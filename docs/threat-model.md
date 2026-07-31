# Threat model (summary)

This is a brief summary of `docs/TECHNICAL_SPEC.md` §53 for version one.

## Assets to protect

- Learner sources, notes, and extracted content on disk
- SQLite library database and derived artifacts
- Provider API keys (OS-encrypted, main process only)
- Learner evidence and concept state
- Local logs and diagnostic exports

## Threats

- **Malicious source content** attempting prompt injection or tool misuse
- **Hostile HTML/scripts** in captured web pages or PDFs
- **Malformed PDFs** causing parser crashes or resource exhaustion
- **Filesystem traversal** via imports, assets, or backup paths
- **API key disclosure** through IPC, logs, renderer, or diagnostics
- **Renderer compromise** expanding to filesystem or network access
- **Malicious deep links** opened from source content
- **Native messaging impersonation** from unsigned or unknown extensions
- **SSRF** through URL ingestion or research fetch paths
- **Provider data retention** when user content is sent to BYOK endpoints
- **Supply-chain compromise** in npm/native dependencies
- **Model-proposed destructive actions** if validation is bypassed
- **Corrupted database/migrations** causing data loss
- **Accidental leakage** via logs, crash reports, or telemetry

## Controls (version one)

| Area | Control |
|------|---------|
| Electron | Sandboxed renderer, context isolation, no Node integration, strict CSP, validated IPC senders |
| Secrets | Electron `safeStorage` / test-only encryptor; keys never in SQLite or renderer |
| Sources | Sanitized HTML→Markdown, no script execution, structural chunking with locators |
| Network | URL policy blocks loopback/private/metadata; size/time limits on fetch |
| Agent | Typed tools, mode limits, citation fail-closed, evidence verbatim checks |
| Extension | Native host validates `NativeMessage` / `BrowserCapturePayload` schemas; packaged ID allowlist planned |
| Persistence | Foreign keys, migrations with checksums, immutable learning events |
| Operations | Redacted rotating logs; user-previewed diagnostics |

Security is treated as part of the architecture—not a post-release audit.

See also: `docs/TECHNICAL_SPEC.md` §54–§57 (Electron hardening, secrets, prompt injection, URL safety).
