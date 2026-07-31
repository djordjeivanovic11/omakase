import { describe, expect, it } from 'vitest';
import { ConceptsRepo } from '../../src/core/learning/concepts-repo.js';
import { LearningEventsRepo } from '../../src/core/learning/events.js';
import { projectConceptStateForStudio } from '../../src/core/learning/projector.js';
import { createStudio, createTestContext } from '../helpers/test-db.js';

describe('concept state projector', () => {
  it('projects mastery from append-only learning events', () => {
    const ctx = createTestContext();
    try {
      const studioId = createStudio(ctx.db);
      const concepts = new ConceptsRepo(ctx.db);
      const events = new LearningEventsRepo(ctx.db);
      const concept = concepts.findOrCreate('Gradient Descent');

      events.append({
        studioId,
        conceptId: concept.id,
        eventKind: 'encountered',
        demonstratedLevel: 'encountered',
        confidence: 0.4,
        rationale: 'Read in source',
      });

      events.append({
        studioId,
        conceptId: concept.id,
        eventKind: 'explanation_evidence',
        demonstratedLevel: 'can_explain',
        confidence: 0.78,
        evidenceExcerpt: 'It minimizes the loss iteratively',
        rationale: 'Probe evidence',
      });

      const states = projectConceptStateForStudio(ctx.db, studioId);
      const state = states.find((s) => s.conceptId === concept.id);
      expect(state?.masteryLevel).toBe('can_explain');
      expect(state?.evidenceCount).toBeGreaterThanOrEqual(2);
    } finally {
      ctx.cleanup();
    }
  });
});
