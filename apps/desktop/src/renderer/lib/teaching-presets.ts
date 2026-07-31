/** Mirrored in core/providers/model-defaults.ts — keep in sync. */
export const OPENAI_TEACHING_PRESETS = [
  {
    id: 'best' as const,
    label: 'Best teaching',
    detail: 'GPT-5.6 Sol · Medium reasoning',
    modelId: 'gpt-5.6',
  },
  {
    id: 'balanced' as const,
    label: 'Balanced',
    detail: 'GPT-5.6 Terra · Medium reasoning',
    modelId: 'gpt-5.6-terra',
  },
];
