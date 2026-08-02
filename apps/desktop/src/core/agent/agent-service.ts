import {
  type AgentRuntimeContext,
  AgentRuntimeContextSchema,
  type AgentStreamEvent,
  type LearningResponse,
  LearningResponseSchema,
  type StartLearnSessionInput,
} from '@omakase/contracts';
import { generateText, stepCountIs, ToolLoopAgent } from 'ai';
import type Database from 'better-sqlite3';
import { reconcileConceptRelationships } from '../learning/concept-graph-repo.js';
import { NextActionsService } from '../learning/next-actions.js';
import { aiSdkTelemetrySettings, recordAiTrace } from '../observability/ai-traces.js';
import { parseMockStructuredOutput } from '../providers/mock-model.js';
import {
  defaultModelForProvider,
  isExplicitMockProfile,
  isMockProviderRuntimeAllowed,
  openaiResponsesProviderOptions,
} from '../providers/model-defaults.js';
import { ProviderRepo } from '../providers/provider-repo.js';
import { createLanguageModel, shouldUseMockProvider } from '../providers/registry.js';
import { UsageService } from '../providers/usage.js';
import type { EmbeddingService } from '../retrieval/embeddings.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';
import { persistValidatedCitations } from '../sources/evidence-repo.js';
import {
  loadSessionScopeSnapshot,
  persistSessionScopeSnapshot,
  resolveSourceScope,
} from '../sources/source-scope.js';
import { sha256Hex } from '../storage/hash.js';
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
import { AgentEventsRepo, type AppendAgentEventInput } from './events.js';
import { buildSystemInstructions, PROMPT_VERSION } from './prompts.js';
import { buildAgentTools, toolsForMode, withToolCallBudget } from './tools.js';

function createRunAbortSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (parent?.aborted) {
    controller.abort();
  } else {
    parent?.addEventListener('abort', abort, { once: true });
  }
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeout);
      parent?.removeEventListener('abort', abort);
    },
    { once: true },
  );
  return controller.signal;
}

export interface AgentServiceDeps {
  db: Database.Database;
  secretStore: SecretStore;
  embeddingService: EmbeddingService;
}

export class AgentService {
  private readonly providerRepo: ProviderRepo;
  private readonly usage: UsageService;
  private readonly embeddingService: EmbeddingService;
  private readonly nextActions: NextActionsService;
  private readonly events: AgentEventsRepo;

  constructor(private readonly deps: AgentServiceDeps) {
    this.embeddingService = deps.embeddingService;
    this.providerRepo = new ProviderRepo(deps.db, deps.secretStore);
    this.usage = new UsageService(deps.db, this.providerRepo);
    this.nextActions = new NextActionsService(deps.db);
    this.events = new AgentEventsRepo(deps.db);
  }

  resolveDefaultProvider(): { profileId: string; modelId: string } {
    const profiles = this.providerRepo.listProfiles().filter((p) => p.enabled);
    // Prefer a real (non-mock) profile with a readable key when both exist.
    const real =
      profiles.find(
        (p) => !isExplicitMockProfile(p.displayName, p.defaultModelId) && p.keySuffix,
      ) ?? profiles.find((p) => !isExplicitMockProfile(p.displayName, p.defaultModelId));
    const profile = real ?? profiles[0];
    if (!profile) {
      throw new Error('No enabled provider profile. Connect an API key in You.');
    }
    if (isExplicitMockProfile(profile.displayName, profile.defaultModelId)) {
      if (!isMockProviderRuntimeAllowed()) {
        throw new Error(
          'Local mock provider is disabled outside deterministic test runs. Connect a real model provider in You, then start the lesson again.',
        );
      }
      const modelId = profile.defaultModelId ?? 'mock-learn-v1';
      return { profileId: profile.id, modelId };
    }
    if (!profile.keySuffix) {
      throw new Error(
        'Provider API key is missing or unreadable. Re-save the model provider key in You, then start the lesson again.',
      );
    }
    const modelId = profile.defaultModelId ?? defaultModelForProvider(profile.provider);
    if (!profile.defaultModelId) {
      this.providerRepo.updateProfile(profile.id, { defaultModelId: modelId });
    }
    return { profileId: profile.id, modelId };
  }

  listActivity(sessionId: string) {
    return this.events.listForSession(sessionId);
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

    const sourceScope =
      input.scope ??
      (input.sourceId
        ? { kind: 'source' as const, sourceId: input.sourceId }
        : { kind: 'studio' as const, studioId: input.studioId });
    const resolvedScope = resolveSourceScope(this.deps.db, input.studioId, sourceScope);

    const runtimeContext = AgentRuntimeContextSchema.parse({
      mode,
      studioId: input.studioId,
      sourceIds: resolvedScope.sourceIds,
      sourceScope,
      resolvedSourceVersionIds: resolvedScope.sourceVersionIds,
      providerProfileId: profileId,
      modelId: resolvedModel,
      sessionId,
      maxSteps: limits.maxSteps,
    });

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

    persistSessionScopeSnapshot(this.deps.db, sessionId, resolvedScope);
    const role = sourceScope.kind === 'studio' ? 'context' : 'selected';
    const insertSessionSource = this.deps.db.prepare(
      `INSERT INTO session_sources (session_id, source_id, source_version_id, role, added_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    );
    const sourceVersionBySource = new Map<string, string>();
    const versionRows = this.deps.db
      .prepare(
        `SELECT id, source_id FROM source_versions WHERE id IN (${resolvedScope.sourceVersionIds.map(() => '?').join(', ') || "''"})`,
      )
      .all(...resolvedScope.sourceVersionIds) as Array<{ id: string; source_id: string }>;
    for (const row of versionRows) sourceVersionBySource.set(row.source_id, row.id);
    for (const sourceId of resolvedScope.sourceIds) {
      const versionId = sourceVersionBySource.get(sourceId);
      if (versionId) insertSessionSource.run(sessionId, sourceId, versionId, role, ts);
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

  async *sendMessage(
    sessionId: string,
    message: string,
    parentSignal?: AbortSignal,
  ): AsyncGenerator<AgentStreamEvent> {
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

    const runtimeContext = AgentRuntimeContextSchema.parse(
      JSON.parse(session.runtime_context_json as string),
    );
    const mode = (session.mode as string) === 'research' ? 'research' : 'learn';
    const studioId = session.studio_id as string;
    const limits = MODE_LIMITS[mode];
    const persistedScope = loadSessionScopeSnapshot(this.deps.db, sessionId);
    const scopeHash =
      persistedScope?.scopeHash ??
      sha256Hex(JSON.stringify({ studioId, sourceIds: runtimeContext.sourceIds }));
    const runId = this.events.startRun(sessionId, scopeHash);
    const emitActivity = (input: AppendAgentEventInput): AgentStreamEvent => ({
      type: 'activity',
      sessionId,
      runId,
      event: this.events.append(runId, input),
    });

    yield emitActivity({
      type: 'RUN_STARTED',
      status: 'started',
      summary: 'Started a scoped learning run',
      details: {
        sourceCount: runtimeContext.sourceIds.length,
        sourceVersionCount: runtimeContext.resolvedSourceVersionIds.length,
      },
    });

    const usageCheck = this.usage.checkUsageLimits('studio', studioId);
    if (!usageCheck.allowed) {
      yield emitActivity({
        type: 'RUN_ERROR',
        status: 'failed',
        summary: 'Learning run stopped because the local budget is exhausted',
        details: { code: 'budget_exceeded' },
      });
      this.events.finishRun(runId, 'failed', {
        code: 'budget_exceeded',
        message: userFacingBudgetMessage('budget_exceeded'),
      });
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

    let retrieved: Awaited<ReturnType<typeof hybridRetrieve>>;
    try {
      if (parentSignal?.aborted) throw new Error('Run cancelled');
      retrieved = await hybridRetrieve(this.deps.db, this.embeddingService, {
        studioId,
        query: message,
        sourceIds: runtimeContext.sourceIds,
        sourceVersionIds: runtimeContext.sourceScope
          ? runtimeContext.resolvedSourceVersionIds
          : undefined,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const interrupted = parentSignal?.aborted === true;
      const code = interrupted ? 'cancelled' : 'retrieval_failed';
      yield emitActivity({
        type: interrupted ? 'RUN_INTERRUPTED' : 'RUN_ERROR',
        status: interrupted ? 'cancelled' : 'failed',
        summary: interrupted
          ? 'Stopped while searching the selected sources'
          : 'Source search failed',
        details: { code },
      });
      this.events.finishRun(runId, interrupted ? 'interrupted' : 'failed', {
        code,
        message: raw,
      });
      if (interrupted) {
        yield { type: 'cancelled', sessionId };
      } else {
        yield { type: 'error', sessionId, code, message: raw };
      }
      return;
    }
    const blocks = clampRetrievedBlocks(retrieved, limits);

    const versionIds = [...new Set(blocks.map((b) => b.block.sourceVersionId))];
    const sourceMap = resolveSourceIdsByVersion(this.deps.db, versionIds);
    const contextBlocks = blocksToContextViews(blocks, sourceMap);

    yield emitActivity({
      type: 'SOURCE_RETRIEVED',
      status: 'succeeded',
      summary: `Searched ${runtimeContext.sourceIds.length} selected source${runtimeContext.sourceIds.length === 1 ? '' : 's'}`,
      sourceRefs: versionIds,
      details: {
        passageCount: contextBlocks.length,
        sourceVersionCount: versionIds.length,
      },
    });
    yield emitActivity({
      type: 'SOURCE_READ',
      status: 'succeeded',
      summary: `Loaded ${contextBlocks.length} retrieved passage${contextBlocks.length === 1 ? '' : 's'} into the lesson`,
      sourceRefs: versionIds,
      details: {
        sourceBlockIds: contextBlocks.map((block) => block.sourceBlockId),
        passageCount: contextBlocks.length,
      },
    });

    const { system, prompt } = buildAgentPromptParts({
      mode,
      objective: (session.objective as string | null) ?? undefined,
      contextBlocks,
      userMessage: message,
    });

    const profile = this.providerRepo.getProfile(runtimeContext.providerProfileId);
    if (!profile) {
      yield emitActivity({
        type: 'RUN_ERROR',
        status: 'failed',
        summary: 'Provider is unavailable',
        details: { code: 'provider_not_found' },
      });
      this.events.finishRun(runId, 'failed', {
        code: 'provider_not_found',
        message: 'Provider missing',
      });
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

    const tools = withToolCallBudget(
      toolsForMode(
        mode,
        buildAgentTools({
          db: this.deps.db,
          embeddingService: this.embeddingService,
          runtimeContext,
        }),
      ),
      limits,
    );

    const started = Date.now();
    const runSignal = createRunAbortSignal(parentSignal, limits.timeoutMs);
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
          abortSignal: runSignal,
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
          stopWhen: stepCountIs(limits.maxSteps),
          experimental_telemetry: aiSdkTelemetrySettings('omakase.learn.stream'),
        });

        const streamResult = await agent.stream({
          prompt: `${system}\n\n${prompt}`,
          abortSignal: runSignal,
          ...(openaiOptions ? { providerOptions: { openai: openaiOptions } } : {}),
        });

        let toolCallCount = 0;
        try {
          for await (const part of streamResult.fullStream) {
            if (part.type === 'tool-call') {
              toolCallCount += 1;
              const toolPart = part as { toolName?: string; toolCallId?: string };
              yield emitActivity({
                type: 'TOOL_CALL_STARTED',
                status: 'started',
                summary: `Using ${toolPart.toolName ?? 'a local source tool'}`,
                toolName: toolPart.toolName ?? null,
                details: { toolCallId: toolPart.toolCallId ?? null },
              });
            }
            if (part.type === 'tool-result') {
              const toolPart = part as { toolName?: string; toolCallId?: string };
              yield emitActivity({
                type: 'TOOL_RESULT',
                status: 'succeeded',
                summary: `${toolPart.toolName ?? 'Local source tool'} completed`,
                toolName: toolPart.toolName ?? null,
                details: { toolCallId: toolPart.toolCallId ?? null },
              });
            }
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
      const interrupted = parentSignal?.aborted === true;
      const budgetExceeded =
        /too many internal actions|max_tool_calls|max_identical_tool_calls/i.test(raw);
      const code = interrupted
        ? 'cancelled'
        : timedOut
          ? 'timeout'
          : budgetExceeded
            ? 'max_tool_calls'
            : 'generation_failed';
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
      yield emitActivity({
        type: interrupted ? 'RUN_INTERRUPTED' : 'RUN_ERROR',
        status: interrupted ? 'cancelled' : 'failed',
        summary: interrupted
          ? 'Stopped the learning run'
          : timedOut
            ? 'Learning run timed out'
            : budgetExceeded
              ? 'Learning run stopped at its safe action limit'
              : 'Learning run failed',
        details: { code, durationMs: Date.now() - started },
      });
      this.events.finishRun(runId, interrupted ? 'interrupted' : 'failed', { code, message: raw });
      if (interrupted) {
        yield { type: 'cancelled', sessionId };
        return;
      }
      yield {
        type: 'error',
        sessionId,
        code,
        message: timedOut || budgetExceeded ? userFacingBudgetMessage(code) : raw,
      };
      return;
    }

    const learningResponse = this.toLearningResponse(fullText, contextBlocks);
    const validation = validateCitationProposals(learningResponse.citations, contextBlocks);
    yield emitActivity({
      type: 'CITATIONS_CHECKED',
      status: validation.rejected.length > 0 ? 'warning' : 'succeeded',
      summary:
        validation.rejected.length > 0
          ? `Checked citations; removed ${validation.rejected.length} unsupported reference${validation.rejected.length === 1 ? '' : 's'}`
          : `Checked ${validation.validated.length} citation${validation.validated.length === 1 ? '' : 's'}`,
      sourceRefs: versionIds,
      details: {
        verified: validation.validated.length,
        rejected: validation.rejected.length,
      },
    });
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

    const evidenceReferences = persistValidatedCitations(
      this.deps.db,
      messageId,
      validation.validated,
    );
    const conceptGraph = reconcileConceptRelationships(this.deps.db, studioId, evidenceReferences);
    yield emitActivity({
      type: 'CONCEPT_GRAPH_UPDATED',
      status: 'succeeded',
      summary:
        conceptGraph.createdRelationCount > 0
          ? `Connected ${conceptGraph.createdRelationCount} source-backed concept${conceptGraph.createdRelationCount === 1 ? '' : 's'}`
          : 'Checked cited passages for supported concept connections',
      sourceRefs: versionIds,
      details: { ...conceptGraph },
    });
    const persistedResponse: LearningResponse = {
      ...learningResponse,
      citations: validation.validated.map((citation, index) => ({
        handle: citation.handle,
        claimSummary: citation.claimSummary,
        evidence: evidenceReferences[index],
      })),
    };
    this.deps.db
      .prepare('UPDATE messages SET content_json = ? WHERE id = ?')
      .run(JSON.stringify(persistedResponse), messageId);

    for (const [index, citation] of validation.validated.entries()) {
      yield {
        type: 'citation',
        sessionId,
        handle: citation.handle,
        sourceBlockId: citation.sourceBlockId,
        claimSummary: citation.claimSummary,
        evidence: evidenceReferences[index],
      };
    }

    const firstCitation = validation.validated[0];
    const firstBlock = firstCitation
      ? contextBlocks.find((b) => b.handle === firstCitation.handle)
      : undefined;
    this.nextActions.proposeAfterLearn(
      studioId,
      firstBlock?.sourceId ?? runtimeContext.sourceIds[0] ?? null,
      firstCitation?.sourceBlockId ?? null,
    );

    yield emitActivity({
      type: 'RUN_FINISHED',
      status: 'succeeded',
      summary: `Completed using ${versionIds.length} source${versionIds.length === 1 ? '' : 's'}`,
      sourceRefs: versionIds,
      details: {
        citationCount: validation.validated.length,
        passageCount: contextBlocks.length,
        conceptConnections: conceptGraph.createdRelationCount,
        durationMs: Date.now() - started,
      },
      durationMs: Date.now() - started,
    });
    this.events.finishRun(runId, 'completed');

    yield {
      type: 'final',
      sessionId,
      messageId,
      result: {
        ...persistedResponse,
      },
    };
  }
}
