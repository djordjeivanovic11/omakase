import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderKind, ProviderProfile } from '@omakase/contracts';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import type { SecretStore } from '../storage/secrets.js';
import { createOmakaseMockModel, isMockModelSelection } from './mock-model.js';

export interface ProviderModelSelection {
  profile: ProviderProfile;
  modelId: string;
  apiKey: string | null;
}

export function shouldUseMockProvider(profile: ProviderProfile, modelId: string): boolean {
  const name = profile.displayName.toLowerCase();
  return (
    process.env.OMAKASE_MOCK_PROVIDER === '1' ||
    name === 'mock' ||
    name.includes('local mock') ||
    isMockModelSelection(modelId)
  );
}

export function createLanguageModel(
  selection: ProviderModelSelection,
  secretStore: SecretStore,
  options?: { mode?: 'learn' | 'research' | 'probe' },
): LanguageModel {
  const { profile, modelId } = selection;

  if (shouldUseMockProvider(profile, modelId)) {
    return createOmakaseMockModel({
      modelId,
      mode: options?.mode ?? 'learn',
    });
  }

  const apiKey =
    selection.apiKey ?? (profile.id ? secretStore.getSecret(`provider:${profile.id}`) : null);
  if (!apiKey) {
    throw new Error(`Missing API key for provider profile ${profile.id}`);
  }

  switch (profile.provider as ProviderKind) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey,
        baseURL: profile.baseUrl ?? undefined,
      });
      return openai(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: profile.baseUrl ?? undefined,
      });
      return anthropic(modelId);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey,
        baseURL: profile.baseUrl ?? undefined,
      });
      return openrouter(modelId);
    }
    default:
      throw new Error(`Unsupported provider: ${profile.provider}`);
  }
}
