import { z } from 'zod';
import { EpochMillisSchema } from './common.js';
import { UuidV7Schema } from './ids.js';

export const NextActionSchema = z.object({
  id: UuidV7Schema,
  studioId: UuidV7Schema.nullable(),
  studioName: z.string().nullable().optional(),
  actionType: z.enum([
    'read_source_section',
    'complete_probe',
    'answer_application',
    'compare_sources',
    'revisit_prerequisite',
    'conduct_research',
    'add_source',
    'review_concept',
  ]),
  sourceId: UuidV7Schema.nullable(),
  sourceBlockId: z.number().int().positive().nullable(),
  conceptId: UuidV7Schema.nullable(),
  title: z.string(),
  rationale: z.string(),
  priority: z.number().int(),
  isPrimary: z.boolean(),
  status: z.enum(['active', 'completed', 'dismissed', 'superseded']),
  dueAt: EpochMillisSchema.nullable(),
  createdAt: EpochMillisSchema,
});
export type NextAction = z.infer<typeof NextActionSchema>;

export const TodayViewSchema = z.object({
  primary: NextActionSchema.nullable(),
  secondary: z.array(NextActionSchema).max(2),
});
export type TodayView = z.infer<typeof TodayViewSchema>;
