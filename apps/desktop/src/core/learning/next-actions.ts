import type { NextAction } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';

export class NextActionsService {
  constructor(private readonly db: Database.Database) {}

  getPrimaryForStudio(studioId: string): NextAction | null {
    const row = this.db
      .prepare(
        `SELECT * FROM next_actions
         WHERE studio_id = ? AND is_primary = 1 AND status = 'active'
         ORDER BY priority DESC, created_at DESC LIMIT 1`,
      )
      .get(studioId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  upsertPrimary(input: {
    studioId: string;
    actionType: NextAction['actionType'];
    title: string;
    rationale: string;
    sourceId?: string | null;
    sourceBlockId?: number | null;
    conceptId?: string | null;
    priority?: number;
  }): NextAction {
    const ts = nowMs();
    this.db
      .prepare(
        `UPDATE next_actions SET status = 'superseded', updated_at = ?
         WHERE studio_id = ? AND is_primary = 1 AND status = 'active'`,
      )
      .run(ts, input.studioId);

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO next_actions (
          id, studio_id, action_type, source_id, source_block_id, concept_id,
          title, rationale, priority, is_primary, status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 'system', ?, ?)`,
      )
      .run(
        id,
        input.studioId,
        input.actionType,
        input.sourceId ?? null,
        input.sourceBlockId ?? null,
        input.conceptId ?? null,
        input.title,
        input.rationale,
        input.priority ?? 10,
        ts,
        ts,
      );

    const action = this.getPrimaryForStudio(input.studioId);
    if (!action) throw new Error('Failed to create next action');
    return action;
  }

  proposeAfterProbeComplete(studioId: string, objective: string): NextAction {
    return this.upsertPrimary({
      studioId,
      actionType: 'review_concept',
      title: `Review: ${objective.slice(0, 60)}`,
      rationale: 'Probe completed — revisit the concept in your sources to consolidate learning.',
      priority: 20,
    });
  }

  proposeAfterLearn(
    studioId: string,
    sourceId: string | null,
    sourceBlockId: number | null,
  ): NextAction {
    return this.upsertPrimary({
      studioId,
      actionType: sourceBlockId ? 'read_source_section' : 'complete_probe',
      title: sourceBlockId ? 'Read the cited section' : 'Start a probe on this topic',
      rationale: sourceBlockId
        ? 'Follow up on the citation from your last question.'
        : 'Validate understanding with a short adaptive probe.',
      sourceId,
      sourceBlockId,
      priority: 15,
    });
  }

  private mapRow(row: Record<string, unknown>): NextAction {
    return {
      id: row.id as string,
      studioId: (row.studio_id as string | null) ?? null,
      actionType: row.action_type as NextAction['actionType'],
      sourceId: (row.source_id as string | null) ?? null,
      sourceBlockId: (row.source_block_id as number | null) ?? null,
      conceptId: (row.concept_id as string | null) ?? null,
      title: row.title as string,
      rationale: row.rationale as string,
      priority: row.priority as number,
      isPrimary: (row.is_primary as number) === 1,
      status: row.status as NextAction['status'],
      dueAt: (row.due_at as number | null) ?? null,
      createdAt: row.created_at as number,
    };
  }
}
