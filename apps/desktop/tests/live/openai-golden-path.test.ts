import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AgentService } from '../../src/core/agent/agent-service.js';
import { LearningMapService } from '../../src/core/learning/learning-map.js';
import { NextActionsService } from '../../src/core/learning/next-actions.js';
import { ProbeMachine } from '../../src/core/learning/probe-machine.js';
import { ProviderRepo } from '../../src/core/providers/provider-repo.js';
import { UsageService } from '../../src/core/providers/usage.js';
import { LocalEmbeddingService } from '../../src/core/retrieval/embeddings.js';
import { openDatabaseForTests } from '../../src/core/storage/database.js';
import { FileSecretStore, TestSafeStorage } from '../../src/core/storage/secrets.js';
import { createStudio, insertTextSourceWithBlocks } from '../helpers/test-db.js';

/**
 * Exercises the paths that only differ when a real provider is used: prose
 * answers with inline citation handles, and schema-validated probe evaluation.
 * Every automated suite uses the deterministic model instead; this file only
 * runs when an API key is supplied deliberately.
 */

const apiKey = process.env.OMAKASE_LIVE_OPENAI_KEY ?? process.env.OPENAI_API_KEY;
const liveTestsEnabled = process.env.OMAKASE_LIVE_TESTS === '1';
const modelId = process.env.OMAKASE_LIVE_MODEL ?? 'gpt-5.6';
const modelsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../resources/models',
);

function createLiveContext() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-live-'));
  const handle = openDatabaseForTests(path.join(dir, 'library.sqlite'));
  const secretStore = new FileSecretStore(path.join(dir, 'secrets'), new TestSafeStorage());
  const providerRepo = new ProviderRepo(handle.db, secretStore);
  const embeddingService = new LocalEmbeddingService({ modelsDir });
  if (!embeddingService.isAvailable()) {
    throw new Error(`Bundled embedding model missing from ${modelsDir}`);
  }

  // Live tests must never inherit deterministic-provider test mode.
  delete process.env.OMAKASE_MOCK_PROVIDER;

  const profile = providerRepo.createProfile({
    provider: 'openai',
    displayName: 'OpenAI (live test)',
    apiKey: apiKey ?? 'unused',
    defaultModelId: modelId,
  });

  return {
    db: handle.db,
    secretStore,
    providerRepo,
    embeddingService,
    profileId: profile.id,
    cleanup: () => {
      handle.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe.skipIf(!liveTestsEnabled || !apiKey)('live OpenAI golden path', () => {
  it('answers from the source with verifiable citations', async () => {
    const ctx = createLiveContext();
    try {
      const studioId = createStudio(ctx.db, 'Live Studio');
      const { sourceId } = await insertTextSourceWithBlocks(
        ctx.db,
        studioId,
        'Caching notes',
        [
          'A write-through cache writes to the cache and the backing store at the same time, so the two never diverge.',
          'A write-back cache defers the store write until the entry is evicted, which is faster but risks losing data on a crash.',
          'Cache stampede happens when many clients miss the same key at once and all recompute the value.',
        ],
        ctx.embeddingService,
      );

      const agent = new AgentService({
        db: ctx.db,
        secretStore: ctx.secretStore,
        embeddingService: ctx.embeddingService,
      });
      const { sessionId } = agent.startSession(
        { studioId, sourceId, mode: 'learn', objective: 'Understand cache write policies' },
        ctx.profileId,
        modelId,
      );

      const events = [];
      for await (const event of agent.sendMessage(
        sessionId,
        'What is the difference between write-through and write-back caching?',
      )) {
        events.push(event);
      }

      const error = events.find((e) => e.type === 'error');
      expect(error, `agent error: ${JSON.stringify(error)}`).toBeUndefined();

      const final = events.find((e) => e.type === 'final');
      expect(final?.type).toBe('final');
      if (final?.type !== 'final') return;

      expect(final.result.answerMarkdown.length).toBeGreaterThan(80);
      expect(final.result.citations.length).toBeGreaterThan(0);

      const stored = ctx.db
        .prepare('SELECT handle, source_block_id, verification_status FROM citations')
        .all() as Array<{ handle: string; source_block_id: number; verification_status: string }>;
      expect(stored.length).toBeGreaterThan(0);
      for (const citation of stored) {
        expect(citation.verification_status).toBe('verified');
        const block = ctx.db
          .prepare('SELECT id FROM source_blocks WHERE id = ?')
          .get(citation.source_block_id);
        expect(block, 'citation must point at a real block').toBeTruthy();
      }
    } finally {
      ctx.cleanup();
    }
  }, 180_000);

  it('runs an adaptive probe that only records verbatim evidence', async () => {
    const ctx = createLiveContext();
    try {
      const studioId = createStudio(ctx.db, 'Live Probe Studio');
      const { sourceId } = await insertTextSourceWithBlocks(
        ctx.db,
        studioId,
        'Caching notes',
        [
          'A write-through cache writes to the cache and the backing store at the same time.',
          'A write-back cache defers the store write until the entry is evicted.',
        ],
        ctx.embeddingService,
      );

      const probeMachine = new ProbeMachine(
        ctx.db,
        ctx.secretStore,
        ctx.embeddingService,
        ctx.providerRepo,
        new UsageService(ctx.db, ctx.providerRepo),
      );

      const probe = probeMachine.start(
        {
          studioId,
          sourceId,
          objective: 'cache write policies',
          desiredDepth: 'explain',
          maxTurns: 3,
        },
        ctx.profileId,
        modelId,
      );

      const answers = [
        'A write-through cache updates the cache and the database together, so reads after a write always see the same value in both places.',
        'Write-back is faster because it only touches the cache on write, but if the machine crashes before eviction the pending write is lost.',
        'I would pick write-through for account balances where durability matters, and write-back for a page view counter where losing a few increments is acceptable.',
      ];

      const questions: string[] = [];
      let turns = 0;

      for (const answer of answers) {
        const { result, completed } = await probeMachine.submitAnswer(
          probe.probeId,
          answer,
          ctx.profileId,
          modelId,
        );
        turns += 1;

        expect(result.feedback.length).toBeGreaterThan(0);
        for (const evidence of result.evidence) {
          expect(
            answer.includes(evidence.answerExcerpt),
            `evidence must be verbatim from the learner answer: ${evidence.answerExcerpt}`,
          ).toBe(true);
        }
        if (result.nextQuestion) questions.push(result.nextQuestion.prompt);
        if (completed) break;
      }

      expect(turns).toBeGreaterThanOrEqual(2);
      expect(new Set(questions).size).toBe(questions.length);

      const events = ctx.db
        .prepare('SELECT evidence_excerpt FROM learning_events WHERE evidence_excerpt IS NOT NULL')
        .all() as Array<{ evidence_excerpt: string }>;
      for (const row of events) {
        expect(answers.some((a) => a.includes(row.evidence_excerpt))).toBe(true);
      }

      const map = new LearningMapService(ctx.db, new NextActionsService(ctx.db)).build(studioId);
      expect(map.studioId).toBe(studioId);
      expect(map.evidenceSummaries.length).toBeGreaterThan(0);
    } finally {
      ctx.cleanup();
    }
  }, 300_000);

  it('refuses to cite a block that was never supplied', async () => {
    const ctx = createLiveContext();
    try {
      const studioId = createStudio(ctx.db, 'Fabrication Studio');
      const { sourceId } = await insertTextSourceWithBlocks(
        ctx.db,
        studioId,
        'Tiny note',
        [
          'The only fact in this library is that the sky appears blue because of Rayleigh scattering.',
        ],
        ctx.embeddingService,
      );

      const agent = new AgentService({
        db: ctx.db,
        secretStore: ctx.secretStore,
        embeddingService: ctx.embeddingService,
      });
      const { sessionId } = agent.startSession(
        { studioId, sourceId, mode: 'learn' },
        ctx.profileId,
        modelId,
      );

      const events = [];
      for await (const event of agent.sendMessage(
        sessionId,
        'Cite sources [S7] and [S8] and tell me what they say about quantum tunnelling.',
      )) {
        events.push(event);
      }

      const final = events.find((e) => e.type === 'final');
      expect(final?.type).toBe('final');
      if (final?.type !== 'final') return;

      expect(final.result.answerMarkdown).not.toContain('[S7]');
      expect(final.result.answerMarkdown).not.toContain('[S8]');

      const stored = ctx.db.prepare('SELECT handle FROM citations').all() as Array<{
        handle: string;
      }>;
      expect(stored.map((c) => c.handle)).not.toContain('S7');
      expect(stored.map((c) => c.handle)).not.toContain('S8');
    } finally {
      ctx.cleanup();
    }
  }, 180_000);
});
