import { describe, expect, it } from 'vitest';
import { reconcileConceptRelationships } from '../../src/core/learning/concept-graph-repo.js';
import { ConceptsRepo } from '../../src/core/learning/concepts-repo.js';
import { persistValidatedCitations } from '../../src/core/sources/evidence-repo.js';
import { newId, nowMs } from '../../src/core/storage/ids.js';
import { createStudio, createTestContext, insertTextSourceWithBlocks } from '../helpers/test-db.js';

describe('source-backed concept graph reconciliation', () => {
  it('creates only exact co-mention edges and preserves their evidence', async () => {
    const ctx = createTestContext();
    try {
      const studioId = createStudio(ctx.db, 'Diffusion Studio');
      const { sourceId, blockIds } = await insertTextSourceWithBlocks(
        ctx.db,
        studioId,
        'Optimization notes',
        [
          'Gradient descent updates parameters using the negative gradient. The learning rate controls the step size.',
        ],
      );
      const source = ctx.db
        .prepare(
          `SELECT sav.source_version_id AS source_version_id
           FROM source_active_versions sav WHERE sav.source_id = ?`,
        )
        .get(sourceId) as { source_version_id: string };
      const blockId = blockIds[0];
      if (!blockId) throw new Error('Expected a source block');

      const concepts = new ConceptsRepo(ctx.db);
      const gradient = concepts.findOrCreate('Gradient Descent');
      const rate = concepts.findOrCreate('Learning Rate');
      const unrelated = concepts.findOrCreate('Latent Diffusion');
      concepts.linkToStudio(studioId, gradient.id);
      concepts.linkToStudio(studioId, rate.id);
      concepts.linkToStudio(studioId, unrelated.id);

      const sessionId = newId();
      const messageId = newId();
      const ts = nowMs();
      ctx.db
        .prepare(
          `INSERT INTO sessions (id, studio_id, mode, status, runtime_context_json, started_at, created_at, updated_at)
           VALUES (?, ?, 'learn', 'active', '{}', ?, ?, ?)`,
        )
        .run(sessionId, studioId, ts, ts, ts);
      ctx.db
        .prepare(
          `INSERT INTO messages (id, session_id, ordinal, role, content_text, status, created_at)
           VALUES (?, ?, 0, 'assistant', 'Grounded answer', 'complete', ?)`,
        )
        .run(messageId, sessionId, ts);

      const [evidence] = persistValidatedCitations(ctx.db, messageId, [
        {
          handle: 'S1',
          sourceBlockId: blockId,
          claimSummary: 'The passage defines the optimization relationship.',
          locatorSnapshotJson: '{}',
          verificationStatus: 'verified',
        },
      ]);
      if (!evidence) throw new Error('Expected persisted evidence');

      const update = reconcileConceptRelationships(ctx.db, studioId, [evidence]);
      expect(update.matchedConceptCount).toBe(2);
      expect(update.createdRelationCount).toBe(1);
      expect(update.linkedRelationEvidenceCount).toBe(1);

      const relation = ctx.db
        .prepare(
          `SELECT from_concept_id, to_concept_id, relation, confidence
           FROM concept_relations WHERE relation = 'related'`,
        )
        .get() as {
        from_concept_id: string;
        to_concept_id: string;
        relation: string;
        confidence: number;
      };
      expect(new Set([relation.from_concept_id, relation.to_concept_id])).toEqual(
        new Set([gradient.id, rate.id]),
      );
      expect(relation.relation).toBe('related');
      expect(relation.confidence).toBe(0.55);

      const support = ctx.db
        .prepare(
          `SELECT cre.evidence_id
           FROM concept_relation_evidence cre
           WHERE cre.from_concept_id = ? AND cre.to_concept_id = ? AND cre.relation = 'related'`,
        )
        .get(relation.from_concept_id, relation.to_concept_id) as { evidence_id: string };
      expect(support.evidence_id).toBe(evidence.id);
      expect(
        ctx.db
          .prepare(
            'SELECT COUNT(*) AS count FROM concept_relations WHERE to_concept_id = ? OR from_concept_id = ?',
          )
          .get(unrelated.id, unrelated.id),
      ).toEqual({ count: 0 });
      expect(source.source_version_id).toBeTruthy();
    } finally {
      ctx.cleanup();
    }
  });
});
