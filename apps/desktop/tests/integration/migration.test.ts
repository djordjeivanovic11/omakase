import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConceptsRepo } from '../../src/core/learning/concepts-repo.js';
import { LearningEventsRepo } from '../../src/core/learning/events.js';
import { projectConceptStateForStudio } from '../../src/core/learning/projector.js';
import { SourcesRepo } from '../../src/core/sources/sources-repo.js';
import {
  assertForeignKeysEnabled,
  defaultMigrationsDir,
  foreignKeyCheck,
  integrityCheck,
  openDatabaseForTests,
} from '../../src/core/storage/database.js';
import {
  applyMigrations,
  canonicalMigrationChecksum,
  loadMigrations,
} from '../../src/core/storage/migrate.js';
import { createStudio, insertTextSourceWithBlocks } from '../helpers/test-db.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('migration integration', () => {
  it('applies 0001 to an empty database with expected guards', async () => {
    const root = makeTempDir('omakase-migration-');
    const dbPath = path.join(root, 'library.sqlite');
    const { db, close } = openDatabaseForTests(dbPath);
    try {
      const migration = db
        .prepare('SELECT version, name, checksum FROM schema_migrations WHERE version = 1')
        .get() as { version: number; name: string; checksum: string };

      expect(migration.version).toBe(1);
      expect(migration.name).toBe('initial_schema');
      expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/);

      assertForeignKeysEnabled(db);
      expect(integrityCheck(db)).toBe('ok');
      expect(foreignKeyCheck(db)).toEqual([]);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');

      const concepts = new ConceptsRepo(db);
      const events = new LearningEventsRepo(db);
      const concept = concepts.findOrCreate('Append Only');
      const eventId = events.append({
        studioId: createStudio(db, 'Trigger Studio'),
        conceptId: concept.id,
        eventKind: 'encountered',
        demonstratedLevel: 'encountered',
        confidence: 0.5,
        rationale: 'seed event',
      });

      expect(() => {
        db.prepare(`UPDATE learning_events SET rationale = 'tamper' WHERE id = ?`).run(eventId);
      }).toThrow(/append-only/);
      expect(() => {
        db.prepare(`DELETE FROM learning_events WHERE id = ?`).run(eventId);
      }).toThrow(/append-only/);
      const studioId = createStudio(db, 'Migration Studio');
      const { sourceId } = await insertTextSourceWithBlocks(db, studioId, 'Note', [
        'SQLite FTS should mirror inserted blocks.',
      ]);
      const sources = new SourcesRepo(db);
      const source = sources.getSource(sourceId);
      expect(source?.activeVersionId).toBeTruthy();
      const blocks = sources.listBlocks(source!.activeVersionId!);
      expect(sources.countFtsRows(source!.activeVersionId!)).toBe(blocks.length);

      const projectorConcept = concepts.findOrCreate('Foreign Keys');
      events.append({
        studioId,
        conceptId: projectorConcept.id,
        eventKind: 'encountered',
        demonstratedLevel: 'encountered',
        confidence: 0.4,
        rationale: 'Read in source',
      });
      events.append({
        studioId,
        conceptId: projectorConcept.id,
        eventKind: 'explanation_evidence',
        demonstratedLevel: 'can_explain',
        confidence: 0.8,
        rationale: 'Verified via projector rebuild',
      });

      const states = projectConceptStateForStudio(db, studioId);
      expect(
        states.some((s) => s.conceptId === projectorConcept.id && s.masteryLevel === 'can_explain'),
      ).toBe(true);
    } finally {
      close();
    }
  });

  it('rejects tampered migration checksum on reopen', () => {
    const root = makeTempDir('omakase-migration-tamper-');
    const dbPath = path.join(root, 'library.sqlite');
    const { db, close } = openDatabaseForTests(dbPath);
    db.prepare(`UPDATE schema_migrations SET checksum = ? WHERE version = 1`).run(
      'deadbeef'.repeat(8),
    );
    expect(() => applyMigrations(db, defaultMigrationsDir())).toThrow(/checksum mismatch/);
    close();
  });

  it('matches canonical migration checksum for 0001', () => {
    const migrationsDir = defaultMigrationsDir();
    const [migration] = loadMigrations(migrationsDir);
    expect(migration?.version).toBe(1);
    const raw = fs.readFileSync(migration!.filePath, 'utf8');
    expect(canonicalMigrationChecksum(raw)).toBe(migration!.checksum);
  });
});
