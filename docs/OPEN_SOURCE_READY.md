# Open-source readiness

Status date: **2026-07-31**  
App version: **0.1.0**

## Verdict

**READY FOR GITHUB**

Unsigned development packages are supported today. Signed/notarized store builds remain documented external blockers (see `docs/release.md`).

## Checklist

| Item | Status | Evidence |
|---|---|---|
| Install verified from clean toolchain | PASS | `node ./scripts/check-env.mjs` → Node 24.18.1 / pnpm 10.14.0; `pnpm install` |
| Tests green | PASS | `OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test` → 86 desktop tests |
| Typecheck | PASS | `pnpm typecheck` (contracts, desktop, extension, website) |
| Lint (errors) | PASS | `pnpm exec biome check . --diagnostic-level=error` |
| Packaging (app dir) | PASS | `pnpm build:desktop` → `apps/desktop/out/Omakase-darwin-arm64/Omakase.app` |
| Distributables | PASS / CONFIGURED | `pnpm package` → Forge makers (DMG/ZIP/Squirrel); CI release workflow on `v*` tags |
| Website builds | PASS | `pnpm build:website` → static export in `website/out` |
| README complete | PASS | Public-facing root `README.md` |
| Repo structure clean | PASS | `apps/`, `packages/`, `website/`, `scripts/`, `docs/`, `migrations/`, `fixtures/` |
| License present | PASS | MIT `LICENSE` |
| Contributor entrypoints | PASS | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue + PR templates |
| No secrets in tree | PASS | `.gitignore` covers `.env*`, `.secrets/`; keys never committed; report via `SECURITY.md` |
| Version in UI | PASS | You page shows `app.getVersion()` |
| First-run / BYOK | PASS | Onboarding accepts real API key; mock provider is gated to deterministic test runs |

## Commands someone should run after clone

```bash
corepack enable
pnpm install
pnpm check-env
pnpm build:contracts
pnpm dev
```

```bash
pnpm typecheck
pnpm lint
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm test
pnpm build
pnpm package
pnpm build:website
```

## Remaining external blockers (not required to publish the repo)

1. Apple Developer ID + notarization credentials  
2. Windows Authenticode certificate  
3. Chrome / Edge store extension IDs for native messaging allowlist  
4. Optional: product screenshots in `docs/assets/` (placeholders documented in README)  
5. Optional: vendored Granite ONNX model files for production embeddings

## Product promise for visitors

1. Open the GitHub repo → understand Omakase in ~30 seconds (README)  
2. Download from Releases (or build with `pnpm package`)  
3. Start learning locally with a BYOK key  
4. Contribute via `CONTRIBUTING.md` without architecture confusion  
