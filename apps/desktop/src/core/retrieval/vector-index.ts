import type Database from 'better-sqlite3';

export interface VectorSearchHit {
  sourceBlockId: number;
  score: number;
}

export interface VectorIndex {
  search(
    queryVector: Float32Array,
    options: { sourceVersionIds?: string[]; limit?: number },
  ): VectorSearchHit[];
}

export function blobToFloat32Vector(blob: Buffer): Float32Array {
  // Copy into a fresh ArrayBuffer so Float32 alignment is guaranteed.
  const copy = Uint8Array.from(blob);
  return new Float32Array(copy.buffer);
}

export function float32VectorToBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class ExactScanVectorIndex implements VectorIndex {
  constructor(
    private readonly db: Database.Database,
    private readonly modelId: string,
    private readonly modelRevision: string,
  ) {}

  search(
    queryVector: Float32Array,
    options: { sourceVersionIds?: string[]; limit?: number },
  ): VectorSearchHit[] {
    const limit = options.limit ?? 20;
    let rows: Array<{ source_block_id: number; vector: Buffer; source_version_id: string }>;

    // An explicit empty scope means no sources. It must never widen into an
    // unscoped library search.
    if (options.sourceVersionIds && options.sourceVersionIds.length === 0) return [];

    if (options.sourceVersionIds && options.sourceVersionIds.length > 0) {
      const placeholders = options.sourceVersionIds.map(() => '?').join(', ');
      rows = this.db
        .prepare(
          `SELECT e.source_block_id, e.vector, sb.source_version_id
           FROM embeddings e
           JOIN source_blocks sb ON sb.id = e.source_block_id
           WHERE e.model_id = ? AND e.model_revision = ?
             AND sb.source_version_id IN (${placeholders})`,
        )
        .all(this.modelId, this.modelRevision, ...options.sourceVersionIds) as typeof rows;
    } else {
      rows = this.db
        .prepare(
          `SELECT e.source_block_id, e.vector, sb.source_version_id
           FROM embeddings e
           JOIN source_blocks sb ON sb.id = e.source_block_id
           WHERE e.model_id = ? AND e.model_revision = ?`,
        )
        .all(this.modelId, this.modelRevision) as typeof rows;
    }

    const hits: VectorSearchHit[] = [];
    for (const row of rows) {
      const vec = blobToFloat32Vector(row.vector);
      hits.push({
        sourceBlockId: row.source_block_id,
        score: cosineSimilarity(queryVector, vec),
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}
