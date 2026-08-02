import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EMBEDDING_DIMENSIONS,
  LocalEmbeddingService,
} from '../../src/core/retrieval/embeddings.js';

/**
 * Loading a 428 MB ONNX model is far too slow for the ordinary suite, so the
 * bundled embedding model is checked here instead. Run with `pnpm test:live`.
 */

const modelsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../resources/models',
);
const service = new LocalEmbeddingService({ modelsDir });

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

describe.skipIf(!service.isAvailable())('bundled embedding model', () => {
  it('produces normalized vectors of the expected width', async () => {
    const [vector] = await service.embedBatch(['Gradient descent minimises a loss function.']);
    expect(vector).toBeDefined();
    if (!vector) return;

    expect(vector.length).toBe(EMBEDDING_DIMENSIONS);
    expect(cosine(vector, vector)).toBeCloseTo(1, 3);
  }, 300_000);

  it('places related sentences closer than unrelated ones', async () => {
    const [caching, cachingParaphrase, unrelated] = await service.embedBatch([
      'A write-through cache updates the cache and the database at the same time.',
      'With write-through caching, both the cache and the backing store are written together.',
      'The tomatoes should be planted after the last frost of spring.',
    ]);
    if (!caching || !cachingParaphrase || !unrelated) throw new Error('missing vectors');

    const related = cosine(caching, cachingParaphrase);
    const different = cosine(caching, unrelated);

    expect(related).toBeGreaterThan(different);
    expect(related).toBeGreaterThan(0.7);
  }, 300_000);

  it('matches across languages, which is why the multilingual model is bundled', async () => {
    const [english, german, unrelated] = await service.embedBatch([
      'The cat is sleeping on the sofa.',
      'Die Katze schläft auf dem Sofa.',
      'Quarterly revenue exceeded the forecast by twelve percent.',
    ]);
    if (!english || !german || !unrelated) throw new Error('missing vectors');

    expect(cosine(english, german)).toBeGreaterThan(cosine(english, unrelated));
  }, 300_000);
});
