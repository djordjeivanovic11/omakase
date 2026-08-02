import { afterEach, describe, expect, it } from 'vitest';
import { searchSourceBlocksFts } from '../../src/core/retrieval/fts.js';
import {
  persistSessionScopeSnapshot,
  resolveSourceScope,
} from '../../src/core/sources/source-scope.js';
import { CollectionsRepo } from '../../src/core/storage/collections-repo.js';
import { newId, nowMs } from '../../src/core/storage/ids.js';
import { createStudio, createTestContext, insertTextSourceWithBlocks } from '../helpers/test-db.js';

const contexts: ReturnType<typeof createTestContext>[] = [];

afterEach(() => {
  for (const context of contexts.splice(0)) context.cleanup();
});

describe('source scopes and collections', () => {
  it('keeps collection membership separate from sources and resolves immutable versions', async () => {
    const context = createTestContext();
    contexts.push(context);
    const studioId = createStudio(context.db, 'Diffusion Models');
    const first = await insertTextSourceWithBlocks(context.db, studioId, 'Foundations', [
      'Forward diffusion gradually adds noise to a data distribution.',
    ]);
    const second = await insertTextSourceWithBlocks(context.db, studioId, 'Sampling', [
      'Denoising reverses the diffusion process and produces samples.',
    ]);

    const collections = new CollectionsRepo(context.db);
    const collection = collections.create({ studioId, name: 'Foundations' });
    collections.addSource({ collectionId: collection.id, sourceId: first.sourceId });
    collections.addSource({ collectionId: collection.id, sourceId: first.sourceId });

    expect(collections.listSourceIds(collection.id)).toEqual([first.sourceId]);
    expect(collections.get(collection.id)?.sourceCount).toBe(1);

    const resolved = resolveSourceScope(context.db, studioId, {
      kind: 'collection',
      collectionId: collection.id,
    });
    expect(resolved.sourceIds).toEqual([first.sourceId]);
    expect(resolved.sourceVersionIds).toHaveLength(1);
    expect(resolved.scopeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(resolved.sourceIds).not.toContain(second.sourceId);

    const sessionId = newId();
    const ts = nowMs();
    context.db
      .prepare(
        `INSERT INTO sessions (id, studio_id, mode, status, runtime_context_json, started_at, created_at, updated_at)
         VALUES (?, ?, 'learn', 'active', '{}', ?, ?, ?)`,
      )
      .run(sessionId, studioId, ts, ts, ts);
    persistSessionScopeSnapshot(context.db, sessionId, resolved);

    const persisted = context.db
      .prepare(
        'SELECT resolved_source_version_ids_json, scope_hash FROM session_scope_snapshots WHERE session_id = ?',
      )
      .get(sessionId) as { resolved_source_version_ids_json: string; scope_hash: string };
    expect(JSON.parse(persisted.resolved_source_version_ids_json)).toEqual(
      resolved.sourceVersionIds,
    );
    expect(persisted.scope_hash).toBe(resolved.scopeHash);
  });

  it('does not retrieve a highly relevant source outside an explicit version scope', async () => {
    const context = createTestContext();
    contexts.push(context);
    const studioId = createStudio(context.db, 'Scoped Retrieval');
    const selected = await insertTextSourceWithBlocks(context.db, studioId, 'Selected', [
      'A general introduction to model training.',
    ]);
    await insertTextSourceWithBlocks(context.db, studioId, 'Excluded', [
      'Score matching is the exact concept requested by this question.',
    ]);

    const selectedVersion = context.db
      .prepare('SELECT source_version_id FROM source_active_versions WHERE source_id = ?')
      .get(selected.sourceId) as { source_version_id: string };
    const hits = searchSourceBlocksFts(context.db, {
      query: 'score matching',
      sourceVersionIds: [selectedVersion.source_version_id],
      limit: 10,
    });
    expect(hits).toEqual([]);
  });

  it('rejects collection membership when the source belongs to another Studio', async () => {
    const context = createTestContext();
    contexts.push(context);
    const firstStudio = createStudio(context.db, 'First');
    const secondStudio = createStudio(context.db, 'Second');
    const source = await insertTextSourceWithBlocks(context.db, secondStudio, 'Private', [
      'Only here',
    ]);
    const collection = new CollectionsRepo(context.db).create({
      studioId: firstStudio,
      name: 'Should stay empty',
    });

    expect(() =>
      new CollectionsRepo(context.db).addSource({
        collectionId: collection.id,
        sourceId: source.sourceId,
      }),
    ).toThrow(/collection studio/);
  });

  it('rejects a scope from another Studio and excludes deleted sources', async () => {
    const context = createTestContext();
    contexts.push(context);
    const studioId = createStudio(context.db, 'Scope owner');
    const otherStudioId = createStudio(context.db, 'Other owner');
    const source = await insertTextSourceWithBlocks(context.db, studioId, 'Source', [
      'Visible text',
    ]);

    expect(() =>
      resolveSourceScope(context.db, studioId, { kind: 'studio', studioId: otherStudioId }),
    ).toThrow(/does not match/i);

    context.db
      .prepare("UPDATE sources SET lifecycle_status = 'deleted', deleted_at = ? WHERE id = ?")
      .run(nowMs(), source.sourceId);
    expect(() =>
      resolveSourceScope(context.db, studioId, { kind: 'source', sourceId: source.sourceId }),
    ).toThrow(/not an active source/i);
  });
});
