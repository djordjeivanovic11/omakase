# Reality audit

**Date:** 2026-07-31  
**Scope:** production runtime, deterministic tests, live verification, packaging, and docs claims related to mocks, canned behavior, fallbacks, fixtures, and incomplete implementation markers.

## Audit method

Commands used:

```bash
git status --short
rg -n -i "mock|mocked|fake|fallback|fixture|demo|sample|canned|stub|placeholder|hardcoded|test provider|deterministic provider|synthetic response|temporary implementation|TODO|FIXME|NOT_IMPLEMENTED|development-only|NODE_ENV|Based on your sources, here is a concise answer|The key point is documented in|Can you distinguish the main idea|Probe completed|revisit the concept|No uncertain concepts right now" apps/desktop/src apps/desktop/tests apps/desktop/scripts apps/extension/entrypoints apps/extension/lib packages/contracts/src website/app evals scripts docs --glob '!docs/dependency-licenses.json' --glob '!evals/reports/**' --glob '!**/out/**' --glob '!**/dist/**' --glob '!**/.vite/**' --glob '!**/.next/**' --glob '!apps/extension/.output/**' --glob '!apps/extension/.wxt/**'
rg -n "catch \(|catch\s*\{|\.catch\(" apps/desktop/src packages/contracts/src --glob '!**/dist/**' --glob '!**/out/**'
rg -n "HashEmbeddingService fallback|hash embedding fallback|hash fallback|OMAKASE_HASH_EMBEDDINGS|GraniteEmbeddingService with a deterministic hash fallback|gpt-4.1-mini" apps docs scripts evals
```

The first scan intentionally includes docs and tests, then this document classifies each production-relevant occurrence. Generated bundles, model/tokenizer assets, dependency-license JSON, and prior eval reports were excluded from the working scan because they produce noise and are not authored runtime policy.

## Findings

| Class | File / lines | Behavior | Reachability | Risk | Required fix / evidence |
|---|---:|---|---|---|---|
| A | `apps/desktop/src/core/providers/mock-model.ts:8-263` | AI SDK deterministic mock model emits canned Learn and Probe JSON, including the scanned text "Based on your sources..." and "The key point is documented..." | Test only after this pass: selected through `shouldUseMockProvider()` only when deterministic test env and profile are explicit | Legitimate CI test double; dangerous only if routed in normal app use | Guarded by `model-defaults.ts:60-68` and `registry.ts:24-40`; covered by `provider-selection.test.ts` |
| A | `apps/desktop/tests/helpers/test-db.ts:32-49`, `apps/desktop/tests/integration/mock-agent-golden.test.ts:10-100`, `apps/desktop/tests/e2e/packaged-smoke.test.ts:70-80` | Deterministic provider profile and packaged smoke env | Unit/integration/packaged smoke only | Required for offline reproducibility | Keep; packaged smoke must set `OMAKASE_TEST=1`, `OMAKASE_SMOKE=1`, and `OMAKASE_MOCK_PROVIDER=1` |
| A | `evals/promptfoo/stub-provider.mjs:1-10`, `evals/promptfoo/*.yaml`, `evals/datasets/*.jsonl` | Offline Promptfoo stub and red-team fixtures | Offline evals only | Legitimate deterministic AI-quality gate | Keep; live model checks stay opt-in and separate |
| A | `apps/desktop/src/core/retrieval/embeddings.ts:37-72` | Hash/Granite deterministic embedding services | Test injection only after this pass | Legitimate deterministic test double; unsafe for real learner search | Runtime construction now returns hash only with explicit `testMode`; covered by `embedding-policy.test.ts` |
| B | `apps/desktop/src/main/ipc.ts:290`, `apps/desktop/src/renderer/pages/OnboardingPage.tsx:16-171`, `apps/desktop/src/renderer/pages/YouPage.tsx:18-164` | Renderer can display local mock setup only if main process reports `mockProviderEnabled` | Hidden unless `isMockProviderRuntimeAllowed()` is true | Previously ambiguous UI affordance; now explicit test harness only | `ipc.ts:290` uses central runtime guard |
| B | `scripts/doctor.mjs:157-175` | Doctor reports bundled model manifest state | Developer diagnostic only | Stale wording previously implied hash fallback was expected | Updated to say local ONNX is required and missing files make embedding fail |
| B | `apps/desktop/src/core/backup/diagnostics.ts:19-71` | Diagnostic preview uses `ModelManifestStub` type and placeholder text for absent logs | Diagnostic export only | Not a model/data fallback; no generated learning content | No code fix required |
| C | `apps/extension/lib/constants.ts:6-10`, `apps/extension/README.md:63-68` | Placeholder Chrome/Edge store extension IDs | Release configuration placeholder | Store publication blocker, not runtime fake learning behavior | Keep documented until store IDs exist |
| C | `apps/desktop/src/renderer/*` placeholder attributes | Form input placeholders | UI copy only | Not data/model fallback | No code fix required |
| D | `apps/desktop/src/core/providers/registry.ts:24-40` | Before this pass, `OMAKASE_MOCK_PROVIDER=1` in an unpackaged normal app could route an explicit local-mock profile to canned teaching | Development runtime and possible misconfigured launches | Could mask real provider setup failures with deterministic answers | Fixed: mock now requires deterministic test env, explicit local-mock profile, and `mock-*` model id; saved mock profiles outside test mode throw a clear setup error |
| D | `apps/desktop/src/main/main.ts:80-87`, `apps/desktop/src/main/ipc.ts:856-871` | Startup auto-created a mock profile when `OMAKASE_MOCK_PROVIDER=1` | Packaged smoke and dev | Could create a test provider in a normal app run if env leaked | Fixed: startup and `ensureMockProvider()` use `isMockProviderRuntimeAllowed()`, which now requires `OMAKASE_TEST=1` |
| D | `apps/desktop/src/main/app-context.ts:47-62`, `apps/desktop/src/core/retrieval/embeddings.ts:91-98` | Missing ONNX model fell back to meaningless hash vectors | Production startup when model files missing | Could mark real learner sources searchable with fake embeddings | Fixed: production gets `LocalEmbeddingService`; missing files fail embedding jobs honestly |
| D | `apps/desktop/src/core/agent/agent-service.ts:36-49` | `AgentService` had an implicit deterministic embedding default | Any direct construction without AppContext | Could use fake query vectors outside tests | Fixed: embedding service is required dependency |
| D | `apps/desktop/src/main/job-worker.ts:61-92` | Embedding errors failed the job but could leave source stuck in `embedding` | Production failed embedding stage | Failure was not visible enough in source state | Fixed: source status becomes `failed` with `embed_failed`; job still fails |
| E | `docs/architecture-decisions/0001-dependency-baseline.md:48`, `docs/AI_ENGINEERING_READINESS.md:80-86` | Older docs described Granite hash fallback | Documentation only | Could cause future agents to preserve a forbidden fallback | Updated as superseded / test-only |
| F | `apps/desktop/src/core/agent/agent-service.ts:317-340` | Catch around `fullStream` falls back to `textStream` / `text` if stream shape differs | Real provider path | Ambiguous but not canned success: it reuses the same provider result object, not generated fallback prose | Keep; provider errors outside shape fallback still yield error at `agent-service.ts:366-383` |
| F | `apps/desktop/src/core/learning/probe-schema.ts:136-139` | `takeNonEmpty()` supplies fallback rubric strings for missing arrays | Real provider structured output normalization | Low product risk; not learner mastery or citation fabrication | Acceptable bounded normalization; durable evidence still filtered by verbatim check |
| F | `apps/desktop/src/core/learning/next-actions.ts:69` | "Probe completed - revisit..." next-action rationale matches scanned wording | Production deterministic next-action policy | Not a fake model answer; deterministic app recommendation | Keep; source-targeted next actions are handled elsewhere when citation/block exists |

## Production rule checks

| Rule | Current behavior | Evidence |
|---|---|---|
| Real provider failure must produce honest error | Learn catches provider/generation errors and yields `error`; connection test records `connection_failed` | `agent-service.ts:366-383`, `connection-test.ts:102-119` |
| Missing API key must show provider setup, not mock teaching | Registry throws on missing API key unless explicit mock runtime/profile/model guard passes | `registry.ts:43-54`, `model-defaults.ts:60-67` |
| Malformed model response must not create durable learner state | Probe uses `generateObject()` with schema for real providers; schema failure throws before transaction | `probe-machine.ts:253-266`, `probe-machine.ts:285-332` |
| Failed retrieval must not invent source grounding | Retrieval errors occur before model call; citation rendering uses only validated supplied handles | `agent-service.ts:210-235`, `agent-service.ts:385-419` |
| Failed embedding worker must not mark source Ready | Embedding success marks Ready; catch marks source failed and job failed | `job-worker.ts:74-89` |
| Failed citation check must not display verified citation | Unknown handles are rejected; only `validation.validated` is emitted/stored | `agent-service.ts:385-419`, `tests/integration/ai-budgets.test.ts:8-18` |
| Failed learner-state proposal must not mark learned | Probe evidence is filtered to verbatim learner answer before persistence | `probe-machine.ts:277-318`, `learning/evidence.ts` |
| Normal app must not select deterministic provider | Mock requires `OMAKASE_TEST=1`, `OMAKASE_MOCK_PROVIDER=1`, explicit local-mock profile, and `mock-*` model; packaged smoke also requires `OMAKASE_SMOKE=1` | `model-defaults.ts:60-68`, `registry.ts:24-40`, `provider-selection.test.ts` |
| No mock provider bundled as default/fallback | OpenAI defaults to `gpt-5.6`; mock model id alone is not explicit | `model-defaults.ts:20-43`, `provider-selection.test.ts:59-78` |
| Test providers reachable only by explicit test route | UI, startup, provider registry, and packaged smoke all share the same test-mode guard | `main.ts:80-87`, `ipc.ts:290`, `ipc.ts:856-871`, `registry.ts:24-40` |

## Live verification suite

The live suite is separate from deterministic CI and is opt-in:

```bash
export OPENAI_API_KEY="..."
export OMAKASE_LIVE_TESTS="1"
export OMAKASE_LIVE_MODEL="gpt-5.6"
pnpm --filter @omakase/desktop test:live
```

Current live coverage:

- `apps/desktop/tests/live/local-embeddings.test.ts` loads the bundled ONNX model and checks vector shape / similarity.
- `apps/desktop/tests/live/openai-golden-path.test.ts` uses a real OpenAI profile, local embeddings, source retrieval, cited Learn answers, structured Probe evaluation, verbatim evidence filtering, and citation rejection.
- `apps/desktop/tests/live/packaged-golden-path.test.ts` drives the packaged app with a real key, real PDF/transcript fixtures, local extraction/embeddings/retrieval, source-grounded Learn, Probe, persistence, and restart recovery.

This Codex run executed the local ONNX live check (`tests/live/local-embeddings.test.ts`, 3 passed) and then the full paid OpenAI live suite with `OMAKASE_LIVE_TESTS=1` and `OMAKASE_LIVE_MODEL=gpt-5.6` (`pnpm --filter @omakase/desktop test:live`, 12 passed). Deterministic verification remains required; live provider verification is the release/personal-use proof that the packaged app can use the real provider path.

## Remaining gaps

1. The live suite does not enforce `OMAKASE_LIVE_MAX_COST_USD` yet; model calls are bounded by test count and existing app budgets, but a live cost guard should be added before broader use.
2. Packaged live verification is macOS-focused in this workspace; Windows remains an external release track.
3. The audit scan is source-level and excludes generated bundles. Release signing should still inspect final artifacts before public distribution.
