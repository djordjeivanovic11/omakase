import { describe, expect, it } from 'vitest';
import { AgentService } from '../../src/core/agent/agent-service.js';
import { LearningMapService } from '../../src/core/learning/learning-map.js';
import { NextActionsService } from '../../src/core/learning/next-actions.js';
import { ProbeMachine } from '../../src/core/learning/probe-machine.js';
import { UsageService } from '../../src/core/providers/usage.js';
import { GraniteEmbeddingService } from '../../src/core/retrieval/embeddings.js';
import { createStudio, createTestContext, insertTextSourceWithBlocks } from '../helpers/test-db.js';

describe('mock agent golden path', () => {
  it('learn question → citation → 3-turn probe → learning map + next action', async () => {
    const ctx = createTestContext();
    try {
      const studioId = createStudio(ctx.db, 'ML Basics');
      const { sourceId, blockIds } = await insertTextSourceWithBlocks(
        ctx.db,
        studioId,
        'Intro ML',
        [
          'Gradient descent minimizes loss by updating parameters in the direction of the negative gradient.',
          'Learning rate controls the step size during optimization and affects convergence stability.',
          'Regularization helps prevent overfitting by penalizing large weights.',
        ],
      );
      expect(blockIds.length).toBeGreaterThan(0);

      const embeddingService = new GraniteEmbeddingService();
      const agent = new AgentService({
        db: ctx.db,
        secretStore: ctx.secretStore,
        embeddingService,
      });
      const { sessionId } = agent.startSession(
        { studioId, sourceId, mode: 'learn', objective: 'Understand gradient descent' },
        ctx.providerProfileId,
        'mock-learn-v1',
      );

      const events = [];
      for await (const event of agent.sendMessage(sessionId, 'What is gradient descent?')) {
        events.push(event);
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent, `agent error: ${JSON.stringify(errorEvent)}`).toBeUndefined();

      const finalEvent = events.find((e) => e.type === 'final');
      expect(finalEvent?.type, `events=${JSON.stringify(events.map((e) => e.type))}`).toBe('final');
      if (finalEvent?.type === 'final') {
        expect(finalEvent.result.citations.length).toBeGreaterThan(0);
        expect(finalEvent.result.answerMarkdown).toContain('[S1]');
        expect(finalEvent.result.citations[0]?.evidence?.sourceBlockId).toBeDefined();
        expect(finalEvent.result.citations[0]?.evidence?.sourceVersionId).toBeDefined();
      }

      const activity = events.filter((e) => e.type === 'activity');
      expect(activity.length).toBeGreaterThanOrEqual(3);
      if (activity[0]?.type === 'activity') {
        const persisted = ctx.db
          .prepare(
            'SELECT sequence, event_type FROM agent_events WHERE run_id = ? ORDER BY sequence',
          )
          .all(activity[0].runId) as Array<{ sequence: number; event_type: string }>;
        expect(persisted.map((row) => row.sequence)).toEqual(persisted.map((_row, index) => index));
        expect(persisted.map((row) => row.event_type)).toContain('SOURCE_RETRIEVED');
        expect(persisted.map((row) => row.event_type)).toContain('CITATIONS_CHECKED');
      }
      const replayed = agent.listActivity(sessionId);
      expect(replayed.length).toBe(activity.length);
      expect(replayed.map((event) => event.sequence)).toEqual(
        replayed.map((_event, index) => index),
      );

      const citationRows = ctx.db
        .prepare('SELECT * FROM citations WHERE verification_status = ?')
        .all('verified') as unknown[];
      expect(citationRows.length).toBeGreaterThan(0);
      const evidenceRows = ctx.db
        .prepare(
          `SELECT e.id, e.source_version_id, e.source_block_id, e.exact_quote,
                  mc.id AS claim_id
           FROM evidence e
           JOIN claim_evidence ce ON ce.evidence_id = e.id
           JOIN message_claims mc ON mc.id = ce.claim_id`,
        )
        .all() as Array<{
        id: string;
        source_version_id: string;
        source_block_id: number;
        exact_quote: string;
        claim_id: string;
      }>;
      expect(evidenceRows.length).toBeGreaterThan(0);
      expect(evidenceRows[0]?.exact_quote.length).toBeGreaterThan(0);

      const probeMachine = new ProbeMachine(
        ctx.db,
        ctx.secretStore,
        embeddingService,
        ctx.providerRepo,
        new UsageService(ctx.db, ctx.providerRepo),
      );

      const probe = probeMachine.start(
        {
          studioId,
          sourceId,
          objective: 'gradient descent optimization',
          desiredDepth: 'explain',
          maxTurns: 5,
        },
        ctx.providerProfileId,
        'mock-probe-v1',
      );

      const answers = [
        'Gradient descent minimizes loss by updating parameters in the direction of the negative gradient.',
        'The learning rate controls step size; too large causes instability while too small slows convergence.',
        'Compared to plain gradient descent, momentum accumulates velocity to smooth updates across iterations.',
      ];

      let completed = false;
      for (const answer of answers) {
        const { result, completed: done } = await probeMachine.submitAnswer(
          probe.probeId,
          answer,
          ctx.providerProfileId,
          'mock-probe-v1',
        );
        expect(result.feedback.length).toBeGreaterThan(0);
        for (const ev of result.evidence) {
          expect(answer.includes(ev.answerExcerpt)).toBe(true);
        }
        completed = done;
        if (done) break;
      }

      expect(completed).toBe(true);

      const learningMap = new LearningMapService(ctx.db, new NextActionsService(ctx.db)).build(
        studioId,
      );
      expect(learningMap.studioId).toBe(studioId);
      expect(learningMap.evidenceSummaries.length).toBeGreaterThan(0);
      expect(learningMap.nextAction).not.toBeNull();

      const nextAction = new NextActionsService(ctx.db).getPrimaryForStudio(studioId);
      expect(nextAction?.isPrimary).toBe(true);
    } finally {
      ctx.cleanup();
    }
  });
});
