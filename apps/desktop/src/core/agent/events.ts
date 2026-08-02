import {
  type AgentEvent,
  AgentEventSchema,
  type AgentEventStatus,
  type AgentEventType,
} from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';

export interface AppendAgentEventInput {
  parentStepId?: string | null;
  type: AgentEventType;
  status: AgentEventStatus;
  summary: string;
  toolName?: string | null;
  sourceRefs?: string[];
  details?: Record<string, unknown>;
  durationMs?: number | null;
  visibility?: 'user' | 'debug';
}

function mapEvent(row: Record<string, unknown>): AgentEvent {
  return AgentEventSchema.parse({
    id: row.id,
    runId: row.run_id,
    sequence: row.sequence,
    parentStepId: row.parent_step_id ?? null,
    type: row.event_type,
    status: row.status,
    summary: row.summary,
    toolName: row.tool_name ?? null,
    sourceRefs: JSON.parse(row.source_refs_json as string),
    details: JSON.parse(row.details_json as string),
    durationMs: row.duration_ms ?? null,
    visibility: row.visibility,
    createdAt: row.created_at,
  });
}

export class AgentEventsRepo {
  constructor(private readonly db: Database.Database) {}

  startRun(sessionId: string, scopeHash: string): string {
    const runId = newId();
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO agent_runs (id, session_id, status, started_at, scope_hash)
         VALUES (?, ?, 'running', ?, ?)`,
      )
      .run(runId, sessionId, ts, scopeHash);
    return runId;
  }

  append(runId: string, input: AppendAgentEventInput): AgentEvent {
    const event = this.db.transaction(() => {
      const row = this.db
        .prepare(
          'SELECT COALESCE(MAX(sequence), -1) + 1 AS next FROM agent_events WHERE run_id = ?',
        )
        .get(runId) as { next: number };
      const createdAt = nowMs();
      const event = AgentEventSchema.parse({
        id: newId(),
        runId,
        sequence: row.next,
        parentStepId: input.parentStepId ?? null,
        type: input.type,
        status: input.status,
        summary: input.summary,
        toolName: input.toolName ?? null,
        sourceRefs: input.sourceRefs ?? [],
        details: input.details ?? {},
        durationMs: input.durationMs ?? null,
        visibility: input.visibility ?? 'user',
        createdAt,
      });
      this.db
        .prepare(
          `INSERT INTO agent_events (
            id, run_id, sequence, parent_step_id, event_type, status, summary,
            tool_name, source_refs_json, details_json, duration_ms, visibility, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.runId,
          event.sequence,
          event.parentStepId,
          event.type,
          event.status,
          event.summary,
          event.toolName,
          JSON.stringify(event.sourceRefs),
          JSON.stringify(event.details),
          event.durationMs,
          event.visibility,
          event.createdAt,
        );
      return event;
    })();
    return event;
  }

  list(runId: string, afterSequence = -1): AgentEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_events
         WHERE run_id = ? AND sequence > ?
         ORDER BY sequence ASC`,
      )
      .all(runId, afterSequence) as Record<string, unknown>[];
    return rows.map(mapEvent);
  }

  listForSession(sessionId: string): AgentEvent[] {
    const rows = this.db
      .prepare(
        `SELECT ae.* FROM agent_events ae
         JOIN agent_runs ar ON ar.id = ae.run_id
         WHERE ar.session_id = ?
         ORDER BY ar.started_at ASC, ae.sequence ASC`,
      )
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(mapEvent);
  }

  finishRun(
    runId: string,
    status: 'completed' | 'interrupted' | 'failed' | 'cancelled',
    error?: { code: string; message: string },
  ): void {
    this.db
      .prepare(
        `UPDATE agent_runs SET status = ?, ended_at = ?, error_code = ?, error_message = ?
         WHERE id = ?`,
      )
      .run(status, nowMs(), error?.code ?? null, error?.message ?? null, runId);
  }
}
