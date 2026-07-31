---
name: omakase-ai-change
description: Use when changing Omakase system instructions, agent modes, tools, runtime context, provider routing, model outputs, source-context construction, or learner-memory proposals. Enforces eval-first AI changes with deterministic verification.
---

# Omakase AI change

## Entry conditions

Activate when the task touches agent prompts, tools, modes, context packing, citations, provider selection, or proposed learner-state writes.

## Procedure

1. Identify the user-visible behavior being changed.
2. Locate existing fixtures and evals (`evals/datasets/`, `apps/desktop/tests/`).
3. Add a failing test or eval case first.
4. Make the smallest implementation change.
5. Verify tool policies and structured schemas.
6. Check provider portability (OpenAI / Anthropic / OpenRouter / mock).
7. Inspect token and cost impact (budgets, usage).
8. Run `pnpm eval:deterministic` and relevant Vitest files.
9. Run optional live eval only when explicitly authorized (`pnpm eval:live`).
10. Document behavior or evaluation changes in `docs/IMPLEMENTATION_STATUS.md` when material.

## Evidence required

- New or updated deterministic test/eval
- Citation/evidence validity still 100% on touched paths
- No second agent framework introduced
- Privacy: no prompt/body logging enabled by default

## Failure modes

- Changing prompts without fixtures
- Treating model output as authoritative persistence
- Expanding tool allowlists “just in case”
- Paying for live model calls in ordinary CI

See `references/checklist.md`.
