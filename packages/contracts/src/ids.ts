import { z } from 'zod';

/** Public application IDs are UUIDv7 strings. */
export const UuidV7Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Expected UUIDv7',
  );

export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/i, 'Expected SHA-256 hex');

export type UuidV7 = z.infer<typeof UuidV7Schema>;
export type Sha256Hex = z.infer<typeof Sha256HexSchema>;
