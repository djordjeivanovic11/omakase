import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup } from '../../src/core/backup/backup.js';
import { listFilesRecursive } from '../../src/core/backup/bundle.js';
import { restoreBackup, validateBackupBundle } from '../../src/core/backup/restore.js';
import { AssetStore } from '../../src/core/storage/asset-store.js';
import { openDatabaseForTests } from '../../src/core/storage/database.js';
import { FileSecretStore, TestSafeStorage } from '../../src/core/storage/secrets.js';
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

describe('backup and restore integration', () => {
  it('backs up and restores studio data without secrets', async () => {
    const sourceRoot = makeTempDir('omakase-backup-src-');
    const sourceDbPath = path.join(sourceRoot, 'library.sqlite');
    const assetsDir = path.join(sourceRoot, 'assets');
    const secretsDir = path.join(sourceRoot, 'secrets');

    const { db, close } = openDatabaseForTests(sourceDbPath);
    const secretStore = new FileSecretStore(secretsDir, new TestSafeStorage());
    secretStore.setSecret('provider:test', 'sk-test-secret-key-1234567890');
    const assets = new AssetStore(db, assetsDir);
    assets.storeBytes(Buffer.from('fixture bytes'), 'text/plain', 'fixture.txt');

    const studioId = createStudio(db, 'Backup Studio');
    await insertTextSourceWithBlocks(db, studioId, 'Backed up source', ['Restorable paragraph.']);
    expect((db.prepare('SELECT COUNT(*) AS c FROM studios').get() as { c: number }).c).toBe(1);

    const backupDir = path.join(makeTempDir('omakase-backup-parent-'), 'bundle');
    await createBackup({
      db,
      assetsDir,
      appVersion: '0.1.0-test',
      destPath: backupDir,
    });
    close();

    const backupProbe = new Database(path.join(backupDir, 'library.sqlite'));
    try {
      const backupStudios = backupProbe.prepare('SELECT COUNT(*) AS c FROM studios').get() as {
        c: number;
      };
      expect(backupStudios.c).toBe(1);
    } finally {
      backupProbe.close();
    }

    validateBackupBundle(backupDir);

    const files = listFilesRecursive(backupDir);
    expect(files.some((f) => f.endsWith('.bin'))).toBe(false);
    expect(files.some((f) => f.includes('secrets'))).toBe(false);

    const restoreRoot = makeTempDir('omakase-restore-');
    const restored = restoreBackup({
      backupPath: backupDir,
      destUserDataPath: restoreRoot,
    });

    const restoredHandle = openDatabaseForTests(restored.dbPath);
    try {
      const studioCount = restoredHandle.db.prepare('SELECT COUNT(*) AS c FROM studios').get() as {
        c: number;
      };
      expect(studioCount.c).toBe(1);

      const studio = restoredHandle.db
        .prepare('SELECT id, name FROM studios WHERE id = ?')
        .get(studioId) as { id: string; name: string } | undefined;
      expect(studio?.name).toBe('Backup Studio');

      const sourceCount = restoredHandle.db.prepare('SELECT COUNT(*) AS c FROM sources').get() as {
        c: number;
      };
      expect(sourceCount.c).toBe(1);

      expect(fs.existsSync(path.join(restored.assetsDir, 'assets'))).toBe(false);
      expect(fs.existsSync(restored.assetsDir)).toBe(true);
      expect(fs.readdirSync(restored.assetsDir).length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(restored.profileRoot, 'secrets'))).toBe(true);
      expect(fs.readdirSync(path.join(restored.profileRoot, 'secrets'))).toHaveLength(0);
    } finally {
      restoredHandle.close();
    }
  });

  it('rejects corrupt backup checksums', async () => {
    const sourceRoot = makeTempDir('omakase-backup-corrupt-');
    const sourceDbPath = path.join(sourceRoot, 'library.sqlite');
    const assetsDir = path.join(sourceRoot, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    const { db, close } = openDatabaseForTests(sourceDbPath);
    createStudio(db, 'Corrupt');

    const backupDir = path.join(makeTempDir('omakase-backup-corrupt-parent-'), 'bundle');
    await createBackup({
      db,
      assetsDir,
      appVersion: '0.1.0-test',
      destPath: backupDir,
    });
    close();

    const manifestPath = path.join(backupDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { dbSha256: string };
    manifest.dbSha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    expect(() => validateBackupBundle(backupDir)).toThrow(/checksum mismatch/);
  });
});
