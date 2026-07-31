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

      const agent = new AgentService({ db: ctx.db, secretStore: ctx.secretStore });
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
      }

      const citationRows = ctx.db
        .prepare('SELECT * FROM citations WHERE verification_status = ?')
        .all('verified') as unknown[];
      expect(citationRows.length).toBeGreaterThan(0);

      const probeMachine = new ProbeMachine(
        ctx.db,
        ctx.secretStore,
        new GraniteEmbeddingService(),
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
      for (let i = 0; i < answers.length; i++) {
        const { result, completed: done } = await probeMachine.submitAnswer(
          probe.probeId,
          answers[i]!,
          ctx.providerProfileId,
          'mock-probe-v1',
        );
        expect(result.feedback.length).toBeGreaterThan(0);
        for (const ev of result.evidence) {
          expect(answers[i]!.includes(ev.answerExcerpt)).toBe(true);
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
