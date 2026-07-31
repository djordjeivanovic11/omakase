import { z } from 'zod';
import {
  EpochMillisSchema,
  PreferredDepthSchema,
  StudioStatusSchema,
  TeachingStyleSchema,
} from './common.js';
import { UuidV7Schema } from './ids.js';

export const StudioSchema = z.object({
  id: UuidV7Schema,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable(),
  primaryObjective: z.string().max(4000).nullable(),
  preferredDepth: PreferredDepthSchema.nullable(),
  teachingStyle: TeachingStyleSchema,
  status: StudioStatusSchema,
  sortOrder: z.number().int(),
  createdAt: EpochMillisSchema,
  updatedAt: EpochMillisSchema,
  archivedAt: EpochMillisSchema.nullable(),
});
export type Studio = z.infer<typeof StudioSchema>;

export const CreateStudioInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  primaryObjective: z.string().max(4000).optional(),
  preferredDepth: PreferredDepthSchema.optional(),
  teachingStyle: TeachingStyleSchema.optional(),
  fromNaturalLanguage: z.string().max(4000).optional(),
});
export type CreateStudioInput = z.infer<typeof CreateStudioInputSchema>;

export const UpdateStudioInputSchema = z.object({
  id: UuidV7Schema,
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  primaryObjective: z.string().max(4000).nullable().optional(),
  preferredDepth: PreferredDepthSchema.nullable().optional(),
  teachingStyle: TeachingStyleSchema.optional(),
  status: StudioStatusSchema.optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateStudioInput = z.infer<typeof UpdateStudioInputSchema>;

export const StudioGoalSchema = z.object({
  id: UuidV7Schema,
  studioId: UuidV7Schema,
  statement: z.string().min(1).max(4000),
  priority: z.number().int(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  isPrimary: z.boolean(),
  targetAt: EpochMillisSchema.nullable(),
  createdAt: EpochMillisSchema,
  updatedAt: EpochMillisSchema,
});
export type StudioGoal = z.infer<typeof StudioGoalSchema>;

export const StudioSourceRoleSchema = z.enum([
  'foundation',
  'current_frontier',
  'explanation',
  'implementation',
  'criticism',
  'reference',
  'exercise',
  'user_note',
]);
export type StudioSourceRole = z.infer<typeof StudioSourceRoleSchema>;
