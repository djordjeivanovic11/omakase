import {
  type AgentRuntimeContext,
  type AgentStreamEvent,
  type LearningResponse,
  LearningResponseSchema,
  type StartLearnSessionInput,
} from '@omakase/contracts';
import { generateText, stepCountIs, ToolLoopAgent } from 'ai';
import type Database from 'better-sqlite3';
import { NextActionsService } from '../learning/next-actions.js';
import { aiSdkTelemetrySettings, recordAiTrace } from '../observability/ai-traces.js';
import {
  defaultModelForProvider,
  isExplicitMockProfile,
  openaiResponsesProviderOptions,
} from '../providers/model-defaults.js';
import { parseMockStructuredOutput } from '../providers/mock-model.js';
import { ProviderRepo } from '../providers/provider-repo.js';
import { createLanguageModel, shouldUseMockProvider } from '../providers/registry.js';
import { UsageService } from '../providers/usage.js';
import { type EmbeddingService, GraniteEmbeddingService } from '../retrieval/embeddings.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';
import { newId, nowMs } from '../storage/ids.js';
import type { SecretStore } from '../storage/secrets.js';
import { clampRetrievedBlocks, MODE_LIMITS, userFacingBudgetMessage } from './budgets.js';
import { buildCitationsFromMarkdown, validateCitationProposals } from './citations.js';
import {
  blocksToContextViews,
  buildAgentPromptParts,
  type ContextBlockView,
  resolveSourceIdsByVersion,
} from './context.js';
import { buildSystemInstructions, PROMPT_VERSION } from './prompts.js';
import { buildAgentTools, toolsForMode } from './tools.js';

export interface AgentServiceDeps {
  db: Database.Database;
  secretStore: SecretStore;
  embeddingService?: EmbeddingService;
}

export class AgentService {
  private readonly providerRepo: ProviderRepo;
  private readonly usage: UsageService;
  private readonly embeddingService: EmbeddingService;
  private readonly nextActions: NextActionsService;

  constructor(private readonly deps: AgentServiceDeps) {
    this.embeddingService = deps.embeddingService ?? new GraniteEmbeddingService();
    this.providerRepo = new ProviderRepo(deps.db, deps.secretStore);
    this.usage = new UsageService(deps.db, this.providerRepo);
    this.nextActions = new NextActionsService(deps.db);
  }

  resolveDefaultProvider(): { profileId: string; modelId: string } {
    const profiles = this.providerRepo.listProfiles().filter((p) => p.enabled);
    // Prefer a real (non-mock) profile when both exist.
    const real = profiles.find((p) => !isExplicitMockProfile(p.displayName, p.defaultModelId));
    const profile = real ?? profiles[0];
    if (!profile) {
      throw new Error(
        'No enabled provider profile. Connect an API key in You, or set OMAKASE_MOCK_PROVIDER=1 for tests.',
      );
    }
    if (isExplicitMockProfile(profile.displayName, profile.defaultModelId)) {
      const modelId = profile.defaultModelId ?? 'mock-learn-v1';
      return { profileId: profile.id, modelId };
    }
    const modelId = profile.defaultModelId ?? defaultModelForProvider(profile.provider);
    if (!profile.defaultModelId) {
      this.providerRepo.updateProfile(profile.id, { defaultModelId: modelId });
    }
    return { profileId: profile.id, modelId };
  }

  startSession(
    input: StartLearnSessionInput,
    providerProfileId?: string,
    modelId?: string,
  ): { sessionId: string; runtimeContext: AgentRuntimeContext } {
    const defaults = this.resolveDefaultProvider();
    const profileId = providerProfileId ?? defaults.profileId;
    const resolvedModel = modelId ?? defaults.modelId;
    const sessionId = newId();
    const ts = nowMs();
    const mode = input.mode ?? 'learn';
    const limits = MODE_LIMITS[mode === 'research' ? 'research' : 'learn'];

    const runtimeContext: AgentRuntimeContext = {
      mode,
      studioId: input.studioId,
      sourceIds: input.sourceId ? [input.sourceId] : [],
      providerProfileId: profileId,
      modelId: resolvedModel,
      sessionId,
      maxSteps: limits.maxSteps,
    };

    this.deps.db
      .prepare(
        `INSERT INTO sessions (
          id, studio_id, mode, objective, status, provider_profile_id, model_id,
          prompt_version, runtime_context_json, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        sessionId,
        input.studioId,
        mode,
        input.objective ?? null,
        profileId,
        resolvedModel,
        PROMPT_VERSION,
        JSON.stringify(runtimeContext),
        ts,
        ts,
        ts,
      );

    if (input.sourceId) {
      this.deps.db
        .prepare(
          `INSERT INTO session_sources (session_id, source_id, role, added_at)
           VALUES (?, ?, 'selected', ?)
           ON CONFLICT DO NOTHING`,
        )
        .run(sessionId, input.sourceId, ts);
    }

    return { sessionId, runtimeContext };
  }

  /**
   * The deterministic test model returns a `LearningResponse` as JSON. Real
   * providers answer in prose with inline `[S1]` markers, so the structured
   * response is assembled here rather than trusting the model to emit JSON.
   */
  private toLearningResponse(text: string, contextBlocks: ContextBlockView[]): LearningResponse {
    try {
      return parseMockStructuredOutput<LearningResponse>('learn', text);
    } catch {
      // Not the deterministic model; fall through to prose handling.
    }

    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = LearningResponseSchema.safeParse(JSON.parse(trimmed));
        if (parsed.success) return parsed.data;
      } catch {
        // Not JSON after all.
      }
    }

    const { answerMarkdown, proposals } = buildCitationsFromMarkdown(text, contextBlocks);
    return LearningResponseSchema.parse({
      answerMarkdown,
      citations: proposals,
      suggestedActions: [],
      learningEvidenceProposals: [],
      possibleMisconceptions: [],
      sessionSummary: answerMarkdown.slice(0, 500),
    });
  }

  async *sendMessage(sessionId: string, message: string): AsyncGenerator<AgentStreamEvent> {
    const session = this.deps.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
      | Record<string, unknown>
      | undefined;
    if (!session) {
      yield {
        type: 'error',
        sessionId,
        code: 'session_not_found',
        message: 'Session not found',
      };
      return;
    }

    const runtimeContext = JSON.parse(
      session.runtime_context_json as string,
    ) as AgentRuntimeContext;
    const mode = (session.mode as string) === 'research' ? 'research' : 'learn';
    const studioId = session.studio_id as string;
    const limits = MODE_LIMITS[mode];

    const usageCheck = this.usage.checkUsageLimits('studio', studioId);
    if (!usageCheck.allowed) {
      yield {
        type: 'error',
        sessionId,
        code: 'budget_exceeded',
        message: userFacingBudgetMessage('budget_exceeded'),
      };
      return;
    }

    const ts = nowMs();
    const ordinalRow = this.deps.db
      .prepare('SELECT COALESCE(MAX(ordinal), -1) + 1 AS next FROM messages WHERE session_id = ?')
      .get(sessionId) as { next: number };

    this.deps.db
      .prepare(
        `INSERT INTO messages (id, session_id, ordinal, role, content_text, status, created_at)
         VALUES (?, ?, ?, 'user', ?, 'complete', ?)`,
      )
      .run(newId(), sessionId, ordinalRow.next, message, ts);

    const retrieved = await hybridRetrieve(this.deps.db, this.embeddingService, {
      studioId,
      query: message,
      sourceIds: runtimeContext.sourceIds,
    });
    const blocks = clampRetrievedBlocks(retrieved, limits);

    const versionIds = [...new Set(blocks.map((b) => b.block.sourceVersionId))];
    const sourceMap = resolveSourceIdsByVersion(this.deps.db, versionIds);
    const contextBlocks = blocksToContextViews(blocks, sourceMap);

    const { system, prompt } = buildAgentPromptParts({
      mode,
      objective: (session.objective as string | null) ?? undefined,
      contextBlocks,
      userMessage: message,
    });

    const profile = this.providerRepo.getProfile(runtimeContext.providerProfileId);
    if (!profile) {
      yield {
        type: 'error',
        sessionId,
        code: 'provider_not_found',
        message: 'Provider missing',
      };
      return;
    }

    const apiKey = this.providerRepo.getApiKey(runtimeContext.providerProfileId);
    const model = createLanguageModel(
      { profile, modelId: runtimeContext.modelId, apiKey },
      this.deps.secretStore,
      { mode },
    );

    const tools = toolsForMode(
      mode,
      buildAgentTools({
        db: this.deps.db,
        embeddingService: this.embeddingService,
        runtimeContext,
      }),
    );

    const started = Date.now();
    let fullText = '';

    const useMock = shouldUseMockProvider(profile, runtimeContext.modelId);
    const openaiOptions =
      !useMock && profile.provider === 'openai' ? openaiResponsesProviderOptions() : undefined;

    try {
      if (useMock) {
        const gen = await generateText({
          model,
          system: `${buildSystemInstructions(mode)}\n\n${system}`,
          prompt,
          abortSignal: AbortSignal.timeout(limits.timeoutMs),
          experimental_telemetry: aiSdkTelemetrySettings('omakase.learn.generate'),
        });
        fullText = gen.text;
        const chunkSize = Math.max(8, Math.ceil(fullText.length / 5));
        for (let i = 0; i < fullText.length; i += chunkSize) {
          yield {
            type: 'text-delta',
            sessionId,
            delta: fullText.slice(i, i + chunkSize),
          };
        }
        this.usage.recordFromProfile(runtimeContext.providerProfileId, runtimeContext.modelId, {
          sessionId,
          operation: 'generate',
          inputTokens: gen.usage?.inputTokens,
          outputTokens: gen.usage?.outputTokens,
          latencyMs: Date.now() - started,
          success: true,
        });
        recordAiTrace({
          traceId: sessionId,
          sessionId,
          mode,
          provider: profile.provider,
          modelId: runtimeContext.modelId,
          durationMs: Date.now() - started,
          stepCount: 1,
          retrievedBlockIds: contextBlocks.map((b) => b.sourceBlockId),
          inputTokens: gen.usage?.inputTokens,
          outputTokens: gen.usage?.outputTokens,
          stopReason: 'mock_complete',
        });
      } else {
        const agent = new ToolLoopAgent({
          model,
          tools,
          instructions: buildSystemInstructions(mode),
          stopWhen: stepCountIs(Math.min(limits.maxSteps, mode === 'research' ? 10 : 8)),
          experimental_telemetry: aiSdkTelemetrySettings('omakase.learn.stream'),
        });

        const streamResult = await agent.stream({
          prompt: `${system}\n\n${prompt}`,
          abortSignal: AbortSignal.timeout(limits.timeoutMs),
          ...(openaiOptions
            ? { providerOptions: { openai: openaiOptions } }
            : {}),
        });

        let toolCallCount = 0;
        try {
          for await (const part of streamResult.fullStream) {
            if (part.type === 'tool-call') toolCallCount += 1;
            if (part.type === 'text-delta' && 'textDelta' in part) {
              const delta = String((part as { textDelta?: string }).textDelta ?? '');
              if (delta) {
                fullText += delta;
                yield { type: 'text-delta', sessionId, delta };
              }
            }
          }
        } catch {
          // fall through to text stream if fullStream shape differs
        }

        if (!fullText) {
          for await (const chunk of streamResult.textStream) {
            fullText += chunk;
            yield { type: 'text-delta', sessionId, delta: chunk };
          }
        }

        if (!fullText) {
          fullText = (await streamResult.text) ?? '';
        }

        this.usage.recordFromProfile(runtimeContext.providerProfileId, runtimeContext.modelId, {
          sessionId,
          operation: 'stream',
          latencyMs: Date.now() - started,
          success: true,
        });
        recordAiTrace({
          traceId: sessionId,
          sessionId,
          mode,
          provider: profile.provider,
          modelId: runtimeContext.modelId,
          durationMs: Date.now() - started,
          stepCount: toolCallCount || limits.maxSteps,
          toolNames: Object.keys(tools),
          retrievedBlockIds: contextBlocks.map((b) => b.sourceBlockId),
          stopReason: 'stream_complete',
          toolCallCount,
          responsesApi: profile.provider === 'openai',
          reasoningEffort: openaiOptions?.reasoningEffort ?? null,
          store: openaiOptions?.store ?? null,
        });
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const timedOut = /abort|timeout/i.test(raw);
      const code = timedOut ? 'timeout' : 'generation_failed';
      recordAiTrace({
        traceId: sessionId,
        sessionId,
        mode,
        modelId: runtimeContext.modelId,
        durationMs: Date.now() - started,
        errorCode: code,
        errorMessage: timedOut ? 'timeout' : 'generation_failed',
        stopReason: code,
      });
      yield {
        type: 'error',
        sessionId,
        code,
        message: timedOut ? userFacingBudgetMessage('timeout') : raw,
      };
      return;
    }

    const learningResponse = this.toLearningResponse(fullText, contextBlocks);
    const validation = validateCitationProposals(learningResponse.citations, contextBlocks);
    for (const citation of validation.validated) {
      yield {
        type: 'citation',
        sessionId,
        handle: citation.handle,
        sourceBlockId: citation.sourceBlockId,
        claimSummary: citation.claimSummary,
      };
    }

    const messageId = newId();
    const assistantOrdinal = ordinalRow.next + 1;
    this.deps.db
      .prepare(
        `INSERT INTO messages (id, session_id, ordinal, role, content_text, content_json, status, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, 'complete', ?)`,
      )
      .run(
        messageId,
        sessionId,
        assistantOrdinal,
        learningResponse.answerMarkdown,
        JSON.stringify(learningResponse),
        nowMs(),
      );

    validation.validated.forEach((citation, index) => {
      this.deps.db
        .prepare(
          `INSERT INTO citations (
            id, message_id, handle, occurrence_index, source_block_id,
            supporting_quote, locator_snapshot_json, verification_status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          messageId,
          citation.handle,
          index,
          citation.sourceBlockId,
          citation.claimSummary,
          citation.locatorSnapshotJson,
          citation.verificationStatus,
          nowMs(),
        );
    });

    const firstCitation = validation.validated[0];
    const firstBlock = firstCitation
      ? contextBlocks.find((b) => b.handle === firstCitation.handle)
      : undefined;
    this.nextActions.proposeAfterLearn(
      studioId,
      firstBlock?.sourceId ?? runtimeContext.sourceIds[0] ?? null,
      firstCitation?.sourceBlockId ?? null,
    );

    yield {
      type: 'final',
      sessionId,
      messageId,
      result: {
        ...learningResponse,
        citations: validation.validated.map((c) => ({
          handle: c.handle,
          claimSummary: c.claimSummary,
        })),
      },
    };
  }
}
