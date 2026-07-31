import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

const PLACEHOLDER = 'REPLACE_WITH_BUILD_TIME_SHA256';

export interface MigrationFile {
  version: number;
  name: string;
  filePath: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory missing: ${migrationsDir}`);
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();

  return files.map((file) => {
    const filePath = path.join(migrationsDir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const version = Number.parseInt(file.slice(0, 4), 10);
    const name = file.replace(/^\d{4}_/, '').replace(/\.sql$/, '');
    const checksum = canonicalMigrationChecksum(raw);
    return { version, name, filePath, sql: raw, checksum };
  });
}

/**
 * Canonical checksum: SHA-256 of the migration SQL with the build-time
 * checksum placeholder restored (so the hash is stable after replacement).
 */
export function canonicalMigrationChecksum(sql: string): string {
  const restored = sql.replace(
    /VALUES\s*\(\s*1\s*,\s*'initial_schema'\s*,\s*'[0-9a-f]{64}'\s*\)/i,
    `VALUES (1, 'initial_schema', '${PLACEHOLDER}')`,
  );
  return crypto.createHash('sha256').update(restored).digest('hex');
}

export function applyMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
    ) STRICT;
  `);

  const applied = new Map(
    db
      .prepare('SELECT version, checksum FROM schema_migrations')
      .all()
      .map((row) => {
        const r = row as { version: number; checksum: string };
        return [r.version, r.checksum] as const;
      }),
  );

  const migrations = loadMigrations(migrationsDir);
  for (const migration of migrations) {
    const existing = applied.get(migration.version);
    if (existing) {
      if (existing !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} checksum mismatch: expected ${migration.checksum}, found ${existing}`,
        );
      }
      continue;
    }

    const sql = stripTransactionWrappers(migration.sql);

    if (migration.version === 1) {
      // 0001 owns schema_migrations creation and its checksum insert.
      const runInitial = db.transaction(() => {
        db.exec('DROP TABLE IF EXISTS schema_migrations;');
        db.exec(sql);
      });
      runInitial();
      const row = db.prepare('SELECT checksum FROM schema_migrations WHERE version = 1').get() as
        | { checksum: string }
        | undefined;
      if (!row || row.checksum !== migration.checksum) {
        throw new Error(`Migration 0001 did not record expected checksum ${migration.checksum}`);
      }
      continue;
    }

    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        migration.checksum,
      );
    });
    run();
  }
}

/**
 * Migration files wrap themselves in an explicit transaction, but the runner
 * needs to own transaction boundaries so a partially applied migration cannot
 * be committed. Leaving a stray `BEGIN` behind is silently catastrophic: the
 * connection stays inside an open transaction for the life of the process and
 * every write is rolled back at exit.
 *
 * Only whole-line transaction control statements are removed. `BEGIN` and `END`
 * inside trigger bodies never appear with a trailing semicolon on their own
 * line, so they are left untouched.
 */
export function stripTransactionWrappers(sql: string): string {
  const transactionControl =
    /^\s*(?:BEGIN(?:\s+(?:IMMEDIATE|DEFERRED|EXCLUSIVE))?|COMMIT|END\s+TRANSACTION|ROLLBACK)\s*;\s*$/i;
  return sql
    .split('\n')
    .filter((line) => !transactionControl.test(line))
    .join('\n');
}
