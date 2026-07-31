# AI engineering readiness

Date: 2026-07-31

## Verdict

**AI ENGINEERING SETUP READY** — with the caveats below.

A clean clone can install; `pnpm run doctor` works; deterministic AI tests/evals pass without API keys; optional tools stay optional; product architecture was not turned into an agent zoo.

## Installed tools and versions

| Tool | Version / pin | Required? |
| --- | --- | --- |
| Node.js | 24.18.1 (`.nvmrc`; engines ≥24; AI SDK needs ≥22) | Required |
| pnpm | 10.14.0 (`packageManager`) | Required |
| TypeScript | 5.8.3 | Required |
| Biome | 2.1.3 | Required |
| AI SDK `ai` | 7.0.43 | Required (product) |
| `@ai-sdk/openai` / `anthropic` | 4.0.25 | Required (product) |
| `@openrouter/ai-sdk-provider` | 3.0.0 | Required (product) |
| Promptfoo | 0.118.0 (dev) | Dev / CI offline |
| Graphify CLI | 0.9.27 via `uv tool` (`graphifyy`) | Optional |
| Context7 MCP | example only (`docs/development/mcp.example.json`) | Optional |
| Playwright MCP | example pin `@playwright/mcp@0.0.34` | Optional |
| GitHub MCP | instructions only | Optional |
| Langfuse | adapter seam only; remote off | Optional |
| Evalite | not installed | Watch |

## Skills

**Retained:** 5 upstream + 4 Omakase-specific (see `docs/development/SKILLS_EVALUATION.md`).  
**Rejected:** full skill megabundle; Graphify always-on exploration rule.

## MCP setup status

- Example config committed (no secrets).
- Local `.cursor/mcp.json` **not** committed and not tested with live Context7/GitHub tokens in this session.
- Playwright MCP not substituted for Electron E2E tests.

## Graphify evaluation

Optional / experimental. Useful on some cross-cutting questions; noisy on others. Build ~3s, ~4.1MB output, gitignored. Details: `docs/development/GRAPHIFY_EVALUATION.md`.

## Deterministic eval results

`pnpm eval:deterministic` → **53/53 passed**

| Suite | Result |
| --- | --- |
| citations | 4/4 (100% gate) |
| learner-evidence | 5/5 (100% gate) |
| tool-policy | 4/4 (100% gate) |
| source-injection | 8/8 (100% gate) |
| probe-adaptation | 9/9 |
| mastery-transitions | 5/5 |
| retrieval | 8/8 (baseline measurement; no arbitrary threshold) |
| provider-capabilities | 10/10 |

## Promptfoo

- Offline regression: **2/2 PASS**
- Offline red-team: **3/3 PASS**
- Uses deterministic stub provider (no paid calls)

## Provider-contract / packaged golden path

- Mock golden integration test: PASS
- Architecture + IPC allowlist + budget unit tests: PASS
- `pnpm verify:ai`: **PASSED**
- `pnpm verify` (format, lint, types, unit/integration, deterministic evals, website/extension/desktop package): **PASSED** on 2026-07-31 (darwin-arm64)
- Playwright packaged E2E file exists but remains an evolving ACC-GOLD item (excluded from default `tsc` until Playwright matcher types are wired)

## Security workflows

- CodeQL workflow added
- Dependabot for npm + GitHub Actions
- Secret scanning prep: `.env.example`, gitignore for traces/graphs/dbs, doctor never prints key values

## Remaining limitations

1. Live Context7 / GitHub / Playwright MCP not exercised with real tokens here.
2. Promptfoo offline suites use a stub provider — they guard config/assert plumbing and committed red-team cases; deeper live red-team is opt-in.
3. Retrieval thresholds not frozen beyond “hit / no-answer” contracts — measure before tightening.
4. Granite ONNX is now the production embedding path; hash embeddings are deterministic test doubles only.
5. Use `pnpm run doctor` (bare `pnpm doctor` is pnpm’s builtin).

## Contributor experience target

```text
pnpm install
pnpm run doctor
pnpm dev
pnpm verify
```
