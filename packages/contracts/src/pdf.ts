import { z } from 'zod';
import { UuidV7Schema } from './ids.js';

export const CoordinateOriginSchema = z.enum(['TOP_LEFT', 'BOTTOM_LEFT']);
export type CoordinateOrigin = z.infer<typeof CoordinateOriginSchema>;

export const NormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;

export const PdfQuadSchema = z.object({
  topLeft: NormalizedPointSchema,
  topRight: NormalizedPointSchema,
  bottomRight: NormalizedPointSchema,
  bottomLeft: NormalizedPointSchema,
});
export type PdfQuad = z.infer<typeof PdfQuadSchema>;

export const NormalizedBoundingBoxSchema = z.object({
  left: z.number().min(0).max(1),
  top: z.number().min(0).max(1),
  right: z.number().min(0).max(1),
  bottom: z.number().min(0).max(1),
});
export type NormalizedBoundingBox = z.infer<typeof NormalizedBoundingBoxSchema>;

export const DocumentAtomKindSchema = z.enum([
  'title',
  'heading',
  'paragraph',
  'list_item',
  'caption',
  'formula',
  'table',
  'table_cell',
  'figure',
  'footnote',
  'header',
  'footer',
  'unknown',
]);
export type DocumentAtomKind = z.infer<typeof DocumentAtomKindSchema>;

export const DocumentAtomSchema = z.object({
  id: UuidV7Schema,
  sourceVersionId: UuidV7Schema,
  pageNumber: z.number().int().positive(),
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
  readingOrder: z.number().int().nonnegative(),
  kind: DocumentAtomKindSchema,
  text: z.string(),
  normalizedText: z.string(),
  quads: z.array(PdfQuadSchema),
  boundingBox: NormalizedBoundingBoxSchema,
  sectionPath: z.array(z.string()),
  characterStart: z.number().int().nonnegative().optional(),
  characterEnd: z.number().int().nonnegative().optional(),
  extractionMethod: z.enum(['native_pdf', 'ocr']),
  parserName: z.string().min(1),
  parserVersion: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});
export type DocumentAtom = z.infer<typeof DocumentAtomSchema>;

export const RetrievalChunkSchema = z.object({
  id: UuidV7Schema,
  sourceVersionId: UuidV7Schema,
  text: z.string(),
  atomIds: z.array(UuidV7Schema),
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  sectionPath: z.array(z.string()),
  embeddingModel: z.string().min(1),
  embeddingVersion: z.string().min(1),
});
export type RetrievalChunk = z.infer<typeof RetrievalChunkSchema>;

export const EvidenceRelationshipSchema = z.enum([
  'supports',
  'defines',
  'example',
  'extends',
  'contrasts',
  'contradicts',
  'context',
]);
export type EvidenceRelationship = z.infer<typeof EvidenceRelationshipSchema>;

export const EvidenceReferenceSchema = z.object({
  id: UuidV7Schema,
  sourceVersionId: UuidV7Schema,
  sourceBlockId: z.number().int().positive().optional(),
  chunkId: z.number().int().positive().optional(),
  atomIds: z.array(UuidV7Schema),
  pageNumber: z.number().int().positive().optional(),
  quads: z.array(PdfQuadSchema),
  exactQuote: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  characterStart: z.number().int().nonnegative().optional(),
  characterEnd: z.number().int().nonnegative().optional(),
  sectionPath: z.array(z.string()),
  relationship: EvidenceRelationshipSchema,
  anchoringConfidence: z.number().min(0).max(1).optional(),
});
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
