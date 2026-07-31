# AI engineering quickstart

## Minimal setup (required)

```bash
git clone <repo-url> omakase && cd omakase
nvm install   # reads .nvmrc → 24.18.1
nvm use
corepack enable
pnpm install
pnpm run doctor
pnpm dev
```

Verify without paid keys:

```bash
pnpm verify
pnpm eval:deterministic
```

You do **not** need Python, Docker, Graphify, Context7, Langfuse, or provider API keys for the minimal path.

## Full AI engineering setup (optional)

1. **Context7** — copy `docs/development/mcp.example.json` to `.cursor/mcp.json`, set `CONTEXT7_API_KEY` in your environment/Cursor secrets UI. Ask for exact package versions installed in this repo.
2. **Playwright MCP** — same MCP file; use an isolated profile; prefer localhost / website / extension test pages. Desktop packaging tests stay in Vitest/Playwright Electron, not MCP.
3. **GitHub MCP** — after the repo is on GitHub; minimum read scopes; never commit the token.
4. **Graphify** — `uv tool install graphifyy` then `pnpm graph:build` after major architectural changes. See `GRAPHIFY.md`.
5. **Skills & rules** — already in `.cursor/skills` and `.cursor/rules`. Read `UPSTREAM.md` for provenance.
6. **Traces** — `OMAKASE_AI_TRACES=1 pnpm --filter @omakase/desktop test` then `pnpm traces:inspect`.
7. **Packaged golden path** — `pnpm build:desktop` (and platform smoke as available).
8. **Live evals** — only with your keys: `pnpm eval:live`.

## Everyday commands

```text
pnpm install
pnpm run doctor   # required: `run` — bare `pnpm doctor` is pnpm’s builtin
pnpm dev
pnpm verify
```

## Learn more

- `docs/AI_ENGINEERING.md`
- `docs/decisions/ADR-AI-ENGINEERING-TOOLING.md`
- `evals/AGENTS.md`
