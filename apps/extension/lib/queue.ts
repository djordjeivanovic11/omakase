import type { NativeMessage } from '@omakase/contracts';
import { uuidv7 } from 'uuidv7';
import { PENDING_CAPTURE_STORAGE_KEY, QUEUE_STORAGE_KEY } from './constants';
import {
  buildCaptureMessage,
  buildCaptureStatusMessage,
  type NativeSendResult,
  sendNativeMessage,
} from './native';

export interface QueuedCapture {
  id: string;
  enqueuedAt: number;
  message: NativeMessage;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: number;
}

export interface PendingCapture {
  id: string;
  submittedAt: number;
  message: NativeMessage;
  attempts: number;
  lastStatus?: string;
  lastError?: string;
  lastCheckedAt?: number;
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

async function readPending(): Promise<PendingCapture[]> {
  const stored = await browser.storage.local.get(PENDING_CAPTURE_STORAGE_KEY);
  const value = stored[PENDING_CAPTURE_STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value as PendingCapture[];
}

async function writePending(items: PendingCapture[]): Promise<void> {
  await browser.storage.local.set({ [PENDING_CAPTURE_STORAGE_KEY]: items });
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

export async function recordPendingCapture(message: NativeMessage): Promise<void> {
  const pending = await readPending();
  if (pending.some((item) => item.message.idempotencyKey === message.idempotencyKey)) return;
  pending.push({ id: uuidv7(), submittedAt: Date.now(), message, attempts: 0 });
  await writePending(pending);
}

export async function getPendingCaptureLength(): Promise<number> {
  return (await readPending()).length;
}

export async function pollPendingCaptures(): Promise<{
  completed: number;
  failed: number;
  remaining: number;
}> {
  const pending = await readPending();
  if (pending.length === 0) return { completed: 0, failed: 0, remaining: 0 };

  const remaining: PendingCapture[] = [];
  let completed = 0;
  let failed = 0;
  for (const item of pending) {
    const externalRequestId = item.message.idempotencyKey;
    if (!externalRequestId) {
      remaining.push(item);
      continue;
    }
    try {
      const result = await sendNativeMessage(buildCaptureStatusMessage(externalRequestId));
      const payload = result.response as { status?: string } | undefined;
      const status = payload?.status ?? 'pending';
      if (status === 'imported') {
        completed += 1;
        continue;
      }
      if (status === 'failed' || status === 'rejected') {
        failed += 1;
        continue;
      }
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastStatus: status,
        lastCheckedAt: Date.now(),
      });
    } catch (error) {
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : 'status_check_failed',
        lastCheckedAt: Date.now(),
      });
    }
  }
  await writePending(remaining);
  return { completed, failed, remaining: remaining.length };
}

export async function flushQueue(): Promise<{ sent: number; failed: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) {
    await pollPendingCaptures();
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
      await recordPendingCapture(item.message);
      continue;
    }

    failed += 1;
    remaining.push({
      ...item,
      attempts: item.attempts + 1,
      lastError: result.error,
      lastAttemptAt: Date.now(),
    });
  }

  await writeQueue(remaining);
  await pollPendingCaptures();
  return { sent, failed, remaining: remaining.length };
}
