# ADR 0005: Persisted, provider-neutral agent activity

## Status

Accepted and partially implemented.

## Decision

Agent activity is normalized into the local `agent_runs` and append-only `agent_events` tables. The current AI SDK 7 stream remains the provider runtime. Application events such as retrieval, citation checking, tool use, completion, and failure are persisted before being sent through the existing typed IPC stream.

The renderer receives safe summaries and structured counts. It never receives hidden chain-of-thought, hidden prompts, credentials, or arbitrary tool payloads.

## Consequences

- Activity can be replayed after a renderer reconnect.
- Counts in the final activity summary are derived from actual persisted operations.
- AG-UI-like lifecycle concepts can be adopted later without adding AG-UI as a runtime dependency.
- Full UI replay and reconnect APIs are the next implementation slice; the persistence and live activity event seam now exists.
