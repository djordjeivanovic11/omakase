import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { ProviderRepo } from '../../src/core/providers/provider-repo.js';
import {
  type EmbeddingService,
  EmbeddingsRepo,
  GraniteEmbeddingService,
} from '../../src/core/retrieval/embeddings.js';
import { openDatabaseForTests } from '../../src/core/storage/database.js';
import { sha256Hex } from '../../src/core/storage/hash.js';
import { newId, nowMs } from '../../src/core/storage/ids.js';
import { FileSecretStore, TestSafeStorage } from '../../src/core/storage/secrets.js';

export interface TestContext {
  dbPath: string;
  db: Database.Database;
  secretStore: FileSecretStore;
  providerRepo: ProviderRepo;
  providerProfileId: string;
  cleanup: () => void;
}

export function createTestContext(): TestContext {
  const previousTestEnv = {
    OMAKASE_MOCK_PROVIDER: process.env.OMAKASE_MOCK_PROVIDER,
    OMAKASE_TEST: process.env.OMAKASE_TEST,
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-test-'));
  const dbPath = path.join(dir, 'test.db');
  const handle = openDatabaseForTests(dbPath);
  const secretStore = new FileSecretStore(path.join(dir, 'secrets'), new TestSafeStorage());
  const providerRepo = new ProviderRepo(handle.db, secretStore);

  process.env.OMAKASE_MOCK_PROVIDER = '1';
  process.env.OMAKASE_TEST = '1';
  const profile = providerRepo.createProfile({
    provider: 'openai',
    displayName: 'Mock',
    apiKey: 'mock-test-key-0001',
    defaultModelId: 'mock-learn-v1',
  });

  return {
    dbPath,
    db: handle.db,
    secretStore,
    providerRepo,
    providerProfileId: profile.id,
    cleanup: () => {
      handle.close();
      fs.rmSync(dir, { recursive: true, force: true });
      if (previousTestEnv.OMAKASE_MOCK_PROVIDER === undefined) {
        delete process.env.OMAKASE_MOCK_PROVIDER;
      } else {
        process.env.OMAKASE_MOCK_PROVIDER = previousTestEnv.OMAKASE_MOCK_PROVIDER;
      }
      if (previousTestEnv.OMAKASE_TEST === undefined) {
        delete process.env.OMAKASE_TEST;
      } else {
        process.env.OMAKASE_TEST = previousTestEnv.OMAKASE_TEST;
      }
    },
  };
}

export async function insertTextSourceWithBlocks(
  db: Database.Database,
  studioId: string,
  title: string,
  paragraphs: string[],
  embeddingService: EmbeddingService = new GraniteEmbeddingService(),
): Promise<{ sourceId: string; blockIds: number[] }> {
  const sourceId = newId();
  const versionId = newId();
  const ts = nowMs();
  const hash = sha256Hex(paragraphs.join('\n'));

  db.prepare(
    `INSERT INTO sources (id, kind, title, lifecycle_status, processing_status, created_at, updated_at)
     VALUES (?, 'text', ?, 'active', 'ready', ?, ?)`,
  ).run(sourceId, title, ts, ts);

  db.prepare(
    `INSERT INTO source_versions (
      id, source_id, version_number, status, normalized_hash, parser_id, parser_version, ready_at, created_at
    ) VALUES (?, ?, 1, 'ready', ?, 'test', '1', ?, ?)`,
  ).run(versionId, sourceId, hash, ts, ts);

  db.prepare(`INSERT INTO source_active_versions (source_id, source_version_id) VALUES (?, ?)`).run(
    sourceId,
    versionId,
  );

  db.prepare(
    `INSERT INTO studio_sources (studio_id, source_id, role, position, added_at) VALUES (?, ?, 'foundation', 0, ?)`,
  ).run(studioId, sourceId, ts);

  const blockIds: number[] = [];
  paragraphs.forEach((text, ordinal) => {
    const publicId = newId();
    const contentHash = sha256Hex(text);
    const info = db
      .prepare(
        `INSERT INTO source_blocks (
          public_id, source_version_id, ordinal, kind, text, heading_path_json, heading_path_text,
          locator_json, content_hash, token_estimate
        ) VALUES (?, ?, ?, 'paragraph', ?, '[]', '', ?, ?, ?)`,
      )
      .run(
        publicId,
        versionId,
        ordinal,
        text,
        JSON.stringify({ kind: 'paragraph', charStart: 0, charEnd: text.length }),
        contentHash,
        Math.ceil(text.length / 4),
      );
    blockIds.push(Number(info.lastInsertRowid));
  });

  const embeddingRepo = new EmbeddingsRepo(db, embeddingService);
  await Promise.all(
    paragraphs.map((text, i) => {
      const blockId = blockIds[i];
      if (blockId === undefined) throw new Error(`Missing block id for paragraph ${i}`);
      return embeddingRepo.ensureEmbedding(blockId, text);
    }),
  );

  return { sourceId, blockIds };
}

export function createStudio(db: Database.Database, name = 'Test Studio'): string {
  const id = newId();
  const ts = nowMs();
  db.prepare(
    `INSERT INTO studios (id, name, teaching_style, status, sort_order, created_at, updated_at)
     VALUES (?, ?, 'direct', 'active', 0, ?, ?)`,
  ).run(id, name, ts, ts);
  return id;
}
