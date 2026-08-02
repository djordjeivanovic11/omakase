import { z } from 'zod';
import { EpochMillisSchema } from './common.js';
import { Sha256HexSchema, UuidV7Schema } from './ids.js';

export const SourceScopeKindSchema = z.enum([
  'source',
  'selection',
  'collection',
  'studio',
  'concept',
]);
export type SourceScopeKind = z.infer<typeof SourceScopeKindSchema>;

export const SourceScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('source'), sourceId: UuidV7Schema }),
  z.object({ kind: z.literal('selection'), sourceIds: z.array(UuidV7Schema).min(1).max(100) }),
  z.object({ kind: z.literal('collection'), collectionId: UuidV7Schema }),
  z.object({ kind: z.literal('studio'), studioId: UuidV7Schema }),
  z.object({ kind: z.literal('concept'), conceptId: UuidV7Schema }),
]);
export type SourceScope = z.infer<typeof SourceScopeSchema>;

export const ResolvedSourceScopeSchema = z.object({
  scope: SourceScopeSchema,
  sourceIds: z.array(UuidV7Schema).max(1000),
  sourceVersionIds: z.array(UuidV7Schema).max(1000),
  resolvedAt: EpochMillisSchema,
  scopeHash: Sha256HexSchema,
});
export type ResolvedSourceScope = z.infer<typeof ResolvedSourceScopeSchema>;

export const CollectionSchema = z.object({
  id: UuidV7Schema,
  studioId: UuidV7Schema,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable(),
  position: z.number().int(),
  sourceCount: z.number().int().nonnegative(),
  createdAt: EpochMillisSchema,
  updatedAt: EpochMillisSchema,
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CreateCollectionInputSchema = z.object({
  studioId: UuidV7Schema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  position: z.number().int().optional(),
});
export type CreateCollectionInput = z.infer<typeof CreateCollectionInputSchema>;

export const UpdateCollectionInputSchema = z.object({
  id: UuidV7Schema,
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  position: z.number().int().optional(),
});
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionInputSchema>;

export const CollectionMembershipInputSchema = z.object({
  collectionId: UuidV7Schema,
  sourceId: UuidV7Schema,
  position: z.number().int().nonnegative().optional(),
});
export type CollectionMembershipInput = z.infer<typeof CollectionMembershipInputSchema>;
