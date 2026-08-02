import { NativeMessageSchema } from '@omakase/contracts';
import { describe, expect, it } from 'vitest';
import { newId, nowMs } from '../../src/core/storage/ids.js';
import type { AppContext } from '../../src/main/app-context.js';
import { handleNativeMessage } from '../../src/main/native-host.js';
import { createTestContext } from '../helpers/test-db.js';

describe('native capture status', () => {
  it('reports pending before desktop ingestion and the persisted terminal state after it runs', async () => {
    const test = createTestContext();
    try {
      const extensionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const externalRequestId = newId();
      const request = NativeMessageSchema.parse({
        type: 'capture_status',
        requestId: newId(),
        extensionId,
        payload: { externalRequestId },
      });
      const context = {
        db: { db: test.db },
      } as unknown as AppContext;

      const before = await handleNativeMessage(context, request);
      expect(before).toMatchObject({ ok: true, payload: { status: 'pending' } });

      test.db
        .prepare(
          `INSERT INTO capture_requests (
            id, external_request_id, extension_id, browser, payload_json, status, received_at
          ) VALUES (?, ?, ?, 'chrome', '{}', 'imported', ?)`,
        )
        .run(newId(), externalRequestId, extensionId, nowMs());

      const after = await handleNativeMessage(context, request);
      expect(after).toMatchObject({ ok: true, payload: { status: 'imported' } });
    } finally {
      test.cleanup();
    }
  });
});
