import { afterEach, describe, expect, it } from 'vitest';
import { ProviderRepo } from '../../src/core/providers/provider-repo.js';
import type { SecretStore } from '../../src/core/storage/secrets.js';
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

  it('re-saving the same provider replaces the stored key instead of duplicating setup', () => {
    const ctx = createTestContext();
    contexts.push(ctx);
    const first = ctx.providerRepo.createProfile({
      provider: 'openai',
      apiKey: 'sk-first-key',
      defaultModelId: 'gpt-5.6',
    });
    const second = ctx.providerRepo.createProfile({
      provider: 'openai',
      apiKey: 'sk-second-key',
      defaultModelId: 'gpt-5.6',
    });

    expect(second.id).toBe(first.id);
    expect(ctx.providerRepo.listProfiles().filter((p) => p.displayName === 'OpenAI')).toHaveLength(
      1,
    );
    expect(ctx.secretStore.getSecret(`provider:${first.id}`)).toBe('sk-second-key');
  });

  it('does not crash provider listing when a saved key is unreadable', () => {
    const ctx = createTestContext();
    contexts.push(ctx);
    const profile = ctx.providerRepo.createProfile({
      provider: 'openai',
      apiKey: 'sk-test-secret-for-unreadable-key',
    });
    const unreadableStore: SecretStore = {
      setSecret: () => undefined,
      getSecret: () => {
        throw new Error('cannot decrypt');
      },
      deleteSecret: () => undefined,
      hasSecret: () => true,
    };

    const repo = new ProviderRepo(ctx.db, unreadableStore);
    const listed = repo.listProfiles().find((p) => p.id === profile.id);

    expect(listed?.keySuffix).toBeNull();
    expect(listed?.lastVerification).toBe('failed');
    expect(listed?.lastErrorCode).toBe('secret_unreadable');
    expect(repo.getApiKey(profile.id)).toBeNull();
  });
});
