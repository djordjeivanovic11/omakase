# Implementation status

## Current milestone

Milestone 8 — **Personal MVP + no-fake-runtime hardening**, with the first production slice of source scopes, collections, durable capture protocol, persisted agent activity, and PDF evidence provenance. Silent mock fallback fixed; production hash embeddings removed; GPT-5.6 defaults; sidebar Learn workspace with resizable source/teacher panes, rendered citations, KaTeX math, and code blocks. See `docs/PRODUCT_AND_AGENT_REDESIGN.md` and `docs/REALITY_AUDIT.md`.

## 2026-08-02 implementation slice

Implemented and persisted:

- `SourceScope` and immutable active source-version snapshots for sessions.
- Many-to-many Studio collections exposed through typed IPC/preload APIs.
- Scope enforcement through hybrid retrieval and agent tools, including empty-scope fail-closed behavior.
- Append-only `agent_runs`/`agent_events`, live activity events, activity replay IPC, and provider cancellation propagation.
- Versioned Native Messaging envelopes, extension-origin validation in the packaged host, context-menu capture, Studio counts/search/recent state, durable no-drop retries, and `omakase://capture/<request-id>` focus handling.
- PDF atom/evidence schema, native PDF.js text geometry, original-file `omakase-pdf://` serving, a PDF.js page viewer, persisted atom anchors, and tested bottom-left PDF to top-left overlay coordinates. Existing flattened extraction remains available as the compatibility text path; scanned-page OCR and layout-aware parser selection are intentionally not claimed.
- Citation persistence now creates source-version evidence and claim-to-evidence links before emitting citation stream events; the Learn PDF pane can render the persisted evidence quads when the active source matches.
- Capture status now survives the initial native-host acknowledgement: the extension polls the local database through the host until import completion or a terminal error.
- The agent now performs a bounded source-backed concept reconciliation pass after citation persistence. Existing Studio concepts that co-occur in the same cited passage receive a canonical `related` edge, and both concept evidence and relation evidence are persisted. Unsupported or short-token matches are ignored.
- Final hardening pass: every IPC channel now shares renderer sender validation; URL ingestion revalidates each redirect and bounds response bodies; browser/native inbox files are atomically claimed; incomplete source versions are not used for deduplication; scopes reject cross-Studio and deleted-source expansion; and real agent tool-call limits are enforced.

Parser benchmarking across Docling/MinerU/GROBID, OCR for scanned PDFs, structure-aware atom-to-chunk spans (the current links are page-scoped), richer model-assisted relation types, multi-source evidence rail/history, and Windows native-host registration remain incomplete.

## Working golden path

Automated (mock provider, no API keys):

1. Create Studio
2. Import text / note / markdown / PDF (multi-select) / transcript / URL
3. Local extract/index with **5 concurrent workers** (blocks + FTS5 + embeddings)
4. Ask a source-grounded question → verified citations
5. Complete adaptive Probe
6. Persist validated learning evidence
7. Learning Map + primary next action
8. Backup/restore round-trip
9. Packaged macOS arm64 app launches + smoke E2E
10. Local DMG via `pnpm make:dmg`

Evidence: `apps/desktop/tests/integration/mock-agent-golden.test.ts`, packaged-smoke (7), migration/backup/secrets tests, live OpenAI suite (opt-in).

## Acceptance evidence

| ID | Status | Command / artifact | Notes |
|---|---|---|---|
| ACC-BLD-001–007 | PASS | `pnpm verify` | Full default gate passed on 2026-08-02, including typecheck, tests, builds, and package |
| ACC-BLD-008 | PASS | `pnpm licenses` → `docs/dependency-licenses.json` | |
| ACC-BLD-012 | PASS | `pnpm --filter @omakase/desktop test:packaged` (7) | Clean-user video N/A for personal |
| ACC-INS-001 | PASS (unsigned) | `pnpm make:dmg` → `out/make/Omakase-darwin-arm64.dmg` | |
| ACC-INS-004/005 | EXTERNAL CREDENTIAL BLOCKED | Signing/notarization | `docs/release.md` |
| ACC-DB-* | PASS | migration / persistence / backup-restore | |
| ACC-PRV-* | PASS mock; live opt-in | secrets-isolation + redaction | |
| ACC-STU-* | PASS | Studios/Inbox/Today/You + archive confirm | |
| ACC-SRC-* | PASS core | multi PDF/transcript; audio transcription deferred | |
| ACC-EMB-* | PASS local | Vendored Granite ONNX + no production hash fallback + ExactScan | |
| ACC-RET-* / ACC-CIT-* | PASS | hybrid/RRF/citations + golden | |
| ACC-AGT-* / ACC-PRB-* | PASS | one agent; raised local budgets; Probe | |
| ACC-WEB-* | PASS local / EXTERNAL store | native host + You register ID | |
| ACC-GOLD-* | PASS mock + packaged (+ live keyed) | Windows EXTERNAL | |

## Known external blockers

1. Apple Developer ID + notarization credentials
2. Windows Authenticode certificate
3. Chrome/Edge store extension IDs for publication
4. Public GitHub Release upload (when ready to publish)

## Architecture decisions made

- Status file: `docs/IMPLEMENTATION_STATUS.md`; structure per `AGENTS.md` §9
- Biome as sole lint/format toolchain
- pnpm `node-linker=hoisted` required by Electron Forge
- Granite ONNX vendored under `resources/models/` (not in git if oversized — fetch via `pnpm --filter @omakase/desktop fetch:model`)
- HashEmbeddingService is test-only; missing ONNX makes production embedding jobs fail honestly
- Mock provider requires deterministic test harness mode (`OMAKASE_TEST=1` + `OMAKASE_MOCK_PROVIDER=1` plus Vitest or packaged smoke) and an explicit local-mock profile
- macOS DMG via `hdiutil` (`scripts/make-macos-dmg.sh`), not Forge MakerDMG
- 5 local job workers for ingestion/embedding
- Immutable source scopes and persisted activity events: `migrations/0002_scopes_collections_evidence.sql`

## Commands used

```bash
nvm use 24
pnpm install
pnpm run doctor
pnpm typecheck
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test
node ./evals/runners/deterministic.mjs
pnpm verify:ai
pnpm --filter @omakase/desktop exec vitest run --config vitest.live.config.ts tests/live/local-embeddings.test.ts
pnpm --filter @omakase/desktop package
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test:packaged
OMAKASE_LIVE_TESTS=1 OPENAI_API_KEY=… OMAKASE_LIVE_MODEL=gpt-5.6 pnpm --filter @omakase/desktop test:live
pnpm make:dmg
pnpm --filter @omakase/extension build
pnpm build:website
```

## Test and build results

- Unit/integration: **105 passed** (`36` desktop files; contracts add 4 tests)
- Packaged smoke: **7 passed**
- Local ONNX embedding live check: **3 passed**
- Full live OpenAI + packaged golden path: **12 passed**
- Deterministic evals: **53/53**
- AI gate: **pass** (`pnpm verify:ai`; deterministic 53/53, Promptfoo regression 2/2, red-team 3/3, desktop AI subset 20/20)
- Typecheck: **pass**
- Desktop package: `apps/desktop/out/Omakase-darwin-arm64/Omakase.app`
- DMG: `apps/desktop/out/make/Omakase-darwin-arm64.dmg`
- Extension Chrome/Edge + website: **pass**

Latest implementation commands:

```bash
pnpm --filter @omakase/contracts build
pnpm typecheck
pnpm --filter @omakase/contracts test
pnpm --filter @omakase/extension build
pnpm exec biome check packages/contracts/src apps/desktop/src apps/extension
pnpm --filter @omakase/desktop package
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test:packaged
```

The AI gate was rerun on 2026-08-02 with Node 24.18.1. Deterministic evals,
offline Promptfoo regression/red-team fixtures, and the AI desktop test subset
all passed. Promptfoo required access to its existing local SQLite database;
the first restricted-shell attempt was an environment permission failure, not
an application failure.

The full default `pnpm verify` gate passed on 2026-08-02: doctor, formatting,
lint, workspace typecheck, unit/integration tests, deterministic evals, website
build, extension build, and desktop production packaging all completed. The
packaged app and smoke test passed with network/loopback permissions enabled;
all 7 packaged smoke tests passed. `git diff --check` is clean.

## Next (optional / external)

1. Benchmark and select a layout-aware parser, then add OCR and exact structure-aware atom-to-chunk spans.
2. Add cross-source claim/evidence history and richer model-assisted concept-edge proposals, keeping the conservative co-mention baseline as a fail-closed fallback.
3. Complete Windows native-host registration and package-level cold-start validation.
4. Notarize + ship GitHub Release when Apple credentials exist.
5. Windows CI package and store extension IDs.
