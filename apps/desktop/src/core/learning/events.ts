import type { DemonstratedLevel } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { sha256Hex } from '../storage/hash.js';
import { newId, nowMs } from '../storage/ids.js';

export interface LearningEventInput {
  studioId?: string | null;
  conceptId: string;
  sessionId?: string | null;
  probeTurnId?: string | null;
  sourceBlockId?: number | null;
  eventKind:
    | 'encountered'
    | 'explanation_evidence'
    | 'application_evidence'
    | 'critique_evidence'
    | 'misconception_hypothesis'
    | 'misconception_confirmed'
    | 'correction'
    | 'review_success'
    | 'review_failure'
    | 'manual_assertion'
    | 'manual_correction'
    | 'retraction';
  demonstratedLevel?: DemonstratedLevel | null;
  confidence: number;
  evidenceMessageId?: string | null;
  evidenceExcerpt?: string | null;
  questionText?: string | null;
  rationale: string;
  rubricJson?: string | null;
  evaluatorProvider?: string | null;
  evaluatorModel?: string | null;
  retractsEventId?: string | null;
  contextJson?: Record<string, unknown>;
}

function computeEventHash(input: LearningEventInput, createdAt: number): string {
  const payload = JSON.stringify({
    studioId: input.studioId ?? null,
    conceptId: input.conceptId,
    eventKind: input.eventKind,
    demonstratedLevel: input.demonstratedLevel ?? null,
    confidence: input.confidence,
    evidenceExcerpt: input.evidenceExcerpt ?? null,
    rationale: input.rationale,
    createdAt,
  });
  return sha256Hex(payload);
}

export class LearningEventsRepo {
  constructor(private readonly db: Database.Database) {}

  append(input: LearningEventInput): string {
    const id = newId();
    const ts = nowMs();
    const eventHash = computeEventHash(input, ts);

    try {
      this.db
        .prepare(
          `INSERT INTO learning_events (
            id, studio_id, concept_id, session_id, probe_turn_id, source_block_id,
            event_kind, demonstrated_level, confidence, evidence_message_id,
            evidence_excerpt, question_text, rationale, rubric_json,
            evaluator_provider, evaluator_model, context_json,
            retracts_event_id, event_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.studioId ?? null,
          input.conceptId,
          input.sessionId ?? null,
          input.probeTurnId ?? null,
          input.sourceBlockId ?? null,
          input.eventKind,
          input.demonstratedLevel ?? null,
          input.confidence,
          input.evidenceMessageId ?? null,
          input.evidenceExcerpt ?? null,
          input.questionText ?? null,
          input.rationale,
          input.rubricJson ?? null,
          input.evaluatorProvider ?? null,
          input.evaluatorModel ?? null,
          JSON.stringify(input.contextJson ?? {}),
          input.retractsEventId ?? null,
          eventHash,
          ts,
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE constraint failed: learning_events.event_hash')) {
        throw new Error('Duplicate learning event rejected');
      }
      throw error;
    }

    return id;
  }
}

export function assertAppendOnly(db: Database.Database): void {
  const updateAttempt = () => {
    db.prepare(`UPDATE learning_events SET rationale = rationale WHERE 0`).run();
  };
  try {
    updateAttempt();
    throw new Error('Expected learning_events update to be blocked');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('append-only')) {
      throw error;
    }
  }
}
