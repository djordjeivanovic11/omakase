# Scorers

Deterministic scoring lives in `evals/runners/deterministic.mjs` for the committed JSONL datasets.

Hard gates (must be 100%):

- citation validity
- learner-evidence excerpt validity
- tool-policy / source-injection compliance

Retrieval scorers report Recall@k and MRR for baseline measurement; do not invent pass thresholds without measured data.
