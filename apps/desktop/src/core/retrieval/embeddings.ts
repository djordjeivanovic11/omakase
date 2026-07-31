import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { sha256Hex } from '../storage/hash.js';
import { float32VectorToBlob } from './vector-index.js';

export const GRANITE_EMBEDDING_MODEL_ID = 'granite-embedding-107m-multilingual';
export const DEFAULT_EMBEDDING_REVISION = 'test';
export const GRANITE_EMBEDDING_REVISION = 'v1';
export const EMBEDDING_DIMENSIONS = 384;
/** Matches the model's sentence_bert_config.json. */
export const EMBEDDING_MAX_TOKENS = 512;

export interface EmbeddingService {
  readonly modelId: string;
  readonly modelRevision: string;
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export function l2Normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i]! * vector[i]!;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    out[i] = vector[i]! / norm;
  }
  return out;
}

/** Deterministic 384-d embedding from text hash for tests and fallback. */
export class HashEmbeddingService implements EmbeddingService {
  readonly modelId = GRANITE_EMBEDDING_MODEL_ID;
  readonly modelRevision: string = DEFAULT_EMBEDDING_REVISION;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  embed(text: string): Promise<Float32Array> {
    return Promise.resolve(this.embedSync(text));
  }

  embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.resolve(texts.map((t) => this.embedSync(t)));
  }

  private embedSync(text: string): Float32Array {
    const vec = new Float32Array(this.dimensions);
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest();
    for (let i = 0; i < this.dimensions; i++) {
      vec[i] = (hash[i % hash.length]! - 128) / 128;
    }
    return l2Normalize(vec);
  }
}

/**
 * Deterministic hash embeddings carry no meaning, so they are only ever a
 * test double. Anything that indexes real learner content must use
 * {@link LocalEmbeddingService}.
 */
export class GraniteEmbeddingService extends HashEmbeddingService {
  override readonly modelRevision: string;

  constructor(revision: string = DEFAULT_EMBEDDING_REVISION) {
    super();
    this.modelRevision = revision;
  }
}

type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: 'cls' | 'mean'; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array | number[] }>;

export interface LocalEmbeddingOptions {
  /** Directory holding `<modelId>/config.json`, `<modelId>/onnx/model.onnx`, … */
  modelsDir: string;
  modelId?: string;
  revision?: string;
}

/**
 * Runs the bundled Granite embedding model locally through ONNX Runtime. The
 * model is loaded on first use because startup should not pay for it, and the
 * pipeline is cached for the life of the process.
 */
export class LocalEmbeddingService implements EmbeddingService {
  readonly modelId: string;
  readonly modelRevision: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private readonly modelsDir: string;
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(options: LocalEmbeddingOptions) {
    this.modelsDir = options.modelsDir;
    this.modelId = options.modelId ?? GRANITE_EMBEDDING_MODEL_ID;
    this.modelRevision = options.revision ?? GRANITE_EMBEDDING_REVISION;
  }

  /** True when the bundled weights are present and usable. */
  isAvailable(): boolean {
    const base = path.join(this.modelsDir, this.modelId);
    return (
      fs.existsSync(path.join(base, 'config.json')) &&
      fs.existsSync(path.join(base, 'onnx', 'model.onnx'))
    );
  }

  async embed(text: string): Promise<Float32Array> {
    const [vector] = await this.embedBatch([text]);
    if (!vector) throw new Error('Embedding model returned no vector');
    return vector;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    const extract = await this.load();
    const output = await extract(
      texts.map((text) => text.trim() || ' '),
      { pooling: 'cls', normalize: true },
    );

    const width = output.dims[output.dims.length - 1] ?? this.dimensions;
    if (width !== this.dimensions) {
      throw new Error(`Embedding model returned ${width} dimensions, expected ${this.dimensions}`);
    }

    const flat = output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
    return texts.map((_, index) => {
      const start = index * width;
      return l2Normalize(flat.slice(start, start + width));
    });
  }

  private load(): Promise<FeatureExtractionPipeline> {
    if (this.pipelinePromise) return this.pipelinePromise;

    this.pipelinePromise = (async () => {
      if (!this.isAvailable()) {
        throw new Error(
          `Embedding model "${this.modelId}" is missing from ${this.modelsDir}. ` +
            'Run "pnpm --filter @omakase/desktop fetch:model".',
        );
      }

      const { env, pipeline } = await import('@huggingface/transformers');
      // Everything stays on this machine: no hub lookups, no cache downloads.
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = this.modelsDir;

      return (await pipeline('feature-extraction', this.modelId, {
        local_files_only: true,
        dtype: 'fp32',
      })) as unknown as FeatureExtractionPipeline;
    })();

    return this.pipelinePromise;
  }
}

export class EmbeddingsRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly service: EmbeddingService,
  ) {}

  async ensureEmbedding(sourceBlockId: number, text: string): Promise<void> {
    const inputHash = sha256Hex(text);
    const existing = this.db
      .prepare(
        `SELECT id FROM embeddings
         WHERE source_block_id = ? AND model_id = ? AND model_revision = ?`,
      )
      .get(sourceBlockId, this.service.modelId, this.service.modelRevision);
    if (existing) return;

    const vector = await this.service.embed(text);
    this.db
      .prepare(
        `INSERT INTO embeddings (
          source_block_id, model_id, model_revision, dimensions,
          normalized, vector, input_hash
        ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        sourceBlockId,
        this.service.modelId,
        this.service.modelRevision,
        this.service.dimensions,
        float32VectorToBlob(vector),
        inputHash,
      );
  }

  async indexBlocks(blocks: Array<{ id: number; text: string }>): Promise<void> {
    for (const block of blocks) {
      await this.ensureEmbedding(block.id, block.text);
    }
  }
}
