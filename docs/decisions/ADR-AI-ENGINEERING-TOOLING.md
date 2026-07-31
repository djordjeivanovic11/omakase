# ADR: AI engineering tooling

Also indexed as `docs/architecture-decisions/0002-ai-engineering-tooling.md` (same decision; series numbering lives under `architecture-decisions/`).

## Status

Accepted — 2026-07-31

## Context

Omakase needs an unusually effective AI-assisted engineering environment without becoming an AI tool zoo or adding cloud product infrastructure. AI SDK 7 already powers the application agent. Contributors use Cursor and other coding agents.

## Decisions

1. **AI SDK 7 is the only application-level agent framework.**
2. **Avoid** LangChain, LangGraph, Mastra, CrewAI, Mem0, and similar frameworks unless a later ADR establishes a measured need.
3. **Project-specific learner memory** (event ledger + projector) rather than generic assistant memory products.
4. **Eval datasets and deterministic verification stay in the repository** (`evals/`, Vitest).
5. **Remote observability disabled by default**; local redacted traces opt-in; Langfuse only via explicit adapter env.
6. **Graphify is optional** (PyPI `graphifyy`); never a Node app dependency or CI requirement.
7. **Small skill set** — five upstream engineering skills + four Omakase-specific skills — not a megabundle.
8. **No required development Docker services.**
9. **MCP selectively**: Context7, Playwright, GitHub only. No filesystem/shell/memory/database/sequential-thinking/generic-search MCP servers.
10. **Node pin remains 24** (satisfies AI SDK’s ≥22 requirement) via `.nvmrc` + `engines` + Corepack `packageManager`.

## Consequences

- Contributors can build and verify with `pnpm install && pnpm doctor && pnpm verify` without Python, Docker, or paid keys.
- Optional tools degrade gracefully when absent.
- Product privacy promises are unchanged.

## Alternatives considered

- Evalite as foundational harness — deferred while v1 remains beta.
- Large skill packs — rejected (ceremony / mixed benchmark evidence).
- Making Graphify required — rejected (repo size + optional value).
