import { z } from 'zod';
import { UuidV7Schema } from './ids.js';
import { BrowserCapturePayloadSchema } from './sources.js';

export const NativeMessageTypeSchema = z.enum([
  'ping',
  'pong',
  'list_studios',
  'capture',
  'capture_ack',
  'error',
]);

export const NativeMessageSchema = z.object({
  type: NativeMessageTypeSchema,
  requestId: UuidV7Schema,
  payload: z.unknown().optional(),
});
export type NativeMessage = z.infer<typeof NativeMessageSchema>;

export const CaptureNativePayloadSchema = BrowserCapturePayloadSchema;
export type CaptureNativePayload = z.infer<typeof CaptureNativePayloadSchema>;

/** Max native-messaging payload size (bytes) before chunking. */
export const NATIVE_MESSAGE_MAX_BYTES = 512_000;
