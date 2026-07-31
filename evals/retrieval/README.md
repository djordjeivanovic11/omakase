# Retrieval evaluation

Place versioned query/relevance fixtures here. Measure Recall@5/10, MRR@10, nDCG@10 for:

- FTS only
- dense only
- hybrid RRF

Hybrid must beat the agreed lexical baseline on the project corpus without violating latency budgets.

Run (when fixtures are populated):

```bash
pnpm --filter @omakase/desktop exec vitest run evals/retrieval
```
