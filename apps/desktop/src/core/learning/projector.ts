import type { ConceptState, DemonstratedLevel, MasteryLevel } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { nowMs } from '../storage/ids.js';
import { canTransitionMastery, compareMastery, maxMastery } from './concepts-repo.js';

const DEMONSTRATED_TO_MASTERY: Record<DemonstratedLevel, MasteryLevel> = {
  encountered: 'encountered',
  can_explain: 'can_explain',
  can_apply: 'can_apply',
  can_compare_or_critique: 'can_compare_or_critique',
};

interface EventRow {
  id: string;
  concept_id: string;
  canonical_name: string;
  event_kind: string;
  demonstrated_level: DemonstratedLevel | null;
  confidence: number;
  evidence_excerpt: string | null;
  created_at: number;
  retracts_event_id: string | null;
}

function eventKindToLevel(
  kind: string,
  demonstrated: DemonstratedLevel | null,
): MasteryLevel | null {
  if (demonstrated) return DEMONSTRATED_TO_MASTERY[demonstrated];
  if (kind === 'encountered') return 'encountered';
  return null;
}

function deriveCertainty(
  mastery: MasteryLevel,
  confidence: number,
  contradictoryCount: number,
): ConceptState['certaintyStatus'] {
  if (mastery === 'unassessed') return 'unassessed';
  if (contradictoryCount > 0) return 'contradicted';
  if (confidence >= 0.75) return 'secure';
  return 'uncertain';
}

export function projectConceptStateForStudio(
  db: Database.Database,
  studioId: string,
): ConceptState[] {
  const rows = db
    .prepare(
      `SELECT le.*, c.canonical_name
       FROM learning_events le
       JOIN concepts c ON c.id = le.concept_id
       WHERE le.studio_id = ?
       ORDER BY le.created_at ASC`,
    )
    .all(studioId) as EventRow[];

  const retracted = new Set(
    rows
      .filter((r) => r.event_kind === 'retraction' && r.retracts_event_id)
      .map((r) => r.retracts_event_id!),
  );

  const byConcept = new Map<
    string,
    {
      conceptName: string;
      mastery: MasteryLevel;
      confidence: number;
      evidenceCount: number;
      contradictoryCount: number;
      lastDemonstratedAt: number | null;
      strongestEventId: string | null;
    }
  >();

  for (const row of rows) {
    if (retracted.has(row.id)) continue;

    const level = eventKindToLevel(row.event_kind, row.demonstrated_level);
    const entry = byConcept.get(row.concept_id) ?? {
      conceptName: row.canonical_name,
      mastery: 'unassessed' as MasteryLevel,
      confidence: 0,
      evidenceCount: 0,
      contradictoryCount: 0,
      lastDemonstratedAt: null,
      strongestEventId: null,
    };

    if (
      row.event_kind === 'misconception_hypothesis' ||
      row.event_kind === 'misconception_confirmed'
    ) {
      entry.contradictoryCount += 1;
    }

    if (level) {
      if (canTransitionMastery(entry.mastery, level)) {
        entry.mastery = maxMastery(entry.mastery, level);
      }
      entry.evidenceCount += 1;
      entry.confidence = Math.max(entry.confidence, row.confidence);
      entry.lastDemonstratedAt = row.created_at;
      if (!entry.strongestEventId || compareMastery(level, entry.mastery) >= 0) {
        entry.strongestEventId = row.id;
      }
    }

    byConcept.set(row.concept_id, entry);
  }

  const ts = nowMs();
  const results: ConceptState[] = [];

  for (const [conceptId, entry] of byConcept) {
    const scopeKey = studioId;
    const certaintyStatus = deriveCertainty(
      entry.mastery,
      entry.confidence,
      entry.contradictoryCount,
    );

    db.prepare(
      `INSERT INTO concept_state (
        scope_key, scope_type, studio_id, concept_id, mastery_level, confidence,
        certainty_status, evidence_count, contradictory_count, strongest_event_id,
        last_demonstrated_at, updated_at
      ) VALUES (?, 'studio', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope_key, concept_id) DO UPDATE SET
        mastery_level = excluded.mastery_level,
        confidence = excluded.confidence,
        certainty_status = excluded.certainty_status,
        evidence_count = excluded.evidence_count,
        contradictory_count = excluded.contradictory_count,
        strongest_event_id = excluded.strongest_event_id,
        last_demonstrated_at = excluded.last_demonstrated_at,
        updated_at = excluded.updated_at`,
    ).run(
      scopeKey,
      studioId,
      conceptId,
      entry.mastery,
      entry.confidence,
      certaintyStatus,
      entry.evidenceCount,
      entry.contradictoryCount,
      entry.strongestEventId,
      entry.lastDemonstratedAt,
      ts,
    );

    results.push({
      scopeKey,
      scopeType: 'studio',
      studioId,
      conceptId,
      conceptName: entry.conceptName,
      masteryLevel: entry.mastery,
      confidence: entry.confidence,
      certaintyStatus,
      evidenceCount: entry.evidenceCount,
      contradictoryCount: entry.contradictoryCount,
      lastDemonstratedAt: entry.lastDemonstratedAt,
      nextReviewAt: null,
    });
  }

  return results;
}

export function rebuildConceptState(db: Database.Database, studioId?: string): void {
  if (studioId) {
    projectConceptStateForStudio(db, studioId);
    return;
  }
  const studios = db.prepare(`SELECT id FROM studios`).all() as Array<{ id: string }>;
  for (const { id } of studios) {
    projectConceptStateForStudio(db, id);
  }
}
