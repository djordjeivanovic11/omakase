import { afterEach, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../helpers/test-db.js';

const contexts: TestContext[] = [];

afterEach(() => {
  for (const ctx of contexts.splice(0)) {
    ctx.cleanup();
  }
});

describe('provider secrets isolation', () => {
  it('never stores the raw API key in SQLite', () => {
    const ctx = createTestContext();
    contexts.push(ctx);

    const secret = 'sk-live-secret-key-MUST-NOT-APPEAR-IN-DB-1234567890';
    const profile = ctx.providerRepo.createProfile({
      provider: 'openai',
      displayName: 'Test OpenAI',
      apiKey: secret,
      defaultModelId: 'gpt-4o-mini',
    });

    expect(profile.keySuffix).toBeTruthy();
    expect(JSON.stringify(profile)).not.toContain(secret);

    const rows = ctx.db.prepare('SELECT * FROM provider_profiles').all();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('sk-live-secret');

    const recovered = ctx.secretStore.getSecret(`provider:${profile.id}`);
    expect(recovered).toBe(secret);
  });

  it('keeps the key available from the secret store after write', () => {
    const ctx = createTestContext();
    contexts.push(ctx);
    const secret = 'sk-restart-persistence-check-abcdefghijklmnop';
    const profile = ctx.providerRepo.createProfile({
      provider: 'openai',
      apiKey: secret,
    });

    expect(ctx.secretStore.getSecret(`provider:${profile.id}`)).toBe(secret);
  });
});
