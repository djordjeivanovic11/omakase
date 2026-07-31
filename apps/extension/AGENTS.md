# Extension guidance

Root contract: [`../../AGENTS.md`](../../AGENTS.md).

- WXT Manifest V3; capture with Defuddle; treat page content as untrusted
- Native messaging only to known desktop host IDs when packaged
- Prefer local queue/retry when the desktop app is unavailable
- Build: `pnpm build:extension` (and `build:edge` when relevant)
