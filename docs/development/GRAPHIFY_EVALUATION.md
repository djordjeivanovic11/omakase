# Graphify evaluation (2026-07-31)

Honest trial after integrating optional wrappers (`pnpm graph:build` / `graph:report` / `graph:clean`).

## Environment

| Item | Value |
| --- | --- |
| Package | `graphifyy` via `uv tool install` |
| CLI | `graphify` 0.9.27 (PyPI 0.9.31 available) |
| Command | `graphify update <repo>` |
| Build time | ~2.9s wall / ~4.4s user on Apple Silicon |
| Output size | ~4.1 MB (`graph.json` ~1.8 MB, `graph.html` ~1.6 MB) |
| Graph size | 1959 nodes, 2965 edges, 162 communities |

## Questions asked

1. Where do AI SDK calls enter the system?
2. Which modules cross Electron process boundaries?
3. Where does source ingestion connect to retrieval?
4. Where does learner evidence become concept state?
5. What code paths participate in Probe?

## Findings vs ordinary search

| Question | Useful? | Notes |
| --- | --- | --- |
| AI SDK entry | **Yes** | Surfaced `agent-service.sendMessage`, `createLanguageModel`, `hybridRetrieve`, tools, citations, budgets quickly |
| Process boundaries | **Weak** | Mixed docs/skills/package.json noise; did not clearly map main/preload/renderer |
| Ingestion → retrieval | **Partial** | Found `enqueueEmbedJob`, `IngestionPipeline`, provider registry; less crisp than reading `ingestion-pipeline.ts` + `hybrid.ts` |
| Evidence → concept state | **Yes** | Linked `evidence.ts`, `projector`, `concepts-repo`, IPC, contracts |
| Probe paths | **Weak** | Dominated by spec vocabulary + unrelated skill headings (“Code Review…”) |

Compared with `rg` + TS go-to-definition: Graphify helped most on **cross-cutting “who calls whom”** questions already partially documented. At current repo size it rarely beat a focused search, and query results often included documentation/skills as first-class nodes (useful for corpus search, noisy for code architecture).

## Risks / costs

- Generated output goes stale immediately; must stay gitignored.
- Default upstream Cursor rule tried to make Graphify **mandatory** before Read/Grep — replaced with an optional scoped rule.
- Semantic/doc extraction may call a configured model if keys are set — keep off for private libraries.
- Contributors need Python/`uv` only for this optional path.

## Verdict

**Remain available and optional / experimental — not recommended as a default session tool.**

Keep the thin `pnpm graph:*` wrappers and docs. Do not add Graphify to CI or Node dependencies. Revisit if the codebase grows large enough that cross-community coupling questions dominate ordinary search.
