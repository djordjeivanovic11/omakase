# Graphify (optional)

Graphify turns a repository into a local queryable code graph (Tree-sitter), plus report/HTML output. It is an **optional repository-intelligence tool**, not an application dependency.

| Item | Value |
| --- | --- |
| Upstream | https://github.com/Graphify-Labs/graphify |
| PyPI package | `graphifyy` |
| CLI | `graphify` |
| License | Apache-2.0 |
| Python | ≥3.10 |
| Install | `uv tool install graphifyy` (isolated; not system Python; not Electron) |

## Why optional

Normal `pnpm install`, tests, and packaging must succeed without Graphify. Contributors are not required to install Python. CI must not fail when Graphify is absent.

## Commands

```bash
pnpm graph:build    # `graphify update .` → graphify-out/ (gitignored)
pnpm graph:report   # `graphify query …` against graphify-out/graph.json
pnpm graph:clean    # delete graphify-out/ and .graphify/
```

Optional project skill/rule install (does not make Graphify required):

```bash
graphify install --project --platform cursor
```

If Graphify is missing, the pnpm wrappers print install instructions and exit 0 (unless `--strict`).

## Good questions

- Which modules cross process boundaries?
- Where does ingestion meet retrieval?
- Where does learner evidence become concept state?
- What participates in Probe?
- Unexpectedly high coupling?
- Where do AI SDK calls enter?
- What is release-critical?

## Data / privacy

Local AST parsing is local. If you configure Graphify to call a model for semantic document processing, treat that as **your** opt-in: do not send private learner libraries or API keys. Prefer code/docs already in the git tree.

## Remove

```bash
pnpm graph:clean
uv tool uninstall graphifyy   # if installed via uv tool
```

Generated graphs are not architectural truth. Copy only manually reviewed insights into an ADR.

Evaluation notes: `GRAPHIFY_EVALUATION.md`.
