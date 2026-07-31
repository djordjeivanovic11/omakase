import type { ProviderKind } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId } from '../storage/ids.js';
import type { ProviderRepo } from './provider-repo.js';
import { shouldUseMockProvider } from './registry.js';

export interface UsageRecordInput {
  sessionId?: string | null;
  providerProfileId?: string | null;
  provider: ProviderKind;
  modelId: string;
  operation: 'generate' | 'stream' | 'probe_evaluation' | 'source_card' | 'other';
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UsageLimitCheck {
  allowed: boolean;
  warning: boolean;
  spentMicrousd: number;
  warningMicrousd: number | null;
  hardLimitMicrousd: number | null;
}

function periodStartMs(period: 'session' | 'day' | 'month'): number {
  const now = new Date();
  if (period === 'session') return 0;
  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export function estimateCostMicrousd(
  db: Database.Database,
  providerProfileId: string | null,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!providerProfileId) return 0;
  const row = db
    .prepare(
      `SELECT input_cost_microusd_per_million_tokens, output_cost_microusd_per_million_tokens
       FROM provider_models WHERE provider_profile_id = ? AND model_id = ?`,
    )
    .get(providerProfileId, modelId) as
    | {
        input_cost_microusd_per_million_tokens: number | null;
        output_cost_microusd_per_million_tokens: number | null;
      }
    | undefined;

  const inputRate = row?.input_cost_microusd_per_million_tokens ?? 0;
  const outputRate = row?.output_cost_microusd_per_million_tokens ?? 0;
  return Math.round(
    (inputTokens * inputRate) / 1_000_000 + (outputTokens * outputRate) / 1_000_000,
  );
}

export class UsageService {
  constructor(
    private readonly db: Database.Database,
    private readonly providerRepo: ProviderRepo,
  ) {}

  recordUsage(input: UsageRecordInput): string {
    const id = newId();
    const inputTokens = input.inputTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const estimatedCost = estimateCostMicrousd(
      this.db,
      input.providerProfileId ?? null,
      input.modelId,
      inputTokens,
      outputTokens,
    );

    this.db
      .prepare(
        `INSERT INTO usage_events (
          id, session_id, provider_profile_id, provider, model_id, operation,
          input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
          estimated_cost_microusd, latency_ms, success, error_code, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.sessionId ?? null,
        input.providerProfileId ?? null,
        input.provider,
        input.modelId,
        input.operation,
        input.inputTokens ?? null,
        input.cachedInputTokens ?? null,
        input.outputTokens ?? null,
        input.reasoningTokens ?? null,
        estimatedCost,
        input.latencyMs ?? null,
        input.success !== false ? 1 : 0,
        input.errorCode ?? null,
        JSON.stringify(input.metadata ?? {}),
      );

    return id;
  }

  recordFromProfile(
    profileId: string,
    modelId: string,
    input: Omit<UsageRecordInput, 'provider' | 'providerProfileId' | 'modelId'>,
  ): string | null {
    const profile = this.providerRepo.getProfile(profileId);
    if (!profile) return null;
    if (shouldUseMockProvider(profile, modelId)) {
      return null;
    }
    return this.recordUsage({
      ...input,
      providerProfileId: profileId,
      provider: profile.provider,
      modelId,
    });
  }

  checkUsageLimits(
    scopeType: 'global' | 'studio' | 'provider_profile',
    scopeId: string,
  ): UsageLimitCheck {
    const limits = this.db
      .prepare(
        `SELECT period, warning_microusd, hard_limit_microusd
         FROM usage_limits WHERE scope_type = ? AND scope_id = ? AND enabled = 1`,
      )
      .all(scopeType, scopeId) as Array<{
      period: 'session' | 'day' | 'month';
      warning_microusd: number | null;
      hard_limit_microusd: number | null;
    }>;

    if (limits.length === 0) {
      return {
        allowed: true,
        warning: false,
        spentMicrousd: 0,
        warningMicrousd: null,
        hardLimitMicrousd: null,
      };
    }

    let spentMicrousd = 0;
    let warningMicrousd: number | null = null;
    let hardLimitMicrousd: number | null = null;

    for (const limit of limits) {
      const since = periodStartMs(limit.period);
      const row = this.db
        .prepare(
          `SELECT COALESCE(SUM(estimated_cost_microusd), 0) AS total
           FROM usage_events WHERE created_at >= ?`,
        )
        .get(since) as { total: number };
      spentMicrousd = Math.max(spentMicrousd, row.total);
      warningMicrousd =
        warningMicrousd === null
          ? limit.warning_microusd
          : Math.min(warningMicrousd ?? Infinity, limit.warning_microusd ?? Infinity);
      hardLimitMicrousd =
        hardLimitMicrousd === null
          ? limit.hard_limit_microusd
          : Math.min(hardLimitMicrousd ?? Infinity, limit.hard_limit_microusd ?? Infinity);
    }

    const warning = warningMicrousd !== null && spentMicrousd >= warningMicrousd;
    const allowed = hardLimitMicrousd === null || spentMicrousd < hardLimitMicrousd;

    return {
      allowed,
      warning,
      spentMicrousd,
      warningMicrousd,
      hardLimitMicrousd,
    };
  }
}
