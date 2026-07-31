import { z } from 'zod';

export const ProviderKindSchema = z.enum(['openai', 'anthropic', 'openrouter']);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const StudioStatusSchema = z.enum(['active', 'paused', 'completed', 'archived']);
export type StudioStatus = z.infer<typeof StudioStatusSchema>;

export const TeachingStyleSchema = z.enum([
  'direct',
  'socratic',
  'paper_companion',
  'implementation_focused',
  'overview_first',
  'technical_deep_dive',
]);
export type TeachingStyle = z.infer<typeof TeachingStyleSchema>;

export const PreferredDepthSchema = z.enum([
  'overview',
  'practical',
  'technical',
  'research',
  'expert',
]);
export type PreferredDepth = z.infer<typeof PreferredDepthSchema>;

export const SourceKindSchema = z.enum([
  'pdf',
  'web',
  'markdown',
  'text',
  'transcript',
  'audio',
  'video',
  'note',
  'repository',
  'other',
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const LifecycleStatusSchema = z.enum(['inbox', 'active', 'archived', 'deleted']);
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

export const ProcessingStatusSchema = z.enum([
  'queued',
  'acquiring',
  'extracting',
  'quality_check',
  'normalizing',
  'structuring',
  'blocking',
  'indexing_lexical',
  'embedding',
  'ready',
  'needs_attention',
  'failed',
  'cancelled',
]);
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

export const AgentModeSchema = z.enum(['onboarding', 'learn', 'research', 'probe', 'triage']);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const MasteryLevelSchema = z.enum([
  'unassessed',
  'encountered',
  'can_explain',
  'can_apply',
  'can_compare_or_critique',
]);
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>;

export const DemonstratedLevelSchema = z.enum([
  'encountered',
  'can_explain',
  'can_apply',
  'can_compare_or_critique',
]);
export type DemonstratedLevel = z.infer<typeof DemonstratedLevelSchema>;

export const EpochMillisSchema = z.number().int().nonnegative();
export type EpochMillis = z.infer<typeof EpochMillisSchema>;

export const ResultOkSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
  });

export const ResultErrSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
