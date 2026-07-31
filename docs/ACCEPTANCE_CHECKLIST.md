# Version-One Acceptance Checklist

**Product:** Local Learning Agent  
**Release candidate:** 0.1.0 personal macOS arm64  
**Commit:** local workspace (pre-first-push)  
**Date:** 2026-07-31  

A requirement is complete only when its evidence is reproducible from a clean checkout or packaged artifact. Use:

```text
NOT STARTED | IN PROGRESS | PASS | FAIL | EXTERNAL CREDENTIAL BLOCKED | NOT APPLICABLE
```

`EXTERNAL CREDENTIAL BLOCKED` is allowed only for actual signing, notarization, store publication, or paid-provider credentials. It is not allowed for unimplemented local behavior.

### Personal MVP gate (this machine)

**Verdict: PASS for personal use on macOS Apple Silicon** (unsigned).  
Filled evidence matrix: [`ACCEPTANCE_EVIDENCE.md`](./ACCEPTANCE_EVIDENCE.md).  
User guide: [`USING_OMAKASE.md`](./USING_OMAKASE.md).  
Readiness report: [`MVP_READINESS_REPORT.md`](./MVP_READINESS_REPORT.md).

Rows below remain the full version-one matrix; many public-release rows stay EXTERNAL or deferred as noted in the evidence file.

---

## A. Repository and build

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-BLD-001 | Clean checkout installs with the pinned pnpm lockfile. | CI command and log. | |
| ACC-BLD-002 | Node and pnpm versions are pinned. | `.nvmrc`/Volta/Corepack files. | |
| ACC-BLD-003 | Typecheck passes for all workspaces. | CI log. | |
| ACC-BLD-004 | Lint/format check passes with one configured toolchain. | CI log. | |
| ACC-BLD-005 | Unit and integration tests pass. | CI log. | |
| ACC-BLD-006 | Desktop renderer, preload, main, and utility processes build. | CI artifacts. | |
| ACC-BLD-007 | Chrome and Edge extension builds succeed. | CI artifacts. | |
| ACC-BLD-008 | Dependency license report is generated. | Attached report. | |
| ACC-BLD-009 | SBOM is generated for release artifacts. | Attached SBOM. | |
| ACC-BLD-010 | No production TODO/FIXME/stub/not-implemented marker remains. | Repository scan command. | |
| ACC-BLD-011 | Architecture decisions document material deviations. | ADR index. | |
| ACC-BLD-012 | Packaged app launches from a clean macOS user account. | Packaged smoke-test log/video. | |
| ACC-BLD-013 | Packaged app launches from a clean Windows user account. | Packaged smoke-test log/video. | |

## B. Installation, updates, and ownership

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-INS-001 | macOS arm64 DMG is produced. | Release artifact. | |
| ACC-INS-002 | Maintained macOS x64 artifact is produced or explicitly excluded by release policy. | Artifact or ADR. | |
| ACC-INS-003 | Windows x64 installer is produced. | Release artifact. | |
| ACC-INS-004 | macOS artifact is signed and notarized. | Verification output. | |
| ACC-INS-005 | Windows artifact is code-signed. | Signature verification output. | |
| ACC-INS-006 | App requires no terminal, Docker, Python, or account. | Fresh-user manual record. | |
| ACC-INS-007 | Existing local library remains usable without internet. | Offline E2E test. | |
| ACC-INS-008 | Update metadata is generated from GitHub Releases configuration. | Release workflow output. | |
| ACC-INS-009 | Downloaded update never interrupts an active learning or ingestion operation. | Integration/E2E test. | |
| ACC-INS-010 | Destructive migration creates a backup first. | Migration test. | |
| ACC-INS-011 | User can skip an available version. | Manual/E2E test. | |

## C. Electron security boundary

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-ELC-001 | Renderer has `nodeIntegration: false`. | Automated BrowserWindow assertion. | |
| ACC-ELC-002 | Renderer has `contextIsolation: true`. | Automated BrowserWindow assertion. | |
| ACC-ELC-003 | Renderer has `sandbox: true`. | Automated BrowserWindow assertion. | |
| ACC-ELC-004 | Renderer cannot import Node, filesystem, SQLite, provider SDKs, or secrets. | Build rule and runtime test. | |
| ACC-ELC-005 | Preload exposes only named typed methods; no generic invoke/send. | Contract test and source audit. | |
| ACC-ELC-006 | IPC inputs and outputs are validated on both sides. | Invalid-payload tests. | |
| ACC-ELC-007 | Main process validates sender/frame identity. | Security test. | |
| ACC-ELC-008 | External URLs open only through validated HTTP(S) policy. | Security tests. | |
| ACC-ELC-009 | Privileged windows never load arbitrary remote content. | Window audit/test. | |
| ACC-ELC-010 | Utility workers cannot write the database directly. | Architecture/test evidence. | |
| ACC-ELC-011 | Worker crash requeues bounded jobs without corrupting state. | Fault-injection test. | |
| ACC-ELC-012 | CSP blocks unsafe script execution. | Packaged CSP test. | |

## D. Provider setup and secrets

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-PRV-001 | OpenAI provider profile and connection test work. | Mock contract + optional real test. | |
| ACC-PRV-002 | Anthropic provider profile and connection test work. | Mock contract + optional real test. | |
| ACC-PRV-003 | OpenRouter provider profile and connection test work. | Mock contract + optional real test. | |
| ACC-PRV-004 | User can select and persist a default model. | Integration test. | |
| ACC-PRV-005 | Capability test records web search, vision, files, transcription, and structured-output support. | Provider contract tests. | |
| ACC-PRV-006 | Unsupported capability has a clear local fallback or explanation. | UI/E2E test. | |
| ACC-PRV-007 | API key survives restart encrypted through OS-backed storage. | Restart test. | |
| ACC-PRV-008 | API key never appears in SQLite. | Database scan test. | |
| ACC-PRV-009 | API key never reaches renderer state or IPC result. | Instrumented security test. | |
| ACC-PRV-010 | API key and Authorization header never appear in logs or diagnostic bundle. | Redaction tests. | |
| ACC-PRV-011 | Provider requests go directly from desktop to provider, not through a project backend. | Network architecture test/audit. | |
| ACC-PRV-012 | Deterministic mock provider supports full golden path without paid credentials. | CI E2E log. | |

## E. Database and local persistence

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-DB-001 | Migration 0001 executes on an empty database. | Migration test. | |
| ACC-DB-002 | Migration checksums are enforced. | Tamper test. | |
| ACC-DB-003 | Foreign keys are enabled on every connection. | Connection test. | |
| ACC-DB-004 | `foreign_key_check` and `integrity_check` pass. | CI test. | |
| ACC-DB-005 | SQLite runs in WAL mode with configured busy timeout. | Runtime assertion. | |
| ACC-DB-006 | One main-process connection owns writes. | Architecture test/audit. | |
| ACC-DB-007 | Multi-table state transitions are atomic. | Fault-injection tests. | |
| ACC-DB-008 | All persisted timestamps use UTC epoch milliseconds. | Schema/application tests. | |
| ACC-DB-009 | Backup uses a consistent SQLite backup plus content files. | Backup test. | |
| ACC-DB-010 | Restore recreates the same logical state and passes integrity checks. | Round-trip test. | |
| ACC-DB-011 | App resumes from an interrupted persistent job queue. | Forced-restart test. | |
| ACC-DB-012 | `learning_events` rejects update and delete. | Schema tests. | |
| ACC-DB-013 | `concept_state` can be rebuilt from learning events. | Projection rebuild test. | |
| ACC-DB-014 | FTS index remains synchronized after insert/update/delete. | Trigger tests. | |

## F. Studios, Inbox, and local ownership

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-STU-001 | User can create, edit, pause, complete, archive, and reopen a Studio. | E2E test. | |
| ACC-STU-002 | Studio supports one active primary goal and secondary goals. | Database/UI tests. | |
| ACC-STU-003 | Studio source roles are assignable and persisted. | Integration test. | |
| ACC-STU-004 | Active Studio has at most one primary next action. | Constraint/policy test. | |
| ACC-STU-005 | Archiving hides Studio from Today without deleting evidence. | E2E test. | |
| ACC-STU-006 | Inbox accepts unassigned sources and later assigns them to a Studio. | E2E test. | |
| ACC-STU-007 | User can create a Studio from a natural-language objective. | Mock-provider E2E. | |
| ACC-STU-008 | Draft onboarding learner claims require user approval before durable storage. | E2E test. | |
| ACC-STU-009 | App has top-level Today, Studios, Inbox, and You navigation only. | UI inspection/test. | |

## G. Source intake and content-addressed storage

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-SRC-001 | Local PDF import works. | Fixture E2E. | |
| ACC-SRC-002 | Remote PDF URL import works under network policy. | Integration test. | |
| ACC-SRC-003 | Browser-captured webpage import works. | Extension E2E. | |
| ACC-SRC-004 | Direct ordinary webpage import works. | Integration test. | |
| ACC-SRC-005 | Markdown, text, pasted text, and user note import work. | Integration tests. | |
| ACC-SRC-006 | VTT, SRT, timestamped JSON, and plain transcript import work. | Parser fixtures. | |
| ACC-SRC-007 | Local audio file can enter explicit transcription flow. | Mock-provider E2E. | |
| ACC-SRC-008 | Saving any source invokes no LLM. | Instrumented test. | |
| ACC-SRC-009 | Original local asset is stored by SHA-256. | Storage test. | |
| ACC-SRC-010 | Duplicate binary/normalized content is detected idempotently. | Duplicate tests. | |
| ACC-SRC-011 | Changed content at the same URL creates a new version. | Versioning test. | |
| ACC-SRC-012 | Near duplicate is proposed, never silently discarded. | Integration test. | |
| ACC-SRC-013 | Interrupted ingestion resumes from first incomplete stage. | Forced-restart test. | |
| ACC-SRC-014 | Every stage has machine-readable status and error. | Database/UI test. | |
| ACC-SRC-015 | User can retry failed stages. | E2E test. | |
| ACC-SRC-016 | Source page shows original, metadata, outline, notes, quality, and history. | UI E2E. | |
| ACC-SRC-017 | Source page offers Learn, Ask, Probe, Compare, and reading guidance. | UI E2E. | |
| ACC-SRC-018 | Source Card is lazy and cached by source/model/prompt/schema hash. | Call-count integration test. | |

## H. Web and file safety

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-SEC-001 | Direct fetch allows only HTTP(S). | URL policy tests. | |
| ACC-SEC-002 | Embedded URL credentials are rejected. | URL policy tests. | |
| ACC-SEC-003 | Loopback, link-local, private, and metadata-service destinations are blocked by default. | SSRF test suite. | |
| ACC-SEC-004 | Redirect count, final destination, size, MIME type, and timeout are enforced. | Network tests. | |
| ACC-SEC-005 | Captured HTML is sanitized and scripts never execute. | Malicious fixture E2E. | |
| ACC-SEC-006 | File type is sniffed rather than trusted by extension. | File fixture tests. | |
| ACC-SEC-007 | Path traversal and unsafe archive paths are rejected. | Security tests. | |
| ACC-SEC-008 | Oversized or pathological files fail safely. | Resource-limit tests. | |
| ACC-SEC-009 | Imported prompt injection cannot change policy or obtain tools. | Agent security eval. | |
| ACC-SEC-010 | Source tools are read-only and scoped to authorized IDs. | Tool contract tests. | |

## I. PDF extraction and viewing

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-PDF-001 | Digital paper text is extracted page by page. | Fixture test. | |
| ACC-PDF-002 | Outline, links, text items, and page count are retained when available. | Fixture test. | |
| ACC-PDF-003 | Structural blocks preserve page locators. | Fixture/assertion. | |
| ACC-PDF-004 | Multi-column reading-order fixture produces acceptable block order. | Golden fixture. | |
| ACC-PDF-005 | Headers/footers are identified without deleting legitimate text. | Fixture test. | |
| ACC-PDF-006 | Code, equations, captions, and tables retain coherent boundaries where practical. | Fixture suite. | |
| ACC-PDF-007 | Per-page extraction quality and suspect-page list are calculated. | Unit/fixture tests. | |
| ACC-PDF-008 | Poor extraction produces visible `needs_attention`, not false success. | E2E test. | |
| ACC-PDF-009 | Targeted vision fallback requires explicit approval and selected pages. | E2E/mock test. | |
| ACC-PDF-010 | Vision-derived blocks record provider/model/prompt/page hashes. | Database test. | |
| ACC-PDF-011 | Citation opens exact PDF page and highlights relevant region/text. | Packaged E2E. | |

## J. Webpage extraction and extension capture

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-WEB-001 | Defuddle extraction preserves headings, code, math, links, and footnotes where available. | Fixture tests. | |
| ACC-WEB-002 | Browser capture works on a client-rendered test page. | Extension E2E. | |
| ACC-WEB-003 | Capture includes URL, final title, author/date when available, selection, and user note. | Protocol test. | |
| ACC-WEB-004 | User can choose Inbox or Studio destination. | Extension E2E. | |
| ACC-WEB-005 | App-closed capture remains in extension retry queue. | Browser E2E. | |
| ACC-WEB-006 | Retry imports once app becomes available and remains idempotent. | Browser/desktop E2E. | |
| ACC-WEB-007 | Native messaging accepts only configured extension IDs. | Security test. | |
| ACC-WEB-008 | Native messaging payloads are schema-validated and size-limited. | Protocol tests. | |
| ACC-WEB-009 | Chrome package installs and captures successfully. | Store/dev package test. | |
| ACC-WEB-010 | Edge package installs and captures successfully. | Store/dev package test. | |

## K. Transcript and media handling

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-MED-001 | Podcasting 2.0 transcript tag is discovered and imported. | RSS fixture. | |
| ACC-MED-002 | Transcript segments preserve timestamps and optional speakers. | Parser tests. | |
| ACC-MED-003 | Transcript blocks preserve timestamp mapping after merging. | Fixture test. | |
| ACC-MED-004 | Publisher/user transcript is preferred over transcription. | Policy test. | |
| ACC-MED-005 | App does not depend on unsupported arbitrary YouTube caption download. | Source audit/test. | |
| ACC-MED-006 | Transcription shows provider, model, duration, and cost estimate before approval. | E2E test. | |
| ACC-MED-007 | Cancelling transcription leaves recoverable state and no false transcript. | Integration test. | |
| ACC-MED-008 | Generated transcript is stored locally and reused. | Call-count test. | |
| ACC-MED-009 | Voice Probe answer transcript is shown for correction before evaluation. | E2E test. | |
| ACC-MED-010 | Transcript citation opens exact timestamp. | Packaged E2E. | |

## L. Local embeddings and indexing

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-EMB-001 | Exact Granite model revision and SHA-256 manifest are bundled. | Manifest verification. | |
| ACC-EMB-002 | Model license notice is included. | Release artifact audit. | |
| ACC-EMB-003 | Model loads without remote download. | Offline test. | |
| ACC-EMB-004 | Inference uses required pooling and normalization. | Numerical fixture test. | |
| ACC-EMB-005 | Output is 384 finite Float32 values. | Unit test. | |
| ACC-EMB-006 | Embedding runs outside renderer and main event loop. | Responsiveness test. | |
| ACC-EMB-007 | Batch progress and cancellation work. | Worker integration test. | |
| ACC-EMB-008 | Model change never mixes vector spaces. | Repository test. | |
| ACC-EMB-009 | Vector rows enforce dimensions and are rebuildable. | Database/rebuild test. | |
| ACC-EMB-010 | Exact-scan fallback works without vector extension. | Fallback test. | |
| ACC-EMB-011 | 50k-block indexing does not freeze navigation or typing. | Performance recording. | |

## M. Retrieval and citations

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-RET-001 | FTS5 lexical search works for exact names, terms, code, and identifiers. | Retrieval fixtures. | |
| ACC-RET-002 | Dense search handles semantic paraphrases. | Retrieval fixtures. | |
| ACC-RET-003 | Hybrid RRF merges lexical and dense candidates. | Unit/integration test. | |
| ACC-RET-004 | Studio/source/type/date/language filters are enforced. | Integration tests. | |
| ACC-RET-005 | Diversity pass prevents duplicate/page monopolization. | Retrieval test. | |
| ACC-RET-006 | Normal agent context contains only bounded selected blocks. | Instrumented test. | |
| ACC-RET-007 | Retrieval eval reports Recall@5/10, MRR@10, and nDCG@10. | Eval report. | |
| ACC-RET-008 | Hybrid beats agreed lexical-only baseline. | Eval report. | |
| ACC-RET-009 | 50k-block search meets the recorded latency budget on target hardware. | Benchmark report. | |
| ACC-CIT-001 | Model sees opaque handles only for supplied source blocks. | Agent contract test. | |
| ACC-CIT-002 | Unknown handle is rejected and never rendered as valid. | Unit/E2E test. | |
| ACC-CIT-003 | Deleted or unavailable locator fails closed. | Integration test. | |
| ACC-CIT-004 | Repair call is bounded and cannot invent new handles. | Agent contract test. | |
| ACC-CIT-005 | Article citation opens heading and paragraph. | E2E test. | |
| ACC-CIT-006 | PDF citation opens page/region. | E2E test. | |
| ACC-CIT-007 | Transcript citation opens timestamp. | E2E test. | |

## N. Agent behavior

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-AGT-001 | One AI SDK ToolLoopAgent serves Learn, Research, and Probe modes. | Architecture test/audit. | |
| ACC-AGT-002 | Runtime context scopes Studio, sources, provider capabilities, budget, and mode. | Unit test. | |
| ACC-AGT-003 | Agent tools use Zod-validated inputs and outputs. | Contract tests. | |
| ACC-AGT-004 | Local source is searched before web for source-specific questions. | Mock trace test. | |
| ACC-AGT-005 | Agent can state that a source does not answer a question. | Eval fixture. | |
| ACC-AGT-006 | Learn mode has no unscoped web or write tool. | Tool-set test. | |
| ACC-AGT-007 | Research mode adds only supported, budgeted search/capture tools. | Tool-set test. | |
| ACC-AGT-008 | Probe mode has web search disabled by default. | Tool-set test. | |
| ACC-AGT-009 | Maximum steps, timeout, cancellation, and cost ceiling are enforced. | Integration tests. | |
| ACC-AGT-010 | Cancellation stops streaming and tool work cleanly. | E2E test. | |
| ACC-AGT-011 | Agent has no raw SQL, shell, arbitrary filesystem, generic HTTP, or secret tool. | Source audit/contract test. | |
| ACC-AGT-012 | Stable instructions and tool descriptions are arranged for provider caching. | Request inspection. | |
| ACC-AGT-013 | Source content is structurally marked as untrusted. | Prompt contract test. | |
| ACC-AGT-014 | Source Card generation is structured and schema-validated. | Mock contract test. | |
| ACC-AGT-015 | Compare distinguishes agreement, terminology, method, evidence, limits, chronology, and novelty. | Eval fixture. | |
| ACC-AGT-016 | User can choose supported teaching policy hints without spawning different agents. | E2E/architecture test. | |

## O. Research and web search

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-RSH-001 | Web research is explicit or triggered only by a current-information need. | Policy tests. | |
| ACC-RSH-002 | OpenAI native web search works when selected model supports it. | Mock/optional real test. | |
| ACC-RSH-003 | Anthropic native web search works when selected model supports it. | Mock/optional real test. | |
| ACC-RSH-004 | Unsupported provider/model gets a clear downgrade path. | E2E test. | |
| ACC-RSH-005 | Search result snippet alone is not durable evidence. | Policy test. | |
| ACC-RSH-006 | Used research evidence is captured locally with URL, retrieval time, excerpt, and hash. | Database test. | |
| ACC-RSH-007 | Source hierarchy favors primary/official material. | Research eval fixtures. | |
| ACC-RSH-008 | Research run obeys tool, duration, and cost limits. | Integration test. | |
| ACC-RSH-009 | User can inspect every captured research source. | E2E test. | |

## P. Probe and learner state

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-PRB-001 | Probe asks only one visible open-ended question at a time. | E2E test. | |
| ACC-PRB-002 | No multiple-choice questionnaire is used as primary Probe. | UI/eval audit. | |
| ACC-PRB-003 | First question exposes learner model rather than recognition. | Eval fixtures. | |
| ACC-PRB-004 | Later question adapts to prior answer. | Mock trace tests. | |
| ACC-PRB-005 | Every question stores hidden target concepts, distinctions, patterns, misconceptions, and evidence level. | Database test. | |
| ACC-PRB-006 | Evidence excerpt must appear verbatim in the user answer. | Positive/negative tests. | |
| ACC-PRB-007 | Invalid evidence proposal is rejected transactionally. | Integration test. | |
| ACC-PRB-008 | Reading/highlighting can grant only `encountered`. | Policy test. | |
| ACC-PRB-009 | `can_explain` requires explanation evidence. | Policy test. | |
| ACC-PRB-010 | `can_apply` requires transfer/application evidence. | Policy test. | |
| ACC-PRB-011 | `can_compare_or_critique` requires trade-off/comparison evidence. | Policy test. | |
| ACC-PRB-012 | Hinted repetition is weighted below unprompted evidence. | Projection test. | |
| ACC-PRB-013 | Contradictory evidence reduces certainty without deleting history. | Projection test. | |
| ACC-PRB-014 | Probe stops on objective, prerequisite gap, misconception, limit, or user stop. | State-machine tests. | |
| ACC-PRB-015 | Probe completion commits result, events, projection, and next action atomically. | Fault-injection test. | |
| ACC-PRB-016 | Learning Map shows secure, uncertain, misconception, prerequisite, evidence, and next action. | E2E test. | |
| ACC-PRB-017 | User correction creates a new event. | E2E/database test. | |
| ACC-PRB-018 | User retraction creates a new retraction event. | E2E/database test. | |
| ACC-PRB-019 | Global prompts receive only distilled transferable state, not unrelated conversations. | Context inspection test. | |
| ACC-PRB-020 | Preferences and mastery are stored/retrieved separately. | Database/agent test. | |
| ACC-PRB-021 | Probe eval reports agreement, excerpt validity, misconception precision, and overpromotion rate. | Eval report. | |
| ACC-PRB-022 | Prompt-injected or polished-but-empty answer does not receive false mastery. | Eval fixtures. | |

## Q. Today and next-action policy

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-TDY-001 | Today shows a small finite list, not infinite feed. | UI test. | |
| ACC-TDY-002 | Each recommendation explains why it is next. | E2E test. | |
| ACC-TDY-003 | Each active Studio has at most one primary next action. | Database/policy test. | |
| ACC-TDY-004 | Completing/dismissing an action deterministically replaces or clears it. | Integration test. | |
| ACC-TDY-005 | Next action can target exact source block/page/timestamp. | E2E test. | |
| ACC-TDY-006 | Main CTA is normally Continue learning. | UI audit. | |

## R. Cost control and usage

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-CST-001 | Every remote call creates a usage event. | Instrumented tests. | |
| ACC-CST-002 | Usage records provider, model, operation, token fields, latency, and estimated cost where known. | Database test. | |
| ACC-CST-003 | Failed/cancelled remote calls are represented accurately. | Integration test. | |
| ACC-CST-004 | Session and monthly warning/hard limits are enforced. | Budget tests. | |
| ACC-CST-005 | Context excludes full library and unnecessary full history. | Request inspection. | |
| ACC-CST-006 | One Probe evaluation call returns feedback, evidence, misconceptions, and next question together. | Provider trace test. | |
| ACC-CST-007 | Source save/index uses zero LLM calls. | Call counter test. | |
| ACC-CST-008 | Transcription and vision show cost estimate before approval. | E2E tests. | |
| ACC-CST-009 | Usage screen presents session and monthly estimates plainly. | UI E2E. | |

## S. Export, restore, deletion, and diagnostics

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-EXP-001 | Studio exports to ordinary Markdown and JSON. | Export test. | |
| ACC-EXP-002 | Complete local backup includes database and content-addressed assets. | Backup inspection. | |
| ACC-EXP-003 | Restore into fresh profile recreates Studios, sources, annotations, and learner evidence. | Round-trip E2E. | |
| ACC-EXP-004 | Export excludes API keys and encrypted secret blobs. | Security test. | |
| ACC-EXP-005 | User can delete source, Studio, learner memory, and all local data with clear scope. | E2E tests. | |
| ACC-EXP-006 | Deletion handles references without corrupting citation/evidence history. | Integrity tests. | |
| ACC-EXP-007 | Diagnostic bundle is previewable and opt-in. | E2E test. | |
| ACC-EXP-008 | Diagnostic bundle is redacted and excludes private content by default. | Security test. | |
| ACC-EXP-009 | Diagnostic bundle includes schema/app/model/native dependency versions and integrity results. | Bundle inspection. | |

## T. Accessibility and product finish

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-UX-001 | Complete keyboard navigation works. | Playwright accessibility E2E. | |
| ACC-UX-002 | Focus is visible and logical. | Accessibility audit. | |
| ACC-UX-003 | Screen-reader names/roles/states are present. | Automated/manual audit. | |
| ACC-UX-004 | Reduced-motion preference is honored. | UI test. | |
| ACC-UX-005 | Zoom and text scaling remain usable. | Manual/E2E test. | |
| ACC-UX-006 | No critical WCAG 2.2 AA issue remains. | Audit report. | |
| ACC-UX-007 | Long jobs show understandable state, progress, cancel/retry, and errors. | E2E test. | |
| ACC-UX-008 | Normal settings expose no chunks, vectors, agent loops, MCP, or temperature controls. | UI audit. | |
| ACC-UX-009 | No infinite feed, streaks, gamification, giant graph, or dashboard clutter is present. | Product audit. | |
| ACC-UX-010 | Fresh nontechnical tester reaches first cited answer and Probe without developer help. | Usability record. | |

## U. Performance and reliability

Record representative hardware and exact dataset with every result.

| ID | Requirement | Required evidence | Status |
|---|---|---|---|
| ACC-PERF-001 | Warm application launch meets recorded product budget. | Benchmark. | |
| ACC-PERF-002 | 50k-block hybrid search meets recorded latency budget. | Benchmark. | |
| ACC-PERF-003 | Background indexing keeps renderer responsive. | Interaction benchmark. | |
| ACC-PERF-004 | Cancellation is observed within the recorded bound. | Benchmark. | |
| ACC-PERF-005 | Database remains intact after forced termination during each ingestion stage. | Fault suite. | |
| ACC-PERF-006 | Worker retry stops after bounded attempts and surfaces useful error. | Fault suite. | |
| ACC-PERF-007 | Large source import respects memory/resource limits. | Benchmark. | |
| ACC-PERF-008 | App handles missing/corrupt model asset with repair path rather than crash loop. | Fault test. | |

## V. Golden-path release proof

The packaged release must pass this exact sequence on macOS and Windows:

| ID | Step | Evidence | Status |
|---|---|---|---|
| ACC-GOLD-001 | Install and launch without terminal or account. | Packaged E2E. | |
| ACC-GOLD-002 | Add mock or real provider profile and select model. | Packaged E2E. | |
| ACC-GOLD-003 | Create an Agent Memory Studio from plain-language goal. | Packaged E2E. | |
| ACC-GOLD-004 | Import a PDF fixture and observe local processing. | Packaged E2E. | |
| ACC-GOLD-005 | Ask a question and receive a precise valid citation. | Packaged E2E. | |
| ACC-GOLD-006 | Open the citation at the exact source page. | Packaged E2E. | |
| ACC-GOLD-007 | Start Probe and answer three adaptive open-ended questions. | Packaged E2E. | |
| ACC-GOLD-008 | See validated Learning Map and persisted concept state. | Packaged E2E. | |
| ACC-GOLD-009 | See exact next source section in Today/Studio. | Packaged E2E. | |
| ACC-GOLD-010 | Restart app and recover all state. | Packaged E2E. | |
| ACC-GOLD-011 | Capture a webpage from extension and learn from it. | Packaged cross-app E2E. | |
| ACC-GOLD-012 | Export, reset profile, restore, and recover the same state. | Packaged E2E. | |

---

## Release sign-off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Product | Personal MVP | PASS (local use) | 2026-07-31 | See ACCEPTANCE_EVIDENCE.md |
| Engineering | Local workspace | PASS (macOS arm64 unsigned) | 2026-07-31 | 72 + 7 packaged + 53 evals |
| Security | — | DEFERRED (public) | — | Unsigned; secrets isolation tested |
| Accessibility | — | NOT STARTED formal audit | — | Basic UI shipping |
| Release | Public store | EXTERNAL CREDENTIAL BLOCKED | — | Notarization / Windows / store IDs |
