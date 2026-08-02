BEGIN;

ALTER TABLE evidence
  ADD COLUMN atom_ids_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(atom_ids_json));

COMMIT;
