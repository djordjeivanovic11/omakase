import type { ConnectionTestResult } from '@omakase/contracts';
import { generateText } from 'ai';
import type Database from 'better-sqlite3';
import type { SecretStore } from '../storage/secrets.js';
import { ProviderRepo } from './provider-repo.js';
import { createLanguageModel, shouldUseMockProvider } from './registry.js';

const MOCK_CAPABILITIES = {
  webSearch: false,
  vision: false,
  files: false,
  transcription: false,
  structuredOutput: true,
};

export async function testProviderConnection(
  db: Database.Database,
  secretStore: SecretStore,
  profileId: string,
  modelId?: string,
): Promise<ConnectionTestResult> {
  const repo = new ProviderRepo(db, secretStore);
  const profile = repo.getProfile(profileId);
  if (!profile) {
    return {
      ok: false,
      provider: 'openai',
      errorCode: 'profile_not_found',
      errorMessage: 'Provider profile not found',
    };
  }

  const resolvedModelId = modelId ?? profile.defaultModelId ?? 'gpt-4o-mini';
  const started = Date.now();

  if (shouldUseMockProvider(profile, resolvedModelId)) {
    repo.updateProfile(profileId, { lastVerification: 'ok', lastErrorCode: null });
    return {
      ok: true,
      provider: profile.provider,
      modelId: resolvedModelId,
      capabilities: MOCK_CAPABILITIES,
      latencyMs: Date.now() - started,
    };
  }

  const apiKey = repo.getApiKey(profileId);
  if (!apiKey) {
    repo.updateProfile(profileId, {
      lastVerification: 'failed',
      lastErrorCode: 'missing_api_key',
    });
    return {
      ok: false,
      provider: profile.provider,
      modelId: resolvedModelId,
      errorCode: 'missing_api_key',
      errorMessage: 'API key not configured',
    };
  }

  try {
    const model = createLanguageModel({ profile, modelId: resolvedModelId, apiKey }, secretStore);
    await generateText({
      model,
      prompt: 'Reply with exactly: ok',
      maxOutputTokens: 16,
    });

    repo.updateProfile(profileId, { lastVerification: 'ok', lastErrorCode: null });
    return {
      ok: true,
      provider: profile.provider,
      modelId: resolvedModelId,
      capabilities: profile.capabilities,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    repo.updateProfile(profileId, {
      lastVerification: 'failed',
      lastErrorCode: 'connection_failed',
    });
    return {
      ok: false,
      provider: profile.provider,
      modelId: resolvedModelId,
      errorCode: 'connection_failed',
      errorMessage: message,
      latencyMs: Date.now() - started,
    };
  }
}
