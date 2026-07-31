import { describe, expect, it } from 'vitest';
import type { ProviderProfile } from '@omakase/contracts';
import {
  DEFAULT_OPENAI_MODEL_ID,
  defaultModelForProvider,
  isExplicitMockProfile,
} from '../../src/core/providers/model-defaults.js';
import { shouldUseMockProvider } from '../../src/core/providers/registry.js';

function profile(
  displayName: string,
  defaultModelId: string | null,
): ProviderProfile {
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

describe('provider selection safety', () => {
  it('defaults OpenAI teaching model to gpt-5.6', () => {
    expect(defaultModelForProvider('openai')).toBe(DEFAULT_OPENAI_MODEL_ID);
    expect(DEFAULT_OPENAI_MODEL_ID).toBe('gpt-5.6');
  });

  it('never treats a real OpenAI profile as mock just because model id was missing', () => {
    const p = profile('OpenAI', null);
    const modelId = p.defaultModelId ?? defaultModelForProvider('openai');
    const prev = process.env.OMAKASE_MOCK_PROVIDER;
    delete process.env.OMAKASE_MOCK_PROVIDER;
    expect(shouldUseMockProvider(p, modelId, { packaged: true })).toBe(false);
    expect(shouldUseMockProvider(p, modelId, { packaged: false })).toBe(false);
    if (prev === undefined) delete process.env.OMAKASE_MOCK_PROVIDER;
    else process.env.OMAKASE_MOCK_PROVIDER = prev;
  });

  it('blocks mock-* model ids in packaged builds unless explicit mock + env', () => {
    const p = profile('OpenAI', 'mock-learn-v1');
    const prev = process.env.OMAKASE_MOCK_PROVIDER;
    delete process.env.OMAKASE_MOCK_PROVIDER;
    expect(shouldUseMockProvider(p, 'mock-learn-v1', { packaged: true })).toBe(false);
    process.env.OMAKASE_MOCK_PROVIDER = '1';
    expect(shouldUseMockProvider(p, 'mock-learn-v1', { packaged: true })).toBe(false);
    const mockProfile = profile('Local mock (testing)', 'mock-learn-v1');
    expect(shouldUseMockProvider(mockProfile, 'mock-learn-v1', { packaged: true })).toBe(true);
    if (prev === undefined) delete process.env.OMAKASE_MOCK_PROVIDER;
    else process.env.OMAKASE_MOCK_PROVIDER = prev;
  });

  it('recognizes explicit mock profiles', () => {
    expect(isExplicitMockProfile('Local mock (testing)', 'mock-learn-v1')).toBe(true);
    expect(isExplicitMockProfile('OpenAI', 'gpt-5.6')).toBe(false);
  });
});
