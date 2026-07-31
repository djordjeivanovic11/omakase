import fs from 'node:fs';
import path from 'node:path';
import type DatabaseType from 'better-sqlite3';
import Database from 'better-sqlite3';
import { foreignKeyCheck, integrityCheck } from '../storage/database.js';
import { sha256File } from '../storage/hash.js';
import { nowMs } from '../storage/ids.js';
import {
  BACKUP_ASSETS_DIR,
  BACKUP_DB_FILE,
  BACKUP_FORMAT_VERSION,
  BACKUP_MANIFEST_FILE,
  type BackupManifest,
} from './bundle.js';

export interface CreateBackupOptions {
  db: DatabaseType.Database;
  assetsDir: string;
  appVersion: string;
  destPath: string;
}

export async function createBackup(options: CreateBackupOptions): Promise<BackupManifest> {
  const { db, assetsDir, appVersion, destPath } = options;

  if (fs.existsSync(destPath)) {
    throw new Error(`Backup destination already exists: ${destPath}`);
  }
  fs.mkdirSync(destPath, { recursive: true });

  const backupDbPath = path.resolve(destPath, BACKUP_DB_FILE);
  const journalMode = String(db.pragma('journal_mode', { simple: true }));
  if (journalMode === 'wal') {
    db.pragma('journal_mode = DELETE');
  }

  let backupResult: { totalPages: number; remainingPages: number };
  try {
    backupResult = await db.backup(backupDbPath);
  } finally {
    if (journalMode === 'wal') {
      db.pragma('journal_mode = WAL');
    }
  }

  if (backupResult.totalPages === 0 || !fs.existsSync(backupDbPath)) {
    // Some WAL-mode databases report zero pages to the async backup API; serialize
    // produces an equivalent consistent snapshot via the same better-sqlite3 binding.
    const snapshot = db.serialize() as Buffer;
    fs.writeFileSync(backupDbPath, snapshot);
  }

  if (!fs.existsSync(backupDbPath)) {
    throw new Error(`SQLite backup failed to produce ${backupDbPath}`);
  }

  const backupDb = new Database(backupDbPath);
  try {
    backupDb.pragma('foreign_keys = ON');
    const backupTables = backupDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'studios'`)
      .get();
    if (!backupTables) {
      throw new Error('Backup database is missing application schema (studios table)');
    }
    if (integrityCheck(backupDb) !== 'ok') {
      throw new Error('Backup database failed integrity check');
    }
    const fkViolations = foreignKeyCheck(backupDb);
    if (fkViolations.length > 0) {
      throw new Error('Backup database has foreign key violations');
    }
  } finally {
    backupDb.close();
  }

  const assetsDest = path.join(destPath, BACKUP_ASSETS_DIR);
  fs.mkdirSync(assetsDest, { recursive: true });

  const assetRows = db.prepare('SELECT relative_path FROM assets').all() as Array<{
    relative_path: string;
  }>;

  let copiedAssets = 0;
  for (const row of assetRows) {
    const src = path.join(assetsDir, row.relative_path);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(assetsDest, row.relative_path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copiedAssets += 1;
  }

  const schemaRow = db
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get() as { version: number; checksum: string } | undefined;

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion: schemaRow?.version ?? 0,
    schemaChecksum: schemaRow?.checksum ?? null,
    createdAt: nowMs(),
    dbSha256: sha256File(backupDbPath),
    assetCount: copiedAssets,
    excludesSecrets: true,
  };

  fs.writeFileSync(
    path.join(destPath, BACKUP_MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  return manifest;
}
