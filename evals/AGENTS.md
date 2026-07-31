# Evals guidance

Root contract: [`../AGENTS.md`](../AGENTS.md) and [`../docs/AI_ENGINEERING.md`](../docs/AI_ENGINEERING.md).

- Committed datasets are small, high-signal, and versioned
- `pnpm eval:deterministic` must pass without API keys
- Citation validity, evidence-excerpt validity, and tool-policy compliance target **100%**
- Live / paid evals are opt-in (`pnpm eval:live`) and gitignore their contentful outputs
- Do not weaken thresholds to make CI green — fix the product or the fixture
