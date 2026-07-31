# MVP readiness report

**Date:** 2026-07-31  
**Product:** Omakase (local-first personal learning studio)  
**Scope:** Personal macOS arm64 MVP — use without a required cloud account

## Verdict

**MVP READY FOR PERSONAL USE on macOS Apple Silicon**, with external blockers called out below (store signing, Windows, store extension IDs).

Deterministic CI path and live OpenAI golden path have been exercised. Packaging produces a launchable `.app` and a local `.dmg`. **2026-07-31 correction:** silent mock fallback removed; default teaching model is GPT-5.6; Learn auto-starts; sidebar + source/teacher workspace. See `docs/PRODUCT_AND_AGENT_REDESIGN.md`.

## What works

| Area | Evidence |
| --- | --- |
| Studios / Inbox / Today / You | Renderer routes + IPC; smoke + UI |
| Text / note / markdown / PDF / transcript / URL ingest | Inbox + studio import; unit/integration + live packaged tests |
| Local extract → blocks → FTS → hybrid retrieval | Integration + live OpenAI Ask with citations |
| Learn / Ask with fail-closed citations | Mock golden + live OpenAI |
| Adaptive Probe + evidence → learner state | Mock golden + live packaged Probe |
| BYOK providers + deterministic mock test harness | You UI; secret store; mock hidden outside explicit test mode |
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
# OMAKASE_LIVE_TESTS=1 OPENAI_API_KEY=… OMAKASE_LIVE_MODEL=gpt-5.6 pnpm --filter @omakase/desktop test:live
```

Evidence log: `docs/ACCEPTANCE_EVIDENCE.md`.

## External / deferred blockers

1. Apple Developer ID signing + notarization (ad-hoc local packages work)
2. Windows installer + Authenticode
3. Chrome/Edge **store** extension IDs (unpacked IDs registered via You)
4. None for local embeddings when `apps/desktop/resources/models` is present; missing model files make embedding fail honestly rather than using fake vectors

## Known product caveats

- Unsigned local `.app` may need right-click → Open on first launch
- Native messaging requires desktop app start + extension ID registration
- Full ACCEPTANCE_CHECKLIST matrix still has items marked IN PROGRESS / EXTERNAL

## Docs updated with this pass

- `docs/USING_OMAKASE.md` (this user guide)
- `docs/IMPLEMENTATION_STATUS.md`
- `apps/extension/README.md` (connect steps)
- This report
