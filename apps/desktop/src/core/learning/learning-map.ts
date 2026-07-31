import type { LearningMap } from '@omakase/contracts';
import { LearningMapSchema } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import type { NextActionsService } from './next-actions.js';
import { projectConceptStateForStudio } from './projector.js';

export class LearningMapService {
  constructor(
    private readonly db: Database.Database,
    private readonly nextActions: NextActionsService,
  ) {}

  build(studioId: string): LearningMap {
    const states = projectConceptStateForStudio(this.db, studioId);

    const secure = states.filter((s) => s.certaintyStatus === 'secure');
    const uncertain = states.filter(
      (s) => s.certaintyStatus === 'uncertain' || s.certaintyStatus === 'unassessed',
    );

    const misconceptions = this.db
      .prepare(
        `SELECT le.concept_id, c.canonical_name, le.rationale, le.confidence
         FROM learning_events le
         JOIN concepts c ON c.id = le.concept_id
         WHERE le.studio_id = ? AND le.event_kind IN ('misconception_hypothesis', 'misconception_confirmed')
         ORDER BY le.created_at DESC LIMIT 10`,
      )
      .all(studioId) as Array<{
      concept_id: string;
      canonical_name: string;
      rationale: string;
      confidence: number;
    }>;

    const evidenceSummaries = this.db
      .prepare(
        `SELECT le.concept_id, c.canonical_name, le.evidence_excerpt, le.demonstrated_level, le.created_at
         FROM learning_events le
         JOIN concepts c ON c.id = le.concept_id
         WHERE le.studio_id = ? AND le.evidence_excerpt IS NOT NULL
         ORDER BY le.created_at DESC LIMIT 20`,
      )
      .all(studioId) as Array<{
      concept_id: string;
      canonical_name: string;
      evidence_excerpt: string;
      demonstrated_level: string;
      created_at: number;
    }>;

    const prerequisites = states.filter(
      (s) => s.masteryLevel === 'encountered' || s.masteryLevel === 'unassessed',
    );

    const primary = this.nextActions.getPrimaryForStudio(studioId);

    return LearningMapSchema.parse({
      studioId,
      secure,
      uncertain,
      misconceptions: misconceptions.map((m) => ({
        conceptId: m.concept_id,
        conceptName: m.canonical_name,
        description: m.rationale,
        confidence: m.confidence,
      })),
      prerequisites,
      evidenceSummaries: evidenceSummaries.map((e) => ({
        conceptId: e.concept_id,
        conceptName: e.canonical_name,
        excerpt: e.evidence_excerpt,
        level: e.demonstrated_level,
        createdAt: e.created_at,
      })),
      nextAction: primary
        ? {
            id: primary.id,
            title: primary.title,
            rationale: primary.rationale,
            actionType: primary.actionType,
            sourceId: primary.sourceId,
            sourceBlockId: primary.sourceBlockId,
          }
        : null,
    });
  }
}
