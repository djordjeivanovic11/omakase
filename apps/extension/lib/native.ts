import {
  BrowserCapturePayloadSchema,
  CaptureNativePayloadSchema,
  NATIVE_MESSAGE_MAX_BYTES,
  type NativeMessage,
  NativeMessageSchema,
} from '@omakase/contracts';
import { uuidv7 } from 'uuidv7';
import { type Browser, browser } from 'wxt/browser';
import { NATIVE_HOST_NAME } from './constants';

export class NativeMessagingError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'host_unavailable'
      | 'payload_too_large'
      | 'invalid_payload'
      | 'invalid_response'
      | 'send_failed',
  ) {
    super(message);
    this.name = 'NativeMessagingError';
  }
}

export interface NativeSendResult {
  ok: boolean;
  error?: string;
  response?: unknown;
}

function messageByteLength(message: NativeMessage): number {
  return new TextEncoder().encode(JSON.stringify(message)).byteLength;
}

export function buildCaptureMessage(payload: unknown, requestId = uuidv7()): NativeMessage {
  const validatedPayload = CaptureNativePayloadSchema.parse(payload);
  BrowserCapturePayloadSchema.parse(validatedPayload);
  const message = NativeMessageSchema.parse({
    type: 'capture',
    requestId,
    payload: validatedPayload,
  });
  if (messageByteLength(message) > NATIVE_MESSAGE_MAX_BYTES) {
    throw new NativeMessagingError(
      `Capture exceeds native messaging limit (${NATIVE_MESSAGE_MAX_BYTES} bytes).`,
      'payload_too_large',
    );
  }
  return message;
}

export function buildPingMessage(requestId = uuidv7()): NativeMessage {
  return NativeMessageSchema.parse({
    type: 'ping',
    requestId,
  });
}

export function buildListStudiosMessage(requestId = uuidv7()): NativeMessage {
  return NativeMessageSchema.parse({
    type: 'list_studios',
    requestId,
  });
}

function sendViaPort(
  port: Browser.runtime.Port,
  message: NativeMessage,
): Promise<NativeSendResult> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: 'native_timeout' });
    }, 15_000);

    const onMessage = (response: unknown) => {
      cleanup();
      if (response && typeof response === 'object' && 'ok' in response) {
        const typed = response as { ok: boolean; error?: string; payload?: unknown };
        resolve({
          ok: typed.ok,
          error: typed.error,
          response: typed.payload ?? response,
        });
        return;
      }
      resolve({ ok: true, response });
    };

    const onDisconnect = () => {
      cleanup();
      const err = browser.runtime.lastError?.message ?? 'native_host_disconnected';
      resolve({ ok: false, error: err });
    };

    const cleanup = () => {
      clearTimeout(timeout);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
    };

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);

    try {
      port.postMessage(message);
    } catch (error) {
      cleanup();
      resolve({
        ok: false,
        error: error instanceof Error ? error.message : 'native_send_failed',
      });
    }
  });
}

export async function sendNativeMessage(message: NativeMessage): Promise<NativeSendResult> {
  NativeMessageSchema.parse(message);
  if (messageByteLength(message) > NATIVE_MESSAGE_MAX_BYTES) {
    throw new NativeMessagingError(
      `Message exceeds native messaging limit (${NATIVE_MESSAGE_MAX_BYTES} bytes).`,
      'payload_too_large',
    );
  }

  let port: Browser.runtime.Port;
  try {
    port = browser.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (error) {
    throw new NativeMessagingError(
      error instanceof Error ? error.message : 'Native host unavailable.',
      'host_unavailable',
    );
  }

  const result = await sendViaPort(port, message);
  try {
    port.disconnect();
  } catch {
    // ignore disconnect errors
  }

  if (!result.ok && result.error?.includes('Specified native messaging host not found')) {
    throw new NativeMessagingError(result.error, 'host_unavailable');
  }

  return result;
}

export async function pingNativeHost(): Promise<boolean> {
  try {
    const result = await sendNativeMessage(buildPingMessage());
    return result.ok;
  } catch {
    return false;
  }
}
