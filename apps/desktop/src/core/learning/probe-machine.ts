import type { ProbeTurnResult, StartProbeInput } from '@omakase/contracts';
import { generateObject, generateText } from 'ai';
import type Database from 'better-sqlite3';
import {
  blocksToContextViews,
  buildAgentPromptParts,
  resolveSourceIdsByVersion,
} from '../agent/context.js';
import { buildSystemInstructions, PROMPT_VERSION } from '../agent/prompts.js';
import { parseMockStructuredOutput } from '../providers/mock-model.js';
import type { ProviderRepo } from '../providers/provider-repo.js';
import { createLanguageModel, shouldUseMockProvider } from '../providers/registry.js';
import type { UsageService } from '../providers/usage.js';
import type { EmbeddingService } from '../retrieval/embeddings.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';
import { newId, nowMs } from '../storage/ids.js';
import type { SecretStore } from '../storage/secrets.js';
import { ConceptsRepo } from './concepts-repo.js';
import { LearningEventsRepo } from './events.js';
import { verifyAnswerExcerpt } from './evidence.js';
import { NextActionsService } from './next-actions.js';
import { ProbeEvaluationSchema, toProbeTurnResult } from './probe-schema.js';
import { rebuildConceptState } from './projector.js';

/** A probe evaluation is one model call; keep it bounded like every other. */
const PROBE_TIMEOUT_MS = 90_000;

export interface ProbeState {
  probeId: string;
  sessionId: string;
  studioId: string;
  status: string;
  turnNumber: number;
  objective: string;
  maxTurns: number;
}

export class ProbeMachine {
  constructor(
    private readonly db: Database.Database,
    private readonly secretStore: SecretStore,
    private readonly embeddingService: EmbeddingService,
    private readonly providerRepo: ProviderRepo,
    private readonly usage: UsageService,
  ) {}

  start(input: StartProbeInput, providerProfileId: string, modelId: string): ProbeState {
    const sessionId = newId();
    const probeId = newId();
    const ts = nowMs();

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO sessions (
            id, studio_id, mode, objective, status, provider_profile_id,
            model_id, prompt_version, runtime_context_json, started_at, created_at, updated_at
          ) VALUES (?, ?, 'probe', ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sessionId,
          input.studioId,
          input.objective,
          providerProfileId,
          modelId,
          PROMPT_VERSION,
          JSON.stringify({ mode: 'probe', maxTurns: input.maxTurns }),
          ts,
          ts,
          ts,
        );

      this.db
        .prepare(
          `INSERT INTO probes (
            id, session_id, studio_id, objective, desired_depth, max_turns,
            status, started_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'building_rubric', ?, ?, ?)`,
        )
        .run(
          probeId,
          sessionId,
          input.studioId,
          input.objective,
          input.desiredDepth,
          input.maxTurns,
          ts,
          ts,
          ts,
        );

      this.db
        .prepare(`UPDATE probes SET status = 'asking', updated_at = ? WHERE id = ?`)
        .run(ts, probeId);

      const questionId = newId();
      this.db
        .prepare(
          `INSERT INTO messages (id, session_id, ordinal, role, content_text, status, created_at)
           VALUES (?, ?, 0, 'assistant', ?, 'complete', ?)`,
        )
        .run(
          questionId,
          sessionId,
          `Let's begin the probe on: ${input.objective}\n\nIn your own words, what is the central idea, and what problem does it solve?`,
          ts,
        );

      this.db
        .prepare(
          `INSERT INTO probe_turns (
            id, probe_id, turn_number, question_message_id, question_type,
            purpose, rubric_json, status, asked_at
          ) VALUES (?, ?, 1, ?, 'explain', ?, ?, 'awaiting_answer', ?)`,
        )
        .run(
          newId(),
          probeId,
          questionId,
          'Initial broad explanation question.',
          JSON.stringify({
            targetConcepts: [input.objective.split(' ')[0] ?? 'topic'],
            distinctions: [],
            patterns: [],
            misconceptions: [],
            evidenceLevel: 'can_explain',
            successCriteria: ['Coherent explanation'],
          }),
          ts,
        );
    });

    tx();

    return this.getState(probeId);
  }

  getState(probeId: string): ProbeState {
    const probe = this.db.prepare('SELECT * FROM probes WHERE id = ?').get(probeId) as Record<
      string,
      unknown
    >;
    if (!probe) throw new Error('Probe not found');
    const turn = this.db
      .prepare('SELECT MAX(turn_number) AS n FROM probe_turns WHERE probe_id = ?')
      .get(probeId) as { n: number | null };
    return {
      probeId,
      sessionId: probe.session_id as string,
      studioId: probe.studio_id as string,
      status: probe.status as string,
      turnNumber: turn.n ?? 0,
      objective: probe.objective as string,
      maxTurns: (probe.max_turns as number) ?? 5,
    };
  }

  /**
   * The model proposes when to stop, but the ceiling is enforced here so a
   * probe can never run longer than the learner agreed to.
   */
  private enforceTurnLimit(
    result: ProbeTurnResult,
    turnNumber: number,
    maxTurns: number,
  ): ProbeTurnResult {
    if (result.shouldStop || turnNumber < maxTurns) return result;
    return {
      ...result,
      nextQuestion: undefined,
      shouldStop: true,
      stopReason: 'turn_limit',
    };
  }

  async submitAnswer(
    probeId: string,
    answer: string,
    providerProfileId: string,
    modelId: string,
  ): Promise<{ result: ProbeTurnResult; completed: boolean }> {
    const state = this.getState(probeId);
    if (state.status === 'completed') {
      throw new Error('Probe already completed');
    }

    const turnRow = this.db
      .prepare(
        `SELECT * FROM probe_turns WHERE probe_id = ? AND status = 'awaiting_answer'
         ORDER BY turn_number DESC LIMIT 1`,
      )
      .get(probeId) as Record<string, unknown> | undefined;
    if (!turnRow) throw new Error('No probe turn awaiting answer');

    const ts = nowMs();
    const answerMessageId = newId();
    const sessionId = state.sessionId;
    const ordinalRow = this.db
      .prepare('SELECT COALESCE(MAX(ordinal), -1) + 1 AS next FROM messages WHERE session_id = ?')
      .get(sessionId) as { next: number };

    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, ordinal, role, content_text, status, created_at)
         VALUES (?, ?, ?, 'user', ?, 'complete', ?)`,
      )
      .run(answerMessageId, sessionId, ordinalRow.next, answer, ts);

    this.db
      .prepare(
        `UPDATE probe_turns SET answer_message_id = ?, status = 'evaluating', answered_at = ? WHERE id = ?`,
      )
      .run(answerMessageId, ts, turnRow.id as string);

    const blocks = await hybridRetrieve(this.db, this.embeddingService, {
      studioId: state.studioId,
      query: state.objective,
      maxResults: 6,
    });
    const versionIds = [...new Set(blocks.map((b) => b.block.sourceVersionId))];
    const sourceMap = resolveSourceIdsByVersion(this.db, versionIds);
    const contextBlocks = blocksToContextViews(blocks, sourceMap);

    const turnNumber = turnRow.turn_number as number;
    const { system, prompt } = buildAgentPromptParts({
      mode: 'probe',
      objective: state.objective,
      contextBlocks,
      userMessage: answer,
      runtimeExtras: { mode: 'probe', probeTurn: turnNumber, probeObjective: state.objective },
    });

    const profile = this.providerRepo.getProfile(providerProfileId);
    if (!profile) throw new Error('Provider profile not found');
    const apiKey = this.providerRepo.getApiKey(providerProfileId);
    const model = createLanguageModel({ profile, modelId, apiKey }, this.secretStore, {
      mode: 'probe',
    });

    const started = Date.now();
    const systemPrompt = `${buildSystemInstructions('probe')}\n\n${system}`;
    const useMock = shouldUseMockProvider(profile, modelId);

    let result: ProbeTurnResult;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    if (useMock) {
      const gen = await generateText({ model, system: systemPrompt, prompt });
      inputTokens = gen.usage?.inputTokens;
      outputTokens = gen.usage?.outputTokens;
      result = parseMockStructuredOutput<ProbeTurnResult>('probe', gen.text);
    } else {
      // Real providers must return the evaluation as a validated object; free
      // text cannot be turned into learner state safely.
      const gen = await generateObject({
        model,
        schema: ProbeEvaluationSchema,
        system: systemPrompt,
        prompt,
        abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      inputTokens = gen.usage?.inputTokens;
      outputTokens = gen.usage?.outputTokens;
      result = toProbeTurnResult(gen.object);
    }

    this.usage.recordFromProfile(providerProfileId, modelId, {
      sessionId,
      operation: 'probe_evaluation',
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - started,
      success: true,
    });

    result = this.enforceTurnLimit(result, turnNumber, state.maxTurns);
    // Models sometimes quote the source instead of the learner. Application
    // code is the authority: drop non-verbatim excerpts before persistence or UI.
    result = sanitizeProbeEvidence(result, answer);

    const conceptsRepo = new ConceptsRepo(this.db);
    const eventsRepo = new LearningEventsRepo(this.db);

    const tx = this.db.transaction(() => {
      const feedbackId = newId();
      const nextOrdinal = (ordinalRow.next as number) + 1;
      this.db
        .prepare(
          `INSERT INTO messages (id, session_id, ordinal, role, content_text, content_json, status, created_at)
           VALUES (?, ?, ?, 'assistant', ?, ?, 'complete', ?)`,
        )
        .run(feedbackId, sessionId, nextOrdinal, result.feedback, JSON.stringify(result), ts);

      this.db
        .prepare(
          `UPDATE probe_turns SET feedback_message_id = ?, evaluation_json = ?, status = 'completed', evaluated_at = ?
           WHERE id = ?`,
        )
        .run(feedbackId, JSON.stringify(result), ts, turnRow.id as string);

      for (const ev of result.evidence) {
        const concept = conceptsRepo.findOrCreate(ev.conceptName ?? state.objective.slice(0, 80));
        conceptsRepo.linkToStudio(state.studioId, concept.id);
        eventsRepo.append({
          studioId: state.studioId,
          conceptId: concept.id,
          sessionId,
          probeTurnId: turnRow.id as string,
          eventKind: 'explanation_evidence',
          demonstratedLevel: ev.demonstratedLevel,
          confidence: ev.confidence,
          evidenceMessageId: answerMessageId,
          evidenceExcerpt: ev.answerExcerpt,
          rationale: ev.rationale,
          evaluatorProvider: profile.provider,
          evaluatorModel: modelId,
        });
      }

      if (result.shouldStop) {
        this.db
          .prepare(
            `UPDATE probes SET status = 'completed', stop_reason = ?, completed_at = ?, result_json = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(result.stopReason ?? 'objective_met', ts, JSON.stringify(result), ts, probeId);

        rebuildConceptState(this.db, state.studioId);
        const nextActions = new NextActionsService(this.db);
        nextActions.proposeAfterProbeComplete(state.studioId, state.objective);
      } else if (result.nextQuestion) {
        const nextTurn = turnNumber + 1;
        const qId = newId();
        const ord2 = nextOrdinal + 1;
        this.db
          .prepare(
            `INSERT INTO messages (id, session_id, ordinal, role, content_text, status, created_at)
             VALUES (?, ?, ?, 'assistant', ?, 'complete', ?)`,
          )
          .run(qId, sessionId, ord2, result.nextQuestion.prompt, ts);

        this.db
          .prepare(
            `INSERT INTO probe_turns (
              id, probe_id, turn_number, question_message_id, question_type,
              purpose, rubric_json, status, asked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_answer', ?)`,
          )
          .run(
            newId(),
            probeId,
            nextTurn,
            qId,
            result.nextQuestion.questionType,
            result.nextQuestion.purpose,
            JSON.stringify(result.nextQuestion.rubric),
            ts,
          );

        this.db
          .prepare(`UPDATE probes SET status = 'asking', updated_at = ? WHERE id = ?`)
          .run(ts, probeId);
      }
    });

    tx();

    return { result, completed: result.shouldStop };
  }
}

function sanitizeProbeEvidence(result: ProbeTurnResult, answer: string): ProbeTurnResult {
  return {
    ...result,
    evidence: result.evidence.filter((item) => verifyAnswerExcerpt(answer, item.answerExcerpt)),
    misconceptionHypotheses: (result.misconceptionHypotheses ?? []).filter((item) =>
      verifyAnswerExcerpt(answer, item.answerExcerpt),
    ),
  };
}
