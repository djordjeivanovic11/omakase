# Product and agent redesign (2026-07-31)

## Problems addressed

1. **Fake teacher** — packaged Learn/Probe answered with deterministic mock templates (“Based on your sources…”).
2. **Prototype hierarchy** — form cards and top nav instead of a calm desktop learning workspace.

## Root cause (agent)

`AgentService.resolveDefaultProvider()` fell back to `mock-learn-v1` when an OpenAI profile had no `defaultModelId`. Registry then routed to `createOmakaseMockModel`.

### Fixes

- Default OpenAI model: **`gpt-5.6`** (Best teaching); Balanced: **`gpt-5.6-terra`**.
- Provider create/verify always persists `defaultModelId`.
- Packaged builds: mock only if `OMAKASE_MOCK_PROVIDER=1` **and** profile display name is an explicit local mock.
- OpenAI requests: Responses path via `openai(modelId)` with `providerOptions.openai` `{ store: false, reasoningEffort: 'medium', include: ['reasoning.encrypted_content'] }`.
- Teaching prompts rewritten (PROMPT_VERSION `v2.0.0`); Learn auto-starts with “Teach me from the top.”
- Citations: model still emits `[S1]`; UI shows human labels and strips handles from prose.

## UI principles

- Left sidebar (~212px): Today | Inbox | Studios | You (+ Settings).
- Cards only for focus; lists use separators.
- Learn: source + teacher split; auto lesson; status while tools run.
- Studios: list-first + New Studio modal.
- Studio detail: Continue learning hero; archive in menu.
- Probe: focused question; Learning Map as Solid / Developing / Next.

## Privacy

- Keys in OS secret store only.
- `store: false` on OpenAI Responses by default.
- Dev diagnostic (`devDiag` / `?diag=1`) never shows secrets or source bodies.

## Evidence

- Unit: `provider-selection`, `citations-display`
- Integration: mock golden still passes with `OMAKASE_MOCK_PROVIDER=1`
- Manual: reconnect key in You → Learn → expect non-template prose and model `gpt-5.6`

## Known limitations

- Encrypted reasoning item replay across restarts not fully implemented.
- Provider-native web search productization deferred.
- Visual golden screenshot matrix deferred.
