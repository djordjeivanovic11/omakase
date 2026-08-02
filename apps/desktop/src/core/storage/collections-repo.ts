import type {
  Collection,
  CollectionMembershipInput,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from './ids.js';

function mapCollection(row: Record<string, unknown>): Collection {
  return {
    id: row.id as string,
    studioId: row.studio_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    position: row.position as number,
    sourceCount: row.source_count as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

export class CollectionsRepo {
  constructor(private readonly db: Database.Database) {}

  list(studioId: string): Collection[] {
    return (
      this.db
        .prepare(
          `SELECT c.*, COUNT(cs.source_id) AS source_count
         FROM collections c
         LEFT JOIN collection_sources cs ON cs.collection_id = c.id
         WHERE c.studio_id = ?
         GROUP BY c.id
         ORDER BY c.position ASC, c.updated_at DESC`,
        )
        .all(studioId) as Record<string, unknown>[]
    ).map(mapCollection);
  }

  get(id: string): Collection | null {
    const row = this.db
      .prepare(
        `SELECT c.*, COUNT(cs.source_id) AS source_count
         FROM collections c
         LEFT JOIN collection_sources cs ON cs.collection_id = c.id
         WHERE c.id = ?
         GROUP BY c.id`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapCollection(row) : null;
  }

  listSourceIds(collectionId: string): string[] {
    return (
      this.db
        .prepare(
          `SELECT source_id FROM collection_sources
           WHERE collection_id = ? ORDER BY position ASC, added_at ASC`,
        )
        .all(collectionId) as Array<{ source_id: string }>
    ).map((row) => row.source_id);
  }

  create(input: CreateCollectionInput): Collection {
    const studio = this.db.prepare('SELECT id FROM studios WHERE id = ?').get(input.studioId);
    if (!studio) throw new Error('Studio not found');
    const id = newId();
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO collections (id, studio_id, name, description, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.studioId, input.name, input.description ?? null, input.position ?? 0, ts, ts);
    const collection = this.get(id);
    if (!collection) throw new Error('Failed to create collection');
    return collection;
  }

  update(input: UpdateCollectionInput): Collection {
    const existing = this.get(input.id);
    if (!existing) throw new Error('Collection not found');
    this.db
      .prepare(
        `UPDATE collections SET name = ?, description = ?, position = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.name ?? existing.name,
        input.description !== undefined ? input.description : existing.description,
        input.position ?? existing.position,
        nowMs(),
        input.id,
      );
    const collection = this.get(input.id);
    if (!collection) throw new Error('Collection missing after update');
    return collection;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM collections WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Collection not found');
  }

  addSource(input: CollectionMembershipInput): void {
    const collection = this.db
      .prepare('SELECT id FROM collections WHERE id = ?')
      .get(input.collectionId);
    if (!collection) throw new Error('Collection not found');
    const source = this.db.prepare('SELECT id FROM sources WHERE id = ?').get(input.sourceId);
    if (!source) throw new Error('Source not found');
    this.db
      .prepare(
        `INSERT INTO collection_sources (collection_id, source_id, position, added_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(collection_id, source_id) DO UPDATE SET position = excluded.position`,
      )
      .run(input.collectionId, input.sourceId, input.position ?? 0, nowMs());
  }

  removeSource(collectionId: string, sourceId: string): void {
    this.db
      .prepare('DELETE FROM collection_sources WHERE collection_id = ? AND source_id = ?')
      .run(collectionId, sourceId);
  }
}
