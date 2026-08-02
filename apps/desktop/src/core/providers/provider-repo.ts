import type {
  CreateProviderProfileInput,
  ProviderCapabilities,
  ProviderModel,
  ProviderProfile,
} from '@omakase/contracts';
import { ProviderCapabilitiesSchema } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';
import type { SecretStore } from '../storage/secrets.js';
import { maskKeySuffix } from '../storage/secrets.js';
import { defaultModelForProvider } from './model-defaults.js';

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  webSearch: false,
  vision: false,
  files: false,
  transcription: false,
  structuredOutput: true,
};

function secretRefForProfile(profileId: string): string {
  return `provider:${profileId}`;
}

function mapProfile(row: Record<string, unknown>, keySuffix: string | null): ProviderProfile {
  const caps = ProviderCapabilitiesSchema.parse(JSON.parse(row.capabilities_json as string));
  return {
    id: row.id as string,
    provider: row.provider as ProviderProfile['provider'],
    displayName: row.display_name as string,
    baseUrl: (row.base_url as string | null) ?? null,
    defaultModelId: (row.default_model_id as string | null) ?? null,
    capabilities: caps,
    enabled: (row.enabled as number) === 1,
    lastVerifiedAt: (row.last_verified_at as number | null) ?? null,
    lastVerification: (row.last_verification as ProviderProfile['lastVerification']) ?? null,
    lastErrorCode: (row.last_error_code as string | null) ?? null,
    keySuffix,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function withUnreadableSecret(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    last_verification: 'failed',
    last_error_code: 'secret_unreadable',
  };
}

function mapModel(row: Record<string, unknown>): ProviderModel {
  const caps = ProviderCapabilitiesSchema.parse(JSON.parse(row.capabilities_json as string));
  return {
    providerProfileId: row.provider_profile_id as string,
    modelId: row.model_id as string,
    displayName: (row.display_name as string | null) ?? null,
    capabilities: caps,
    active: (row.active as number) === 1,
  };
}

export class ProviderRepo {
  constructor(
    private readonly db: Database.Database,
    private readonly secretStore: SecretStore,
  ) {}

  listProfiles(): ProviderProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_profiles ORDER BY created_at ASC')
      .all() as Record<string, unknown>[];
    return rows.map((row) => {
      const ref = row.secret_ref as string;
      try {
        const key = this.secretStore.getSecret(ref);
        return mapProfile(row, key ? maskKeySuffix(key) : null);
      } catch {
        return mapProfile(withUnreadableSecret(row), null);
      }
    });
  }

  getProfile(id: string): ProviderProfile | null {
    const row = this.db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    try {
      const key = this.secretStore.getSecret(row.secret_ref as string);
      return mapProfile(row, key ? maskKeySuffix(key) : null);
    } catch {
      return mapProfile(withUnreadableSecret(row), null);
    }
  }

  createProfile(input: CreateProviderProfileInput): ProviderProfile {
    const id = newId();
    const ts = nowMs();
    const ref = secretRefForProfile(id);
    const displayName =
      input.displayName ??
      (input.provider === 'openai'
        ? 'OpenAI'
        : input.provider === 'anthropic'
          ? 'Anthropic'
          : 'OpenRouter');

    const defaultModelId = input.defaultModelId ?? defaultModelForProvider(input.provider);

    const existing = this.db
      .prepare(
        `SELECT id FROM provider_profiles
         WHERE provider = ? AND display_name = ? AND COALESCE(base_url, '') = COALESCE(?, '')
         ORDER BY created_at ASC
         LIMIT 1`,
      )
      .get(input.provider, displayName, input.baseUrl ?? null) as { id: string } | undefined;
    if (existing) {
      this.secretStore.setSecret(secretRefForProfile(existing.id), input.apiKey);
      this.db
        .prepare(
          `UPDATE provider_profiles SET
            default_model_id = ?,
            enabled = 1,
            last_verified_at = NULL,
            last_verification = NULL,
            last_error_code = NULL,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(defaultModelId, ts, existing.id);
      this.upsertModel(existing.id, {
        modelId: defaultModelId,
        displayName: defaultModelId,
        capabilities: DEFAULT_CAPABILITIES,
        active: true,
      });
      const profile = this.getProfile(existing.id);
      if (!profile) throw new Error('Failed to update provider profile');
      return profile;
    }

    this.secretStore.setSecret(ref, input.apiKey);

    this.db
      .prepare(
        `INSERT INTO provider_profiles (
          id, provider, display_name, base_url, default_model_id,
          secret_ref, capabilities_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.provider,
        displayName,
        input.baseUrl ?? null,
        defaultModelId,
        ref,
        JSON.stringify(DEFAULT_CAPABILITIES),
        ts,
        ts,
      );

    this.upsertModel(id, {
      modelId: defaultModelId,
      displayName: defaultModelId,
      capabilities: DEFAULT_CAPABILITIES,
      active: true,
    });

    const profile = this.getProfile(id);
    if (!profile) throw new Error('Failed to create provider profile');
    return profile;
  }

  updateProfile(
    id: string,
    patch: Partial<{
      displayName: string;
      baseUrl: string | null;
      defaultModelId: string | null;
      enabled: boolean;
      apiKey: string;
      lastVerification: 'ok' | 'failed';
      lastErrorCode: string | null;
    }>,
  ): ProviderProfile {
    const existing = this.getProfile(id);
    if (!existing) throw new Error('Provider profile not found');
    const ts = nowMs();

    if (patch.apiKey) {
      this.secretStore.setSecret(secretRefForProfile(id), patch.apiKey);
    }

    this.db
      .prepare(
        `UPDATE provider_profiles SET
          display_name = ?,
          base_url = ?,
          default_model_id = ?,
          enabled = ?,
          last_verified_at = ?,
          last_verification = ?,
          last_error_code = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.displayName ?? existing.displayName,
        patch.baseUrl !== undefined ? patch.baseUrl : existing.baseUrl,
        patch.defaultModelId !== undefined ? patch.defaultModelId : existing.defaultModelId,
        patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled ? 1 : 0,
        patch.lastVerification ? ts : existing.lastVerifiedAt,
        patch.lastVerification ?? existing.lastVerification,
        patch.lastErrorCode !== undefined ? patch.lastErrorCode : existing.lastErrorCode,
        ts,
        id,
      );

    const profile = this.getProfile(id);
    if (!profile) throw new Error('Provider profile missing after update');
    return profile;
  }

  deleteProfile(id: string): void {
    const row = this.db.prepare('SELECT secret_ref FROM provider_profiles WHERE id = ?').get(id) as
      | { secret_ref: string }
      | undefined;
    if (!row) return;
    this.db.prepare('DELETE FROM provider_profiles WHERE id = ?').run(id);
    this.secretStore.deleteSecret(row.secret_ref);
  }

  getApiKey(profileId: string): string | null {
    try {
      return this.secretStore.getSecret(secretRefForProfile(profileId));
    } catch {
      return null;
    }
  }

  listModels(profileId: string): ProviderModel[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_models WHERE provider_profile_id = ? ORDER BY model_id ASC')
      .all(profileId) as Record<string, unknown>[];
    return rows.map(mapModel);
  }

  upsertModel(
    profileId: string,
    model: {
      modelId: string;
      displayName?: string | null;
      capabilities?: ProviderCapabilities;
      active?: boolean;
      inputCostMicrousdPerMillion?: number | null;
      outputCostMicrousdPerMillion?: number | null;
    },
  ): ProviderModel {
    const ts = nowMs();
    const caps = model.capabilities ?? DEFAULT_CAPABILITIES;
    this.db
      .prepare(
        `INSERT INTO provider_models (
          provider_profile_id, model_id, display_name, capabilities_json,
          input_cost_microusd_per_million_tokens, output_cost_microusd_per_million_tokens,
          active, discovered_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_profile_id, model_id) DO UPDATE SET
          display_name = excluded.display_name,
          capabilities_json = excluded.capabilities_json,
          input_cost_microusd_per_million_tokens = excluded.input_cost_microusd_per_million_tokens,
          output_cost_microusd_per_million_tokens = excluded.output_cost_microusd_per_million_tokens,
          active = excluded.active,
          updated_at = excluded.updated_at`,
      )
      .run(
        profileId,
        model.modelId,
        model.displayName ?? model.modelId,
        JSON.stringify(caps),
        model.inputCostMicrousdPerMillion ?? null,
        model.outputCostMicrousdPerMillion ?? null,
        model.active !== false ? 1 : 0,
        ts,
        ts,
      );

    const row = this.db
      .prepare('SELECT * FROM provider_models WHERE provider_profile_id = ? AND model_id = ?')
      .get(profileId, model.modelId) as Record<string, unknown>;
    return mapModel(row);
  }
}
