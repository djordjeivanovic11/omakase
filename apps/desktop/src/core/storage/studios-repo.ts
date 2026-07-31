import type {
  CreateStudioInput,
  Studio,
  StudioSourceRole,
  UpdateStudioInput,
} from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from './ids.js';

function mapStudio(row: Record<string, unknown>): Studio {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    primaryObjective: (row.primary_objective as string | null) ?? null,
    preferredDepth: (row.preferred_depth as Studio['preferredDepth']) ?? null,
    teachingStyle: row.teaching_style as Studio['teachingStyle'],
    status: row.status as Studio['status'],
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    archivedAt: (row.archived_at as number | null) ?? null,
  };
}

export class StudiosRepo {
  constructor(private readonly db: Database.Database) {}

  list(includeArchived = false): Studio[] {
    const sql = includeArchived
      ? 'SELECT * FROM studios ORDER BY sort_order ASC, updated_at DESC'
      : `SELECT * FROM studios WHERE status <> 'archived' ORDER BY sort_order ASC, updated_at DESC`;
    return (this.db.prepare(sql).all() as Record<string, unknown>[]).map(mapStudio);
  }

  get(id: string): Studio | null {
    const row = this.db.prepare('SELECT * FROM studios WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapStudio(row) : null;
  }

  create(input: CreateStudioInput): Studio {
    const id = newId();
    const ts = nowMs();
    const teachingStyle = input.teachingStyle ?? 'direct';
    this.db
      .prepare(
        `INSERT INTO studios (
          id, name, description, primary_objective, preferred_depth,
          teaching_style, status, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description ?? null,
        input.primaryObjective ?? null,
        input.preferredDepth ?? null,
        teachingStyle,
        ts,
        ts,
      );

    if (input.primaryObjective) {
      this.db
        .prepare(
          `INSERT INTO studio_goals (
            id, studio_id, statement, priority, status, is_primary, created_at, updated_at
          ) VALUES (?, ?, ?, 0, 'active', 1, ?, ?)`,
        )
        .run(newId(), id, input.primaryObjective, ts, ts);
    }

    const studio = this.get(id);
    if (!studio) throw new Error('Failed to create studio');
    return studio;
  }

  update(input: UpdateStudioInput): Studio {
    const existing = this.get(input.id);
    if (!existing) throw new Error('Studio not found');
    const ts = nowMs();
    const status = input.status ?? existing.status;
    const archivedAt = status === 'archived' ? (existing.archivedAt ?? ts) : null;

    this.db
      .prepare(
        `UPDATE studios SET
          name = ?,
          description = ?,
          primary_objective = ?,
          preferred_depth = ?,
          teaching_style = ?,
          status = ?,
          sort_order = ?,
          archived_at = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        input.name ?? existing.name,
        input.description !== undefined ? input.description : existing.description,
        input.primaryObjective !== undefined ? input.primaryObjective : existing.primaryObjective,
        input.preferredDepth !== undefined ? input.preferredDepth : existing.preferredDepth,
        input.teachingStyle ?? existing.teachingStyle,
        status,
        input.sortOrder ?? existing.sortOrder,
        archivedAt,
        ts,
        input.id,
      );

    const studio = this.get(input.id);
    if (!studio) throw new Error('Studio missing after update');
    return studio;
  }

  assignSource(studioId: string, sourceId: string, role: StudioSourceRole = 'reference'): void {
    const studio = this.get(studioId);
    if (!studio) throw new Error('Studio not found');
    const source = this.db.prepare('SELECT id FROM sources WHERE id = ?').get(sourceId);
    if (!source) throw new Error('Source not found');
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO studio_sources (studio_id, source_id, role, position, pinned, added_at)
         VALUES (?, ?, ?, 0, 0, ?)
         ON CONFLICT(studio_id, source_id) DO UPDATE SET role = excluded.role`,
      )
      .run(studioId, sourceId, role, ts);
    this.db
      .prepare(
        `UPDATE sources SET lifecycle_status = 'active', updated_at = ? WHERE id = ? AND lifecycle_status = 'inbox'`,
      )
      .run(ts, sourceId);
  }
}
