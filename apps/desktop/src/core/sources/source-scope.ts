import {
  type ResolvedSourceScope,
  ResolvedSourceScopeSchema,
  type SourceScope,
} from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { CollectionsRepo } from '../storage/collections-repo.js';
import { sha256Hex } from '../storage/hash.js';
import { nowMs } from '../storage/ids.js';

type ScopeRow = { source_id: string; source_version_id: string };

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function assertStudio(db: Database.Database, studioId: string): void {
  const row = db
    .prepare('SELECT id FROM studios WHERE id = ? AND status <> ?')
    .get(studioId, 'archived');
  if (!row) throw new Error('Studio not found');
}

function resolveRows(db: Database.Database, studioId: string, sourceIds: string[]): ScopeRow[] {
  if (sourceIds.length === 0) return [];
  const placeholders = sourceIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT ss.source_id, sav.source_version_id
       FROM studio_sources ss
       JOIN sources s ON s.id = ss.source_id
       JOIN source_active_versions sav ON sav.source_id = ss.source_id
       WHERE ss.studio_id = ?
         AND ss.source_id IN (${placeholders})
         AND s.lifecycle_status <> 'deleted'
         AND s.deleted_at IS NULL
       ORDER BY ss.position ASC, ss.added_at ASC`,
    )
    .all(studioId, ...sourceIds) as ScopeRow[];
}

export function resolveSourceScope(
  db: Database.Database,
  studioId: string,
  scope: SourceScope,
): ResolvedSourceScope {
  assertStudio(db, studioId);
  let sourceIds: string[];

  if (scope.kind === 'studio' && scope.studioId !== studioId) {
    throw new Error('Requested Studio scope does not match the session Studio');
  }

  if (scope.kind === 'source') {
    sourceIds = [scope.sourceId];
  } else if (scope.kind === 'selection') {
    sourceIds = scope.sourceIds;
  } else if (scope.kind === 'collection') {
    const collection = db
      .prepare('SELECT id, studio_id FROM collections WHERE id = ?')
      .get(scope.collectionId) as { id: string; studio_id: string } | undefined;
    if (!collection || collection.studio_id !== studioId) {
      throw new Error('Collection is not part of this Studio');
    }
    sourceIds = new CollectionsRepo(db).listSourceIds(scope.collectionId);
  } else if (scope.kind === 'concept') {
    sourceIds = (
      db
        .prepare(
          `SELECT DISTINCT ss.source_id
           FROM studio_sources ss
           JOIN source_active_versions sav ON sav.source_id = ss.source_id
           JOIN evidence e ON e.source_version_id = sav.source_version_id
           JOIN concept_evidence ce ON ce.evidence_id = e.id
           JOIN studio_concepts sc ON sc.concept_id = ce.concept_id
           JOIN sources s ON s.id = ss.source_id
           WHERE ss.studio_id = ?
             AND sc.studio_id = ?
             AND sc.status <> 'removed'
             AND ce.concept_id = ?
             AND s.lifecycle_status <> 'deleted'
             AND s.deleted_at IS NULL`,
        )
        .all(studioId, studioId, scope.conceptId) as Array<{ source_id: string }>
    ).map((row) => row.source_id);
  } else {
    sourceIds = (
      db
        .prepare(
          `SELECT ss.source_id
           FROM studio_sources ss
           JOIN sources s ON s.id = ss.source_id
           JOIN source_active_versions sav ON sav.source_id = ss.source_id
           WHERE ss.studio_id = ?
             AND s.lifecycle_status <> 'deleted'
             AND s.deleted_at IS NULL
           ORDER BY ss.position ASC, ss.added_at ASC`,
        )
        .all(studioId) as Array<{ source_id: string }>
    ).map((row) => row.source_id);
  }

  sourceIds = unique(sourceIds);
  const rows = resolveRows(db, studioId, sourceIds);
  if (rows.length !== sourceIds.length) {
    const resolved = new Set(rows.map((row) => row.source_id));
    const missing = sourceIds.find((id) => !resolved.has(id));
    throw new Error(`Source ${missing ?? 'requested'} is not an active source in this Studio`);
  }

  const sourceVersionIds = rows.map((row) => row.source_version_id);
  const resolvedAt = nowMs();
  const scopeHash = sha256Hex(
    JSON.stringify({
      studioId,
      scope,
      sourceIds,
      sourceVersionIds,
    }),
  );
  return ResolvedSourceScopeSchema.parse({
    scope,
    sourceIds,
    sourceVersionIds,
    resolvedAt,
    scopeHash,
  });
}

export function persistSessionScopeSnapshot(
  db: Database.Database,
  sessionId: string,
  resolved: ResolvedSourceScope,
): void {
  db.prepare(
    `INSERT INTO session_scope_snapshots (
      session_id, scope_kind, requested_scope_json, resolved_source_ids_json,
      resolved_source_version_ids_json, scope_hash, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      scope_kind = excluded.scope_kind,
      requested_scope_json = excluded.requested_scope_json,
      resolved_source_ids_json = excluded.resolved_source_ids_json,
      resolved_source_version_ids_json = excluded.resolved_source_version_ids_json,
      scope_hash = excluded.scope_hash,
      resolved_at = excluded.resolved_at`,
  ).run(
    sessionId,
    resolved.scope.kind,
    JSON.stringify(resolved.scope),
    JSON.stringify(resolved.sourceIds),
    JSON.stringify(resolved.sourceVersionIds),
    resolved.scopeHash,
    resolved.resolvedAt,
  );
}

export function loadSessionScopeSnapshot(
  db: Database.Database,
  sessionId: string,
): ResolvedSourceScope | null {
  const row = db
    .prepare(
      `SELECT scope_kind, requested_scope_json, resolved_source_ids_json,
              resolved_source_version_ids_json, scope_hash, resolved_at
       FROM session_scope_snapshots WHERE session_id = ?`,
    )
    .get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return ResolvedSourceScopeSchema.parse({
    scope: JSON.parse(row.requested_scope_json as string) as SourceScope,
    sourceIds: JSON.parse(row.resolved_source_ids_json as string) as string[],
    sourceVersionIds: JSON.parse(row.resolved_source_version_ids_json as string) as string[],
    scopeHash: row.scope_hash as string,
    resolvedAt: row.resolved_at as number,
  });
}
