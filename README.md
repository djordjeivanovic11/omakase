# Omakase

**Your personal AI learning studio that teaches you what matters, and proves you understand it.**

Local-first. No accounts. You own your learning.

---

- Learn from real sources — papers, videos, articles, notes
- Private by default — everything stays on your machine
- Understand, don’t just read — citations back to the source
- Adaptive **Probe** sessions that test real understanding
- Bring your own API key (OpenAI, Anthropic, or OpenRouter)

---

## Screenshots

| Studio | Learn | Probe |
| --- | --- | --- |
| ![TODO: Studio](docs/assets/screenshot-studio.png) | ![TODO: Learn](docs/assets/screenshot-learn.png) | ![TODO: Probe](docs/assets/screenshot-probe.png) |

> Place PNG/GIF captures in `docs/assets/` when ready. Filenames above are the expected placeholders.

---

## Install

### macOS

1. Download the latest [`.dmg`](https://github.com/djordjeivanovic11/omakase/releases/latest)
2. Drag **Omakase** to Applications
3. Open and connect your API key

### Windows

1. Download the latest installer from [Releases](https://github.com/djordjeivanovic11/omakase/releases/latest)
2. Run the installer
3. Open and connect your API key

### From source (macOS Apple Silicon)

```bash
git clone https://github.com/djordjeivanovic11/omakase.git
cd omakase
nvm use          # Node 24
corepack enable
pnpm install
pnpm run doctor
OMAKASE_MOCK_PROVIDER=1 pnpm dev
```

Build a local app + DMG (unsigned, for personal use):

```bash
pnpm --filter @omakase/desktop package
pnpm make:dmg
open apps/desktop/out/make/Omakase-darwin-arm64.dmg
```

Full walkthrough: [`docs/USING_OMAKASE.md`](docs/USING_OMAKASE.md).  
MVP readiness: [`docs/MVP_READINESS_REPORT.md`](docs/MVP_READINESS_REPORT.md).

---

## How it works

1. **Create a Studio** — a focused place for one learning goal  
2. **Add sources** — multi-select PDFs/transcripts, paste, URL, or browser capture (5 local workers prepare them in parallel)  
3. **Learn** — ask grounded questions with citations  
4. **Probe** — answer adaptive open-ended questions  
5. **Continue** — see the Learning Map and the exact next step  

---

## Philosophy

- **Local-first** — sources, embeddings, conversations, and evidence stay on disk  
- **No accounts** — no required backend or cloud control plane  
- **You own your learning** — export and restore anytime  
- **AI is a teacher, not a feed** — small next actions, never infinite scroll  

---

## Tech stack

- Electron + React  
- SQLite (FTS5)  
- AI SDK 7  
- Local embeddings  

---

## Develop

```bash
pnpm install
pnpm build:contracts
pnpm dev                 # desktop
pnpm dev:extension       # browser extension
pnpm --filter @omakase/website dev   # landing page

pnpm typecheck
pnpm lint
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm test

pnpm build               # contracts + extension + packaged .app
pnpm make                # Forge ZIP / Windows makers
pnpm make:dmg            # reliable macOS DMG (hdiutil)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture notes and PR expectations.

---

## Project layout

```text
apps/desktop       Electron app (main, preload, UI, domain)
apps/extension     Browser capture extension (WXT)
packages/contracts Shared Zod schemas / IPC
website            Public landing page (Next.js static export)
migrations         SQLite schema migrations
docs/              Spec, threat model, release notes
scripts/           Env check + release helpers
```

---

## Contributing

We welcome issues and pull requests. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

Security reports: [SECURITY.md](SECURITY.md).

---

## License

[MIT](LICENSE)
