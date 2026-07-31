import fs from 'node:fs';
import path from 'node:path';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_MANIFEST_FILE = 'manifest.json';
export const BACKUP_DB_FILE = 'library.sqlite';
export const BACKUP_ASSETS_DIR = 'assets';

export interface BackupManifest {
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  schemaChecksum: string | null;
  createdAt: number;
  dbSha256: string;
  assetCount: number;
  excludesSecrets: true;
}

export function isBackupBundle(dirPath: string): boolean {
  return (
    fs.existsSync(path.join(dirPath, BACKUP_MANIFEST_FILE)) &&
    fs.existsSync(path.join(dirPath, BACKUP_DB_FILE))
  );
}

export function readBackupManifest(bundlePath: string): BackupManifest {
  const manifestPath = path.join(bundlePath, BACKUP_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Invalid backup: manifest.json missing');
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
}

export function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function listFilesRecursive(dirPath: string, base = dirPath): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dirPath)) return results;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, base));
    } else {
      results.push(path.relative(base, full));
    }
  }
  return results;
}
