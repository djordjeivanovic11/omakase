import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../security/redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keep log files small enough to read by hand and bounded on disk. */
const MAX_BYTES = 2 * 1024 * 1024;
const KEEP_ROTATIONS = 3;

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(scope: string): Logger;
  readonly filePath: string | null;
}

/**
 * Values reaching the log must never contain document text or credentials.
 * Anything longer than this is treated as content and dropped rather than
 * truncated, so a long snippet of a private PDF can't leak in fragments.
 */
const MAX_FIELD_CHARS = 200;

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > MAX_FIELD_CHARS) return `[omitted ${value.length} chars]`;
    return redactSecrets(value);
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message).slice(0, MAX_FIELD_CHARS),
      stack: value.stack ? redactSecrets(value.stack).slice(0, 4000) : undefined,
    };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return String(value);
}

export function formatLogLine(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: Record<string, unknown>,
): string {
  const record: Record<string, unknown> = {
    t: new Date().toISOString(),
    level,
    scope,
    msg: redactSecrets(message).slice(0, 1000),
  };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      record[k] = sanitizeValue(v);
    }
  }
  return JSON.stringify(record);
}

interface LogSink {
  filePath: string | null;
  minLevel: LogLevel;
}

/**
 * Shared, mutable sink so loggers captured at module-import time (before
 * `initLogger` runs) still write to the log file once it is configured.
 */
const sink: LogSink = { filePath: null, minLevel: 'info' };

class FileLogger implements Logger {
  constructor(private readonly scope: string) {}

  get filePath(): string | null {
    return sink.filePath;
  }

  private write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[sink.minLevel]) return;
    const line = formatLogLine(level, this.scope, message, fields);

    if (level === 'error' || level === 'warn') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }

    if (!sink.filePath) return;
    try {
      rotateIfNeeded(sink.filePath);
      fs.appendFileSync(sink.filePath, `${line}\n`, 'utf8');
    } catch {
      // Logging must never take the app down.
    }
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.write('debug', message, fields);
  }
  info(message: string, fields?: Record<string, unknown>): void {
    this.write('info', message, fields);
  }
  warn(message: string, fields?: Record<string, unknown>): void {
    this.write('warn', message, fields);
  }
  error(message: string, fields?: Record<string, unknown>): void {
    this.write('error', message, fields);
  }

  child(scope: string): Logger {
    return new FileLogger(`${this.scope}.${scope}`);
  }
}

function rotateIfNeeded(filePath: string): void {
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return;
  }
  if (size < MAX_BYTES) return;

  for (let i = KEEP_ROTATIONS - 1; i >= 1; i--) {
    const from = `${filePath}.${i}`;
    const to = `${filePath}.${i + 1}`;
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
  fs.renameSync(filePath, `${filePath}.1`);
}

const rootLogger: Logger = new FileLogger('omakase');

export function initLogger(logsDir: string, minLevel: LogLevel = 'info'): Logger {
  sink.minLevel = minLevel;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    sink.filePath = path.join(logsDir, 'omakase.log');
  } catch {
    sink.filePath = null;
  }
  return rootLogger;
}

export function getLogger(): Logger {
  return rootLogger;
}
