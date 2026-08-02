# ADR 0003: Immutable source scopes and evidence records

## Status

Accepted and implemented as the first production slice.

## Decision

Omakase resolves every learning scope to concrete active source-version IDs at session start. The resolved list and a content hash are persisted in `session_scope_snapshots`. Retrieval, agent tools, and future citation/evidence services must use those version IDs rather than re-resolving a mutable Studio or collection during a run.

Collections are many-to-many references through `collection_sources`; they never copy sources, versions, blocks, or embeddings.

PDF atoms and evidence are stored separately from the existing `source_blocks` representation. This allows existing sources to continue working while preserving a migration path to geometry-aware parsing.

## Consequences

- Old answers remain tied to the evidence that existed when the session began.
- A collection can change without rewriting historical learning sessions.
- The retrieval layer has an explicit empty-scope behavior instead of falling back to the entire Studio.
- Existing source blocks remain compatible with the current citation system.
- A future claim-level citation layer can point to atoms, geometry, and textual selectors without inventing locations.
