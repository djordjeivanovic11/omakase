import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { sha256File, sha256Hex } from './hash.js';
import { nowMs } from './ids.js';

export interface StoredAsset {
  sha256: string;
  mediaType: string;
  byteSize: number;
  relativePath: string;
  originalFilename: string | null;
}

export class AssetStore {
  constructor(
    private readonly db: Database.Database,
    private readonly assetsDir: string,
  ) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  absolutePath(relativePath: string): string {
    const resolved = path.resolve(this.assetsDir, relativePath);
    if (
      !resolved.startsWith(path.resolve(this.assetsDir) + path.sep) &&
      resolved !== path.resolve(this.assetsDir)
    ) {
      throw new Error('Path traversal rejected');
    }
    return resolved;
  }

  storeBytes(bytes: Buffer, mediaType: string, originalFilename?: string | null): StoredAsset {
    const sha256 = sha256Hex(bytes);
    return this.persist(sha256, bytes, mediaType, originalFilename ?? null);
  }

  storeFile(filePath: string, mediaType: string, originalFilename?: string | null): StoredAsset {
    const sha256 = sha256File(filePath);
    const existing = this.db
      .prepare(
        'SELECT sha256, media_type, byte_size, relative_path, original_filename FROM assets WHERE sha256 = ?',
      )
      .get(sha256) as
      | {
          sha256: string;
          media_type: string;
          byte_size: number;
          relative_path: string;
          original_filename: string | null;
        }
      | undefined;
    if (existing) {
      return {
        sha256: existing.sha256,
        mediaType: existing.media_type,
        byteSize: existing.byte_size,
        relativePath: existing.relative_path,
        originalFilename: existing.original_filename,
      };
    }
    const bytes = fs.readFileSync(filePath);
    return this.persist(sha256, bytes, mediaType, originalFilename ?? path.basename(filePath));
  }

  private persist(
    sha256: string,
    bytes: Buffer,
    mediaType: string,
    originalFilename: string | null,
  ): StoredAsset {
    const existing = this.db
      .prepare(
        'SELECT sha256, media_type, byte_size, relative_path, original_filename FROM assets WHERE sha256 = ?',
      )
      .get(sha256) as
      | {
          sha256: string;
          media_type: string;
          byte_size: number;
          relative_path: string;
          original_filename: string | null;
        }
      | undefined;
    if (existing) {
      return {
        sha256: existing.sha256,
        mediaType: existing.media_type,
        byteSize: existing.byte_size,
        relativePath: existing.relative_path,
        originalFilename: existing.original_filename,
      };
    }

    const relativePath = path.join(sha256.slice(0, 2), sha256);
    const abs = this.absolutePath(relativePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);

    this.db
      .prepare(
        `INSERT INTO assets (sha256, media_type, byte_size, relative_path, original_filename, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sha256, mediaType, bytes.length, relativePath, originalFilename, nowMs());

    return {
      sha256,
      mediaType,
      byteSize: bytes.length,
      relativePath,
      originalFilename,
    };
  }
}
