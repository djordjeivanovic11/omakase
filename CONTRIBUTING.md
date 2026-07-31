# Contributing to Omakase

Thanks for helping make Omakase better. This guide gets you from clone to a useful pull request quickly.

## Requirements

- Node.js 24+ (see `.nvmrc`)
- pnpm 10.14+ (via Corepack)

```bash
corepack enable
pnpm install
pnpm build:contracts
```

## Run locally

```bash
# Desktop app (Electron)
pnpm dev

# Deterministic mock provider — no paid API key
OMAKASE_MOCK_PROVIDER=1 pnpm dev

# Browser extension
pnpm dev:extension

# Landing page
pnpm --filter @omakase/website dev
```

## Verify before opening a PR

```bash
pnpm typecheck
pnpm lint
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm test
```

## Architecture (short)

```text
apps/desktop      Electron main + preload + React UI + domain core
apps/extension    WXT Manifest V3 capture extension
packages/contracts  Shared Zod schemas and IPC channel names
website           Public landing page (static export)
migrations        SQLite migration 0001
docs/             Spec pack and operating contract
```

Product invariants (non-negotiable):

1. **Local-first** — sources, embeddings, evidence, and learner state stay on the device.
2. **No required backend** — no accounts, sync, or cloud control plane in version one.
3. **BYOK** — model calls go directly from the desktop app to the user's provider.
4. **API keys never in the renderer or SQLite** — OS-backed secrets in the main process.
5. **One bounded agent** — Learn / Research / Probe are modes, not separate agents.
6. **Evidence before mastery** — reading alone never promotes past `encountered`.

Read [`docs/AGENTS.md`](docs/AGENTS.md) and [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md) before large changes.

## Where to start

Good first areas:

- UI polish and accessibility in `apps/desktop/src/renderer`
- Parser fixtures under `fixtures/`
- Unit tests next to modules in `apps/desktop/tests`
- Docs clarity in `README.md`, `CONTRIBUTING.md`, and `website/`

Avoid:

- Adding a backend, auth, or hosted sync
- Introducing LangChain, LangGraph, Mastra, Docker, or a second agent framework
- Exposing chunk/embedding/retrieval knobs to end users
- Putting secrets in the renderer, SQLite, logs, or diagnostics by default

## Coding standards

- TypeScript throughout; shared shapes live in `@omakase/contracts` as Zod schemas.
- Format and lint with Biome (`pnpm lint` / `pnpm lint:fix`).
- Prefer small, focused modules over frameworks.
- Renderer stays sandboxed: no Node, filesystem, database, or provider SDK imports.
- Tests: Vitest. Prefer the lowest practical layer (unit → integration → E2E).
- Do not leave `TODO` / `FIXME` / `not implemented` in production paths.

## Pull request rules

1. One coherent change per PR.
2. Include or update tests when behavior changes.
3. Run typecheck, lint, and tests locally.
4. Never commit secrets, `.env` files, or real API keys.
5. Update `docs/IMPLEMENTATION_STATUS.md` only when acceptance evidence changes.
6. Keep the app launchable — do not land broken `main`.

Use the pull request template checklist.

## Package / release

```bash
pnpm build          # contracts + extension + packaged desktop app dir
pnpm package        # distributables (DMG / ZIP / Squirrel)
```

Signing and notarization require external credentials — see [`docs/release.md`](docs/release.md).

## Questions

Open a GitHub Discussion or issue. For security vulnerabilities, follow [`SECURITY.md`](SECURITY.md) — do not file a public issue.
