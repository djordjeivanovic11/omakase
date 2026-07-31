#!/usr/bin/env python3
"""Chrome/Edge native messaging host for Omakase.

Speaks the browser native-messaging framing protocol (4-byte LE length + JSON)
and drops validated captures into the desktop app's native-inbox directory so
the running Omakase process can import them. Also answers ping and list_studios.
"""

from __future__ import annotations

import json
import os
import sqlite3
import struct
import sys
import uuid
from pathlib import Path

HOST_NAME = "com.omakase.desktop"


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
    return json.loads(body.decode("utf-8"))


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
                "SELECT id, name FROM studios WHERE status != 'archived' ORDER BY updated_at DESC"
            ).fetchall()
            return [{"id": row[0], "name": row[1]} for row in rows]
        finally:
            conn.close()
    except Exception:
        return []


def handle(message: dict) -> dict:
    msg_type = message.get("type")
    request_id = message.get("requestId")

    if msg_type == "ping":
        return {"ok": True, "type": "pong", "requestId": request_id}

    if msg_type == "list_studios":
        return {"ok": True, "type": "list_studios", "requestId": request_id, "payload": list_studios()}

    if msg_type == "capture":
        drop = inbox_dir() / f"{uuid.uuid4()}.json"
        drop.write_text(json.dumps(message), encoding="utf-8")
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
