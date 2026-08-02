import { type DocumentAtom, DocumentAtomSchema } from '@omakase/contracts';
import type Database from 'better-sqlite3';

function mapAtom(row: Record<string, unknown>): DocumentAtom {
  return DocumentAtomSchema.parse({
    id: row.id,
    sourceVersionId: row.source_version_id,
    pageNumber: row.page_number,
    pageWidth: row.page_width,
    pageHeight: row.page_height,
    readingOrder: row.reading_order,
    kind: row.kind,
    text: row.text,
    normalizedText: row.normalized_text,
    sectionPath: JSON.parse(row.section_path_json as string),
    boundingBox: JSON.parse(row.bounding_box_json as string),
    quads: JSON.parse(row.quads_json as string),
    characterStart: row.character_start ?? undefined,
    characterEnd: row.character_end ?? undefined,
    extractionMethod: row.extraction_method,
    parserName: row.parser_name,
    parserVersion: row.parser_version,
    confidence: row.confidence ?? undefined,
  });
}

export function replaceDocumentAtoms(
  db: Database.Database,
  sourceVersionId: string,
  atoms: DocumentAtom[],
): void {
  const insert = db.prepare(
    `INSERT INTO document_atoms (
      id, source_version_id, page_number, page_width, page_height, reading_order,
      kind, text, normalized_text, section_path_json, bounding_box_json, quads_json,
      character_start, character_end, extraction_method, parser_name, parser_version,
      confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const transaction = db.transaction(() => {
    db.prepare(
      `DELETE FROM chunk_atoms
       WHERE source_block_id IN (SELECT id FROM source_blocks WHERE source_version_id = ?)`,
    ).run(sourceVersionId);
    db.prepare('DELETE FROM document_atoms WHERE source_version_id = ?').run(sourceVersionId);
    for (const atom of atoms) {
      const validated = DocumentAtomSchema.parse(atom);
      insert.run(
        validated.id,
        validated.sourceVersionId,
        validated.pageNumber,
        validated.pageWidth,
        validated.pageHeight,
        validated.readingOrder,
        validated.kind,
        validated.text,
        validated.normalizedText,
        JSON.stringify(validated.sectionPath),
        JSON.stringify(validated.boundingBox),
        JSON.stringify(validated.quads),
        validated.characterStart ?? null,
        validated.characterEnd ?? null,
        validated.extractionMethod,
        validated.parserName,
        validated.parserVersion,
        validated.confidence ?? null,
      );
    }
  });
  transaction();
}

export function listDocumentAtoms(
  db: Database.Database,
  sourceVersionId: string,
  pageNumber?: number,
): DocumentAtom[] {
  const rows = pageNumber
    ? db
        .prepare(
          `SELECT * FROM document_atoms
           WHERE source_version_id = ? AND page_number = ?
           ORDER BY reading_order`,
        )
        .all(sourceVersionId, pageNumber)
    : db
        .prepare(
          `SELECT * FROM document_atoms
           WHERE source_version_id = ?
           ORDER BY reading_order`,
        )
        .all(sourceVersionId);
  return (rows as Record<string, unknown>[]).map(mapAtom);
}

/**
 * Preserve a reversible page-level relationship between existing retrieval
 * blocks and native PDF atoms. The current block builder normalizes whitespace,
 * so page membership is safer than pretending its character offsets are exact.
 */
export function linkBlocksToDocumentAtoms(db: Database.Database, sourceVersionId: string): void {
  const transaction = db.transaction(() => {
    db.prepare(
      `DELETE FROM chunk_atoms
       WHERE source_block_id IN (SELECT id FROM source_blocks WHERE source_version_id = ?)`,
    ).run(sourceVersionId);
    const blocks = db
      .prepare(
        `SELECT id, page_start, page_end FROM source_blocks
         WHERE source_version_id = ? AND page_start IS NOT NULL
         ORDER BY ordinal`,
      )
      .all(sourceVersionId) as Array<{ id: number; page_start: number; page_end: number | null }>;
    const atoms = db
      .prepare(
        `SELECT id, page_number FROM document_atoms
         WHERE source_version_id = ? ORDER BY reading_order`,
      )
      .all(sourceVersionId) as Array<{ id: string; page_number: number }>;
    const insert = db.prepare(
      `INSERT INTO chunk_atoms (source_block_id, atom_id, atom_order)
       VALUES (?, ?, ?)
       ON CONFLICT(source_block_id, atom_id) DO UPDATE SET atom_order = excluded.atom_order`,
    );
    for (const block of blocks) {
      const endPage = block.page_end ?? block.page_start;
      atoms
        .filter((atom) => atom.page_number >= block.page_start && atom.page_number <= endPage)
        .forEach((atom, atomOrder) => insert.run(block.id, atom.id, atomOrder));
    }
  });
  transaction();
}
