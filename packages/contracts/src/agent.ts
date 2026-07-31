import { z } from 'zod';
import { AgentModeSchema } from './common.js';
import { UuidV7Schema } from './ids.js';
import { LearningResponseSchema } from './learning.js';

export const AgentRuntimeContextSchema = z.object({
  mode: AgentModeSchema,
  studioId: UuidV7Schema.optional(),
  sourceIds: z.array(UuidV7Schema).max(50).default([]),
  providerProfileId: UuidV7Schema,
  modelId: z.string().min(1),
  sessionId: UuidV7Schema,
  budgetMicrousd: z.number().int().nonnegative().optional(),
  maxSteps: z.number().int().positive().optional(),
  teachingStyle: z.string().optional(),
});
export type AgentRuntimeContext = z.infer<typeof AgentRuntimeContextSchema>;

export const StartLearnSessionInputSchema = z.object({
  studioId: UuidV7Schema,
  sourceId: UuidV7Schema.optional(),
  objective: z.string().max(4000).optional(),
  mode: z.enum(['learn', 'research']).default('learn'),
});
export type StartLearnSessionInput = z.infer<typeof StartLearnSessionInputSchema>;

export const SendAgentMessageInputSchema = z.object({
  sessionId: UuidV7Schema,
  message: z.string().min(1).max(20_000),
});
export type SendAgentMessageInput = z.infer<typeof SendAgentMessageInputSchema>;

export const AgentStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text-delta'),
    sessionId: UuidV7Schema,
    delta: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    sessionId: UuidV7Schema,
    toolName: z.string(),
    toolCallId: z.string(),
  }),
  z.object({
    type: z.literal('tool-result'),
    sessionId: UuidV7Schema,
    toolName: z.string(),
    toolCallId: z.string(),
    ok: z.boolean(),
  }),
  z.object({
    type: z.literal('citation'),
    sessionId: UuidV7Schema,
    handle: z.string(),
    sourceBlockId: z.number().int().positive(),
    claimSummary: z.string(),
  }),
  z.object({
    type: z.literal('final'),
    sessionId: UuidV7Schema,
    messageId: UuidV7Schema,
    result: LearningResponseSchema,
  }),
  z.object({
    type: z.literal('error'),
    sessionId: UuidV7Schema,
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('cancelled'),
    sessionId: UuidV7Schema,
  }),
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export const SearchLibraryInputSchema = z.object({
  query: z.string().min(1).max(2000),
  studioId: UuidV7Schema,
  sourceIds: z.array(UuidV7Schema).max(50).optional(),
  limit: z.number().int().min(1).max(30).default(12),
});
export type SearchLibraryInput = z.infer<typeof SearchLibraryInputSchema>;
