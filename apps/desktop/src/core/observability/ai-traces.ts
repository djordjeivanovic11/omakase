/**
 * Local-first AI development traces.
 *
 * Default: disabled for ordinary users.
 * When enabled (OMAKASE_AI_TRACES=1), writes redacted metadata JSONL
 * outside the repository (~/.omakase/dev-traces) unless OMAKASE_TRACES_DIR is set.
 *
 * Never records API keys, full prompts, source bodies, or learner answers.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redactSecrets } from '../security/redact.js';

export interface AiTraceEvent {
  traceId: string;
  sessionId?: string;
  mode?: string;
  provider?: string;
  modelId?: string;
  durationMs?: number;
  stepCount?: number;
  toolNames?: string[];
  toolDurationMs?: number[];
  retrievedBlockIds?: number[];
  contextTokenEstimate?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicrousd?: number;
  validationFailures?: string[];
  stopReason?: string;
  errorCode?: string;
  /** Already-redacted short message only */
  errorMessage?: string;
  ts?: number;
}

export interface TraceExporter {
  export(event: AiTraceEvent): void | Promise<void>;
}

class LocalJsonlExporter implements TraceExporter {
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  export(event: AiTraceEvent): void {
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(this.dir, `traces-${day}.jsonl`);
    const line = JSON.stringify({ ...event, ts: event.ts ?? Date.now() });
    fs.appendFileSync(file, `${line}\n`, 'utf8');
  }
}

/**
 * Optional remote adapter seam (e.g. Langfuse). Not wired by default.
 * Implementers must refuse to send source/learner content.
 */
export class NoopRemoteExporter implements TraceExporter {
  export(_event: AiTraceEvent): void {
    // intentionally empty
  }
}

let exporter: TraceExporter | null = null;

export function tracesEnabled(): boolean {
  return process.env.OMAKASE_AI_TRACES === '1' || process.env.OMAKASE_AI_TRACES === 'true';
}

export function defaultTracesDir(): string {
  return process.env.OMAKASE_TRACES_DIR ?? path.join(os.homedir(), '.omakase', 'dev-traces');
}

export function configureTraceExporter(next: TraceExporter | null): void {
  exporter = next;
}

function getExporter(): TraceExporter | null {
  if (!tracesEnabled()) return null;
  if (exporter) return exporter;
  // Optional remote: only if explicitly configured AND local traces enabled.
  if (process.env.OMAKASE_LANGFUSE_HOST && process.env.OMAKASE_LANGFUSE_ENABLED === '1') {
    // Boundary only — do not send by default. Developers may replace this.
    exporter = new NoopRemoteExporter();
    return exporter;
  }
  exporter = new LocalJsonlExporter(defaultTracesDir());
  return exporter;
}

const MAX_MSG = 160;

export function recordAiTrace(event: AiTraceEvent): void {
  const active = getExporter();
  if (!active) return;

  const safe: AiTraceEvent = {
    traceId: event.traceId,
    sessionId: event.sessionId,
    mode: event.mode,
    provider: event.provider,
    modelId: event.modelId,
    durationMs: event.durationMs,
    stepCount: event.stepCount,
    toolNames: event.toolNames?.slice(0, 32),
    toolDurationMs: event.toolDurationMs?.slice(0, 32),
    retrievedBlockIds: event.retrievedBlockIds?.slice(0, 32),
    contextTokenEstimate: event.contextTokenEstimate,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    estimatedCostMicrousd: event.estimatedCostMicrousd,
    validationFailures: event.validationFailures?.slice(0, 20),
    stopReason: event.stopReason,
    errorCode: event.errorCode,
    errorMessage: event.errorMessage
      ? redactSecrets(event.errorMessage).slice(0, MAX_MSG)
      : undefined,
    ts: event.ts ?? Date.now(),
  };

  try {
    void active.export(safe);
  } catch {
    // Tracing must never break learning.
  }
}

/** AI SDK telemetry toggle — never record prompt/response bodies by default. */
export function aiSdkTelemetrySettings(functionId: string):
  | {
      isEnabled: true;
      functionId: string;
      recordInputs: false;
      recordOutputs: false;
      metadata: Record<string, string>;
    }
  | { isEnabled: false } {
  if (!tracesEnabled()) return { isEnabled: false };
  return {
    isEnabled: true,
    functionId,
    recordInputs: false,
    recordOutputs: false,
    metadata: {
      app: 'omakase',
      privacy: 'local-redacted',
    },
  };
}
