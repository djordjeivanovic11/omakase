import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { foreignKeyCheck, integrityCheck } from '../storage/database.js';
import { sha256File } from '../storage/hash.js';
import {
  BACKUP_ASSETS_DIR,
  BACKUP_DB_FILE,
  BACKUP_FORMAT_VERSION,
  type BackupManifest,
  copyDirectoryRecursive,
  readBackupManifest,
} from './bundle.js';

export interface RestoreBackupOptions {
  backupPath: string;
  /** Parent directory that will contain the `omakase/` profile folder. */
  destUserDataPath: string;
}

export interface RestoreBackupResult {
  profileRoot: string;
  dbPath: string;
  assetsDir: string;
  manifest: BackupManifest;
}

export function validateBackupBundle(backupPath: string): BackupManifest {
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isDirectory()) {
    throw new Error('Backup path must be an existing directory');
  }

  const manifest = readBackupManifest(backupPath);
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format version: ${manifest.formatVersion}`);
  }
  if (manifest.excludesSecrets !== true) {
    throw new Error('Backup manifest must declare excludesSecrets=true');
  }

  const dbPath = path.join(backupPath, BACKUP_DB_FILE);
  if (!fs.existsSync(dbPath)) {
    throw new Error('Invalid backup: library.sqlite missing');
  }

  const actualHash = sha256File(dbPath);
  if (actualHash !== manifest.dbSha256) {
    throw new Error('Backup database checksum mismatch (corrupt or tampered)');
  }

  const probe = new Database(dbPath, { readonly: true });
  try {
    probe.pragma('foreign_keys = ON');
    if (integrityCheck(probe) !== 'ok') {
      throw new Error('Backup database failed integrity check');
    }
    const fkViolations = foreignKeyCheck(probe);
    if (fkViolations.length > 0) {
      throw new Error('Backup database has foreign key violations');
    }
  } finally {
    probe.close();
  }

  return manifest;
}

export function restoreBackup(options: RestoreBackupOptions): RestoreBackupResult {
  const manifest = validateBackupBundle(options.backupPath);

  const profileRoot = path.join(options.destUserDataPath, 'omakase');
  const dbPath = path.join(profileRoot, 'library.sqlite');
  const assetsDir = path.join(profileRoot, 'assets');
  const secretsDir = path.join(profileRoot, 'secrets');

  fs.mkdirSync(profileRoot, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(secretsDir, { recursive: true });

  fs.copyFileSync(path.join(options.backupPath, BACKUP_DB_FILE), dbPath);

  const backupAssets = path.join(options.backupPath, BACKUP_ASSETS_DIR);
  if (fs.existsSync(backupAssets)) {
    copyDirectoryRecursive(backupAssets, assetsDir);
  }

  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = ON');
    if (integrityCheck(db) !== 'ok') {
      throw new Error('Restored database failed integrity check');
    }
    const fkViolations = foreignKeyCheck(db);
    if (fkViolations.length > 0) {
      throw new Error('Restored database has foreign key violations');
    }
  } finally {
    db.close();
  }

  return { profileRoot, dbPath, assetsDir, manifest };
}
