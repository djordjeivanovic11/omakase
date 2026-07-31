import { z } from 'zod';
import {
  EpochMillisSchema,
  LifecycleStatusSchema,
  ProcessingStatusSchema,
  SourceKindSchema,
} from './common.js';
import { Sha256HexSchema, UuidV7Schema } from './ids.js';
import { StudioSourceRoleSchema } from './studios.js';

export const SourceBlockKindSchema = z.enum([
  'heading',
  'paragraph',
  'list',
  'code',
  'equation',
  'table',
  'caption',
  'quote',
  'transcript',
  'note',
]);
export type SourceBlockKind = z.infer<typeof SourceBlockKindSchema>;

export const LocatorSchema = z.object({
  kind: z.enum(['page', 'section', 'paragraph', 'timestamp', 'char_range', 'web']),
  page: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  headingPath: z.array(z.string()).optional(),
  timeStartMs: z.number().int().nonnegative().optional(),
  timeEndMs: z.number().int().nonnegative().optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().nonnegative().optional(),
  url: z.string().url().optional(),
  anchor: z.string().optional(),
});
export type Locator = z.infer<typeof LocatorSchema>;

export const SourceSchema = z.object({
  id: UuidV7Schema,
  kind: SourceKindSchema,
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  originalUrl: z.string().nullable(),
  language: z.string().nullable(),
  publishedAt: EpochMillisSchema.nullable(),
  lifecycleStatus: LifecycleStatusSchema,
  processingStatus: ProcessingStatusSchema,
  processingErrorCode: z.string().nullable(),
  processingError: z.string().nullable(),
  metadata: z.record(z.unknown()),
  capturedAt: EpochMillisSchema.nullable(),
  createdAt: EpochMillisSchema,
  updatedAt: EpochMillisSchema,
  deletedAt: EpochMillisSchema.nullable(),
  activeVersionId: UuidV7Schema.nullable().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const SourceBlockSchema = z.object({
  id: z.number().int().positive(),
  publicId: UuidV7Schema,
  sourceVersionId: UuidV7Schema,
  ordinal: z.number().int().nonnegative(),
  kind: SourceBlockKindSchema,
  text: z.string(),
  headingPath: z.array(z.string()),
  headingPathText: z.string(),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  timeStartMs: z.number().int().nonnegative().nullable(),
  timeEndMs: z.number().int().nonnegative().nullable(),
  locator: LocatorSchema,
  contentHash: Sha256HexSchema,
  tokenEstimate: z.number().int().nonnegative(),
});
export type SourceBlock = z.infer<typeof SourceBlockSchema>;

export const ImportTextSourceInputSchema = z.object({
  title: z.string().min(1).max(500),
  text: z.string().min(1).max(2_000_000),
  kind: z.enum(['text', 'markdown', 'note']).default('text'),
  studioId: UuidV7Schema.optional(),
  role: StudioSourceRoleSchema.optional(),
  lifecycleStatus: LifecycleStatusSchema.default('inbox'),
});
export type ImportTextSourceInput = z.input<typeof ImportTextSourceInputSchema>;

export const ImportPdfSourceInputSchema = z.object({
  absolutePath: z.string().min(1),
  title: z.string().min(1).max(500).optional(),
  studioId: UuidV7Schema.optional(),
  role: StudioSourceRoleSchema.optional(),
  lifecycleStatus: LifecycleStatusSchema.default('inbox'),
});
export type ImportPdfSourceInput = z.input<typeof ImportPdfSourceInputSchema>;

export const ImportTranscriptSourceInputSchema = z
  .object({
    absolutePath: z.string().min(1).optional(),
    text: z.string().min(1).max(5_000_000).optional(),
    title: z.string().min(1).max(500).optional(),
    studioId: UuidV7Schema.optional(),
    role: StudioSourceRoleSchema.optional(),
    lifecycleStatus: LifecycleStatusSchema.default('inbox'),
  })
  .refine((value) => Boolean(value.absolutePath) !== Boolean(value.text), {
    message: 'Provide either a transcript file or pasted transcript text, not both.',
  });
export type ImportTranscriptSourceInput = z.input<typeof ImportTranscriptSourceInputSchema>;

export const ImportUrlSourceInputSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(500).optional(),
  studioId: UuidV7Schema.optional(),
  role: StudioSourceRoleSchema.optional(),
  lifecycleStatus: LifecycleStatusSchema.default('inbox'),
});
export type ImportUrlSourceInput = z.input<typeof ImportUrlSourceInputSchema>;

export const BrowserCapturePayloadSchema = z.object({
  externalRequestId: UuidV7Schema,
  url: z.string().url(),
  finalUrl: z.string().url().optional(),
  title: z.string().min(1).max(1000),
  author: z.string().max(500).optional(),
  publishedAt: EpochMillisSchema.optional(),
  markdown: z.string().min(1).max(5_000_000),
  selection: z.string().max(100_000).optional(),
  userNote: z.string().max(20_000).optional(),
  destination: z.enum(['inbox', 'studio']).default('inbox'),
  studioId: UuidV7Schema.optional(),
  contentHash: Sha256HexSchema.optional(),
});
export type BrowserCapturePayload = z.infer<typeof BrowserCapturePayloadSchema>;

export const AssignSourceToStudioInputSchema = z.object({
  sourceId: UuidV7Schema,
  studioId: UuidV7Schema,
  role: StudioSourceRoleSchema.default('reference'),
});
export type AssignSourceToStudioInput = z.infer<typeof AssignSourceToStudioInputSchema>;
