import { z } from 'zod';
import { EpochMillisSchema } from './common.js';
import { UuidV7Schema } from './ids.js';
import { BrowserCapturePayloadSchema } from './sources.js';

export const NativeMessageTypeSchema = z.enum([
  'ping',
  'pong',
  'list_studios',
  'capture',
  'capture_status',
  'capture_ack',
  'error',
]);

export const NativeMessageSchema = z.object({
  protocolVersion: z.literal(1).default(1),
  type: NativeMessageTypeSchema,
  requestId: UuidV7Schema,
  timestamp: EpochMillisSchema.default(() => Date.now()),
  idempotencyKey: UuidV7Schema.optional(),
  extensionId: z
    .string()
    .regex(/^[a-p]{32}$/)
    .optional(),
  payload: z.unknown().optional(),
});
export type NativeMessage = z.infer<typeof NativeMessageSchema>;

export const CaptureNativePayloadSchema = BrowserCapturePayloadSchema;
export type CaptureNativePayload = z.infer<typeof CaptureNativePayloadSchema>;

export const CaptureStatusPayloadSchema = z.object({
  externalRequestId: UuidV7Schema,
});
export type CaptureStatusPayload = z.infer<typeof CaptureStatusPayloadSchema>;

/** Max native-messaging payload size (bytes) before chunking. */
export const NATIVE_MESSAGE_MAX_BYTES = 512_000;
