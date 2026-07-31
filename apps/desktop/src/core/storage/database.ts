import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { applyMigrations } from './migrate.js';

export interface DatabaseHandle {
  db: Database.Database;
  close: () => void;
}

let writeOwner: Database.Database | null = null;

export function getWriteOwner(): Database.Database | null {
  return writeOwner;
}

export function defaultMigrationsDir(): string {
  const candidates: string[] = [];

  // Packaged app: migrations ship as an extra resource.
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'migrations'));
  }
  // Development and tests: repo-root migrations.
  candidates.push(
    path.resolve(process.cwd(), 'migrations'),
    path.resolve(process.cwd(), '../../migrations'),
  );
  try {
    candidates.push(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../migrations'),
    );
  } catch {
    // import.meta.url is unavailable in some bundled CJS contexts; other candidates cover it.
  }

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '0001_initial_schema.sql'))) {
      return candidate;
    }
  }
  throw new Error(`Could not locate migrations directory. Looked in: ${candidates.join(', ')}`);
}

export function openDatabase(
  dbPath: string,
  migrationsDir: string = defaultMigrationsDir(),
): DatabaseHandle {
  if (writeOwner) {
    throw new Error('A write-owning database connection already exists');
  }

  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.pragma('trusted_schema = OFF');

  const fk = db.pragma('foreign_keys', { simple: true });
  if (fk !== 1 && fk !== '1') {
    throw new Error('Failed to enable foreign_keys');
  }

  applyMigrations(db, migrationsDir);
  assertNoOpenTransaction(db);
  writeOwner = db;

  return {
    db,
    close: () => {
      if (writeOwner === db) {
        writeOwner = null;
      }
      // Fold the write-ahead log back into the database file so a later crash
      // or an external reader never sees a half-empty library.
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // A checkpoint failure must not prevent the connection from closing.
      }
      db.close();
    },
  };
}

/**
 * An open transaction at this point means every subsequent write would be
 * discarded when the process exits, so fail loudly instead of losing data.
 */
function assertNoOpenTransaction(db: Database.Database): void {
  if (db.inTransaction) {
    db.exec('ROLLBACK;');
    throw new Error(
      'Database connection was left inside a transaction after migrations; refusing to continue',
    );
  }
}

export function openDatabaseForTests(dbPath: string, migrationsDir?: string): DatabaseHandle {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.pragma('trusted_schema = OFF');

  const fk = db.pragma('foreign_keys', { simple: true });
  if (fk !== 1 && fk !== '1') {
    throw new Error('Failed to enable foreign_keys');
  }

  applyMigrations(db, migrationsDir ?? defaultMigrationsDir());
  assertNoOpenTransaction(db);

  return {
    db,
    close: () => {
      db.close();
    },
  };
}

export function assertForeignKeysEnabled(db: Database.Database): void {
  const value = db.pragma('foreign_keys', { simple: true });
  if (value !== 1 && value !== '1') {
    throw new Error('foreign_keys must be ON');
  }
}

export function integrityCheck(db: Database.Database): string {
  const row = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  return row[0]?.integrity_check ?? 'unknown';
}

export function foreignKeyCheck(db: Database.Database): unknown[] {
  return db.pragma('foreign_key_check') as unknown[];
}
