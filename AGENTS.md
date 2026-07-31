# Omakase — agent & contributor contract

Omakase is a **local-first personal learning studio**: Studios, source-grounded learning, adaptive Probe, and evidence-backed learner state. It is not a generic chatbot, RAG shell, or agent platform.

Authoritative deep contract: [`docs/AGENTS.md`](docs/AGENTS.md)  
Product specification: [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md)  
AI engineering setup: [`docs/AI_ENGINEERING.md`](docs/AI_ENGINEERING.md)

## Architecture (short)

- Electron desktop app + optional browser extension + marketing website
- Local SQLite, local extraction/embeddings/retrieval, BYOK frontier models
- One AI SDK 7 agent with modes: Learn | Research | Probe
- No required cloud backend, account, or remote telemetry

## Package layout

```text
apps/desktop     Electron main / preload / renderer / core
apps/extension   WXT Manifest V3 capture extension
packages/contracts  Shared Zod schemas & protocol types
website          Public site
evals            Deterministic AI eval datasets & runners
docs             Spec, ADRs, AI engineering guides
```

## Setup

```bash
nvm use          # Node 24 (AI SDK 7 requires ≥22; this repo pins 24)
corepack enable
pnpm install
pnpm run doctor      # note: use `pnpm run doctor` (pnpm has a built-in `pnpm doctor`)
pnpm dev
```

## Required verification

```bash
pnpm verify          # format, lint, types, tests, deterministic evals, builds
pnpm verify:ai       # AI contracts + offline Promptfoo
pnpm verify:release  # + package / release docs gate
```

Deterministic tests and evals must pass **without** paid API keys (`OMAKASE_MOCK_PROVIDER=1`).

## Definition of Done

- Behavior matches the spec invariants (local-first, citations fail closed, evidence before mastery)
- Tests/evals updated for AI or learning changes
- Packaged paths considered when touching assets/workers
- `docs/IMPLEMENTATION_STATUS.md` updated with honest evidence
- No secrets committed; no new required backend

## Hard prohibitions

- No second agent framework (LangChain, LangGraph, Mastra, CrewAI, Mem0, …)
- No mandatory cloud control plane or hosted vector DB
- No arbitrary model-directed filesystem/shell/SQL
- No remote telemetry by default
- Do not expose chunks/embeddings/RAG/MCP jargon in the product UI

Nested guidance (directory-specific only): `apps/desktop/AGENTS.md`, `apps/extension/AGENTS.md`, `website/AGENTS.md`, `evals/AGENTS.md`.
