import type { ProviderProfile } from '@omakase/contracts';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENAI_MODEL_ID,
  defaultModelForProvider,
  isExplicitMockProfile,
  isMockProviderRuntimeAllowed,
} from '../../src/core/providers/model-defaults.js';
import { createLanguageModel, shouldUseMockProvider } from '../../src/core/providers/registry.js';

function profile(displayName: string, defaultModelId: string | null): ProviderProfile {
  return {
    id: 'p1',
    provider: 'openai',
    displayName,
    baseUrl: null,
    defaultModelId,
    keySuffix: 'abcd',
    capabilities: {
      webSearch: false,
      vision: false,
      files: false,
      transcription: false,
      structuredOutput: true,
    },
    enabled: true,
    lastVerification: null,
    lastVerifiedAt: null,
    lastErrorCode: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function withMockEnv(
  env: Partial<
    Record<
      'OMAKASE_MOCK_PROVIDER' | 'OMAKASE_TEST' | 'OMAKASE_SMOKE' | 'VITEST' | 'NODE_ENV',
      string | undefined
    >
  >,
  fn: () => void,
): void {
  const prev = {
    OMAKASE_MOCK_PROVIDER: process.env.OMAKASE_MOCK_PROVIDER,
    OMAKASE_TEST: process.env.OMAKASE_TEST,
    OMAKASE_SMOKE: process.env.OMAKASE_SMOKE,
    VITEST: process.env.VITEST,
    NODE_ENV: process.env.NODE_ENV,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('provider selection safety', () => {
  const emptySecretStore = {
    setSecret: () => undefined,
    getSecret: () => null,
    deleteSecret: () => undefined,
    hasSecret: () => false,
  };

  it('defaults OpenAI teaching model to gpt-5.6', () => {
    expect(defaultModelForProvider('openai')).toBe(DEFAULT_OPENAI_MODEL_ID);
    expect(DEFAULT_OPENAI_MODEL_ID).toBe('gpt-5.6');
  });

  it('never treats a real OpenAI profile as mock just because model id was missing', () => {
    const p = profile('OpenAI', null);
    const modelId = p.defaultModelId ?? defaultModelForProvider('openai');
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1' }, () => {
      expect(shouldUseMockProvider(p, modelId, { packaged: true })).toBe(false);
      expect(shouldUseMockProvider(p, modelId, { packaged: false })).toBe(false);
    });
  });

  it('requires an explicit local mock profile, not only a mock-* model id', () => {
    const p = profile('OpenAI', 'mock-learn-v1');
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1' }, () => {
      expect(shouldUseMockProvider(p, 'mock-learn-v1', { packaged: false })).toBe(false);
      expect(shouldUseMockProvider(p, 'mock-learn-v1', { packaged: true })).toBe(false);
    });
  });

  it('allows local mock only in unpackaged deterministic test harness mode', () => {
    const mockProfile = profile('Local mock (testing)', 'mock-learn-v1');
    withMockEnv({ OMAKASE_MOCK_PROVIDER: undefined, OMAKASE_TEST: undefined }, () => {
      expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: false })).toBe(false);
    });
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1', OMAKASE_TEST: undefined }, () => {
      expect(isMockProviderRuntimeAllowed({ packaged: false })).toBe(false);
      expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: false })).toBe(false);
    });
    withMockEnv(
      {
        OMAKASE_MOCK_PROVIDER: '1',
        OMAKASE_TEST: '1',
        VITEST: undefined,
        NODE_ENV: undefined,
      },
      () => {
        expect(isMockProviderRuntimeAllowed({ packaged: false })).toBe(false);
        expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: false })).toBe(
          false,
        );
      },
    );
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1', OMAKASE_TEST: '1', VITEST: 'true' }, () => {
      expect(isMockProviderRuntimeAllowed({ packaged: false })).toBe(true);
      expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: false })).toBe(true);
    });
  });

  it('blocks packaged mock outside the smoke harness', () => {
    const mockProfile = profile('Local mock (testing)', 'mock-learn-v1');
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1', OMAKASE_TEST: undefined }, () => {
      expect(isMockProviderRuntimeAllowed({ packaged: true })).toBe(false);
      expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: true })).toBe(false);
    });
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1', OMAKASE_TEST: '1', OMAKASE_SMOKE: '1' }, () => {
      expect(isMockProviderRuntimeAllowed({ packaged: true })).toBe(true);
      expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: true })).toBe(true);
    });
  });

  it('recognizes explicit mock profiles', () => {
    expect(isExplicitMockProfile('Local mock (testing)', 'mock-learn-v1')).toBe(true);
    expect(isExplicitMockProfile('OpenAI', 'mock-learn-v1')).toBe(false);
    expect(isExplicitMockProfile('OpenAI', 'gpt-5.6')).toBe(false);
  });

  it('fails clearly if a saved mock profile is used outside test mode', () => {
    const mockProfile = profile('Local mock (testing)', 'mock-learn-v1');
    withMockEnv({ OMAKASE_MOCK_PROVIDER: '1', OMAKASE_TEST: undefined }, () => {
      expect(() =>
        createLanguageModel(
          { profile: mockProfile, modelId: 'mock-learn-v1', apiKey: 'mock-key' },
          emptySecretStore,
        ),
      ).toThrow(/disabled outside deterministic test runs/i);
    });
  });
});
