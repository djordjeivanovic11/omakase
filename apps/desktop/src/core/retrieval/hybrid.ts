import type { SourceBlock } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import type { EmbeddingService } from './embeddings.js';
import { DEFAULT_EMBEDDING_REVISION, GRANITE_EMBEDDING_MODEL_ID } from './embeddings.js';
import { resolveStudioSourceVersionIds, searchSourceBlocksFts } from './fts.js';
import { reciprocalRankFusion } from './rrf.js';
import { ExactScanVectorIndex } from './vector-index.js';

export interface RetrievedBlock {
  block: SourceBlock;
  score: number;
  handle: string;
}

export interface HybridSearchOptions {
  studioId: string;
  query: string;
  sourceIds?: string[];
  minResults?: number;
  maxResults?: number;
}

function mapBlockRow(row: Record<string, unknown>): SourceBlock {
  return {
    id: row.id as number,
    publicId: row.public_id as string,
    sourceVersionId: row.source_version_id as string,
    ordinal: row.ordinal as number,
    kind: row.kind as SourceBlock['kind'],
    text: row.text as string,
    headingPath: JSON.parse(row.heading_path_json as string) as string[],
    headingPathText: row.heading_path_text as string,
    pageStart: (row.page_start as number | null) ?? null,
    pageEnd: (row.page_end as number | null) ?? null,
    timeStartMs: (row.time_start_ms as number | null) ?? null,
    timeEndMs: (row.time_end_ms as number | null) ?? null,
    locator: JSON.parse(row.locator_json as string) as SourceBlock['locator'],
    contentHash: row.content_hash as string,
    tokenEstimate: row.token_estimate as number,
  };
}

function loadBlocksByIds(db: Database.Database, ids: number[]): SourceBlock[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM source_blocks WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
  const byId = new Map(rows.map((r) => [r.id as number, mapBlockRow(r)]));
  return ids.map((id) => byId.get(id)).filter((b): b is SourceBlock => b !== undefined);
}

/** Simple diversity: prefer blocks from different sources / heading paths. */
function diversityPass(blocks: RetrievedBlock[], target: number): RetrievedBlock[] {
  const selected: RetrievedBlock[] = [];
  const seenHeadings = new Set<string>();

  for (const item of blocks) {
    const key = `${item.block.sourceVersionId}:${item.block.headingPathText}`;
    if (seenHeadings.has(key) && selected.length >= Math.min(4, target)) {
      continue;
    }
    seenHeadings.add(key);
    selected.push(item);
    if (selected.length >= target) break;
  }

  if (selected.length < target) {
    for (const item of blocks) {
      if (selected.some((s) => s.block.id === item.block.id)) continue;
      selected.push(item);
      if (selected.length >= target) break;
    }
  }

  return selected;
}

export async function hybridRetrieve(
  db: Database.Database,
  embeddingService: EmbeddingService,
  options: HybridSearchOptions,
): Promise<RetrievedBlock[]> {
  const minResults = options.minResults ?? 8;
  const maxResults = options.maxResults ?? 32;
  const versionIds = resolveStudioSourceVersionIds(db, options.studioId, options.sourceIds);
  if (versionIds.length === 0) return [];

  const ftsHits = searchSourceBlocksFts(db, {
    query: options.query,
    sourceVersionIds: versionIds,
    limit: maxResults * 2,
  });

  const lexicalList = ftsHits.map((hit, index) => ({
    item: hit.sourceBlockId,
    rank: index + 1,
  }));

  const queryVector = await embeddingService.embed(options.query);
  const vectorIndex = new ExactScanVectorIndex(
    db,
    embeddingService.modelId ?? GRANITE_EMBEDDING_MODEL_ID,
    embeddingService.modelRevision ?? DEFAULT_EMBEDDING_REVISION,
  );
  const vectorHits = vectorIndex.search(queryVector, {
    sourceVersionIds: versionIds,
    limit: maxResults * 2,
  });

  const denseList = vectorHits.map((hit, index) => ({
    item: hit.sourceBlockId,
    rank: index + 1,
  }));

  const fused =
    lexicalList.length > 0 && denseList.length > 0
      ? reciprocalRankFusion([lexicalList, denseList])
      : lexicalList.length > 0
        ? lexicalList.map((x) => ({ item: x.item, score: 1 / x.rank, ranks: [x.rank] }))
        : denseList.map((x) => ({ item: x.item, score: 1 / x.rank, ranks: [x.rank] }));

  const blocks = loadBlocksByIds(
    db,
    fused.slice(0, maxResults * 2).map((f) => f.item),
  );

  const retrieved: RetrievedBlock[] = blocks.map((block, index) => ({
    block,
    score: fused.find((f) => f.item === block.id)?.score ?? 0,
    handle: `S${index + 1}`,
  }));

  retrieved.sort((a, b) => b.score - a.score);

  const diverse = diversityPass(retrieved, maxResults);

  // A thin result set gives the model too little to answer from, so top up
  // with the opening blocks of the selected sources.
  if (diverse.length < minResults) {
    const placeholders = versionIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT * FROM source_blocks
         WHERE source_version_id IN (${placeholders})
         ORDER BY source_version_id, ordinal
         LIMIT ?`,
      )
      .all(...versionIds, maxResults) as Record<string, unknown>[];

    const selectedIds = new Set(diverse.map((item) => item.block.id));
    for (const row of rows) {
      if (diverse.length >= minResults) break;
      const block = mapBlockRow(row);
      if (selectedIds.has(block.id)) continue;
      selectedIds.add(block.id);
      diverse.push({ block, score: 0, handle: '' });
    }
  }

  const take = Math.min(Math.max(maxResults, minResults), diverse.length);
  return diverse.slice(0, take).map((item, index) => ({
    ...item,
    handle: `S${index + 1}`,
  }));
}
