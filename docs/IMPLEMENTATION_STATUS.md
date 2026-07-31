# Implementation status

## Current milestone

Milestone 8 — **Personal MVP + no-fake-runtime hardening**. Silent mock fallback fixed; production hash embeddings removed; GPT-5.6 defaults; sidebar Learn workspace. See `docs/PRODUCT_AND_AGENT_REDESIGN.md` and `docs/REALITY_AUDIT.md`.

## Working golden path

Automated (mock provider, no API keys):

1. Create Studio
2. Import text / note / markdown / PDF (multi-select) / transcript / URL
3. Local extract/index with **5 concurrent workers** (blocks + FTS5 + embeddings)
4. Ask a source-grounded question → verified citations
5. Complete adaptive Probe
6. Persist validated learning evidence
7. Learning Map + primary next action
8. Backup/restore round-trip
9. Packaged macOS arm64 app launches + smoke E2E
10. Local DMG via `pnpm make:dmg`

Evidence: `apps/desktop/tests/integration/mock-agent-golden.test.ts`, packaged-smoke (7), migration/backup/secrets tests, live OpenAI suite (opt-in).

## Acceptance evidence

| ID | Status | Command / artifact | Notes |
|---|---|---|---|
| ACC-BLD-001–007 | PASS | doctor, typecheck, 82 tests, package, extension builds | |
| ACC-BLD-008 | PASS | `pnpm licenses` → `docs/dependency-licenses.json` | |
| ACC-BLD-012 | PASS | `pnpm --filter @omakase/desktop test:packaged` (7) | Clean-user video N/A for personal |
| ACC-INS-001 | PASS (unsigned) | `pnpm make:dmg` → `out/make/Omakase-darwin-arm64.dmg` | |
| ACC-INS-004/005 | EXTERNAL CREDENTIAL BLOCKED | Signing/notarization | `docs/release.md` |
| ACC-DB-* | PASS | migration / persistence / backup-restore | |
| ACC-PRV-* | PASS mock; live opt-in | secrets-isolation + redaction | |
| ACC-STU-* | PASS | Studios/Inbox/Today/You + archive confirm | |
| ACC-SRC-* | PASS core | multi PDF/transcript; audio transcription deferred | |
| ACC-EMB-* | PASS local | Vendored Granite ONNX + no production hash fallback + ExactScan | |
| ACC-RET-* / ACC-CIT-* | PASS | hybrid/RRF/citations + golden | |
| ACC-AGT-* / ACC-PRB-* | PASS | one agent; raised local budgets; Probe | |
| ACC-WEB-* | PASS local / EXTERNAL store | native host + You register ID | |
| ACC-GOLD-* | PASS mock + packaged (+ live keyed) | Windows EXTERNAL | |

## Known external blockers

1. Apple Developer ID + notarization credentials
2. Windows Authenticode certificate
3. Chrome/Edge store extension IDs for publication
4. Public GitHub Release upload (when ready to publish)

## Architecture decisions made

- Status file: `docs/IMPLEMENTATION_STATUS.md`; structure per `AGENTS.md` §9
- Biome as sole lint/format toolchain
- pnpm `node-linker=hoisted` required by Electron Forge
- Granite ONNX vendored under `resources/models/` (not in git if oversized — fetch via `pnpm --filter @omakase/desktop fetch:model`)
- HashEmbeddingService is test-only; missing ONNX makes production embedding jobs fail honestly
- Mock provider requires deterministic test mode (`OMAKASE_TEST=1` + `OMAKASE_MOCK_PROVIDER=1`) plus an explicit local-mock profile; packaged mock is limited further to `OMAKASE_SMOKE=1`
- macOS DMG via `hdiutil` (`scripts/make-macos-dmg.sh`), not Forge MakerDMG
- 5 local job workers for ingestion/embedding

## Commands used

```bash
nvm use 24
pnpm install
pnpm run doctor
pnpm typecheck
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test
node ./evals/runners/deterministic.mjs
pnpm verify:ai
pnpm --filter @omakase/desktop exec vitest run --config vitest.live.config.ts tests/live/local-embeddings.test.ts
pnpm --filter @omakase/desktop package
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test:packaged
OMAKASE_LIVE_TESTS=1 OPENAI_API_KEY=… OMAKASE_LIVE_MODEL=gpt-5.6 pnpm --filter @omakase/desktop test:live
pnpm make:dmg
pnpm --filter @omakase/extension build
pnpm build:website
```

## Test and build results

- Unit/integration: **82 passed**
- Packaged smoke: **7 passed**
- Local ONNX embedding live check: **3 passed**
- Full live OpenAI + packaged golden path: **12 passed**
- Deterministic evals: **53/53**
- AI gate: **pass** (`pnpm verify:ai`)
- Typecheck: **pass**
- Desktop package: `apps/desktop/out/Omakase-darwin-arm64/Omakase.app`
- DMG: `apps/desktop/out/make/Omakase-darwin-arm64.dmg`
- Extension Chrome/Edge + website: **pass**

## Next (optional / external)

1. Notarize + ship GitHub Release when Apple credentials exist
2. Windows CI package
3. Store extension IDs
4. Formal 50k-block latency report (not required for personal use)
