import type { NativeMessage } from '@omakase/contracts';
import { uuidv7 } from 'uuidv7';
import { MAX_QUEUE_ATTEMPTS, QUEUE_STORAGE_KEY } from './constants';
import { buildCaptureMessage, type NativeSendResult, sendNativeMessage } from './native';

export interface QueuedCapture {
  id: string;
  enqueuedAt: number;
  message: NativeMessage;
  attempts: number;
  lastError?: string;
}

async function readQueue(): Promise<QueuedCapture[]> {
  const stored = await browser.storage.local.get(QUEUE_STORAGE_KEY);
  const value = stored[QUEUE_STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value as QueuedCapture[];
}

async function writeQueue(items: QueuedCapture[]): Promise<void> {
  await browser.storage.local.set({ [QUEUE_STORAGE_KEY]: items });
}

export async function getQueueLength(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function enqueueCapture(payload: unknown): Promise<QueuedCapture> {
  const message = buildCaptureMessage(payload);
  const item: QueuedCapture = {
    id: uuidv7(),
    enqueuedAt: Date.now(),
    message,
    attempts: 0,
  };
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function flushQueue(): Promise<{ sent: number; failed: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return { sent: 0, failed: 0, remaining: 0 };
  }

  const remaining: QueuedCapture[] = [];
  let sent = 0;
  let failed = 0;

  for (const item of queue) {
    let result: NativeSendResult;
    try {
      result = await sendNativeMessage(item.message);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : 'native_send_failed',
      };
    }

    if (result.ok) {
      sent += 1;
      continue;
    }

    failed += 1;
    const attempts = item.attempts + 1;
    if (attempts >= MAX_QUEUE_ATTEMPTS) {
      continue;
    }
    remaining.push({
      ...item,
      attempts,
      lastError: result.error,
    });
  }

  await writeQueue(remaining);
  return { sent, failed, remaining: remaining.length };
}
