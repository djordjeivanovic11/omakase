import { type EvidenceReference, EvidenceReferenceSchema, type PdfQuad } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';

export interface PersistableCitation {
  handle: string;
  sourceBlockId: number;
  claimSummary: string;
  locatorSnapshotJson: string;
  verificationStatus: 'verified' | 'invalid_handle' | 'missing_block';
}

interface SourceBlockRow {
  id: number;
  source_version_id: string;
  text: string;
  heading_path_json: string;
  page_start: number | null;
  char_start: number | null;
  char_end: number | null;
}

interface AtomRow {
  id: string;
  page_number: number;
  quads_json: string;
  character_start: number | null;
  character_end: number | null;
}

function parseArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function buildEvidence(
  db: Database.Database,
  citation: PersistableCitation,
): { reference: EvidenceReference; block: SourceBlockRow } {
  const block = db
    .prepare(
      `SELECT id, source_version_id, text, heading_path_json, page_start, char_start, char_end
       FROM source_blocks WHERE id = ?`,
    )
    .get(citation.sourceBlockId) as SourceBlockRow | undefined;
  if (!block)
    throw new Error(`Citation block ${citation.sourceBlockId} disappeared before persistence`);

  const atoms = db
    .prepare(
      `SELECT da.id, da.page_number, da.quads_json, da.character_start, da.character_end
       FROM chunk_atoms ca
       JOIN document_atoms da ON da.id = ca.atom_id
       WHERE ca.source_block_id = ?
       ORDER BY ca.atom_order`,
    )
    .all(citation.sourceBlockId) as AtomRow[];
  const atomIds = atoms.map((atom) => atom.id);
  const quads = atoms.flatMap((atom) => parseArray<PdfQuad>(atom.quads_json, []));
  const pageNumber = block.page_start ?? atoms[0]?.page_number;
  const characterStart = block.char_start ?? atoms[0]?.character_start ?? undefined;
  const characterEnd = block.char_end ?? atoms.at(-1)?.character_end ?? undefined;
  const sectionPath = parseArray<string>(block.heading_path_json, []);
  const evidenceId = newId();

  const reference = EvidenceReferenceSchema.parse({
    id: evidenceId,
    sourceVersionId: block.source_version_id,
    sourceBlockId: block.id,
    atomIds,
    pageNumber,
    quads,
    exactQuote: block.text,
    characterStart,
    characterEnd,
    sectionPath,
    relationship: 'supports',
    // Current block-to-atom linking is page-based. Keep this below certainty
    // until structure-aware chunking can prove an exact atom span.
    anchoringConfidence: atoms.length > 0 ? 0.65 : 0.9,
  });

  db.prepare(
    `INSERT INTO evidence (
      id, source_version_id, source_block_id, exact_quote, prefix, suffix,
      page_number, section_path_json, quads_json, character_start, character_end,
      atom_ids_json, relationship, retrieval_score, rerank_score, anchoring_confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    reference.id,
    reference.sourceVersionId,
    reference.sourceBlockId ?? null,
    reference.exactQuote ?? null,
    reference.prefix ?? null,
    reference.suffix ?? null,
    reference.pageNumber ?? null,
    JSON.stringify(reference.sectionPath),
    JSON.stringify(reference.quads),
    reference.characterStart ?? null,
    reference.characterEnd ?? null,
    JSON.stringify(reference.atomIds),
    reference.relationship,
    null,
    null,
    reference.anchoringConfidence ?? null,
    nowMs(),
  );

  return { reference, block };
}

/**
 * Persists citations, exact source evidence, and claim-to-evidence links in
 * one transaction. A citation can only become visible after its evidence row
 * and immutable source-version relationship exist.
 */
export function persistValidatedCitations(
  db: Database.Database,
  messageId: string,
  citations: PersistableCitation[],
): EvidenceReference[] {
  return db.transaction(() => {
    const references: EvidenceReference[] = [];
    for (const [index, citation] of citations.entries()) {
      if (citation.verificationStatus !== 'verified') {
        throw new Error(`Cannot persist unverified citation ${citation.handle}`);
      }
      const { reference, block } = buildEvidence(db, citation);
      const claimId = newId();

      db.prepare(
        `INSERT INTO citations (
          id, message_id, handle, occurrence_index, source_block_id,
          supporting_quote, locator_snapshot_json, verification_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(),
        messageId,
        citation.handle,
        index,
        citation.sourceBlockId,
        block.text,
        citation.locatorSnapshotJson,
        citation.verificationStatus,
        nowMs(),
      );

      db.prepare(
        `INSERT INTO message_claims (id, message_id, claim_text, answer_start, answer_end, created_at)
         VALUES (?, ?, ?, NULL, NULL, ?)`,
      ).run(claimId, messageId, citation.claimSummary, nowMs());
      db.prepare(`INSERT INTO claim_evidence (claim_id, evidence_id) VALUES (?, ?)`).run(
        claimId,
        reference.id,
      );
      references.push(reference);
    }
    return references;
  })();
}

export function listEvidenceForSourceVersion(
  db: Database.Database,
  sourceVersionId: string,
): EvidenceReference[] {
  const rows = db
    .prepare(
      `SELECT * FROM evidence
       WHERE source_version_id = ? ORDER BY page_number, created_at, id`,
    )
    .all(sourceVersionId) as Array<Record<string, unknown>>;
  return rows.map((row) =>
    EvidenceReferenceSchema.parse({
      id: row.id,
      sourceVersionId: row.source_version_id,
      sourceBlockId: row.source_block_id ?? undefined,
      atomIds: parseArray<string>(row.atom_ids_json as string, []),
      pageNumber: row.page_number ?? undefined,
      quads: parseArray<PdfQuad>(row.quads_json as string, []),
      exactQuote: row.exact_quote ?? undefined,
      prefix: row.prefix ?? undefined,
      suffix: row.suffix ?? undefined,
      characterStart: row.character_start ?? undefined,
      characterEnd: row.character_end ?? undefined,
      sectionPath: parseArray<string>(row.section_path_json as string, []),
      relationship: row.relationship,
      anchoringConfidence: row.anchoring_confidence ?? undefined,
    }),
  );
}
