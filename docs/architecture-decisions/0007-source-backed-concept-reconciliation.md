# ADR 0007: Source-backed concept reconciliation

## Decision

After a learning answer's citations have been validated and persisted, Omakase
runs a bounded local reconciliation pass over those exact evidence passages.
It considers only concepts already linked to the current Studio. When two or
more non-trivial concept names occur as whole phrases in the same source block,
it records their concept evidence and creates one canonical-direction `related`
edge. The edge is linked to the evidence row that caused it.

The pass is deliberately conservative. It does not create concepts from
untrusted text, merge aliases, infer directional relationships, use embedding
similarity as proof, or publish an edge without an evidence row. It is a
production baseline for the Studio graph while richer model-assisted proposals
are evaluated separately.

## Invariants

- Evidence must belong to a source block in the active Studio.
- Concept matches use normalized whole-phrase matching and ignore tokens shorter
  than four characters.
- A single evidence passage contributes at most 12 concepts and 24 pairs.
- Symmetric `related` edges use one deterministic concept-ID direction.
- `concept_evidence` and `concept_relation_evidence` are idempotent.
- The agent emits `CONCEPT_GRAPH_UPDATED` only after the database update succeeds,
  and its details contain the actual persisted counts.

## Consequences

This gives the learning map a real, provenance-backed incremental graph without
introducing another graph runtime or pretending that semantic similarity proves
a relationship. It does not yet discover new concepts or support model-proposed
edge types such as prerequisite, contradiction, or extension; those require a
separate validated proposal contract and evidence-selection step.
