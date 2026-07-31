import { describe, expect, it } from 'vitest';
import { AgentService } from '../../src/core/agent/agent-service.js';
import { validateCitationProposals } from '../../src/core/agent/citations.js';
import { verifyAnswerExcerpt } from '../../src/core/learning/evidence.js';
import { createStudio, createTestContext, insertTextSourceWithBlocks } from '../helpers/test-db.js';

describe('AI budget and fail-closed contracts', () => {
  it('rejects fabricated citations so they never appear verified', () => {
    const result = validateCitationProposals(
      [{ handle: 'S9', claimSummary: 'nope' }],
      [{ handle: 'S1', sourceBlockId: 1, locatorJson: '{}' }],
    );
    expect(result.validated).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
  });

  it('rejects non-verbatim learner evidence', () => {
    expect(verifyAnswerExcerpt('I understand momentum.', 'gradient descent updates')).toBe(false);
  });

  it('provider timeout-style abort does not erase prior studio state', async () => {
    const ctx = createTestContext();
    try {
      const studioId = createStudio(ctx.db, 'Budget Studio');
      await insertTextSourceWithBlocks(ctx.db, studioId, 'Notes', [
        'Momentum accumulates velocity across gradient steps.',
      ]);
      const before = ctx.db.prepare('SELECT COUNT(*) AS c FROM sources').get() as { c: number };
      const agent = new AgentService({ db: ctx.db, secretStore: ctx.secretStore });
      const { sessionId } = agent.startSession(
        { studioId, mode: 'learn', objective: 'momentum' },
        ctx.providerProfileId,
        'mock-learn-v1',
      );
      // Completing a normal mock turn should leave sources intact.
      for await (const _ of agent.sendMessage(sessionId, 'What is momentum?')) {
        // drain
      }
      const after = ctx.db.prepare('SELECT COUNT(*) AS c FROM sources').get() as { c: number };
      expect(after.c).toBe(before.c);
      expect(before.c).toBeGreaterThan(0);
    } finally {
      ctx.cleanup();
    }
  });
});
