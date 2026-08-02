#!/usr/bin/env python3
"""Chrome/Edge native messaging host for Omakase.

Speaks the browser native-messaging framing protocol (4-byte LE length + JSON)
and drops validated captures into the desktop app's native-inbox directory so
the running Omakase process can import them. Also answers ping, list_studios,
and durable capture status checks.
"""

from __future__ import annotations

import json
import os
import sqlite3
import struct
import sys
import uuid
from pathlib import Path
import re

HOST_NAME = "com.omakase.desktop"
EXTENSION_ID_PATTERN = re.compile(r"^[a-p]{32}$")


def user_data_root() -> Path:
    override = os.environ.get("OMAKASE_USER_DATA")
    if override:
        return Path(override) / "omakase"
    # Electron default on macOS when productName is Omakase.
    return Path.home() / "Library" / "Application Support" / "Omakase" / "omakase"


def inbox_dir() -> Path:
    path = user_data_root() / "native-inbox"
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return user_data_root() / "library.sqlite"


def allowed_extension_ids() -> set[str]:
    path = user_data_root() / "native-host" / "allowed-extension-ids.json"
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return {
            value
            for value in parsed.get("ids", [])
            if isinstance(value, str) and EXTENSION_ID_PATTERN.fullmatch(value)
        }
    except Exception:
        return set()


def caller_extension_id() -> str | None:
    if len(sys.argv) < 2:
        return None
    origin = sys.argv[1]
    prefix = "chrome-extension://"
    if not origin.startswith(prefix) or not origin.endswith("/"):
        return None
    extension_id = origin[len(prefix) : -1]
    if extension_id not in allowed_extension_ids():
        return None
    return extension_id


def read_message() -> dict | None:
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len or len(raw_len) < 4:
        return None
    (length,) = struct.unpack("<I", raw_len)
    if length == 0 or length > 512_000:
        return None
    body = sys.stdin.buffer.read(length)
    if len(body) < length:
        return None
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"type": "invalid"}
    return parsed if isinstance(parsed, dict) else {"type": "invalid"}


def write_message(payload: dict) -> None:
    encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def list_studios() -> list[dict]:
    path = db_path()
    if not path.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            rows = conn.execute(
                """
                SELECT s.id, s.name, COUNT(ss.source_id) AS source_count
                FROM studios s
                LEFT JOIN studio_sources ss ON ss.studio_id = s.id
                WHERE s.status != 'archived'
                GROUP BY s.id
                ORDER BY s.updated_at DESC
                """,
            ).fetchall()
            return [
                {"id": row[0], "name": row[1], "sourceCount": row[2]}
                for row in rows
            ]
        finally:
            conn.close()
    except Exception:
        return []


def capture_status(extension_id: str, external_request_id: str) -> dict:
    path = db_path()
    if not path.exists():
        return {"status": "pending"}
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            row = conn.execute(
                """
                SELECT status, source_id, error_code, error_message
                FROM capture_requests
                WHERE extension_id = ? AND external_request_id = ?
                """,
                (extension_id, external_request_id),
            ).fetchone()
            if row is None:
                return {"status": "pending"}
            return {
                "status": row[0],
                "sourceId": row[1],
                "errorCode": row[2],
                "errorMessage": row[3],
            }
        finally:
            conn.close()
    except Exception:
        return {"status": "pending"}


def handle(message: dict) -> dict:
    msg_type = message.get("type")
    request_id = message.get("requestId")

    extension_id = caller_extension_id()
    if not extension_id:
        return {
            "ok": False,
            "type": "error",
            "requestId": request_id,
            "error": "extension_not_allowlisted",
        }

    if msg_type == "ping":
        return {"ok": True, "type": "pong", "requestId": request_id}

    if msg_type == "list_studios":
        return {"ok": True, "type": "list_studios", "requestId": request_id, "payload": list_studios()}

    if msg_type == "capture_status":
        payload = message.get("payload")
        external_request_id = payload.get("externalRequestId") if isinstance(payload, dict) else None
        if not isinstance(external_request_id, str):
            return {
                "ok": False,
                "type": "error",
                "requestId": request_id,
                "error": "invalid_capture_status_payload",
            }
        return {
            "ok": True,
            "type": "capture_status",
            "requestId": request_id,
            "payload": capture_status(extension_id, external_request_id),
        }

    if msg_type == "capture":
        drop = inbox_dir() / f"{uuid.uuid4()}.json"
        enriched = {**message, "extensionId": extension_id}
        drop.write_text(json.dumps(enriched), encoding="utf-8")
        return {"ok": True, "type": "capture_ack", "requestId": request_id}

    return {
        "ok": False,
        "type": "error",
        "requestId": request_id,
        "error": "unsupported_message_type",
    }


def main() -> int:
    while True:
        message = read_message()
        if message is None:
            return 0
        try:
            write_message(handle(message))
        except Exception as exc:  # noqa: BLE001 — host must never crash the browser
            write_message({"ok": False, "error": str(exc)[:200]})


if __name__ == "__main__":
    raise SystemExit(main())
