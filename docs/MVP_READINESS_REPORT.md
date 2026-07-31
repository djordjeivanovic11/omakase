# MVP readiness report

**Date:** 2026-07-31  
**Product:** Omakase (local-first personal learning studio)  
**Scope:** Personal macOS arm64 MVP — use without a required cloud account

## Verdict

**MVP READY FOR PERSONAL USE on macOS Apple Silicon**, with external blockers called out below (store signing, Windows, store extension IDs, vendored ONNX model optional).

Deterministic CI path and live OpenAI golden path have been exercised. Packaging produces a launchable `.app` and a local `.dmg` (`apps/desktop/out/make/Omakase-darwin-arm64.dmg`). Bulk PDF/transcript multi-select + **5 concurrent local workers** prepare large libraries faster. Remaining gaps are store distribution, not core learning loops.

## What works

| Area | Evidence |
| --- | --- |
| Studios / Inbox / Today / You | Renderer routes + IPC; smoke + UI |
| Text / note / markdown / PDF / transcript / URL ingest | Inbox + studio import; unit/integration + live packaged tests |
| Local extract → blocks → FTS → hybrid retrieval | Integration + live OpenAI Ask with citations |
| Learn / Ask with fail-closed citations | Mock golden + live OpenAI |
| Adaptive Probe + evidence → learner state | Mock golden + live packaged Probe |
| BYOK providers + mock provider | You UI; secret store; `OMAKASE_MOCK_PROVIDER=1` |
| Backup / restore | `tests/integration/backup-restore.test.ts` |
| Packaged macOS arm64 launch | `tests/e2e/packaged-smoke.test.ts`, live packaged golden |
| Browser extension + native host | Host install + You allowlist UI; extension build |
| Secrets isolation | Keys outside SQLite; redaction tests |

## Commands to reproduce

```bash
nvm use 24
pnpm install
pnpm run doctor
pnpm typecheck
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test
node ./evals/runners/deterministic.mjs
pnpm --filter @omakase/desktop package
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test:packaged
pnpm make:dmg
# optional live (requires key in env, never commit):
# OPENAI_API_KEY=… pnpm --filter @omakase/desktop exec vitest run --config vitest.live.config.ts
```

Evidence log: `docs/ACCEPTANCE_EVIDENCE.md`.

## External / deferred blockers

1. Apple Developer ID signing + notarization (ad-hoc local packages work)
2. Windows installer + Authenticode
3. Chrome/Edge **store** extension IDs (unpacked IDs registered via You)
4. Bundled Granite ONNX weights (hash embeddings fallback ships)

## Known product caveats

- Unsigned local `.app` may need right-click → Open on first launch
- Native messaging requires desktop app start + extension ID registration
- Full ACCEPTANCE_CHECKLIST matrix still has items marked IN PROGRESS / EXTERNAL

## Docs updated with this pass

- `docs/USING_OMAKASE.md` (this user guide)
- `docs/IMPLEMENTATION_STATUS.md`
- `apps/extension/README.md` (connect steps)
- This report
