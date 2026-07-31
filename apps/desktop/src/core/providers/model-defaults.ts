/**
 * Visible OpenAI teaching presets. Model IDs are API aliases.
 * Sol (`gpt-5.6`) = Best teaching; Terra = lower-cost balanced.
 */

export const OPENAI_TEACHING_PRESETS = [
  {
    id: 'best',
    label: 'Best teaching',
    detail: 'GPT-5.6 Sol · Medium reasoning',
    modelId: 'gpt-5.6',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    detail: 'GPT-5.6 Terra · Medium reasoning',
    modelId: 'gpt-5.6-terra',
  },
] as const;

export type OpenAiTeachingPresetId = (typeof OPENAI_TEACHING_PRESETS)[number]['id'];

export const DEFAULT_OPENAI_MODEL_ID = OPENAI_TEACHING_PRESETS[0].modelId;
export const DEFAULT_ANTHROPIC_MODEL_ID = 'claude-sonnet-4-5';
export const DEFAULT_OPENROUTER_MODEL_ID = 'openai/gpt-5.6';

export function defaultModelForProvider(
  provider: 'openai' | 'anthropic' | 'openrouter' | string,
): string {
  switch (provider) {
    case 'openai':
      return DEFAULT_OPENAI_MODEL_ID;
    case 'anthropic':
      return DEFAULT_ANTHROPIC_MODEL_ID;
    case 'openrouter':
      return DEFAULT_OPENROUTER_MODEL_ID;
    default:
      return DEFAULT_OPENAI_MODEL_ID;
  }
}

export function isMockModelId(modelId: string | null | undefined): boolean {
  return Boolean(modelId?.startsWith('mock-'));
}

/** True only for the explicit local test profile, never for a mock model id alone. */
export function isExplicitMockProfile(
  displayName: string,
  modelId: string | null | undefined,
): boolean {
  const name = displayName.toLowerCase();
  const explicitName = name === 'mock' || name.includes('local mock');
  return explicitName && (!modelId || isMockModelId(modelId));
}

export function isPackagedRuntime(options?: { packaged?: boolean }): boolean {
  return options?.packaged ?? process.env.OMAKASE_PACKAGED === '1';
}

export function isMockProviderRuntimeAllowed(options?: { packaged?: boolean }): boolean {
  if (process.env.OMAKASE_MOCK_PROVIDER !== '1') return false;
  if (process.env.OMAKASE_TEST !== '1') return false;
  if (!isPackagedRuntime(options)) return true;

  // Packaged mock runs are only for the deterministic smoke harness. A normal
  // packaged app, even with OMAKASE_MOCK_PROVIDER accidentally present, cannot
  // create or route through the test provider.
  return process.env.OMAKASE_TEST === '1' && process.env.OMAKASE_SMOKE === '1';
}

export function openaiResponsesProviderOptions(): {
  store: false;
  reasoningEffort: 'medium';
  include: ['reasoning.encrypted_content'];
} {
  return {
    store: false,
    reasoningEffort: 'medium',
    include: ['reasoning.encrypted_content'],
  };
}
