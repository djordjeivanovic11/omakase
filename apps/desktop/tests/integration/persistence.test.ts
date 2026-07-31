import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabaseForTests } from '../../src/core/storage/database.js';
import { stripTransactionWrappers } from '../../src/core/storage/migrate.js';
import { StudiosRepo } from '../../src/core/storage/studios-repo.js';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-persist-'));
  return path.join(dir, 'library.sqlite');
}

describe('migration transaction handling', () => {
  it('removes the wrapping transaction even when the file starts with comments', () => {
    const sql = [
      '-- a comment',
      '-- another comment',
      '',
      'BEGIN IMMEDIATE;',
      'CREATE TABLE t (id INTEGER PRIMARY KEY);',
      'COMMIT;',
      '',
    ].join('\n');

    const stripped = stripTransactionWrappers(sql);
    expect(stripped).not.toMatch(/^\s*BEGIN\s+IMMEDIATE\s*;\s*$/m);
    expect(stripped).not.toMatch(/^\s*COMMIT\s*;\s*$/m);
    expect(stripped).toContain('CREATE TABLE t');
  });

  it('keeps BEGIN and END that belong to trigger bodies', () => {
    const sql = [
      'CREATE TRIGGER guard BEFORE INSERT ON t',
      'FOR EACH ROW',
      'BEGIN',
      "  SELECT RAISE(ABORT, 'nope');",
      'END;',
    ].join('\n');

    expect(stripTransactionWrappers(sql)).toBe(sql);
  });

  it('leaves no open transaction after opening the database', () => {
    const dbPath = tempDbPath();
    const handle = openDatabaseForTests(dbPath);
    expect(handle.db.inTransaction).toBe(false);
    handle.close();
  });
});

describe('local library persistence', () => {
  it('recovers studios written by a previous process', () => {
    const dbPath = tempDbPath();

    const first = openDatabaseForTests(dbPath);
    const created = new StudiosRepo(first.db).create({ name: 'Persisted Studio' });
    first.close();

    const second = openDatabaseForTests(dbPath);
    const studios = new StudiosRepo(second.db).list();
    second.close();

    expect(studios.map((s) => s.id)).toContain(created.id);
    expect(studios.map((s) => s.name)).toContain('Persisted Studio');
  });

  it('survives a connection that is abandoned without closing', () => {
    const dbPath = tempDbPath();

    const first = openDatabaseForTests(dbPath);
    new StudiosRepo(first.db).create({ name: 'Abandoned Studio' });
    // Deliberately no close(): emulates the process being killed.

    const second = openDatabaseForTests(dbPath);
    const names = new StudiosRepo(second.db).list().map((s) => s.name);
    second.close();
    first.close();

    expect(names).toContain('Abandoned Studio');
  });
});
