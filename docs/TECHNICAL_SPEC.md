# Local Learning Agent
## Full Product and Technical Specification

**Status:** Implementation-ready  
**Working title:** Local Learning Agent  
**User-facing learning containers:** Studios  
**Target platforms:** macOS and Windows  
**Architecture:** Local-first desktop application, browser extension, bring-your-own-model API key  
**Specification date:** 31 July 2026  

---

## 0. How to read this specification

This document is both a product contract and an engineering contract. It defines what the application must do, why it exists, how it should feel, how it must be built, and how correctness will be evaluated.

Normative words are used deliberately:

- **MUST** means an implementation is unacceptable without the requirement.
- **SHOULD** means the requirement is strongly preferred; deviations require a written architecture decision.
- **MAY** means the implementation is optional.

The coding agent must not reinterpret the product as a generic chatbot, document-RAG shell, note-taking application, agent framework, or feed reader. The application is a local, source-native learning system that maintains an evidence-backed model of what a person understands and uses that model to decide what the person should learn next.

---

# Part I — Product definition

## 1. Executive summary

The application helps a technically ambitious person learn difficult subjects from primary sources without drowning in bookmarks, chat histories, summaries, or endless feeds.

The user:

1. installs one desktop application;
2. connects an OpenAI, Anthropic, or OpenRouter API key;
3. selects a model;
4. creates a **Studio** for a topic;
5. adds papers, webpages, notes, transcripts, audio, or other sources;
6. learns through a source-grounded agent;
7. completes open-ended **Probe** conversations that reveal the boundary of their understanding;
8. receives the exact next concept, source, section, or question that will move them forward.

All private data stays local by default:

- sources and extracted text;
- embeddings and indexes;
- Studios and goals;
- conversation history;
- learner state;
- Probe evidence;
- usage and cost history;
- notes and annotations.

The remote model is used only for work that benefits from frontier reasoning: teaching, comparing sources, diagnosing misconceptions, evaluating open-ended explanations, and performing explicit web research. Parsing, chunking, embeddings, search, storage, deduplication, scheduling, citation resolution, and learner-state persistence run locally.

The central product loop is:

```text
Source
  → faithful local representation
  → retrieval of the right evidence
  → adaptive teaching
  → open-ended Probe
  → evidence of understanding
  → updated learner state
  → exact next learning action
```

The product must feel far simpler than its internals:

> Add something. Learn it. Probe me. Continue.

---

## 2. The problem

People trying to stay current in AI and other fast-moving technical fields face several related failures:

- important ideas are scattered across papers, repositories, articles, podcasts, talks, and social discussion;
- bookmark collections become unread queues rather than knowledge;
- generic chatbots answer questions but do not maintain a reliable model of what the learner can explain or apply;
- document-chat systems retrieve passages but rarely control sequence, prerequisites, or depth;
- feeds optimize attention rather than learning;
- summaries create recognition without understanding;
- users repeatedly reread material because their tools do not preserve evidence of mastery or confusion;
- current learning products rarely connect a source to the learner’s existing knowledge and next objective.

A great teacher does three things that current tools generally separate:

1. chooses the right source;
2. explains it at the right level;
3. tests what the learner can actually do with the idea.

This application combines those three functions while keeping ownership and privacy local.

---

## 3. Product thesis

The application is not “chat with your documents.” It is:

> A source-native teacher with durable, evidence-backed memory of the learner.

The moat is not provider integration, vector storage, PDF parsing, or streaming chat. Those are commodity capabilities. The distinctive system is the closed loop between:

- source understanding;
- learner understanding;
- teaching policy;
- next-source selection.

A saved source is not considered learned. A generated summary is not considered evidence. The system must remain with the user until they can explain, apply, distinguish, or critique the relevant idea.

---

## 4. Product principles

### 4.1 One clear job

The application exists to answer:

> What should I understand next, and how do I get there from where I am?

Anything that does not improve this answer should be removed or postponed.

### 4.2 Sophistication underneath, obviousness above

The interface must not expose infrastructure vocabulary such as embeddings, chunks, RAG, vector databases, MCP, tool loops, context windows, temperature, reranking, or prompt templates.

The user sees sources, Studios, learning, Probe, evidence, and next steps.

### 4.3 Local-first, not cloud-dependent

No account is required. No hosted backend is required for the core product. The user’s intellectual history remains useful even if the company disappears.

### 4.4 Bring your own intelligence

The user chooses a provider and model. Requests go directly from the desktop application to that provider. The application does not proxy or mark up model usage.

### 4.5 Evidence over inference

The system may infer that a user is confused, but durable learner-state changes require traceable evidence. Every belief about learner mastery must be inspectable and correctable.

### 4.6 Sources over generated prose

Generated explanations must remain subordinate to original sources. The user must always be able to open the cited page, paragraph, timestamp, or section.

### 4.7 No infinite feed

The product makes choices. It should present a small number of meaningful next actions instead of transferring filtering work to the user.

### 4.8 One agent, narrow tools

Use one capable agent with typed, constrained tools. Do not build a society of planner, teacher, critic, memory, and researcher agents unless measured evidence proves a single-agent design insufficient.

### 4.9 Deterministic code owns consequences

The model may propose actions. Application code validates and commits them. The model must not receive unrestricted SQL, filesystem, secret, or memory-write access.

### 4.10 Portable by default

Sources, notes, Studio definitions, and learner evidence must be exportable in ordinary formats. Private data must never be trapped in a proprietary cloud object.

### 4.11 Cost is a product feature

The application must avoid API calls when local work is sufficient. It must show estimated and actual cost without forcing the user to understand tokens.

### 4.12 Half the product, fully finished

The first release must execute the golden path exceptionally. It must not ship a plugin marketplace, social network, cloud sync, visual graph, or twenty unfinished integrations.

---

## 5. Product vocabulary

### Studio

A focused learning environment for one subject or project, such as “Agent Memory,” “Reinforcement Learning,” or “AI for Biology.” A Studio contains goals, sources, concepts, sessions, open questions, and topic-specific learner state.

### Source

An original artifact the learner can inspect: PDF, webpage, Markdown file, pasted text, note, transcript, podcast episode, audio file, or supported media item.

### Source block

The smallest citable unit in the local source representation. A block retains structure and a stable locator such as page, section, paragraph, or timestamp.

### Learning session

A conversation whose goal is understanding. It may explain, compare, question, or guide reading, but it remains grounded in source evidence and Studio objectives.

### Probe

An adaptive sequence of open-ended questions, asked one at a time, designed to locate the boundary of the learner’s understanding. Probe does not primarily assign a grade; it updates the learning map.

### Learning map

A visible representation of secure concepts, uncertain concepts, misconceptions, missing prerequisites, and next actions.

### Learner evidence

A traceable event supporting a claim about what the learner can explain, apply, compare, or critique. Evidence includes the question, the learner’s answer, the relevant excerpt, the rubric, and evaluator confidence.

### Global learner state

Stable knowledge, goals, background, and preferences that can safely inform multiple Studios.

### Studio learner state

Topic-specific understanding, misconceptions, objectives, and source sequence for one Studio.

### Inbox

A local capture queue for material saved through the browser extension, drag-and-drop, or paste. The Inbox is not assumed to be a reading list; it is raw intake awaiting triage or assignment.

### Today

The application’s home. It shows the next one to three meaningful learning actions, not an infinite stream.

---

## 6. Primary users

The first release is for people who understand enough to recognize that they are missing important developments but do not have a complete private network, curriculum, or source-selection habit.

Primary users include:

- software engineers moving into AI or a new AI subfield;
- technical founders making architecture and product decisions;
- research engineers working across adjacent topics;
- strong students preparing for research or technical work;
- technical leaders who need depth without spending hours filtering feeds;
- researchers entering a neighboring field.

The product is not optimized initially for:

- casual users who only want a daily news summary;
- children or classrooms requiring teacher administration;
- institutions needing multi-user grading and compliance;
- experts who already possess a superior narrow-field source network;
- teams requiring shared cloud workspaces.

---

## 7. Version-one product scope

Version one MUST include:

1. signed macOS and Windows desktop applications;
2. no-account local onboarding;
3. OpenAI, Anthropic, and OpenRouter provider connections;
4. model selection and connection testing;
5. encrypted local secret storage;
6. Studios with goals and source collections;
7. URL, PDF, Markdown, plain-text, pasted-text, and note ingestion;
8. browser capture extension for Chrome and Edge;
9. local text extraction, normalization, chunking, deduplication, embeddings, and hybrid search;
10. source-grounded Learn and Ask experiences with exact citations;
11. explicit Research mode with provider-native web search where supported;
12. Probe mode with one open-ended question at a time;
13. evidence-backed global and Studio learner memory;
14. visible Learning Map and memory correction controls;
15. transcript import for VTT, SRT, text, and supported podcast transcript links;
16. explicit API transcription for user-authorized audio files or podcast enclosures;
17. local job queue with resumable ingestion;
18. source annotations and notes;
19. cost and usage visibility;
20. Markdown/JSON export and full local backup;
21. local diagnostics and redacted logs;
22. automated unit, integration, retrieval, Probe, security, and packaging tests.

Version one MUST NOT include:

- mandatory cloud services;
- user accounts;
- cloud sync;
- collaboration or teams;
- mobile applications;
- a generic agent builder;
- arbitrary MCP server installation;
- a plugin marketplace;
- automatic large-scale X monitoring;
- a social feed;
- a visual knowledge-graph home screen;
- a bundled multi-gigabyte generative model;
- unrestricted autonomous browsing;
- unsupported scraping of YouTube captions;
- multi-agent orchestration;
- flashcard-first interaction;
- gamification, streak pressure, or public scores.

---

## 8. Success criteria

The release is successful when the following are true:

### First value

A new user can install the app, connect a provider, add one ordinary PDF, and begin a cited learning session without documentation or a terminal.

### Source trust

At least 99% of displayed citations in the evaluation suite resolve to an existing source block and open the correct location.

### Learning signal

Probe can distinguish exposure from explanation and application. Reading alone never grants mastery above “Encountered.”

### Local ownership

Disconnecting the internet preserves access to all prior sources, notes, conversations, learner state, search, and exports. Only new remote model calls and web fetches fail.

### Cost discipline

Saving and locally indexing a source causes zero language-model calls. A typical question sends only selected source blocks and compact learner state, not the entire library.

### Product simplicity

The main navigation contains only **Today**, **Studios**, **Inbox**, and **You**. Advanced settings remain subordinate.

### Reliability

Ingestion jobs resume after a crash or restart. Database migrations are transactional. The app never silently loses a source, note, answer, or evidence event.

---

# Part II — User experience and functional requirements

## 9. Information architecture

The top-level navigation MUST contain four destinations:

### Today

Shows:

- one primary “Continue learning” action;
- up to two secondary actions;
- items due for review only when meaningful;
- current Studio context;
- estimated time, when confidently known;
- no infinite feed.

### Studios

Shows active Studios and their current next step. Each Studio contains:

- overview;
- goals;
- source library;
- learning path;
- sessions;
- concept map;
- open questions;
- Studio-specific learner state.

### Inbox

Shows recently captured items and local processing state. The user can:

- assign an item to a Studio;
- learn it now;
- archive it;
- add a note;
- remove it;
- ask the agent to triage selected items.

### You

Shows:

- global goals and background;
- learning preferences;
- demonstrated concepts;
- uncertain concepts;
- misconceptions under review;
- evidence supporting each learner-state claim;
- provider and usage settings;
- export and privacy controls.

Chat MUST NOT be a top-level destination. The agent is contextual to a source, Studio, Probe, or next action.

---

## 10. First-run experience

### FR-ONB-001 — Welcome

The first screen MUST communicate three promises:

- sources and learning history stay on this computer;
- the user connects their own AI provider;
- the application will remember demonstrated understanding and guide the next step.

### FR-ONB-002 — Provider connection

The user chooses OpenAI, Anthropic, or OpenRouter.

The app MUST:

1. request the API key;
2. store it with OS-backed encryption;
3. perform a minimal connection test;
4. retrieve or present a curated model list;
5. explain model trade-offs in plain language;
6. allow one default model selection.

The app MUST NOT show every provider setting during onboarding.

### FR-ONB-003 — Model capability check

The provider adapter MUST derive and store capabilities for the selected model:

```text
text generation
streaming
structured output
reliable tool use
web search
vision / image input
file references
transcription
reasoning control
usage metadata
prompt caching metadata
```

The UI MUST clearly indicate unavailable features without exposing provider internals.

### FR-ONB-004 — First Studio

The application asks:

> What are you trying to understand, and where do you think you are now?

The user may type or speak. The system asks a small number of follow-up questions and creates a draft Studio profile containing:

- title;
- objective;
- current background;
- preferred depth;
- initial concepts;
- likely prerequisite gaps;
- first recommended action.

The user approves or edits this profile before it becomes durable learner state.

### FR-ONB-005 — No forced tutorial

The first useful action is adding a source or starting an initial Probe. The user must not be forced through a carousel of product features.

---

## 11. Studios

### FR-STU-001 — Create

A Studio can be created from:

- a natural-language description;
- an imported portable Studio package;
- selected Inbox sources;
- duplication of an existing Studio without private learner evidence.

### FR-STU-002 — Goals

Each Studio MUST support one active primary goal and optional secondary goals. Goals are plain-language statements and may have statuses:

```text
active | paused | completed | abandoned
```

### FR-STU-003 — Source roles

A source attached to a Studio MAY be assigned one of:

```text
foundation | current_frontier | explanation | implementation |
criticism | reference | exercise | user_note
```

The role assists sequencing but is never treated as truth.

### FR-STU-004 — Next step

Every active Studio MUST have at most one primary next step. It can be:

- read a precise source section;
- complete a Probe;
- answer one application question;
- compare two sources;
- revisit a prerequisite;
- conduct explicit research;
- add a missing source.

### FR-STU-005 — Archive

Archiving a Studio hides it from Today but preserves all sources, evidence, and exports.

---

## 12. Source intake

### FR-SRC-001 — Supported source types

The application MUST accept:

- local PDF;
- remote PDF URL;
- webpage URL;
- browser-captured page;
- Markdown;
- plain text;
- pasted text;
- user note;
- VTT;
- SRT;
- timestamped transcript JSON;
- podcast RSS feed or episode URL when a public transcript or accessible enclosure is available;
- local audio file for explicit transcription.

### FR-SRC-002 — Capture without AI cost

Saving a source MUST perform only local or ordinary network work. It MUST NOT invoke a language model automatically.

### FR-SRC-003 — Idempotent ingestion

The same content must not be indexed twice. Dedupe uses:

- canonical URL;
- normalized content hash;
- binary hash for files;
- source-version hash.

The user may intentionally retain multiple versions of one source.

### FR-SRC-004 — Visible processing state

Every source has a state:

```text
queued
fetching
extracting
normalizing
chunking
embedding
ready
needs_attention
failed
archived
```

The user receives understandable errors and a retry action.

### FR-SRC-005 — Original preservation

For local files, the application stores a content-addressed copy unless the user explicitly chooses reference-only mode. For webpages, it stores normalized content and capture metadata. It must not silently overwrite a prior source version.

### FR-SRC-006 — Source page

Every source page MUST provide:

- original content viewer;
- metadata;
- outline;
- notes and highlights;
- Learn;
- Ask;
- Probe;
- Compare;
- “What should I read?”;
- citation navigation;
- extraction quality status;
- source version history.

### FR-SRC-007 — Lazy Source Card

A Source Card is generated only when the user chooses to learn, triage, or inspect the source deeply. It contains:

- central contribution;
- important claims;
- definitions;
- prerequisites;
- method;
- evidence;
- limitations;
- important sections;
- relationships to known concepts and sources.

The card is cached against source hash, model, prompt version, and schema version.

---

## 13. Learn and Ask

### FR-LRN-001 — Contextual agent

The agent always knows:

- active Studio;
- active source or selected sources;
- current learning objective;
- relevant learner state;
- recent necessary conversation turns;
- available tools and provider capabilities;
- cost and step budget.

### FR-LRN-002 — Source priority

For source-specific questions, the agent MUST search and read the local source before using web search. It may state that the source does not answer the question.

### FR-LRN-003 — Citations

Claims derived from sources MUST cite precise blocks. The citation opens:

- PDF page and highlighted block;
- article heading and paragraph;
- transcript timestamp;
- local note position;
- web-research URL and captured excerpt.

### FR-LRN-004 — Teaching controls

The user may choose a teaching style:

```text
direct
socratic
paper companion
implementation focused
overview first
technical deep dive
```

These are policy hints, not separate agent personalities.

### FR-LRN-005 — Ask before telling when useful

When a prerequisite is uncertain, the agent SHOULD ask a short diagnostic question before delivering a long explanation. It must not do this mechanically on every turn.

### FR-LRN-006 — Reading guidance

The agent can recommend exact sections and can explicitly advise that a source is not worth reading for the current objective. It must explain the reason.

### FR-LRN-007 — Compare

The user can compare two or more sources. The response MUST distinguish:

- agreement;
- terminology differences;
- method differences;
- evidence strength;
- limitations;
- chronology;
- what is genuinely new.

---

## 14. Research and web search

### FR-RES-001 — Explicit research mode

Web search MUST be explicit or clearly necessary for a current-information question. It must not run on every query.

### FR-RES-002 — Provider-native search first

Where the selected provider supports a native web-search tool, the agent SHOULD use it through the provider adapter. The user must not need a separate search API key for version one.

### FR-RES-003 — Captured research evidence

Research results used in a durable answer MUST be captured locally with:

- URL;
- title;
- author or publisher when available;
- retrieval time;
- quoted or extracted evidence;
- provider annotations;
- access status;
- content hash.

A search result snippet alone is not durable source evidence.

### FR-RES-004 — Source hierarchy

The research policy SHOULD prefer:

1. original papers and official documentation;
2. author or laboratory material;
3. repositories and release notes;
4. credible technical analysis;
5. discussion and social signals.

Popularity must not be treated as technical validity.

### FR-RES-005 — Web-search budgets

Each research run has maximum tool calls, total duration, and estimated cost. The user may raise the limit for a deliberate deep-research session.

---

## 15. Probe

### FR-PRB-001 — Mandatory open-ended format

Probe asks only open-ended questions. It does not use multiple choice as the primary assessment mechanism.

### FR-PRB-002 — One question at a time

The interface displays one question, waits for the answer, evaluates it, and then selects the next question. It must not dump a static questionnaire.

### FR-PRB-003 — Adaptive question types

Probe can ask the learner to:

- explain;
- distinguish;
- predict;
- apply;
- diagnose;
- design;
- compare;
- critique;
- connect to another concept.

### FR-PRB-004 — Hidden rubric

Every question has a structured rubric with:

- target concepts;
- expected distinctions;
- acceptable reasoning patterns;
- likely misconceptions;
- evidence required for a mastery transition;
- question purpose.

The full rubric remains hidden during the answer but may be shown afterward.

### FR-PRB-005 — Evidence validation

When the model proposes learner evidence, the application MUST verify that the cited learner-answer excerpt exists verbatim in the answer. Invalid evidence is rejected.

### FR-PRB-006 — No automatic mastery from reading

Reading, highlighting, or saving a source can produce only the state **Encountered**. Higher states require open-ended evidence.

### FR-PRB-007 — Probe stopping

Probe ends when one of the following occurs:

- target concepts have sufficient evidence;
- a prerequisite gap has been located;
- a misconception requires teaching before further assessment;
- the maximum turn budget is reached;
- the user stops.

### FR-PRB-008 — Probe result

The result is a Learning Map, not merely a score:

```text
Secure
Uncertain
Misconceptions to resolve
Missing prerequisites
Best evidence
Recommended next action
Suggested review date
```

### FR-PRB-009 — Voice answers

The user MAY answer by voice. Audio is transcribed explicitly, the transcript is shown for correction, and only the corrected transcript is evaluated.

---

## 16. Learner memory

### FR-MEM-001 — Three memory classes

The system maintains:

1. source memory;
2. Studio memory;
3. global learner memory.

These must remain separate in storage and retrieval.

### FR-MEM-002 — Evidence-backed state

Each concept state includes:

- mastery level;
- confidence;
- evidence count;
- strongest evidence;
- contradictory evidence;
- last demonstrated date;
- contexts demonstrated;
- next review date;
- scope: global or Studio.

### FR-MEM-003 — Mastery ladder

The canonical ladder is:

```text
unassessed
encountered
can_explain
can_apply
can_compare_or_critique
```

### FR-MEM-004 — User control

The user can inspect, correct, retract, or delete every memory. Corrections create a new event; they do not silently rewrite history.

### FR-MEM-005 — Cross-Studio sharing

Only distilled, transferable, evidence-backed state may cross Studios. Entire conversations and source-specific assumptions must not be inserted into unrelated prompts.

### FR-MEM-006 — Memory decay

Confidence MAY decay over time based on evidence strength and elapsed time. Decay changes review priority; it must not erase evidence.

### FR-MEM-007 — Preferences are not mastery

Preferences such as “prefers primary sources” and knowledge such as “can apply Bayes’ rule” are stored as different memory types.

---

## 17. Browser extension

### FR-EXT-001 — Minimal interface

The extension popup contains:

- Save to Inbox;
- destination Studio;
- include selected text;
- optional note;
- save button.

No model call occurs inside the extension.

### FR-EXT-002 — Rendered-page extraction

The extension uses the rendered DOM and Defuddle to capture clean Markdown and metadata. This supports dynamic and authenticated pages already visible to the user.

### FR-EXT-003 — Payload

A capture contains:

- URL;
- canonical URL if present;
- title;
- author;
- publication date;
- language;
- selected text;
- user note;
- extracted Markdown;
- raw metadata;
- capture time;
- content hash;
- target Studio ID if selected.

### FR-EXT-004 — Native messaging

Production communication uses browser native messaging to the installed desktop app. The host accepts messages only from the published extension identifiers.

### FR-EXT-005 — Offline queue

If the desktop application is closed or unavailable, the extension stores captures locally and retries when the native host becomes available.

### FR-EXT-006 — Permissions

The extension requests the minimum permissions required. Broad host access must be optional and explained. The user may use “active tab only” capture.

---

## 18. Media and transcripts

### FR-MED-001 — Existing transcripts first

The ingestion order is:

1. publisher-provided transcript;
2. VTT, SRT, JSON, or text supplied by the user;
3. transcript visible and explicitly captured from the current browser page;
4. explicit API transcription of authorized audio;
5. optional local transcription pack in a later release.

### FR-MED-002 — Podcast support

For an RSS feed or episode, the application checks for Podcasting 2.0 transcript links. If present, it imports the best supported timed format. If absent, it may offer transcription of the episode enclosure after showing size, duration, and cost estimate.

### FR-MED-003 — YouTube constraint

Version one must not depend on undocumented bulk caption extraction. A YouTube URL may be saved with metadata. Transcript content is imported only when the user provides it, captures it from a visible page, or supplies authorized media for transcription.

### FR-MED-004 — Timestamp anchors

Transcript blocks preserve start and end timestamps. Citations open the relevant point in the transcript and, where possible, the original media URL with a time parameter.

### FR-MED-005 — Transcription consent and cost

Transcription is never automatic. The UI shows provider, estimated cost, expected upload size, and privacy implications before starting.

---

## 19. Cost and usage

### FR-CST-001 — Local by default

The following MUST be local:

- extraction;
- normalization;
- hashing;
- deduplication;
- chunking;
- embeddings;
- lexical and semantic search;
- source storage;
- citation resolution;
- learner-state storage;
- review scheduling.

### FR-CST-002 — Session budget

Each model run has:

- maximum steps;
- maximum total duration;
- maximum per-tool duration;
- estimated cost ceiling;
- context-size ceiling.

### FR-CST-003 — Usage display

The user sees:

```text
This session
Today
This month
Configured monthly limit
```

Where providers return authoritative cost, use it. Otherwise calculate an estimate from a versioned local price table and label it as estimated.

### FR-CST-004 — No hidden calls

Every remote model, search, vision, or transcription call creates a local usage event visible in diagnostics.

### FR-CST-005 — Prompt reuse

Stable instructions, tool definitions, and cached source representations SHOULD be arranged to benefit from provider prompt caching where available.

---

## 20. Export, backup, and deletion

### FR-EXP-001 — Studio export

A Studio can be exported as a portable directory or archive containing:

```text
studio.yaml
path.md
concepts.yaml
sources.yaml
notes/
```

Private learner evidence is excluded by default and may be included only through a separate explicit option.

### FR-EXP-002 — Full personal export

The user can export:

- normalized sources;
- notes and annotations;
- Studios;
- sessions;
- learner evidence;
- concept state;
- settings excluding secrets;
- usage history.

Formats: Markdown, JSON, and SQLite backup.

### FR-EXP-003 — Backup

The app creates a consistent local backup using SQLite’s backup mechanism and copies content-addressed files. Backups are restorable through the UI.

### FR-EXP-004 — Deletion

Deleting a source removes attachments, blocks, embeddings, and derived Source Cards after confirmation. Learner evidence that cited the source is retained as a tombstoned reference unless the user chooses complete erasure.

---

# Part III — System architecture

## 21. Architectural overview

The application has one desktop binary and one small browser extension. There is no required hosted backend.

```text
┌──────────────────────────────────────────────────────────────┐
│ Browser extension                                            │
│ WXT / MV3 · Defuddle · local retry queue                     │
└───────────────────────┬──────────────────────────────────────┘
                        │ native messaging
                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Electron desktop application                                 │
│                                                              │
│  Renderer                                                    │
│  React UI only · no Node access                              │
│        │ typed IPC                                           │
│        ▼                                                     │
│  Preload                                                     │
│  narrow contextBridge                                        │
│        │                                                     │
│        ▼                                                     │
│  Main process                                                │
│  app lifecycle · SQLite · filesystem · secrets · agent       │
│       ├───────────┬───────────────┬───────────────────────┐   │
│       ▼           ▼               ▼                       ▼   │
│  ingestion     retrieval      provider calls        job queue │
│       │           │                                       │   │
│       └───────────┴──────┬────────────────────────────────┘   │
│                          ▼                                    │
│  Utility processes                                            │
│  local embeddings · PDF extraction · optional transcription   │
└──────────────────────────────────────────────────────────────┘
                        │ direct HTTPS
                        ▼
             OpenAI / Anthropic / OpenRouter
```

---

## 22. Technology baseline

The initial implementation baseline is:

| Concern | Choice |
|---|---|
| Desktop runtime | Electron 43.2.0 baseline, pinned exact |
| UI | React 19 + TypeScript |
| Build | Vite through stable Electron Forge |
| Package management | pnpm workspace + lockfile |
| Agent/model abstraction | Vercel AI SDK 7 |
| Providers | `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@openrouter/ai-sdk-provider` |
| Validation | Zod |
| Local database | SQLite through `better-sqlite3` 13.x |
| Full-text search | SQLite FTS5 |
| Vector functions | pinned `sqlite-vec` stable, behind an interface |
| Local embeddings | `@huggingface/transformers` with bundled ONNX model |
| Default encoder | IBM Granite Embedding 97M Multilingual R2 |
| Web extraction | Defuddle |
| PDF extraction/viewing | unpdf + PDF.js |
| Extension | WXT, Manifest V3 |
| Unit/integration tests | Vitest |
| Desktop end-to-end tests | Playwright Electron support |
| Formatting/linting | Biome or ESLint + Prettier; choose one, not both stacks |

Rules:

- All production dependencies MUST be pinned by lockfile.
- Alpha or beta dependencies require an explicit architecture decision and a fallback.
- Forge 8 alpha must not be used for the initial release.
- Package upgrades must be isolated from feature changes.
- The implementation must generate a dependency-license report in CI.

---

## 23. Repository structure

Use one monorepo without creating an internal platform.

```text
/
├── AGENTS.md
├── README.md
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   ├── desktop/
│   │   ├── forge.config.ts
│   │   ├── src/
│   │   │   ├── main/
│   │   │   ├── preload/
│   │   │   ├── renderer/
│   │   │   ├── workers/
│   │   │   └── core/
│   │   │       ├── agent/
│   │   │       ├── learning/
│   │   │       ├── sources/
│   │   │       ├── retrieval/
│   │   │       ├── storage/
│   │   │       ├── providers/
│   │   │       └── jobs/
│   │   └── resources/
│   │       └── models/
│   └── extension/
│       ├── entrypoints/
│       └── lib/
├── packages/
│   └── contracts/
│       ├── ipc.ts
│       ├── agent.ts
│       ├── sources.ts
│       ├── learning.ts
│       └── extension.ts
├── migrations/
├── fixtures/
├── evals/
└── docs/
    ├── architecture-decisions/
    ├── threat-model.md
    └── release.md
```

`packages/contracts` may contain only schemas, serializable types, and protocol constants. It must not become a catch-all utilities package.

---

## 24. Electron process model

### 24.1 Renderer

The renderer is a sandboxed web application. It MUST have:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
```

It must not import Node libraries, provider SDKs, database libraries, filesystem APIs, or secrets.

### 24.2 Preload

The preload exposes a narrow typed API through `contextBridge`. Each method maps to a specific operation. There is no generic `invoke(channel, payload)` exported to the renderer.

Example shape:

```ts
interface DesktopBridge {
  studios: {
    list(): Promise<StudioSummary[]>;
    create(input: CreateStudioInput): Promise<Studio>;
    get(id: string): Promise<StudioDetail>;
  };
  sources: {
    addFile(input: AddFileInput): Promise<Source>;
    addUrl(input: AddUrlInput): Promise<Source>;
    subscribeJob(jobId: string, listener: (event: JobEvent) => void): Unsubscribe;
  };
  sessions: {
    start(input: StartSessionInput): Promise<SessionHandle>;
    send(input: SendMessageInput): Promise<void>;
    subscribe(sessionId: string, listener: (event: SessionStreamEvent) => void): Unsubscribe;
    cancel(sessionId: string): Promise<void>;
  };
  probe: {
    start(input: StartProbeInput): Promise<Probe>;
    answer(input: AnswerProbeInput): Promise<void>;
  };
}
```

All input and output are validated with shared Zod schemas on both sides.

### 24.3 Main process

The main process owns:

- database connection and migrations;
- API-key encryption/decryption;
- provider instances;
- agent execution;
- local filesystem;
- network policy;
- source job queue;
- native messaging host;
- update checks;
- opening external URLs;
- renderer IPC authorization.

Long CPU work must not run on the main event loop.

### 24.4 Utility processes

Use Electron `utilityProcess` for:

- embedding model inference;
- large PDF extraction;
- optional local audio processing;
- future advanced document parsing.

A worker is supervised by the main process. Jobs are persisted before dispatch and acknowledged after completion. If a worker exits, the job returns to the queue with bounded retries.

The embedding utility process is deliberately separate from the database process. This isolates ONNX Runtime, protects UI responsiveness, and avoids native-library interactions with SQLite extensions.

---

## 25. Application data layout

Under Electron `userData`:

```text
LocalLearningAgent/
├── learning.db
├── learning.db-wal
├── learning.db-shm
├── library/
│   ├── sha256/<prefix>/<hash>.pdf
│   ├── sha256/<prefix>/<hash>.md
│   └── sha256/<prefix>/<hash>.media
├── derived/
│   ├── normalized/
│   ├── page-images/
│   └── transcripts/
├── models/
│   └── manifest.json
├── secrets/
│   └── <provider-profile-id>.bin
├── logs/
├── backups/
└── jobs/
```

Rules:

- Paths stored in the database are relative to the application data root.
- Original binary content is addressed by SHA-256.
- Derived content includes parser and schema versions.
- Temporary files are written into a dedicated temp directory and atomically renamed after success.
- Secrets are never stored in SQLite, logs, crash reports, or renderer state.

---

## 26. Database configuration

At connection startup:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
PRAGMA trusted_schema = OFF;
```

Additional rules:

- One main-process connection owns writes.
- Transactions wrap every multi-table state transition.
- Migrations are ordered, checksummed, and transactional where SQLite permits.
- All tables use `STRICT` where compatible.
- Foreign-key violations fail tests.
- Database integrity checks run during diagnostics and before backup restore.
- Do not use `AUTOINCREMENT` unless monotonic non-reuse is required.
- Timestamps are UTC ISO strings or integer milliseconds; choose one convention and use it everywhere.
- IDs visible across IPC are UUIDv7 or ULID strings. High-volume internal source-block row IDs may use integer primary keys.

The complete initial schema is supplied separately in `SCHEMA.sql`.

---

# Part IV — Source architecture

## 27. Canonical source representation

Every source version is transformed into ordered blocks.

```ts
interface SourceBlock {
  id: number;
  sourceVersionId: string;
  ordinal: number;
  kind:
    | 'heading'
    | 'paragraph'
    | 'list'
    | 'code'
    | 'equation'
    | 'table'
    | 'caption'
    | 'quote'
    | 'transcript'
    | 'note';
  text: string;
  headingPath: string[];
  pageStart?: number;
  pageEnd?: number;
  timeStartMs?: number;
  timeEndMs?: number;
  charStart?: number;
  charEnd?: number;
  locator: SourceLocator;
  contentHash: string;
  tokenEstimate: number;
}
```

A locator is stable and source-type specific:

```ts
type SourceLocator =
  | { type: 'pdf'; page: number; bbox?: [number, number, number, number] }
  | { type: 'web'; headingPath: string[]; paragraphIndex: number }
  | { type: 'transcript'; startMs: number; endMs: number }
  | { type: 'text'; start: number; end: number };
```

The source pipeline MUST preserve enough information to render and cite the original location.

---

## 28. Ingestion state machine

```text
QUEUED
  → ACQUIRE
  → EXTRACT
  → QUALITY_CHECK
  → NORMALIZE
  → STRUCTURE
  → BLOCK
  → INDEX_LEXICAL
  → EMBED
  → READY
```

Failure states include a machine-readable error code and human-readable message.

Each stage is idempotent. A stage writes its output under a versioned key and marks completion in the same transaction. A restart resumes from the first incomplete stage.

Example job payload:

```ts
interface IngestionJobPayload {
  sourceId: string;
  sourceVersionId: string;
  requestedStages?: IngestionStage[];
  force?: boolean;
}
```

---

## 29. Webpage extraction

### Primary path: browser capture

The extension runs Defuddle against the rendered `document`. It returns clean Markdown and metadata. This is preferred because it can capture pages the user is already authorized to view and handles client-rendered content.

### Secondary path: direct URL

The desktop app may fetch ordinary HTTP(S) URLs through Electron networking. Direct fetch MUST:

- permit only `http:` and `https:`;
- reject embedded credentials;
- block loopback, link-local, metadata-service, and private-network destinations by default;
- cap redirects;
- cap response size;
- enforce content-type allowlists;
- set timeouts;
- avoid executing remote scripts;
- sanitize extracted HTML;
- retain final URL and redirect chain.

### Normalization

Normalization SHOULD:

- preserve headings;
- preserve code fences;
- preserve mathematics where possible;
- preserve links and footnotes;
- remove navigation and repeated chrome;
- collapse pathological whitespace;
- avoid rewriting quoted text;
- retain source metadata separately from content.

---

## 30. PDF extraction quality ladder

### Level 1 — Fast local text extraction

Use unpdf/PDF.js to obtain:

- document metadata;
- page count;
- outline;
- page text items;
- positional data;
- links;
- page rendering on demand.

Text items are reconstructed into lines, paragraphs, and sections with deterministic heuristics. The original page text items remain available for locator verification.

### Level 2 — Quality assessment

Compute per-page signals:

- character count;
- printable-character ratio;
- replacement-character ratio;
- text-item fragmentation;
- repeated header/footer ratio;
- suspicious reading-order jumps;
- image-to-text ratio;
- line-overlap anomalies;
- blank-page probability.

A source receives an extraction quality score and a list of suspect pages.

### Level 3 — User-visible attention

If extraction is poor, mark the source `needs_attention` and explain why. The user can still view the PDF and choose:

- retry extraction;
- visually interpret selected pages with the connected multimodal model;
- attach a better text or Markdown version;
- postpone.

### Level 4 — Targeted vision fallback

Only suspect pages are rendered to images and sent to a vision-capable model after explicit approval. The result is stored as a derived block set with provider, model, prompt, and page-image hashes.

### Optional advanced parser seam

Define:

```ts
interface AdvancedDocumentParser {
  id: string;
  supports(input: SourceAsset): boolean;
  parse(input: ParseRequest): Promise<StructuredDocument>;
}
```

This seam permits future local packs based on Docling, Marker, MinerU, or another evaluated system. None is a mandatory dependency for version one because they add Python, large models, licensing considerations, or hardware variability.

---

## 31. Transcript pipeline

### Supported formats

- WebVTT;
- SRT;
- plain text;
- timestamped JSON;
- Podcasting 2.0 transcript URLs;
- provider transcription output.

### Normalized representation

```ts
interface TranscriptSegment {
  speaker?: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}
```

Segments are merged into source blocks based on semantic and time boundaries while retaining original timestamp mapping.

### Podcast acquisition

The RSS adapter parses episode metadata, transcript tags, chapters, and enclosures. It does not automatically download media. The user must initiate transcription.

### Transcription

Use AI SDK’s provider-neutral transcription interface when supported. Before starting:

1. inspect local file size and duration;
2. estimate cost;
3. identify provider and model;
4. obtain user approval;
5. copy or stream the authorized media safely;
6. persist progress;
7. store transcript locally;
8. delete temporary upload artifacts when possible.

A later optional local transcription pack may use whisper.cpp. It is not required for the first complete release.

---

## 32. Chunking and block assembly

Do not split solely by fixed token count.

The block assembler uses:

1. source structure;
2. headings;
3. paragraph boundaries;
4. page or timestamp boundaries;
5. code and equation boundaries;
6. maximum embedding input length;
7. minimum useful semantic unit.

Recommended initial targets:

- 250–900 model tokens per retrievable block;
- 10–15% semantic overlap only when a boundary would otherwise lose context;
- code blocks remain intact up to a safety cap;
- tables remain one structured block when practical;
- headings are included as metadata and optionally prepended to embedding text;
- transcript blocks target roughly 30–120 seconds depending on density.

Block assembly is versioned. Rechunking creates a new source version or derived block version and triggers re-embedding without changing the original source.

---

## 33. Dedupe and source versioning

Use three hashes:

```text
asset_hash       raw file or captured payload
normalized_hash  normalized source content
block_hash       normalized individual block content
```

A URL is not content identity. The same URL may create a new source version when the normalized hash changes.

Near-duplicate detection MAY use local embeddings after exact hashes. It must never silently discard a source; it should propose a merge.

---

# Part V — Local embeddings and retrieval

## 34. Default embedding model

Use **IBM Granite Embedding 97M Multilingual R2** as the initial bundled encoder because it offers a strong efficiency-quality trade-off for local multilingual text, technical material, and code.

Implementation requirements:

- 384-dimensional normalized vectors;
- bundled, quantized ONNX artifact where validated;
- Apache 2.0 license notice included;
- exact model revision and SHA-256 recorded in `models/manifest.json`;
- remote model downloads disabled by default;
- inference runs in a utility process;
- the UI never exposes an embedding-model picker in normal settings.

A larger 768- or 1024-dimensional encoder is not assumed better. Any replacement must win the project retrieval evaluation at acceptable latency, memory, disk, and reindexing cost.

### Model manifest

```json
{
  "id": "ibm-granite/granite-embedding-97m-multilingual-r2",
  "revision": "<immutable revision>",
  "dimensions": 384,
  "pooling": "cls",
  "normalized": true,
  "runtime": "onnx",
  "dtype": "q8",
  "files": [{ "path": "...", "sha256": "..." }],
  "license": "Apache-2.0"
}
```

---

## 35. Embedding service

```ts
interface EmbeddingService {
  modelInfo(): Promise<EmbeddingModelInfo>;
  embedDocuments(inputs: EmbedInput[]): Promise<EmbeddedText[]>;
  embedQuery(input: EmbedInput): Promise<EmbeddedText>;
  health(): Promise<WorkerHealth>;
  shutdown(): Promise<void>;
}
```

Requirements:

- batch inputs conservatively;
- support cancellation;
- report progress;
- serialize inference if the runtime does not support concurrent sessions;
- apply the model’s exact pooling and normalization;
- reject vectors with incorrect length or non-finite values;
- persist model/version with every vector;
- reindex lazily after a model change;
- never mix vector spaces in one query.

---

## 36. Vector storage

Store vectors in a normal SQLite table as Float32 BLOBs. Load a pinned stable `sqlite-vec` build and use scalar cosine-distance functions or a controlled vector table implementation behind an interface.

```ts
interface VectorIndex {
  upsert(records: VectorRecord[]): Promise<void>;
  removeSourceVersion(sourceVersionId: string): Promise<void>;
  search(query: Float32Array, filter: RetrievalFilter, limit: number): Promise<VectorHit[]>;
  health(): Promise<VectorIndexHealth>;
}
```

Design constraints:

- application logic must not depend directly on `vec0` SQL syntax;
- a pure-JavaScript exact-scan fallback must exist for diagnostics and migration recovery;
- extension loading is disabled immediately after loading the trusted packaged extension;
- vector rows are joined to canonical source blocks by foreign key;
- the index is rebuildable from source blocks.

Do not add a separate vector database.

---

## 37. Hybrid retrieval

Every local source query follows:

```text
normalize query
  → derive Studio/source filters
  → FTS5 search
  → query embedding
  → vector search
  → reciprocal-rank fusion
  → structural diversity pass
  → optional lightweight relevance check
  → return source blocks with locators
```

Initial parameters:

- lexical candidates: 40;
- semantic candidates: 40;
- fused candidates: 20;
- final context blocks: 4–10 depending on size;
- RRF constant: configurable in code, initially 60.

The diversity pass prevents one page or duplicate passage from occupying the whole context.

Retrieval filters include:

- active source;
- selected sources;
- Studio sources;
- source type;
- language;
- date range;
- role;
- source version;
- block kind.

The agent does not invent filters. Typed tool arguments are validated against accessible Studio/source IDs.

---

## 38. Citation integrity

The model never creates arbitrary citation identifiers. Context blocks are supplied with opaque citation handles:

```text
[SRC:7F3A]
```

The output schema contains only handles from the provided context. The application validates:

- handle exists;
- block was included in the model call;
- cited claim has a nearby handle;
- locator resolves;
- source is not deleted or unavailable.

Invalid citations are removed from display and the response is marked for repair. A bounded repair call MAY be attempted; fabricated citations must never be shown as valid.

---

# Part VI — Agent architecture

## 39. AI SDK 7 integration

Use Vercel AI SDK 7 as the sole model and tool-loop abstraction.

Use:

- provider-specific adapters;
- `createProviderRegistry` or an equivalent typed registry;
- `ToolLoopAgent` for bounded tool use;
- typed runtime context;
- per-tool context schemas;
- `prepareStep` for mode-specific model, reasoning, tool, and prompt control;
- `stopWhen` and hard step limits;
- tool approvals for side effects;
- total, step, chunk, and tool timeouts;
- `Output.object()` for validated structured results;
- provider file uploads only as an optional optimization;
- AI SDK mock providers in tests;
- telemetry routed to local redacted observability.

Do not add LangChain, LangGraph, Mastra, Mem0, or another orchestration framework in version one.

---

## 40. Provider registry

```ts
type ProviderId = 'openai' | 'anthropic' | 'openrouter';

interface ProviderProfile {
  id: string;
  provider: ProviderId;
  label: string;
  selectedModelId: string;
  baseUrl?: string;
  capabilities: ModelCapabilities;
}
```

The registry is constructed in the main process after decrypting the selected secret. Provider instances are never serialized to the renderer.

Model lists:

- use provider discovery where stable;
- otherwise use a curated, remotely updatable but locally cached catalog;
- preserve a manual model-ID field under Advanced;
- test tool use and structured output before allowing a model to power Probe;
- fall back gracefully when a provider changes model availability.

---

## 41. One agent, three modes

```ts
type AgentMode = 'learn' | 'research' | 'probe';

interface LearningRuntimeContext {
  runId: string;
  mode: AgentMode;
  studioId: string;
  sessionId: string;
  objective: string;
  activeSourceIds: string[];
  providerProfileId: string;
  modelId: string;
  capabilities: ModelCapabilities;
  budget: RunBudget;
  probe?: ProbeRuntimeState;
}
```

### Learn mode

Purpose: teach, explain, compare, guide reading.

Available tools:

```text
search_library
get_source_outline
read_source_blocks
get_studio_state
get_learner_state
get_annotations
inspect_pdf_page (approval when remote vision is required)
get_transcript_segment
```

### Research mode

Adds:

```text
web_search
capture_research_source
inspect_references
```

Research mode may use higher step budgets but remains bounded.

### Probe mode

Available tools:

```text
get_probe_objective
get_relevant_source_blocks
get_learner_state
propose_learning_delta
```

Web search is disabled by default in Probe. The agent evaluates the learner’s answer, not the internet.

---

## 42. Tool contracts

All tools are narrow, typed, and auditable.

Example:

```ts
const searchLibraryInput = z.object({
  query: z.string().min(1).max(2000),
  studioId: z.string(),
  sourceIds: z.array(z.string()).max(50).optional(),
  limit: z.number().int().min(1).max(30).default(12),
});
```

Tool rules:

- read tools have no side effects;
- source and Studio IDs are checked against runtime scope;
- tools return compact data, not raw database objects;
- side-effect tools require application validation and, where appropriate, user approval;
- tools cannot read secrets;
- tools cannot issue arbitrary network requests;
- tools cannot execute shell commands;
- tools cannot write learner memory directly.

---

## 43. Agent loop control

Initial limits:

| Mode | Max steps | Total timeout | Tool timeout |
|---|---:|---:|---:|
| Learn | 8 | 120 s | 30 s |
| Research | 14 | 240 s | 45 s |
| Probe | 5 per turn | 90 s | 20 s |

These are application defaults, not promises to the user. The user can cancel any run.

`prepareStep` MUST:

- inspect remaining budget;
- reduce tools when no longer needed;
- prevent repeated identical searches;
- select reasoning level based on mode and model capability;
- keep stable instructions at the prompt prefix;
- stop when enough evidence is available.

The agent should not browse or retrieve after it already has sufficient evidence merely to consume the remaining step budget.

---

## 44. Prompt architecture

The model input has explicit layers:

```text
1. immutable product and safety instructions
2. mode-specific teaching policy
3. typed tool definitions
4. compact global learner state
5. compact Studio state
6. current objective
7. necessary recent turns
8. untrusted source blocks
9. current user message
```

Source blocks are delimited and labeled as untrusted evidence. They can contain instructions, but those instructions are never executable policy.

Prompt versions are stored with each run. Changing a prompt requires an eval run and a version increment.

---

## 45. Structured agent result

The final result uses a validated schema similar to:

```ts
const learningResponseSchema = z.object({
  answerMarkdown: z.string(),
  citations: z.array(z.object({
    handle: z.string(),
    claimSummary: z.string().max(300),
  })),
  suggestedActions: z.array(z.object({
    type: z.enum([
      'read_section',
      'start_probe',
      'compare_sources',
      'review_concept',
      'research',
      'none',
    ]),
    rationale: z.string(),
    sourceId: z.string().optional(),
    locator: z.unknown().optional(),
  })).max(3),
  learningEvidenceProposals: z.array(learningEvidenceProposalSchema).max(10),
  possibleMisconceptions: z.array(misconceptionProposalSchema).max(5),
  sessionSummary: z.string().max(2000),
});
```

The application validates and selectively commits proposals. User-visible text is never allowed to smuggle database operations.

---

## 46. Context construction

A normal turn sends:

- compact global profile: target 300–800 tokens;
- compact Studio state: target 300–1000 tokens;
- selected learner-concept states: retrieved locally;
- last necessary turns only;
- 4–10 relevant source blocks;
- source outlines only when needed;
- tool definitions;
- current question.

The application does not replay full histories by default. Sessions receive rolling summaries, but summaries are not treated as learner evidence.

---

## 47. Provider file references

AI SDK 7 provider file uploads MAY be used for repeated vision or large-file operations when the provider supports them. Requirements:

- local structured extraction remains authoritative for citations;
- file upload is explicit and recorded;
- provider file reference and expiry are stored;
- the app can delete provider-hosted files where the API permits;
- files are never uploaded merely because they were saved locally;
- a provider reference is invalidated when source content changes.

---

# Part VII — Learner model and Probe engine

## 48. Learner-state model

Learner state is an event-sourced projection.

### Events are truth

`learning_events` is append-only except for explicit retraction metadata. It records:

- scope;
- concept;
- event kind;
- demonstrated level;
- confidence;
- learner-answer excerpt;
- question;
- rubric;
- evaluator model;
- source context;
- timestamp;
- retraction.

### Concept state is a projection

`concept_state` is derived from events and may be rebuilt. It stores the current convenient view for retrieval and UI.

### Model proposals are not truth

The evaluator proposes a `LearningDelta`. Application code validates:

- concept exists or can be safely created;
- evidence excerpt occurs in the learner answer;
- level transition is allowed;
- confidence is in range;
- scope is valid;
- no duplicate event exists;
- rubric supports the proposed level.

---

## 49. Concept identity

Concepts have canonical names and aliases. The app must avoid creating separate concepts for superficial wording differences.

A concept record contains:

```text
canonical name
description
domain
aliases
parent concepts
prerequisites
related concepts
creation source
```

Automatic concept creation is conservative. The model proposes; deterministic code searches aliases and similarity; ambiguous merges require user confirmation.

---

## 50. Mastery transition policy

Allowed upward transitions:

```text
unassessed → encountered
encountered → can_explain
can_explain → can_apply
can_apply → can_compare_or_critique
```

A Probe may jump a level only when the rubric explicitly tests the higher level and evidence is strong.

Downward changes do not delete prior evidence. New contradictory evidence reduces confidence or marks state uncertain.

Initial confidence rules:

- one weak answer cannot establish a high-confidence state;
- transfer across contexts raises confidence;
- unprompted distinction is stronger than recognition after hints;
- direct correction followed by repetition in the same turn is weak evidence;
- delayed successful recall is stronger than immediate recall.

These rules live in deterministic policy code and evaluator prompts.

---

## 51. Probe state machine

```text
DRAFT
  → SELECT_OBJECTIVE
  → BUILD_RUBRIC
  → ASK
  → RECEIVE_ANSWER
  → EVALUATE
      ├── ASK_NEXT
      ├── TEACH_GAP
      ├── COMPLETE
      └── USER_STOPPED
```

### Start

Inputs:

- Studio;
- target source or concept set;
- desired depth;
- maximum turns, default 5;
- optional user objective.

### Question generation

The first question is broad enough to expose the learner’s model. Later questions target distinctions or gaps discovered in prior answers.

### Answer evaluation schema

```ts
const probeTurnResultSchema = z.object({
  feedback: z.string(),
  evidence: z.array(z.object({
    conceptId: z.string(),
    answerExcerpt: z.string().min(1),
    demonstratedLevel: z.enum([
      'encountered',
      'can_explain',
      'can_apply',
      'can_compare_or_critique',
    ]),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })),
  misconceptionHypotheses: z.array(z.object({
    conceptId: z.string(),
    description: z.string(),
    answerExcerpt: z.string().min(1),
    confidence: z.number().min(0).max(1),
  })),
  nextQuestion: z.object({
    prompt: z.string(),
    purpose: z.string(),
    rubric: probeRubricSchema,
  }).optional(),
  shouldStop: z.boolean(),
  stopReason: z.enum([
    'objective_met',
    'prerequisite_gap',
    'teach_before_continue',
    'turn_limit',
    'user_stopped',
  ]).optional(),
});
```

### Feedback

Feedback should be specific and brief. It identifies what was correct, what is missing, and why the next question follows. It must not flatter the user or inflate mastery.

### Completion

The Probe result is committed in one transaction together with validated learning events and the next-step proposal.

---

## 52. Review scheduling

Review scheduling is secondary to the core learning experience. A concept receives `next_review_at` based on:

- mastery level;
- confidence;
- evidence age;
- contradictory evidence;
- importance to active goals;
- user preference.

A future FSRS integration MAY optimize timing, but version one can use a small deterministic scheduler. Do not expose flashcard terminology in the primary interface.

---

# Part VIII — Security and privacy

## 53. Threat model

Threats include:

- malicious source content attempting prompt injection;
- hostile HTML or scripts;
- malformed PDFs;
- filesystem traversal;
- API-key disclosure;
- renderer compromise;
- malicious deep links;
- native-messaging impersonation;
- SSRF through URL ingestion;
- provider data retention;
- dependency supply-chain compromise;
- model-generated destructive actions;
- corrupted local database or migrations;
- accidental leakage through logs and telemetry.

Security is part of the architecture, not a later audit task.

---

## 54. Electron hardening

The application MUST follow Electron’s security checklist:

- load only packaged local UI content;
- use context isolation;
- enable renderer sandboxing;
- disable Node integration;
- define a strict Content Security Policy;
- deny unexpected permission requests;
- validate navigation and new-window attempts;
- open external URLs through a validated main-process method;
- disallow `webview` for arbitrary content;
- keep Electron patched within the supported major line;
- validate all IPC senders and payloads;
- expose no generic Electron APIs to the renderer.

Renderer CSP baseline:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
media-src 'self' blob:;
object-src 'none';
frame-src 'none';
base-uri 'none';
form-action 'none';
```

Provider calls occur in the main process, so the renderer does not need arbitrary internet access.

---

## 55. Secret storage

- Encrypt provider keys with Electron `safeStorage` in the main process.
- Store ciphertext in a separate file keyed by provider profile ID.
- Never return a decrypted key to the renderer.
- Never include keys in environment dumps, logs, diagnostics, or crash metadata.
- Support key replacement and deletion.
- Display only a short masked suffix after save.
- Decrypt immediately before provider construction or request and release references afterward.
- On platforms where OS-backed encryption is unavailable, block secret persistence and explain the limitation rather than storing plaintext.

---

## 56. Prompt-injection defense

Source content is untrusted data.

Enforcement:

- source text is never concatenated into the system-instruction section;
- source blocks are delimited with explicit IDs;
- the system prompt states that instructions found inside sources are evidence, not commands;
- source tools are read-only;
- research results cannot alter tool policy;
- external links are not fetched automatically because a source requests it;
- model tool calls are constrained to schemas and runtime scope;
- side effects require deterministic validation or approval.

Prompt-injection fixtures are mandatory in the test suite.

---

## 57. URL and network safety

Direct URL acquisition MUST:

- resolve DNS and re-check destination after redirects;
- block localhost, private, link-local, and cloud-metadata ranges by default;
- reject non-HTTP schemes;
- cap body size;
- cap decompressed size;
- cap redirects;
- use request timeouts;
- sanitize filenames;
- avoid persisting cookies unless necessary for explicit browser capture;
- never reuse browser-auth cookies in desktop direct fetch.

Provider network destinations are allowlisted by selected provider configuration. Custom base URLs are Advanced and carry a warning.

---

## 58. File safety

- Imported files are treated as bytes, never executed.
- File extensions are not trusted; inspect MIME signatures.
- Reject or warn on password-protected PDFs.
- Cap file size and page count with overridable advanced limits.
- PDF JavaScript is never executed.
- Archive extraction, if added later, must defend against zip-slip and bombs.
- Temporary paths are generated by the app, not user input.
- File previews use internal viewers or OS-open with user action.

---

## 59. Native messaging security

- Register the native host during signed installation.
- Allow only known Chrome and Edge extension IDs.
- Validate every message with Zod.
- Cap message size.
- Large page payloads use a chunked protocol with hash verification.
- Reject paths or commands from the extension.
- The extension can submit capture data only; it cannot invoke arbitrary desktop methods.

---

## 60. Privacy communication

The UI must distinguish:

### Always local

Sources, embeddings, learner state, notes, indexes, usage history.

### Sent to the selected provider when needed

Selected source passages, compact learner context, current user message, optional uploaded file/page, explicit audio transcription.

### Sent to websites

Only explicit URL fetches, research searches, and source opening.

No analytics are enabled by default. Optional anonymous telemetry must be opt-in and must never include source text, messages, learner state, URLs, or file names.

---

# Part IX — Performance, reliability, and accessibility

## 61. Performance budgets

Target hardware:

- Apple Silicon Mac with 8 GB RAM or more;
- Intel Mac still supported where Electron supports it, with reduced embedding speed;
- Windows 11 x64 with 8 GB RAM or more;
- Windows ARM64 when dependency packaging is validated.

Targets on a typical modern laptop:

| Operation | Target |
|---|---:|
| Cold app launch to usable shell | < 3 s median |
| Warm launch | < 1.5 s median |
| Create Studio | < 300 ms local portion |
| Add 20-page born-digital PDF to extracted state | < 10 s median |
| Local search over 50k blocks | < 250 ms p95 excluding query embedding |
| Query embedding | < 300 ms warm p95 |
| Citation navigation | < 150 ms after viewer ready |
| UI input latency | < 100 ms |
| Background indexing | must not block renderer |

These are evaluation targets, not assumptions. CI and release tests must record actual numbers.

---

## 62. Job queue and recovery

The local job queue persists:

- job type;
- payload;
- state;
- progress;
- attempts;
- lease time;
- last error;
- retry time.

On startup:

- expired running leases return to queued;
- idempotent jobs resume;
- permanent failures move to `failed`;
- the user can retry or inspect.

Use bounded exponential backoff for network work. Do not retry authentication, unsupported format, or user-cancel errors automatically.

---

## 63. Cancellation

All long operations support cancellation:

- model stream;
- agent loop;
- web search;
- source fetch;
- PDF parsing;
- embedding batch;
- transcription;
- export and backup where safe.

Cancellation produces a durable state and does not leave partial database rows pretending to be complete.

---

## 64. Accessibility

The application MUST support:

- full keyboard navigation;
- visible focus states;
- semantic landmarks;
- screen-reader labels;
- scalable text;
- sufficient contrast;
- reduced-motion preference;
- captions/transcripts for audio features;
- no color-only mastery indicators;
- keyboard shortcuts discoverable in menus.

Probe must not impose timed answers by default.

---

## 65. Visual and interaction design

The interface should feel calm, serious, and native rather than like an analytics dashboard.

Rules:

- one primary action per screen;
- generous whitespace;
- readable long-form typography;
- no card grid unless content truly forms a grid;
- no gradient-heavy AI aesthetic;
- no animated agent avatar;
- no endless loading prose;
- no token counters in the main flow;
- no celebration animations for mastery;
- source and learner evidence remain one click away;
- advanced capability is progressively disclosed.

Core labels:

```text
Today
Studios
Inbox
You
Continue learning
Learn
Ask
Probe
Research
```

---

# Part X — Testing and evaluation

## 66. Test strategy

Testing has five layers:

1. deterministic unit tests;
2. database and process integration tests;
3. AI-contract tests with mock providers;
4. evaluation datasets using real models when explicitly run;
5. packaged desktop and extension end-to-end tests.

No feature is complete when only the happy-path UI works.

---

## 67. Unit tests

Required unit coverage includes:

- URL canonicalization;
- content hashing;
- deduplication;
- block assembly;
- locator generation;
- FTS query escaping;
- reciprocal-rank fusion;
- vector normalization and validation;
- citation-handle validation;
- mastery transition rules;
- evidence excerpt matching;
- review scheduling;
- cost estimation;
- provider capability mapping;
- IPC schema validation;
- job retry classification;
- secret redaction;
- path containment.

Aim for high coverage of domain logic, not artificial line coverage of React rendering.

---

## 68. Parser fixtures

Maintain fixtures for:

- ordinary single-column paper;
- two-column paper;
- paper with equations;
- paper with tables;
- scanned PDF;
- malformed PDF;
- webpage with heavy navigation;
- client-rendered article capture;
- code-heavy documentation;
- VTT and SRT;
- multilingual source;
- prompt-injection source;
- duplicate and revised source.

Golden outputs include block order, text, headings, page/timestamp locators, and quality flags.

---

## 69. Retrieval evaluation

Create a versioned evaluation set with at least 200 queries across:

- factual lookup;
- conceptual explanation;
- terminology mismatch;
- cross-language retrieval;
- code/documentation retrieval;
- comparison;
- long-document reference;
- transcript lookup;
- exact identifiers;
- negative/no-answer cases.

Record:

- Recall@5;
- Recall@10;
- MRR;
- nDCG@10;
- citation-block accuracy;
- latency;
- memory use;
- index size.

Compare:

- FTS only;
- vector only;
- hybrid;
- alternative encoder candidates.

A larger embedding model may replace the default only when this evaluation demonstrates a meaningful product improvement.

---

## 70. Probe evaluation

Build a curated set of learner answers containing:

- correct explanation;
- superficial recognition;
- partial explanation;
- common misconception;
- correct application;
- memorized wording without transfer;
- contradictory reasoning;
- answer in another language;
- irrelevant answer;
- adversarial instruction to self-award mastery.

Evaluate:

- mastery-level agreement with human labels;
- misconception detection precision;
- evidence-excerpt validity;
- next-question usefulness;
- overconfidence rate;
- underconfidence rate;
- consistency across supported provider models.

Probe is release-blocking. It is the core learner-model input, not a decorative feature.

---

## 71. AI contract tests

Use AI SDK mock providers to test:

- tool call sequences;
- malformed tool arguments;
- repeated tool calls;
- timeout propagation;
- cancellation;
- structured-output repair;
- invalid citations;
- invalid evidence excerpts;
- model refusing a tool;
- provider stream interruption;
- cost and usage recording;
- capability fallbacks.

Real-provider tests are opt-in, rate-limited, and excluded from normal contributor CI.

---

## 72. Security tests

Required tests:

- source prompt injection cannot call side-effect tools;
- renderer cannot access Node;
- IPC rejects unknown senders and malformed payloads;
- direct URL fetch blocks private networks and redirects to them;
- external URL opener rejects dangerous schemes;
- native messaging rejects unknown extension IDs;
- source HTML scripts are not executed;
- path traversal fails;
- secrets do not appear in logs or diagnostics;
- malicious citation handles fail closed;
- oversized extension payload is rejected;
- corrupted database backup is not restored over a healthy database.

---

## 73. End-to-end golden path

A release candidate must pass this packaged-app flow on macOS and Windows:

1. launch fresh install;
2. connect a test provider or deterministic mock endpoint;
3. create “Agent Memory” Studio;
4. import a PDF fixture;
5. observe extraction and indexing;
6. ask a question;
7. receive a streaming answer with valid page citation;
8. open citation in PDF viewer;
9. start Probe;
10. answer three open-ended questions;
11. see validated Learning Map;
12. close and reopen app;
13. confirm Studio, source, session, evidence, and next step persist;
14. capture a webpage through extension;
15. confirm it appears in Inbox;
16. export Studio;
17. create and restore a backup.

---

# Part XI — Observability and diagnostics

## 74. Local logging

Use structured local logs with levels:

```text
error | warn | info | debug
```

Default production logging excludes:

- source text;
- user messages;
- learner answers;
- URLs unless user enables diagnostic detail;
- API keys;
- provider request bodies.

Logs include correlation IDs for jobs, sessions, runs, and tool calls.

Rotate logs and cap total disk use.

---

## 75. AI telemetry

Subscribe to AI SDK telemetry and lifecycle events locally. Record:

- provider/model;
- operation type;
- duration;
- time to first token;
- step count;
- tool duration;
- token usage;
- cache-read tokens when available;
- finish reason;
- error class;
- estimated or provider cost.

Do not store hidden chain-of-thought or provider reasoning text. If a provider emits reasoning summaries intended for display, treat them as ordinary generated content under the provider’s rules.

---

## 76. Diagnostic bundle

The user may export a diagnostic bundle containing:

- app and OS versions;
- dependency manifest;
- redacted logs;
- database schema version;
- integrity-check output;
- job states;
- model manifest;
- extension connection status;
- provider capability status without secrets.

The UI lists exactly what will be included before export.

---

# Part XII — Build, release, and distribution

## 77. Desktop packaging

Use stable Electron Forge.

Artifacts:

### macOS

- arm64 DMG;
- x64 DMG if maintained;
- signed and notarized;
- ZIP artifact for update service.

### Windows

- x64 Squirrel.Windows installer initially;
- signed installer;
- optional ARM64 after native dependency validation.

The app must install without administrator privileges where the chosen installer supports it.

---

## 78. Updates

For an open-source repository, use GitHub Releases with Electron-compatible update metadata. The app:

- checks after startup with delay;
- downloads in background;
- never interrupts an active learning or ingestion operation;
- asks to restart when ready;
- supports skipping a version;
- verifies signed artifacts.

Database migrations must be backward-aware. Before a destructive migration, create a backup.

---

## 79. Extension distribution

Publish to:

- Chrome Web Store;
- Microsoft Edge Add-ons.

WXT build and submission automation runs in CI. Store IDs are injected into native-host manifests during packaging.

---

## 80. CI pipeline

Pull requests run:

```text
typecheck
lint / format check
unit tests
integration tests
schema migration tests
security tests
fixture parser tests
renderer build
extension build
license audit
```

Main/release branches additionally run:

```text
packaged smoke tests
macOS build
Windows build
artifact signing
SBOM generation
update metadata generation
retrieval benchmark smoke set
```

Nightly or manual workflows run real-provider evals with explicit secrets and cost caps.

---

# Part XIII — Implementation sequence

## 81. Milestone 0 — Foundation

Deliver:

- monorepo;
- Electron Forge shell;
- sandboxed renderer/preload/main boundary;
- React navigation shell;
- SQLite migrations;
- settings and safe secret storage;
- provider connection test;
- CI;
- signed-development packaging path;
- architecture decision records.

Exit criteria:

- packaged app launches on macOS and Windows;
- renderer cannot access Node;
- provider key survives restart encrypted;
- database migration tests pass.

---

## 82. Milestone 1 — Studios and local source core

Deliver:

- Studios;
- goals;
- source records;
- content-addressed library;
- local job queue;
- text/Markdown/pasted source ingestion;
- source viewer;
- notes and annotations;
- backup/export skeleton.

Exit criteria:

- source ingestion resumes after forced restart;
- duplicate source handling works;
- all data persists locally.

---

## 83. Milestone 2 — PDF and web ingestion

Deliver:

- unpdf/PDF.js extraction;
- PDF viewer and page citations;
- quality assessment;
- Defuddle direct and extension-ready capture format;
- URL safety policy;
- FTS5 index.

Exit criteria:

- parser fixture suite passes;
- cited block opens correct page/paragraph;
- malicious HTML does not execute.

---

## 84. Milestone 3 — Local embeddings and retrieval

Deliver:

- bundled Granite encoder;
- embedding utility process;
- vector storage/index abstraction;
- hybrid retrieval;
- retrieval eval harness;
- index versioning and rebuild.

Exit criteria:

- 50k-block performance target measured;
- no UI blocking during indexing;
- hybrid retrieval beats lexical-only baseline on agreed eval threshold.

---

## 85. Milestone 4 — Learning agent

Deliver:

- AI SDK 7 provider registry;
- Learn agent mode;
- typed tools;
- streamed session events;
- citation validation;
- compact context construction;
- usage/cost events;
- cancellation and timeouts;
- Source Cards.

Exit criteria:

- answers are grounded in local source blocks;
- invalid citation handles fail closed;
- no source save invokes a model;
- mock-provider contract tests pass.

---

## 86. Milestone 5 — Learner state and Probe

Deliver:

- concepts and aliases;
- learning-event log;
- concept-state projection;
- Probe state machine;
- hidden rubrics;
- evidence validation;
- Learning Map;
- cross-Studio distilled memory;
- user correction/retraction.

Exit criteria:

- reading cannot grant `can_explain`;
- evidence excerpt validation is enforced;
- Probe eval reaches agreed human-label agreement threshold;
- learner state rebuilds from event log.

---

## 87. Milestone 6 — Research and media

Deliver:

- explicit Research mode;
- OpenAI/Anthropic provider-native web search where supported;
- captured research evidence;
- transcript import;
- podcast transcript tag support;
- explicit API transcription;
- timestamp citations.

Exit criteria:

- web search is unavailable in Probe by default;
- research evidence is locally inspectable;
- transcription always requires approval and cost display.

---

## 88. Milestone 7 — Browser extension

Deliver:

- WXT extension;
- Defuddle capture;
- Inbox/Studio target selection;
- native messaging;
- offline retry queue;
- Chrome and Edge builds;
- extension security tests.

Exit criteria:

- captured page appears locally with original metadata;
- unknown extension IDs are rejected;
- app closed/open retry succeeds.

---

## 89. Milestone 8 — Product polish and release

Deliver:

- Today next-action policy;
- complete You page;
- accessibility pass;
- performance pass;
- diagnostics;
- full export/restore;
- signed installers;
- auto-update;
- documentation;
- golden-path E2E;
- release checklist.

Exit criteria:

- all Definition of Done items pass;
- no release-blocking security findings;
- fresh nontechnical tester completes first-value flow without developer help.

---

# Part XIV — Definition of Done

## 90. Product Definition of Done

The product is complete for version one only when all statements below are true.

### Installation and ownership

- [ ] Signed macOS installer works.
- [ ] Signed Windows installer works.
- [ ] No terminal, Docker, Python, or account is required.
- [ ] The app works offline for existing local content.
- [ ] User data is exportable and restorable.

### Provider setup

- [ ] OpenAI connection works.
- [ ] Anthropic connection works.
- [ ] OpenRouter connection works.
- [ ] Keys are OS-encrypted and never reach renderer/logs.
- [ ] Unsupported model capabilities are handled clearly.

### Sources

- [ ] PDF, URL, Markdown, text, and transcript ingestion work.
- [ ] Original files are preserved content-addressably.
- [ ] Processing is resumable and idempotent.
- [ ] Extraction quality is visible.
- [ ] Citations open exact source locations.

### Retrieval

- [ ] Local embeddings work on target Mac and Windows devices.
- [ ] Hybrid retrieval meets evaluation and latency targets.
- [ ] Vector index can be rebuilt.
- [ ] No hosted vector database exists.

### Agent

- [ ] Learn, Research, and Probe modes use one bounded agent.
- [ ] Tool inputs are typed and scoped.
- [ ] Model cannot write database or filesystem arbitrarily.
- [ ] Cancellation and timeouts work.
- [ ] Source prompt injections fail to alter policy.

### Learning

- [ ] Probe asks one open-ended question at a time.
- [ ] Every durable mastery claim has evidence.
- [ ] Evidence excerpts are validated.
- [ ] Learner can correct/retract memory.
- [ ] Cross-Studio memory shares only distilled state.
- [ ] Reading alone never implies explanation/application.

### Cost

- [ ] Saving/indexing sources is model-call free.
- [ ] Every remote call appears in local usage history.
- [ ] Session and monthly limits work.
- [ ] Context construction avoids full-history replay.

### Extension and media

- [ ] Chrome and Edge capture work.
- [ ] Native messaging is restricted to known IDs.
- [ ] Podcast transcript links import.
- [ ] Audio transcription is explicit and costed.
- [ ] YouTube captions are not acquired through an unsupported official path.

### Quality

- [ ] Unit and integration suites pass.
- [ ] Parser fixtures pass.
- [ ] Retrieval eval passes.
- [ ] Probe eval passes.
- [ ] Security suite passes.
- [ ] Packaged golden-path E2E passes on macOS and Windows.
- [ ] Accessibility audit has no critical issues.

---

# Part XV — Risks and deliberate trade-offs

## 91. Embedding-model risk

The 97M model may underperform a larger encoder on difficult retrieval. Mitigation: maintain a real eval set and a replaceable embedding interface. Do not increase dimensions based on intuition alone.

## 92. PDF complexity

No lightweight parser perfectly handles every table, formula, scan, and layout. Mitigation: quality ladder, visible failure, targeted vision fallback, advanced-parser seam.

## 93. Provider variability

Models differ in tool use, structured output, web search, and cost metadata. Mitigation: capability tests, provider-specific adapters, curated supported-model list, mock contracts, graceful downgrade.

## 94. Learner-model overconfidence

An LLM may award mastery too easily. Mitigation: open-ended evidence, deterministic transitions, multiple contexts, confidence limits, human evals, user correction.

## 95. Local native dependencies

Electron, SQLite, ONNX Runtime, and vector extensions can create packaging failures. Mitigation: isolate ONNX in a utility process, pin versions, build on real target OS runners, retain vector fallback.

## 96. Browser platform restrictions

Dynamic pages and captions vary. Mitigation: rendered-page extension capture, explicit supported paths, no dependence on brittle scraping.

## 97. Scope expansion

Discovery feeds, X monitoring, local generative models, social Studios, and graph visualization can distract from the core. Mitigation: version-one non-goals are normative; additions require evidence from the golden learning loop.

---

# Part XVI — Future direction, explicitly outside version one

After the core learning loop is excellent, the same architecture can support:

- curated AI people and source packs;
- arXiv and GitHub subscriptions;
- podcast feed monitoring;
- topic-specific frontier discovery;
- idea lineage and historical timelines;
- shareable expert-curated Studios;
- optional local transcription pack;
- optional local generative model;
- encrypted peer-to-peer sync;
- an open Studio registry.

Automated discovery must feed the same Inbox and learner model. It must not become a separate engagement feed.

---

# Part XVII — Final implementation instruction

The coding agent must treat the following as the golden path:

> Create a Studio → add one PDF or captured webpage → locally extract and index it → ask a cited question → learn one concept → complete an adaptive three-question Probe → persist validated learner evidence → show the Learning Map → recommend the exact next source section.

The agent should implement milestone by milestone, keep the repository runnable, execute all tests continuously, and continue until every applicable Definition of Done item is satisfied. It must not stop after scaffolding, produce placeholder implementations, or replace hard product behavior with TODO comments.

When external credentials are unavailable, the agent must use deterministic provider mocks and complete all local behavior. Code-signing certificates and store credentials are the only expected external release blockers; their absence does not justify leaving packaging configuration or release automation unimplemented.

The governing engineering principle is:

> Borrow the machinery. Own the judgment.

The application should borrow reliable infrastructure for models, extraction, rendering, storage, and packaging. It must own the hard part: deciding what this person understands, what remains uncertain, what evidence supports that belief, and what they should learn next.
