import { z } from 'zod';
import { EpochMillisSchema, ProviderKindSchema } from './common.js';
import { UuidV7Schema } from './ids.js';

export const ProviderCapabilitiesSchema = z.object({
  webSearch: z.boolean().default(false),
  vision: z.boolean().default(false),
  files: z.boolean().default(false),
  transcription: z.boolean().default(false),
  structuredOutput: z.boolean().default(true),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const ProviderProfileSchema = z.object({
  id: UuidV7Schema,
  provider: ProviderKindSchema,
  displayName: z.string().min(1).max(200),
  baseUrl: z.string().url().nullable(),
  defaultModelId: z.string().nullable(),
  capabilities: ProviderCapabilitiesSchema,
  enabled: z.boolean(),
  lastVerifiedAt: EpochMillisSchema.nullable(),
  lastVerification: z.enum(['ok', 'failed']).nullable(),
  lastErrorCode: z.string().nullable(),
  /** Masked key suffix only — never the full key. */
  keySuffix: z.string().nullable(),
  createdAt: EpochMillisSchema,
  updatedAt: EpochMillisSchema,
});
export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;

export const CreateProviderProfileInputSchema = z.object({
  provider: ProviderKindSchema,
  displayName: z.string().min(1).max(200).optional(),
  apiKey: z.string().min(1).max(5000),
  baseUrl: z.string().url().optional(),
  defaultModelId: z.string().min(1).max(200).optional(),
});
export type CreateProviderProfileInput = z.infer<typeof CreateProviderProfileInputSchema>;

export const ProviderModelSchema = z.object({
  providerProfileId: UuidV7Schema,
  modelId: z.string(),
  displayName: z.string().nullable(),
  capabilities: ProviderCapabilitiesSchema,
  active: z.boolean(),
});
export type ProviderModel = z.infer<typeof ProviderModelSchema>;

export const ConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  provider: ProviderKindSchema,
  modelId: z.string().optional(),
  capabilities: ProviderCapabilitiesSchema.optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;
