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

/** True only for explicit mock profiles / model ids (never a silent fallback). */
export function isExplicitMockProfile(displayName: string, modelId: string | null | undefined): boolean {
  const name = displayName.toLowerCase();
  if (name === 'mock' || name.includes('local mock')) return true;
  if (modelId && modelId.startsWith('mock-')) return true;
  return false;
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
