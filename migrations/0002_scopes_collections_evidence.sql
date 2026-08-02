BEGIN;

-- Collections reference existing sources; they never duplicate source assets,
-- versions, blocks, or embeddings.
CREATE TABLE collections (
  id          TEXT PRIMARY KEY,
  studio_id   TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at  INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (studio_id, name)
) STRICT;

CREATE INDEX collections_studio_idx ON collections(studio_id, position, updated_at DESC);

CREATE TABLE collection_sources (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  added_at      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY (collection_id, source_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX collection_sources_source_idx ON collection_sources(source_id, collection_id);

CREATE TRIGGER collection_source_must_belong_to_studio_insert
BEFORE INSERT ON collection_sources
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM collections c
  JOIN studio_sources ss ON ss.studio_id = c.studio_id AND ss.source_id = NEW.source_id
  WHERE c.id = NEW.collection_id
)
BEGIN
  SELECT RAISE(ABORT, 'collection source must belong to the collection studio');
END;

CREATE TRIGGER collection_source_must_belong_to_studio_update
BEFORE UPDATE OF collection_id, source_id ON collection_sources
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM collections c
  JOIN studio_sources ss ON ss.studio_id = c.studio_id AND ss.source_id = NEW.source_id
  WHERE c.id = NEW.collection_id
)
BEGIN
  SELECT RAISE(ABORT, 'collection source must belong to the collection studio');
END;

-- The resolved version list is immutable evidence for a session. New source
-- versions added later must not silently alter an old answer.
CREATE TABLE session_scope_snapshots (
  session_id                    TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  scope_kind                    TEXT NOT NULL CHECK (scope_kind IN (
                                  'source', 'selection', 'collection', 'studio', 'concept'
                                )),
  requested_scope_json           TEXT NOT NULL CHECK (json_valid(requested_scope_json)),
  resolved_source_ids_json       TEXT NOT NULL CHECK (json_valid(resolved_source_ids_json)),
  resolved_source_version_ids_json TEXT NOT NULL CHECK (json_valid(resolved_source_version_ids_json)),
  scope_hash                    TEXT NOT NULL CHECK (length(scope_hash) = 64),
  resolved_at                   INTEGER NOT NULL
) STRICT;

CREATE INDEX session_scope_snapshot_hash_idx ON session_scope_snapshots(scope_hash);

-- A run is separate from a session message stream so activity can be replayed
-- and a later message can have its own lifecycle.
CREATE TABLE agent_runs (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN (
                    'running', 'completed', 'interrupted', 'failed', 'cancelled'
                  )),
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  error_code      TEXT,
  error_message   TEXT,
  scope_hash      TEXT NOT NULL
) STRICT;

CREATE INDEX agent_runs_session_idx ON agent_runs(session_id, started_at DESC);

CREATE TABLE agent_events (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence          INTEGER NOT NULL CHECK (sequence >= 0),
  parent_step_id    TEXT,
  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'RUN_STARTED', 'STEP_STARTED', 'ACTIVITY_SNAPSHOT',
                      'ACTIVITY_DELTA', 'TOOL_CALL_STARTED', 'TOOL_CALL_ARGUMENTS',
                      'TOOL_CALL_FINISHED', 'TOOL_RESULT', 'SOURCE_RETRIEVED',
                      'SOURCE_READ', 'CONCEPT_GRAPH_UPDATED', 'CITATIONS_CHECKED',
                      'STEP_FINISHED', 'RUN_INTERRUPTED', 'RUN_FINISHED', 'RUN_ERROR'
                    )),
  status            TEXT NOT NULL CHECK (status IN (
                      'started', 'running', 'succeeded', 'warning', 'failed', 'cancelled'
                    )),
  summary           TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 500),
  tool_name         TEXT,
  source_refs_json  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_refs_json)),
  details_json      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  duration_ms       INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  visibility        TEXT NOT NULL DEFAULT 'user' CHECK (visibility IN ('user', 'debug')),
  created_at        INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX agent_events_run_sequence_idx ON agent_events(run_id, sequence);
CREATE INDEX agent_events_run_created_idx ON agent_events(run_id, created_at, sequence);

-- Layout-aware PDF work can be introduced without invalidating the existing
-- source_blocks representation. Every atom and evidence row is tied to an
-- immutable source version.
CREATE TABLE document_atoms (
  id                TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES source_versions(id) ON DELETE RESTRICT,
  page_number       INTEGER NOT NULL CHECK (page_number >= 1),
  page_width        REAL NOT NULL CHECK (page_width > 0),
  page_height       REAL NOT NULL CHECK (page_height > 0),
  reading_order     INTEGER NOT NULL CHECK (reading_order >= 0),
  kind              TEXT NOT NULL CHECK (kind IN (
                      'title', 'heading', 'paragraph', 'list_item', 'caption',
                      'formula', 'table', 'table_cell', 'figure', 'footnote',
                      'header', 'footer', 'unknown'
                    )),
  text              TEXT NOT NULL,
  normalized_text   TEXT NOT NULL,
  section_path_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(section_path_json)),
  bounding_box_json TEXT NOT NULL CHECK (json_valid(bounding_box_json)),
  quads_json        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(quads_json)),
  character_start   INTEGER CHECK (character_start IS NULL OR character_start >= 0),
  character_end     INTEGER CHECK (character_end IS NULL OR character_end >= character_start),
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('native_pdf', 'ocr')),
  parser_name       TEXT NOT NULL,
  parser_version    TEXT NOT NULL,
  confidence        REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at        INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (source_version_id, reading_order)
) STRICT;

CREATE INDEX document_atoms_version_page_idx
  ON document_atoms(source_version_id, page_number, reading_order);

CREATE TABLE chunk_atoms (
  source_block_id INTEGER NOT NULL REFERENCES source_blocks(id) ON DELETE CASCADE,
  atom_id         TEXT NOT NULL REFERENCES document_atoms(id) ON DELETE RESTRICT,
  atom_order      INTEGER NOT NULL CHECK (atom_order >= 0),
  PRIMARY KEY (source_block_id, atom_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX chunk_atoms_atom_idx ON chunk_atoms(atom_id, source_block_id);

CREATE TABLE evidence (
  id                    TEXT PRIMARY KEY,
  source_version_id     TEXT NOT NULL REFERENCES source_versions(id) ON DELETE RESTRICT,
  source_block_id       INTEGER REFERENCES source_blocks(id) ON DELETE RESTRICT,
  exact_quote           TEXT,
  prefix                TEXT,
  suffix                TEXT,
  page_number           INTEGER CHECK (page_number IS NULL OR page_number >= 1),
  section_path_json     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(section_path_json)),
  quads_json            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(quads_json)),
  character_start       INTEGER CHECK (character_start IS NULL OR character_start >= 0),
  character_end         INTEGER CHECK (character_end IS NULL OR character_end >= character_start),
  relationship          TEXT NOT NULL CHECK (relationship IN (
                          'supports', 'defines', 'example', 'extends',
                          'contrasts', 'contradicts', 'context'
                        )),
  retrieval_score       REAL,
  rerank_score          REAL,
  anchoring_confidence  REAL CHECK (
                          anchoring_confidence IS NULL OR
                          (anchoring_confidence >= 0 AND anchoring_confidence <= 1)
                        ),
  created_at            INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  CHECK (source_block_id IS NOT NULL OR exact_quote IS NOT NULL OR json_array_length(quads_json) > 0)
) STRICT;

CREATE INDEX evidence_version_idx ON evidence(source_version_id, page_number, created_at);
CREATE INDEX evidence_block_idx ON evidence(source_block_id);

CREATE TABLE message_claims (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  claim_text   TEXT NOT NULL,
  answer_start INTEGER CHECK (answer_start IS NULL OR answer_start >= 0),
  answer_end   INTEGER CHECK (answer_end IS NULL OR answer_end >= answer_start),
  created_at   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;

CREATE TABLE claim_evidence (
  claim_id    TEXT NOT NULL REFERENCES message_claims(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  PRIMARY KEY (claim_id, evidence_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE concept_evidence (
  concept_id  TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  PRIMARY KEY (concept_id, evidence_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE concept_relation_evidence (
  from_concept_id TEXT NOT NULL,
  to_concept_id   TEXT NOT NULL,
  relation        TEXT NOT NULL,
  evidence_id     TEXT NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  FOREIGN KEY (from_concept_id, to_concept_id, relation)
    REFERENCES concept_relations(from_concept_id, to_concept_id, relation)
    ON DELETE CASCADE,
  PRIMARY KEY (from_concept_id, to_concept_id, relation, evidence_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX concept_evidence_evidence_idx ON concept_evidence(evidence_id, concept_id);
CREATE INDEX concept_relation_evidence_evidence_idx ON concept_relation_evidence(evidence_id);

COMMIT;
