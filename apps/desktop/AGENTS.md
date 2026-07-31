# Desktop app guidance

Root contract: [`../../AGENTS.md`](../../AGENTS.md) and [`../../docs/AGENTS.md`](../../docs/AGENTS.md).

## Boundaries

- `src/main` — DB, secrets, providers, IPC, jobs, packaging concerns
- `src/preload` — narrow typed bridge only
- `src/renderer` — UI; no Node, no secrets, no direct DB
- `src/core` — domain logic (agent, learning, ingest, retrieval, storage)
- Utility processes — heavy work; results return to main for writes

## Commands

```bash
pnpm --filter @omakase/desktop test
pnpm --filter @omakase/desktop package
```

Use `OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1` for deterministic runs. Enable local AI traces with `OMAKASE_AI_TRACES=1` (writes outside the repo).
