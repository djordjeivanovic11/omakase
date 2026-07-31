## Summary

<!-- What changed and why (1–3 sentences). -->

## Test plan

- [ ] `pnpm run doctor`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm test`
- [ ] `pnpm eval:deterministic` (if AI / learning / retrieval touched)
- [ ] Manual check of the affected golden-path step (if UI/behavior changed)

## Checklist

- [ ] Tests added or updated when behavior changes
- [ ] No secrets, API keys, or private library content committed
- [ ] Follows architecture invariants (local-first, no required backend, sandboxed renderer)
- [ ] Docs updated if user-facing or contributor-facing behavior changed

## AI behavior (mark N/A if not applicable)

- [ ] N/A — this change does not affect AI behavior
- [ ] Behavior changed:
- [ ] Prompt or tool changed:
- [ ] Eval added or updated:
- [ ] Deterministic tests run:
- [ ] Provider compatibility considered:
- [ ] Source-grounding impact:
- [ ] Learner-memory impact:
- [ ] Token or cost impact:
- [ ] Privacy impact:
- [ ] Screenshots or redacted trace summaries (optional):
