# Coding Agent Operating Contract

This repository implements the **Local Learning Agent** described in `TECHNICAL_SPEC.md`.

This file is an execution contract for an autonomous coding agent. It is not a replacement for the product specification.

## 1. Authority order

When documents differ, use this order:

1. `TECHNICAL_SPEC.md` — product and architecture contract.
2. `SCHEMA.sql` — canonical version-one persistence model.
3. `ACCEPTANCE_CHECKLIST.md` — release evidence required.
4. This file — implementation process.
5. Architecture decision records created during implementation.

Do not reinterpret the product as a generic chatbot, RAG shell, note-taking app, feed reader, or general agent platform.

The golden path is:

> Create a Studio → add one PDF or captured webpage → locally extract and index it → ask a cited question → learn one concept → complete an adaptive three-question Probe → persist validated learner evidence → show the Learning Map → recommend the exact next source section.

## 2. Completion mandate

Continue implementation milestone by milestone until every applicable version-one acceptance criterion passes.

Do not stop after:

- scaffolding;
- mock screens;
- interfaces without implementations;
- a chat demo;
- a happy path that bypasses persistence;
- a README claiming future behavior;
- adding TODO, FIXME, placeholder, stub, or `throw new Error("not implemented")` in production paths.

An absent external credential is not a blocker. Use deterministic provider mocks and complete the full local flow. Code-signing certificates, notarization credentials, store credentials, and real paid provider keys are the only expected external blockers. Configure those release paths completely and document exactly which secret must be supplied.

## 3. Default decision policy

Do not pause for ordinary implementation choices. Make the smallest decision consistent with the specification, record meaningful trade-offs in an ADR, implement it, and test it.

Ask for human input only when all of the following are true:

- the choice changes the product contract materially;
- no safe interpretation exists in the specification;
- the choice cannot be reversed cheaply;
- proceeding would create meaningful user harm, data loss, licensing risk, or security exposure.

For everything else, choose the simpler option.

## 4. Product invariants

These invariants are non-negotiable:

1. **Local ownership:** sources, extracted content, embeddings, conversations, learner evidence, and usage history remain local by default.
2. **No required backend:** version one has no account, hosted database, proxy, sync service, or required cloud control plane.
3. **BYOK only:** model requests go directly from the desktop app to the selected provider.
4. **No API key in renderer or SQLite:** secrets live behind the main process and OS-backed encryption.
5. **No model call on save:** capture, extraction, normalization, chunking, indexing, and embeddings are local.
6. **One agent:** Learn, Research, and Probe are modes of one bounded AI SDK agent.
7. **Typed tools:** tools are narrow, validated, scoped, cancellable, and auditable.
8. **Deterministic consequences:** model output is a proposal. Application code owns citations, permissions, budgets, persistence, and mastery transitions.
9. **Evidence before mastery:** reading can establish only `encountered`. Higher levels require validated open-ended evidence.
10. **One Probe question at a time:** never generate a static questionnaire as the primary interaction.
11. **Sources are untrusted data:** imported content cannot modify instructions or invoke tools.
12. **Citations fail closed:** a citation is displayed only after resolving to a block supplied to the model.
13. **No infinite feed:** Today presents a small, ranked set of next actions.
14. **No exposed machinery:** normal users do not configure chunks, embeddings, vector stores, agents, MCP, temperatures, or retrieval weights.
15. **Portable data:** export and restore work without a proprietary cloud.

## 5. Required repository shape

Use the monorepo described in the specification:

```text
/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── apps/
│   ├── desktop/
│   └── extension/
├── packages/
│   └── contracts/
├── migrations/
├── fixtures/
├── evals/
└── docs/
    ├── architecture-decisions/
    ├── threat-model.md
    ├── implementation-status.md
    └── release.md
```

Do not create a broad internal framework. `packages/contracts` contains only serializable types, Zod schemas, protocol constants, and generated schema types. Domain implementation stays inside the desktop application unless it is genuinely shared with the extension.

## 6. Dependency policy

At initialization:

1. use Node 24 and pnpm;
2. resolve the stable versions permitted by `TECHNICAL_SPEC.md`;
3. pin them through the lockfile;
4. record exact baseline versions in `docs/architecture-decisions/0001-dependency-baseline.md`;
5. reject alpha/beta dependencies unless the specification explicitly allows them and a fallback exists;
6. generate a dependency-license report in CI.

Do not add LangChain, LangGraph, Mastra, Mem0, Graphiti, a hosted vector database, a Python service, Docker, or a second agent framework.

Before adding any production dependency, answer in the ADR or commit message:

- Which required capability does it provide?
- Why is the platform or existing dependency insufficient?
- What is its license?
- Does it execute native code?
- Does it affect packaging on macOS or Windows?
- What is the removal seam?

Prefer a small direct implementation when a dependency would introduce more surface area than code saved.

## 7. Implementation order

Implement the milestones from the specification in order. A later milestone may begin only when the prior milestone’s automated exit criteria pass and the repository remains runnable.

### Milestone 0: foundation

Build and verify:

- pnpm workspace;
- Electron Forge application;
- React renderer;
- sandboxed BrowserWindow;
- typed preload bridge;
- migration runner using `SCHEMA.sql` as migration 0001;
- safe secret service;
- provider profile setup and connection tests;
- CI on macOS and Windows;
- deterministic mock provider;
- packaging smoke tests.

### Milestone 1: Studios and local source core

Build and verify:

- Studio CRUD and goals;
- Inbox;
- content-addressed asset store;
- text, Markdown, paste, and note ingestion;
- persistent job queue;
- source viewer;
- annotation primitives;
- export/backup skeleton.

### Milestone 2: PDF and webpage ingestion

Build and verify:

- unpdf/PDF.js extraction;
- ordered source blocks and exact locators;
- PDF viewer with citation navigation;
- deterministic quality scoring;
- Defuddle capture payload;
- URL security policy;
- FTS5 search;
- malicious fixture coverage.

### Milestone 3: local embeddings and retrieval

Build and verify:

- bundled Granite model manifest and checksum validation;
- embedding utility process;
- model-correct pooling and normalization;
- vector repository behind `VectorIndex`;
- exact-scan fallback;
- hybrid lexical/semantic retrieval with RRF;
- retrieval evaluation harness;
- nonblocking indexing and rebuild.

### Milestone 4: learning agent

Build and verify:

- AI SDK 7 provider registry;
- one ToolLoopAgent with typed runtime context;
- Learn mode;
- local read-only tools;
- streaming through typed IPC;
- context construction;
- citation handles and validation;
- Source Cards;
- cancellation, timeouts, step limits, and budgets;
- usage recording.

### Milestone 5: learner state and Probe

Build and verify:

- concepts and aliases;
- immutable learning-event ledger;
- deterministic concept-state projector;
- open-ended Probe state machine;
- hidden rubrics;
- verbatim evidence validation;
- Learning Map;
- user correction and retraction events;
- cross-Studio distilled memory.

### Milestone 6: research and media

Build and verify:

- explicit Research mode;
- provider-native OpenAI/Anthropic web search where supported;
- local capture of durable web evidence;
- transcript parsers;
- Podcasting 2.0 transcript discovery;
- explicit provider transcription with cost approval;
- timestamp citations;
- no web-search tool in Probe by default.

### Milestone 7: browser extension

Build and verify:

- WXT Manifest V3 extension;
- rendered-page Defuddle extraction;
- Inbox/Studio destination;
- selection and note capture;
- native messaging protocol;
- local retry queue when desktop app is unavailable;
- known-extension-ID restriction;
- Chrome and Edge builds.

### Milestone 8: product completion

Build and verify:

- Today next-action policy;
- complete You page;
- usage and budget UI;
- full export/restore/delete;
- diagnostics bundle;
- accessibility and keyboard navigation;
- performance budgets;
- signed/notarized release configuration;
- update configuration;
- packaged golden-path E2E;
- complete acceptance evidence.

## 8. Work loop

For each coherent slice:

1. inspect the existing code and current implementation status;
2. state the smallest end-to-end behavior being added;
3. write or update tests first where practical;
4. implement production behavior;
5. run the narrow test set;
6. run typecheck and lint for touched packages;
7. update `docs/implementation-status.md` with evidence and remaining gaps;
8. commit a working checkpoint;
9. continue to the next slice.

Never accumulate a large untested branch. Keep `main` launchable.

## 9. Required status document

Maintain `docs/implementation-status.md` with this structure:

```markdown
# Implementation status

## Current milestone

## Working golden path

## Acceptance evidence
| ID | Status | Command / artifact | Notes |

## Known external blockers

## Architecture decisions made

## Next smallest slice
```

Only report a criterion as complete when a reproducible command, test, screenshot, package artifact, or manual verification record exists.

## 10. Database rules

- Use `SCHEMA.sql` as migration `0001_initial_schema.sql` without silently changing semantics.
- Later changes use numbered migrations; never edit an already released migration.
- Run every migration in tests from an empty database and from the previous schema snapshot.
- Enable foreign keys on every connection.
- Keep one write-owning main-process connection.
- Wrap multi-table state transitions in transactions.
- Use UUIDv7 strings for IPC-visible IDs and integer source-block row IDs.
- Store all timestamps as UTC Unix epoch milliseconds.
- Keep API keys out of the database.
- Treat `learning_events` as immutable; correction and retraction are new events.
- Derive `concept_state` from the event ledger and prove it can be rebuilt.
- Keep vectors rebuildable from canonical blocks.
- Never rely on the optional vector extension without the exact-scan fallback.

Add tests for foreign keys, integrity checks, FTS synchronization, migration checksums, duplicate ingestion, event immutability, projection rebuilds, and backup restore.

## 11. Electron boundary rules

Renderer:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- no filesystem, database, provider SDK, native module, or secret imports;
- no remote web content in privileged renderer frames.

Preload:

- expose named domain methods only;
- never expose generic IPC invoke/send;
- validate input and output with shared Zod schemas;
- return serializable values only;
- cleanly unsubscribe event listeners.

Main process:

- owns database, filesystem, providers, network policy, secrets, jobs, native messaging, and updates;
- validates renderer identity and IPC payloads;
- opens external URLs only through an allowlisted function;
- never logs keys, raw Authorization headers, or complete sensitive prompts.

Utility processes:

- run embeddings and large PDF work;
- communicate through typed MessagePorts;
- support cancellation and heartbeat;
- never write the database directly;
- return results to the write-owning main process;
- are restarted and jobs requeued after bounded failure.

## 12. Source pipeline rules

Every source follows the persisted state machine. Each stage is idempotent and versioned.

Never:

- mutate an old source version in place;
- use URL alone as content identity;
- discard a near duplicate silently;
- flatten away PDF page or transcript timestamp boundaries;
- call a frontier model merely because a source was saved;
- run remote page scripts in the desktop app;
- represent extracted text without a stable source locator.

Use structural chunking before token-size limits. Preserve headings, code, equations, tables, page boundaries, and transcript timestamps as far as practical.

PDF quality fallback order:

1. local text extraction;
2. deterministic quality assessment;
3. visible `needs_attention` state;
4. explicit targeted vision on selected suspect pages;
5. optional advanced parser only through the defined seam.

Transcript order:

1. publisher-provided transcript;
2. user-provided VTT/SRT/timestamped JSON/plain text;
3. transcript visible in an authorized browser page;
4. explicit BYOK transcription;
5. optional local Whisper pack outside version one.

## 13. Retrieval rules

- Bundle one invisible default encoder.
- Record exact model revision and file hashes.
- Verify model files before loading.
- Use CLS pooling and normalization exactly as the model card requires.
- Never mix embeddings from different model revisions in one similarity query.
- Use FTS5 plus dense retrieval and reciprocal-rank fusion.
- Apply source/Studio filters deterministically.
- Prevent duplicate passages from occupying the full context.
- Supply only 4–10 relevant blocks under normal conditions.
- Keep a reproducible retrieval eval set in `evals/retrieval`.
- Do not replace the encoder because another model has more dimensions; require measured improvement.

## 14. Agent rules

Use one AI SDK 7 ToolLoopAgent with runtime mode:

```text
learn | research | probe
```

The model may call only tools allowed for that mode and runtime scope.

Core local tools are read-only:

```text
search_library
get_source_outline
read_source_blocks
inspect_pdf_page
get_transcript_segment
get_studio_state
get_learner_state
```

Research may additionally use provider-native search and source capture. Probe may inspect only the target learner state, rubric context, and selected source evidence. Probe does not receive web search by default.

Every loop has:

- maximum steps;
- wall-clock timeout;
- estimated cost ceiling;
- cancellation signal;
- per-tool input limits;
- provider capability checks;
- a fail-closed outcome.

The model never receives raw SQL, unrestricted filesystem access, arbitrary shell execution, generic HTTP fetch, secret access, or an unscoped memory write tool.

## 15. Structured outputs and consequences

Use Zod schemas for all durable model output.

Model output may propose:

- response text;
- citation handles;
- learner evidence;
- misconception hypotheses;
- next action;
- session summary;
- source relationships.

Application code must validate before persistence:

- citation handle was in supplied context;
- source locator resolves;
- evidence excerpt is verbatim in the user answer;
- concept identity resolves or enters a conservative merge flow;
- mastery transition is permitted by policy;
- confidence is bounded;
- scope is valid;
- duplicate event hash does not exist;
- cost and permission limits were respected.

Reject invalid proposals. Never “best effort” a durable memory or citation.

## 16. Probe implementation rules

Probe is a state machine, not a prompt template.

Required behavior:

- one open-ended question is visible at a time;
- first question exposes the learner’s mental model;
- later questions adapt to the previous answer;
- question types include explain, distinguish, apply, predict, diagnose, design, compare, critique, and connect;
- every question has a hidden structured rubric;
- feedback is specific, brief, and non-flattering;
- hints before the answer reduce evidence strength;
- verbatim excerpts support every durable evidence event;
- a correction repeated immediately is weak evidence;
- transfer to a new context is strong evidence;
- Probe stops on objective completion, prerequisite gap, misconception requiring teaching, turn limit, or user stop;
- completion produces a Learning Map and one next action.

Build deterministic fixtures for strong, partial, wrong, polished-but-empty, prompt-injection, copied, multilingual, and self-corrected answers.

## 17. Security rules

Treat all source content, web results, filenames, metadata, and transcripts as attacker-controlled.

Required controls:

- sanitize captured HTML into inert Markdown;
- never execute imported scripts;
- block SSRF targets including loopback, link-local, private networks, and cloud metadata endpoints by default;
- validate redirects and final destinations;
- enforce response-size and timeout limits;
- reject path traversal and unsafe archive contents;
- sniff file types rather than trusting extensions;
- use CSP and Electron security defaults;
- restrict native messaging to packaged extension IDs;
- sign native-host manifests as part of packaging;
- redact secrets and sensitive headers from logs;
- maintain prompt-injection test fixtures;
- require explicit approval for transcription uploads and visual page interpretation;
- generate SBOM and license report in release CI.

Do not weaken a control to make a test pass.

## 18. Testing requirements

Use Vitest for unit/integration tests and Playwright for packaged Electron E2E.

Every behavior must have the lowest practical test layer. Required suites include:

- migration and schema tests;
- content-addressed storage tests;
- job recovery tests;
- parser fixtures;
- FTS trigger synchronization;
- embedding worker protocol;
- retrieval metrics;
- provider contract mocks;
- citation validation;
- Probe evaluator fixtures;
- learner projection rebuild;
- IPC authorization and validation;
- URL/SSRF security;
- extension native messaging;
- export/restore;
- packaged golden path on macOS and Windows.

Real-provider tests are opt-in, secret-gated, cost-capped, and never required for ordinary pull requests.

Do not use snapshots as the sole test for security, learner state, citations, or retrieval quality.

## 19. Evaluation gates

The implementation must establish and record explicit baselines before optimization.

Retrieval gate:

- compare FTS-only, dense-only, and hybrid;
- measure Recall@5, Recall@10, MRR@10, nDCG@10;
- hybrid must beat the agreed lexical baseline on the project corpus without violating latency budgets.

Probe gate:

- compare evaluator decisions against human labels;
- report mastery-level agreement, evidence-excerpt validity, misconception precision, and overpromotion rate;
- false mastery is more costly than underpromotion;
- no release while a model can reliably award higher mastery without evidence.

Performance gate:

- test cold start, 50k-block search, source import, embedding throughput, memory use, cancellation, and background-job responsiveness on representative Mac and Windows hardware.

## 20. Design implementation rules

The primary navigation is:

```text
Today | Studios | Inbox | You
```

Inside a source, the primary actions are:

```text
Learn | Ask | Probe
```

Research and Compare are contextual secondary actions.

Use native-feeling typography, generous whitespace, clear hierarchy, and restrained motion. Avoid dashboards full of cards, gradients, gamification, streaks, artificial scores, giant graphs, and infrastructure settings.

The main action should normally be **Continue learning**.

Every asynchronous operation shows:

- current plain-language state;
- progress where measurable;
- cancellation where safe;
- useful failure explanation;
- retry or recovery action.

Meet WCAG 2.2 AA for applicable desktop interactions. Ensure complete keyboard navigation, visible focus, reduced-motion support, screen-reader labels, and readable zoom.

## 21. Logging and diagnostics

Logs are local, structured, rotating, and redacted. Include correlation IDs, job IDs, session IDs, parser versions, model identifiers, timings, and error codes. Exclude API keys, Authorization headers, full private source content, and full prompts by default.

The diagnostic bundle must be previewable before export and include only selected:

- app/platform versions;
- schema version;
- dependency/native module versions;
- job failure summaries;
- redacted logs;
- integrity results;
- model manifest and checksums;
- optional user-selected source metadata.

## 22. Release discipline

A release candidate must:

1. pass all CI gates;
2. build on real macOS and Windows runners;
3. launch from packaged artifacts;
4. pass the packaged golden-path E2E;
5. pass database integrity and restore tests;
6. include SBOM and license report;
7. include update metadata;
8. contain no production TODO/FIXME/stub markers;
9. document external signing credentials still required;
10. complete `ACCEPTANCE_CHECKLIST.md` with evidence.

Do not claim signed/notarized completion without actual evidence. Mark external credential-dependent items accurately while still producing unsigned development artifacts and complete signing configuration.

## 23. Definition of engineering quality

Prefer:

- one clear module over a configurable framework;
- one transaction over eventually consistent local state;
- one typed interface over a generic event bus;
- one agent over an agent society;
- one source representation over parser-specific downstream formats;
- deterministic policy over prompt-only rules;
- measured retrieval over dimensionality intuition;
- evidence-backed memory over chat summarization;
- end-to-end behavior over abstract scaffolding.

The governing rule is:

> Borrow the machinery. Own the judgment.
