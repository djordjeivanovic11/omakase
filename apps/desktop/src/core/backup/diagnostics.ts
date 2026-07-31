import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { redactLogLines } from '../security/redact.js';
import { foreignKeyCheck, integrityCheck } from '../storage/database.js';
import { nowMs } from '../storage/ids.js';

export interface DiagnosticsPreview {
  appVersion: string;
  platform: string;
  schemaVersion: number;
  schemaChecksum: string | null;
  schemaIntegrity: string;
  foreignKeyViolations: number;
  providerCount: number;
  studioCount: number;
  sourceCount: number;
  embeddingModel: string;
  modelManifest: ModelManifestStub | null;
  logsPreview: string[];
  redactionNotice: string;
}

export interface ModelManifestStub {
  modelId: string;
  revision: string;
  dimensions: number;
  note: string;
  licenseNotice: string;
}

export interface BuildDiagnosticsOptions {
  db: Database.Database;
  appVersion: string;
  platform: string;
  embeddingModel: string;
  modelsDir: string;
  logsDir?: string;
  providerCount: number;
}

function readModelManifest(modelsDir: string): ModelManifestStub | null {
  const manifestPath = path.join(modelsDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    return {
      modelId: String(raw.modelId ?? ''),
      revision: String(raw.revision ?? ''),
      dimensions: Number(raw.dimensions ?? 0),
      note: String(raw.note ?? ''),
      licenseNotice: String(raw.licenseNotice ?? ''),
    };
  } catch {
    return null;
  }
}

function readRedactedLogPreview(logsDir: string | undefined, maxLines = 20): string[] {
  if (!logsDir || !fs.existsSync(logsDir)) {
    return ['(no logs directory — placeholder)'];
  }

  const files = fs
    .readdirSync(logsDir)
    .filter((name) => name.endsWith('.log'))
    .map((name) => path.join(logsDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (files.length === 0) {
    return ['(no log files yet — placeholder)'];
  }

  const latest = files[0]!;
  const content = fs.readFileSync(latest, 'utf8');
  const lines = content.split('\n').filter(Boolean).slice(-maxLines);
  return redactLogLines(lines);
}

export function buildDiagnosticsPreview(options: BuildDiagnosticsOptions): DiagnosticsPreview {
  const schemaRow = options.db
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get() as { version: number; checksum: string } | undefined;

  const studioCount = (
    options.db.prepare(`SELECT COUNT(*) AS c FROM studios`).get() as { c: number }
  ).c;
  const sourceCount = (
    options.db.prepare(`SELECT COUNT(*) AS c FROM sources WHERE deleted_at IS NULL`).get() as {
      c: number;
    }
  ).c;

  return {
    appVersion: options.appVersion,
    platform: options.platform,
    schemaVersion: schemaRow?.version ?? 0,
    schemaChecksum: schemaRow?.checksum ?? null,
    schemaIntegrity: integrityCheck(options.db),
    foreignKeyViolations: foreignKeyCheck(options.db).length,
    providerCount: options.providerCount,
    studioCount,
    sourceCount,
    embeddingModel: options.embeddingModel,
    modelManifest: readModelManifest(options.modelsDir),
    logsPreview: readRedactedLogPreview(options.logsDir),
    redactionNotice: 'Diagnostics exclude API keys and full source text by default.',
  };
}

export function exportDiagnosticsBundle(
  preview: DiagnosticsPreview,
  destPath: string,
): { path: string; exportedAt: number } {
  const exportedAt = nowMs();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, JSON.stringify({ ...preview, exportedAt }, null, 2), 'utf8');
  return { path: destPath, exportedAt };
}
