import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface JobRecord {
  id: string;
  type: string;
  payloadJson: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  dedupeKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export class JobQueue {
  constructor(private readonly db: Database.Database) {}

  enqueue(
    type: string,
    payload: unknown,
    opts?: { dedupeKey?: string; priority?: number; maxAttempts?: number },
  ): string {
    const id = newId();
    const ts = nowMs();
    try {
      this.db
        .prepare(
          `INSERT INTO jobs (
            id, type, payload_json, status, priority, progress, attempts, max_attempts,
            dedupe_key, available_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'queued', ?, 0, 0, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          type,
          JSON.stringify(payload),
          opts?.priority ?? 0,
          opts?.maxAttempts ?? 3,
          opts?.dedupeKey ?? null,
          ts,
          ts,
          ts,
        );
      return id;
    } catch (err) {
      if (opts?.dedupeKey && String(err).includes('UNIQUE')) {
        const existing = this.db
          .prepare(`SELECT id FROM jobs WHERE dedupe_key = ? AND status IN ('queued', 'running')`)
          .get(opts.dedupeKey) as { id: string } | undefined;
        if (existing) return existing.id;
      }
      throw err;
    }
  }

  claimNext(workerId: string, types?: string[]): JobRecord | null {
    const ts = nowMs();
    const typeFilter =
      types && types.length > 0 ? `AND type IN (${types.map(() => '?').join(',')})` : '';
    const row = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE status = 'queued' AND available_at <= ?
         ${typeFilter}
         ORDER BY priority DESC, created_at ASC
         LIMIT 1`,
      )
      .get(ts, ...(types ?? [])) as Record<string, unknown> | undefined;
    if (!row) return null;

    const id = row.id as string;
    const updated = this.db
      .prepare(
        `UPDATE jobs SET
          status = 'running',
          worker_id = ?,
          locked_at = ?,
          started_at = COALESCE(started_at, ?),
          attempts = attempts + 1,
          updated_at = ?
         WHERE id = ? AND status = 'queued'`,
      )
      .run(workerId, ts, ts, ts, id);
    if (updated.changes === 0) return null;
    return this.get(id);
  }

  get(id: string): JobRecord | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      type: row.type as string,
      payloadJson: row.payload_json as string,
      status: row.status as JobStatus,
      progress: row.progress as number,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      dedupeKey: (row.dedupe_key as string | null) ?? null,
      errorCode: (row.error_code as string | null) ?? null,
      errorMessage: (row.error_message as string | null) ?? null,
    };
  }

  setProgress(id: string, progress: number): void {
    this.db
      .prepare(`UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?`)
      .run(Math.max(0, Math.min(1, progress)), nowMs(), id);
  }

  succeed(id: string, result?: unknown): void {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'succeeded', progress = 1, result_json = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(result ? JSON.stringify(result) : null, nowMs(), nowMs(), id);
  }

  fail(id: string, errorCode: string, errorMessage: string, retry = true): void {
    const job = this.get(id);
    if (!job) return;
    const ts = nowMs();
    if (retry && job.attempts < job.maxAttempts) {
      const delay = Math.min(60_000, 1000 * 2 ** Math.max(0, job.attempts - 1));
      this.db
        .prepare(
          `UPDATE jobs SET
            status = 'queued',
            worker_id = NULL,
            locked_at = NULL,
            available_at = ?,
            error_code = ?,
            error_message = ?,
            updated_at = ?
           WHERE id = ?`,
        )
        .run(ts + delay, errorCode, errorMessage, ts, id);
      return;
    }
    this.db
      .prepare(
        `UPDATE jobs SET
          status = 'failed',
          error_code = ?,
          error_message = ?,
          completed_at = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(errorCode, errorMessage, ts, ts, id);
  }

  cancel(id: string): void {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'cancelled', completed_at = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'running')`,
      )
      .run(nowMs(), nowMs(), id);
  }

  /** Requeue expired running leases on startup. */
  recoverStale(leaseMs = 5 * 60_000): number {
    const cutoff = nowMs() - leaseMs;
    const result = this.db
      .prepare(
        `UPDATE jobs SET
          status = 'queued',
          worker_id = NULL,
          locked_at = NULL,
          available_at = ?,
          updated_at = ?
         WHERE status = 'running' AND (locked_at IS NULL OR locked_at < ?)`,
      )
      .run(nowMs(), nowMs(), cutoff);
    return result.changes;
  }

  list(limit = 50): JobRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as string,
      type: row.type as string,
      payloadJson: row.payload_json as string,
      status: row.status as JobStatus,
      progress: row.progress as number,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      dedupeKey: (row.dedupe_key as string | null) ?? null,
      errorCode: (row.error_code as string | null) ?? null,
      errorMessage: (row.error_message as string | null) ?? null,
    }));
  }
}
