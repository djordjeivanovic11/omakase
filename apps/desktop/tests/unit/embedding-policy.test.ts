import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRuntimeEmbeddingService,
  HashEmbeddingService,
  LocalEmbeddingService,
} from '../../src/core/retrieval/embeddings.js';

describe('runtime embedding policy', () => {
  it('uses hash embeddings only for explicit test mode', () => {
    const service = createRuntimeEmbeddingService({
      modelsDir: '/missing-models',
      testMode: true,
    });

    expect(service).toBeInstanceOf(HashEmbeddingService);
  });

  it('does not fall back to hash embeddings when production model files are missing', () => {
    const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-missing-model-'));
    try {
      const service = createRuntimeEmbeddingService({ modelsDir });

      expect(service).toBeInstanceOf(LocalEmbeddingService);
      expect((service as LocalEmbeddingService).isAvailable()).toBe(false);
    } finally {
      fs.rmSync(modelsDir, { recursive: true, force: true });
    }
  });
});
