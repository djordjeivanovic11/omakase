import { z } from 'zod';
import { EpochMillisSchema } from './common.js';
import { UuidV7Schema } from './ids.js';

export const AgentEventTypeSchema = z.enum([
  'RUN_STARTED',
  'STEP_STARTED',
  'ACTIVITY_SNAPSHOT',
  'ACTIVITY_DELTA',
  'TOOL_CALL_STARTED',
  'TOOL_CALL_ARGUMENTS',
  'TOOL_CALL_FINISHED',
  'TOOL_RESULT',
  'SOURCE_RETRIEVED',
  'SOURCE_READ',
  'CONCEPT_GRAPH_UPDATED',
  'CITATIONS_CHECKED',
  'STEP_FINISHED',
  'RUN_INTERRUPTED',
  'RUN_FINISHED',
  'RUN_ERROR',
]);
export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const AgentEventStatusSchema = z.enum([
  'started',
  'running',
  'succeeded',
  'warning',
  'failed',
  'cancelled',
]);
export type AgentEventStatus = z.infer<typeof AgentEventStatusSchema>;

export const AgentEventSchema = z.object({
  id: UuidV7Schema,
  runId: UuidV7Schema,
  sequence: z.number().int().nonnegative(),
  parentStepId: UuidV7Schema.nullable(),
  type: AgentEventTypeSchema,
  status: AgentEventStatusSchema,
  summary: z.string().trim().min(1).max(500),
  toolName: z.string().max(200).nullable(),
  sourceRefs: z.array(UuidV7Schema),
  details: z.record(z.unknown()),
  durationMs: z.number().int().nonnegative().nullable(),
  visibility: z.enum(['user', 'debug']),
  createdAt: EpochMillisSchema,
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const AgentRunStatusSchema = z.enum([
  'running',
  'completed',
  'interrupted',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
