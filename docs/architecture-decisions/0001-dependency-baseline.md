# ADR 0001: Dependency baseline

This record captures pinned dependency versions for Omakase at initialization time, as required by `docs/AGENTS.md`.

## Runtime (apps/desktop)

| Package | Version |
|---------|---------|
| electron | 43.2.0 |
| react | 19.1.1 |
| react-dom | 19.1.1 |
| react-router | 7.8.2 |
| better-sqlite3 | 13.0.2 |
| ai | 7.0.43 |
| @ai-sdk/openai | 4.0.25 |
| @ai-sdk/anthropic | 4.0.25 |
| @openrouter/ai-sdk-provider | 3.0.0 |
| @huggingface/transformers | 3.7.2 |
| defuddle | 0.19.2 |
| unpdf | 1.8.0 |
| uuidv7 | 1.2.1 |
| zod | 3.25.76 |

## Tooling

| Package | Version |
|---------|---------|
| typescript | 5.8.3 |
| vite | 6.3.5 |
| vitest | 3.2.4 |
| @electron-forge/cli | 7.11.2 |
| @vitejs/plugin-react | 4.7.0 |
| @biomejs/biome | 2.1.3 |
| pnpm | 10.14.0 |
| node (engines) | >=24.0.0 |

## Workspace packages

| Package | Version |
|---------|---------|
| @omakase/contracts | 0.1.0 (workspace) |
| @omakase/desktop | 0.1.0 (workspace) |
| @omakase/extension | 0.1.0 (workspace) — WXT 0.21.2 |

## Notes

- Native modules (`better-sqlite3`, future ONNX runtime) are rebuilt by Electron Forge during packaging.
- Superseded 2026-07-31: Granite embedding model files are now bundled under `resources/models`; deterministic hash embeddings are test doubles only and are not a production fallback.
- No LangChain, hosted vector DB, or secondary agent frameworks are permitted per spec.
