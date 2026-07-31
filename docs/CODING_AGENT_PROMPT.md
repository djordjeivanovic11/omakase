# Implementation Prompt

You are the principal engineer responsible for implementing the complete version-one **Local Learning Agent** in this repository.

Read, in order:

1. `AGENTS.md`
2. `TECHNICAL_SPEC.md`
3. `SCHEMA.sql`
4. `ACCEPTANCE_CHECKLIST.md`
5. `REFERENCES.md`

Then inspect the repository and begin implementation immediately. Do not return only a plan.

Treat the specification as both the product contract and engineering contract. The application is not a generic chatbot or document-RAG shell. It is a local, source-native learning system that:

- creates topic Studios;
- ingests and preserves sources locally;
- extracts and indexes sources without model cost;
- uses a user-selected OpenAI, Anthropic, or OpenRouter model through AI SDK 7;
- teaches with exact source citations;
- asks one adaptive open-ended Probe question at a time;
- stores only validated, evidence-backed learner state;
- recommends the exact next learning action.

The fixed architecture is:

> One Electron desktop app, one WXT browser extension, one SQLite database, one local Granite encoder, and one bounded AI SDK 7 agent. No required backend.

Implement the milestones in `TECHNICAL_SPEC.md` in order. Keep the repository runnable and tested after every coherent slice. Maintain `docs/implementation-status.md` with current milestone, working golden path, acceptance evidence, external blockers, decisions, and next slice.

Do not stop because real provider keys are unavailable. Implement deterministic mock providers and complete all local behavior and packaged golden-path tests. The only legitimate external release blockers are unavailable code-signing/notarization/store credentials or optional paid-provider credentials. Configure those paths completely and document the exact missing secret.

Do not leave production TODOs, placeholders, unimplemented methods, mock-only UI paths, or interfaces without working implementations. Do not add a cloud backend, account system, Docker, Python service, LangChain, LangGraph, Mem0, Graphiti, a hosted vector database, a second agent framework, an infinite feed, or scope outside version one.

For ordinary implementation ambiguity, make the smallest reversible decision consistent with the documents, record meaningful trade-offs as ADRs, and continue. Ask for human input only for a material, irreversible product/security/licensing decision not resolved by the specification.

The golden path that must work from packaged macOS and Windows applications is:

> Create a Studio → add one PDF or captured webpage → locally extract and index it → ask a cited question → learn one concept → complete an adaptive three-question Probe → persist validated learner evidence → show the Learning Map → recommend the exact next source section → restart and recover all state.

Run the relevant tests continuously, update acceptance evidence, and continue until every applicable item in `ACCEPTANCE_CHECKLIST.md` passes.
