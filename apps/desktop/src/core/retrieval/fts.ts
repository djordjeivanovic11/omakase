import type Database from 'better-sqlite3';

export interface FtsHit {
  sourceBlockId: number;
  sourceVersionId: string;
  rank: number;
  snippet: string;
}

export interface FtsSearchOptions {
  query: string;
  sourceVersionIds?: string[];
  limit?: number;
}

export function searchSourceBlocksFts(db: Database.Database, options: FtsSearchOptions): FtsHit[] {
  const limit = options.limit ?? 20;
  const trimmed = options.query.trim();
  if (!trimmed) return [];

  const ftsQuery = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' OR ');

  if (options.sourceVersionIds && options.sourceVersionIds.length > 0) {
    const placeholders = options.sourceVersionIds.map(() => '?').join(', ');
    const sql = `
      SELECT
        sb.id AS source_block_id,
        sb.source_version_id,
        bm25(source_blocks_fts) AS rank,
        snippet(source_blocks_fts, 3, '…', '…', '…', 32) AS snippet
      FROM source_blocks_fts
      JOIN source_blocks sb ON sb.id = source_blocks_fts.rowid
      WHERE source_blocks_fts MATCH ?
        AND sb.source_version_id IN (${placeholders})
      ORDER BY rank
      LIMIT ?
    `;
    const rows = db.prepare(sql).all(ftsQuery, ...options.sourceVersionIds, limit) as Array<{
      source_block_id: number;
      source_version_id: string;
      rank: number;
      snippet: string;
    }>;
    return rows.map((r) => ({
      sourceBlockId: r.source_block_id,
      sourceVersionId: r.source_version_id,
      rank: r.rank,
      snippet: r.snippet,
    }));
  }

  const sql = `
    SELECT
      sb.id AS source_block_id,
      sb.source_version_id,
      bm25(source_blocks_fts) AS rank,
      snippet(source_blocks_fts, 3, '…', '…', '…', 32) AS snippet
    FROM source_blocks_fts
    JOIN source_blocks sb ON sb.id = source_blocks_fts.rowid
    WHERE source_blocks_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(ftsQuery, limit) as Array<{
    source_block_id: number;
    source_version_id: string;
    rank: number;
    snippet: string;
  }>;
  return rows.map((r) => ({
    sourceBlockId: r.source_block_id,
    sourceVersionId: r.source_version_id,
    rank: r.rank,
    snippet: r.snippet,
  }));
}

export function resolveStudioSourceVersionIds(
  db: Database.Database,
  studioId: string,
  sourceIds?: string[],
): string[] {
  if (sourceIds && sourceIds.length > 0) {
    const placeholders = sourceIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT sav.source_version_id
         FROM studio_sources ss
         JOIN source_active_versions sav ON sav.source_id = ss.source_id
         WHERE ss.studio_id = ? AND ss.source_id IN (${placeholders})`,
      )
      .all(studioId, ...sourceIds) as Array<{ source_version_id: string }>;
    return rows.map((r) => r.source_version_id);
  }

  const rows = db
    .prepare(
      `SELECT sav.source_version_id
       FROM studio_sources ss
       JOIN source_active_versions sav ON sav.source_id = ss.source_id
       WHERE ss.studio_id = ?`,
    )
    .all(studioId) as Array<{ source_version_id: string }>;
  return rows.map((r) => r.source_version_id);
}
