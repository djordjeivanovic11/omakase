# Local Learning Agent — Implementation Specification Pack

This pack defines a complete version-one product and architecture for a local-first learning desktop application.

The application lets a person create topic **Studios**, add difficult sources, learn through a source-grounded agent, and complete open-ended **Probe** conversations that establish what the person can actually explain, apply, compare, or critique. Sources, embeddings, conversations, evidence, learner state, and usage history stay local. The user supplies an OpenAI, Anthropic, or OpenRouter key for frontier reasoning.

## Product in one sentence

> Bring it something worth understanding; it reads the source, teaches it at the right depth, probes the boundary of your understanding, and gives you the exact next step.

## Architecture in one sentence

> One Electron desktop app, one WXT browser extension, one SQLite database, one local encoder, and one bounded AI SDK 7 agent—without a required backend.

## Pack contents

| File | Purpose |
|---|---|
| `TECHNICAL_SPEC.md` | Full product, UX, architecture, agent, learning, security, testing, release, and milestone contract. |
| `SCHEMA.sql` | Executable initial SQLite schema for local storage and learner evidence. |
| `AGENTS.md` | Autonomous coding-agent operating rules and completion mandate. |
| `ACCEPTANCE_CHECKLIST.md` | Reproducible version-one release criteria and evidence matrix. |
| `REFERENCES.md` | Primary technical documentation and rationale baseline. |
| `CODING_AGENT_PROMPT.md` | Ready-to-paste instruction for starting implementation. |
| `SPEC_VALIDATION.md` | Checks already performed on the schema and pack consistency. |
| `AI_ENGINEERING.md` | Development-agent / eval / MCP / Graphify operating system. |
| `AI_ENGINEERING_READINESS.md` | Readiness verdict for the AI engineering setup. |
| `USING_OMAKASE.md` | End-user guide for local install, sources, Probe, and extension. |
| `MVP_READINESS_REPORT.md` | Personal MVP readiness verdict and reproduce commands. |
| `ACCEPTANCE_EVIDENCE.md` | Filled evidence for the personal macOS MVP gate. |
| `IMPLEMENTATION_STATUS.md` | Living implementation evidence vs acceptance IDs. |
| `development/` | Quickstart, Graphify, skills evaluation. |
| `decisions/` | AI engineering ADR (also mirrored under `architecture-decisions/`). |
| `MANIFEST.sha256` | Integrity hashes for the pack. |

## Reading order

1. `AGENTS.md`
2. `TECHNICAL_SPEC.md`
3. `SCHEMA.sql`
4. `ACCEPTANCE_CHECKLIST.md`
5. `REFERENCES.md`

The authority order is defined in `AGENTS.md`.

## How to use this with a coding agent

Place these files at the root of a new or existing repository. Then give the coding agent the contents of `CODING_AGENT_PROMPT.md`.

The coding agent must:

- implement rather than merely plan;
- keep the repository runnable after each slice;
- work milestone by milestone;
- use deterministic provider mocks whenever real keys are absent;
- maintain `docs/implementation-status.md` with reproducible evidence;
- continue until every applicable acceptance criterion passes;
- leave only signing, notarization, store publication, or paid credentials as accurately documented external blockers.

## Fixed version-one decisions

- macOS and Windows desktop app;
- Electron, React, TypeScript, stable Electron Forge;
- pnpm monorepo;
- AI SDK 7;
- OpenAI, Anthropic, and OpenRouter BYOK;
- SQLite, FTS5, and local Float32 embeddings;
- bundled IBM Granite Embedding 97M Multilingual R2 encoder;
- unpdf/PDF.js extraction with a quality ladder;
- Defuddle browser capture through WXT;
- provider-native web search only in explicit Research mode;
- one open-ended Probe question at a time;
- event-sourced learner evidence with deterministic mastery projection;
- no account, cloud database, required backend, Docker, Python service, multi-agent system, or hosted vector database.

## The required vertical slice

The first end-to-end implementation target is:

> Create a Studio → import one PDF → extract and index it locally → ask a cited question → learn one concept → answer three adaptive Probe questions → store validated evidence → show a Learning Map → recommend the exact next section.

Do not begin automated frontier feeds, X monitoring, social Studios, plugin systems, local generative models, or a visible knowledge graph before this flow is excellent.

## Schema validation

`SCHEMA.sql` is designed for SQLite with JSON1, FTS5, and strict tables. The implementation must execute it as migration `0001`, replace the placeholder migration checksum during the build process, and test:

- empty-database migration;
- foreign-key integrity;
- FTS synchronization;
- event immutability;
- projection rebuild;
- backup and restore.

## Product standard

The sophistication belongs under the surface. A normal user should see four primary places:

```text
Today | Studios | Inbox | You
```

And three primary source actions:

```text
Learn | Ask | Probe
```

The main action is normally:

> Continue learning

The implementation is successful only when the user understands more deeply—not merely when the system has ingested more content.
