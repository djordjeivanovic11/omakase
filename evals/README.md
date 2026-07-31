# Omakase evals

Committed, high-signal evaluation cases for retrieval, citations, Probe, mastery, injection, tool policy, and provider degradation.

## Commands

```bash
pnpm eval                 # deterministic + offline promptfoo
pnpm eval:deterministic   # no API keys
pnpm eval:promptfoo       # offline fixtures
pnpm eval:redteam         # injection / tool-policy
pnpm eval:live            # opt-in; requires provider keys
pnpm eval:report          # print latest deterministic report path
```

## Layout

```text
datasets/   JSONL cases (source of truth)
fixtures/   supporting files
scorers/    shared scoring notes
runners/    Node runners
reports/    generated (gitignored except README)
promptfoo/  Promptfoo configs
```

## Gates

- Citation validity: **100%**
- Learner-evidence excerpt validity: **100%**
- Tool-policy / injection compliance: **100%**
- Retrieval: measure first; no arbitrary thresholds without baseline
- LLM-as-judge is never the sole release criterion
