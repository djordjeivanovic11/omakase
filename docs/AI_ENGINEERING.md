# AI engineering operating system

Omakase’s durable advantage is **committed AI-quality knowledge**: eval cases, learner-state rules, deterministic citation checks, and project-specific skills. External tools (Context7, Graphify, MCP, Promptfoo) help coding agents; they must not become product infrastructure.

This document describes the **development** setup for building, evaluating, reviewing, and releasing Omakase. It does not change the product into a generic agent framework.

## Principles

1. Solve a real Omakase engineering problem.
2. Remove more complexity than you add.
3. Contributors must understand and be able to remove each tool.
4. Prefer measurable correctness, security, and speed.
5. Prefer development dependencies over product infrastructure.

## Tool map

| Layer | Decision | Required? |
| --- | --- | --- |
| Agent runtime | AI SDK 7 only (`ai@7.0.43`) | **Required (product)** |
| Current docs | Context7 MCP | Optional (dev) |
| Repo understanding | Graphify (`graphifyy` / `graphify`) | Optional (dev) |
| UI verification | Playwright MCP + real Playwright Electron tests | MCP optional; tests required over time |
| GitHub operations | Official GitHub MCP after publication | Optional (dev) |
| Agent instructions | `AGENTS.md`, `.cursor/rules`, focused skills | Required (repo) |
| AI quality | Deterministic evals + Promptfoo | Deterministic required; live opt-in |
| Observability | Local AI SDK telemetry; optional Langfuse adapter | Local opt-in; remote off by default |
| Security | CodeQL, Dependabot, secret scanning prep | Required (CI) |
| Release discipline | `pnpm verify` / `verify:release` | Required |

### Forbidden as runtime dependencies

Do not add to the packaged app or ordinary user path:

- LangChain, LangGraph, Mastra, CrewAI, Mem0, Graphiti
- Hosted vector databases or required cloud backends
- Graphify, Context7, Promptfoo, Evalite, Langfuse as product deps
- MCP servers of any kind inside the Electron app
- Required Docker / Python services for contributors or users

## What each tool does

### AI SDK 7

Application agent runtime (`ToolLoopAgent`, typed tools/context, mock providers, telemetry hooks). Pin and verify with the lockfile. Node **≥22** required by AI SDK; this repository pins **Node 24**.

### Context7 (optional)

Retrieves version-specific docs for fast-moving libraries (AI SDK, Electron, Transformers.js, PDF.js, WXT). Dev-only MCP. Never overrides local types/tests.

### Graphify (optional)

PyPI package `graphifyy`, CLI `graphify`. Local Tree-sitter graph for architecture questions after major changes — not every session. See `docs/development/GRAPHIFY.md`.

### Playwright MCP (optional)

Interactive browser inspection for website/extension. Isolated profile only. Desktop E2E uses real Playwright Electron APIs in-repo.

### GitHub MCP (optional)

Issues/PR/CI inspection after the repo is public. Minimum token scopes. No credentials in git.

### Promptfoo (dev)

Offline regression and red-team fixtures in CI; live comparisons opt-in. Not the sole release criterion.

### Skills & rules

Small set under `.cursor/skills` and `.cursor/rules`. Provenance for upstream skills in `.cursor/skills/UPSTREAM.md`.

### Local traces

`OMAKASE_AI_TRACES=1` writes redacted metadata under `~/.omakase/dev-traces` (or `OMAKASE_TRACES_DIR`). Inspect with `pnpm traces:inspect`. No source/learner bodies.

## Contributor install

### Minimal (required)

```bash
nvm use                 # 24.18.1 from .nvmrc
corepack enable
pnpm install
pnpm run doctor
pnpm dev
pnpm verify
```

### Full AI engineering (optional extras)

1. Copy `docs/development/mcp.example.json` → `.cursor/mcp.json` and supply keys via env/UI (never commit).
2. `uv tool install graphifyy` then `pnpm graph:build` when needed.
3. Enable traces: `OMAKASE_AI_TRACES=1`.
4. Live evals only with your own keys: `pnpm eval:live`.

## Evaluating AI behavior

| Command | Purpose | API keys |
| --- | --- | --- |
| `pnpm eval:deterministic` | JSONL contract suites | No |
| `pnpm eval:promptfoo` | Offline Promptfoo | No |
| `pnpm eval:redteam` | Injection / tool-policy | No |
| `pnpm eval:live` | Paid/live providers | Yes, opt-in |
| `pnpm verify:ai` | Combined AI gate | No |

Hard gates: citation validity, evidence-excerpt validity, tool-policy compliance → **100%**.

## Privacy & keys

- User library and learner history stay on device.
- Provider keys: OS-backed secret store; never in SQLite/renderer/Promptfoo configs.
- Telemetry remote exporters off unless a developer sets explicit env flags.
- `pnpm run doctor` never prints key values.

## Environments

| Environment | How the setup applies |
| --- | --- |
| Cursor | Rules, skills, agents, optional MCP |
| Codex / Claude Code | `AGENTS.md` + skills format; MCP if configured |
| Ordinary terminal | `pnpm run doctor`, `pnpm verify`, evals — no IDE required |

## Authoritative vs generated

| Authoritative | Generated / disposable |
| --- | --- |
| Spec, ADRs, `AGENTS.md`, rules, skills, eval datasets | `.graphify/`, eval reports, local traces, Promptfoo live outputs |
| Lockfile + pinned versions | Package build `out/` |

## Updating or removing tools

- **AI SDK**: bump via ADR + lockfile; run `pnpm verify:ai`.
- **Promptfoo**: root devDependency; remove scripts if dropped.
- **Graphify**: delete `.graphify/`, uninstall `uv tool`; scripts stay no-op friendly.
- **MCP**: delete local `.cursor/mcp.json`.
- **Skills**: remove directory; update `UPSTREAM.md` / skills evaluation doc.

## Related docs

- ADR: `docs/decisions/ADR-AI-ENGINEERING-TOOLING.md`
- Quickstart: `docs/development/AI_ENGINEERING_QUICKSTART.md`
- Readiness: `docs/AI_ENGINEERING_READINESS.md`
