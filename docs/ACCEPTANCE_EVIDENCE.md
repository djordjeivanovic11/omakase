# Acceptance evidence — personal macOS MVP (2026-07-31)

Authoritative product checklist: [`ACCEPTANCE_CHECKLIST.md`](./ACCEPTANCE_CHECKLIST.md).  
This file records **reproducible evidence** for the personal Apple Silicon MVP gate. Items that need store credentials, Windows runners, or notarization stay EXTERNAL.

## Gate commands (all green on this machine)

```bash
nvm use 24
pnpm run doctor                          # OK
pnpm typecheck                           # contracts, desktop, extension, website
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test   # 72 passed
node ./evals/runners/deterministic.mjs   # 53/53
pnpm --filter @omakase/extension build && pnpm --filter @omakase/extension build:edge
pnpm build:website
pnpm --filter @omakase/desktop package
OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1 pnpm --filter @omakase/desktop test:packaged  # 7 passed
pnpm make:dmg                            # apps/desktop/out/make/Omakase-darwin-arm64.dmg
```

Live OpenAI (opt-in, never commit keys):

```bash
# OPENAI_API_KEY=… pnpm --filter @omakase/desktop exec vitest run --config vitest.live.config.ts
```

## Status by area

| Area | Status | Evidence |
|---|---|---|
| A Build | PASS (local) | doctor, typecheck, 72 unit/integration, extension + website builds, package + packaged-smoke |
| B Install | PASS macOS arm64 unsigned; EXTERNAL signing/Windows | `.app` + `make:dmg` hdiutil DMG; ACC-INS-004/005 EXTERNAL |
| C Electron security | PASS | `window-security`, `ipc-allowlist`, `architecture` tests |
| D Providers / secrets | PASS mock + opt-in live | secrets-isolation, redaction, mock golden; live suite when keyed |
| E Database | PASS | migration, persistence, backup-restore |
| F Studios / nav | PASS | UI + IPC; packaged smoke nav; archive confirm |
| G Sources | PASS core paths | text/PDF/transcript/URL/web ingest + multi-select; audio transcription deferred |
| H Web/file safety | PASS core | url-policy, web-sanitize; full archive/pathological suite partial |
| I PDF | PASS digital text | pdf-blocks / extract tests; vision fallback EXTERNAL/deferred |
| J Extension | PASS local unpack | native host + You allowlist; store IDs EXTERNAL |
| K Media | PASS transcripts | transcript-parse; podcasting/YouTube/audio transcription deferred |
| L Embeddings | PASS with vendored ONNX + hash fallback | `resources/models/…/onnx/model.onnx` + manifest; ExactScanVectorIndex |
| M Retrieval / citations | PASS | rrf, hybrid, citations unit + mock/live golden |
| N Agent | PASS | one agent, tools, budgets raised for local libraries, mock golden |
| O Research web | IN PROGRESS / deferred | research-policy unit; provider-native search not required for personal MVP |
| P Probe / mastery | PASS | probe machine + mock/live Probe |
| Q Golden path | PASS mock + packaged smoke (+ live opt-in) | mock-agent-golden, packaged-smoke, packaged-golden-path (keyed) |

## Explicitly out of personal MVP scope

- Apple notarization / Developer ID
- Windows installer CI artifact
- Chrome/Edge **store** extension publication
- Full ACC-PDF vision OCR path
- ACC-MED podcasting / voice Probe transcription UX
- 50k-block formal latency report

## Sign-off (personal use)

| Role | Decision | Date |
|---|---|---|
| Engineering (local) | **PASS — ready for personal use on macOS arm64** | 2026-07-31 |
| Product / Security / Release (public store) | Deferred — EXTERNAL credentials | — |
