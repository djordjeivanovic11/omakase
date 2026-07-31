import {
  type LearningResponse,
  LearningResponseSchema,
  type ProbeTurnResult,
  ProbeTurnResultSchema,
} from '@omakase/contracts';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';

export interface OmakaseMockRuntime {
  mode: 'learn' | 'research' | 'probe';
  probeTurn?: number;
  probeObjective?: string;
  lastUserAnswer?: string;
  contextHandles?: Array<{ handle: string; blockId: number; excerpt: string }>;
}

export function isMockModelSelection(modelId: string): boolean {
  return modelId.startsWith('mock-');
}

const RUNTIME_MARKER = /<!-- omakase-runtime:\s*(\{[\s\S]*?\})\s*-->/;
const SOURCE_BLOCK_RE =
  /<<<UNTRUSTED_SOURCE handle="(S\d+)" blockId="(\d+)">>>([\s\S]*?)<<<END_SOURCE>>>/g;

export function parseMockRuntime(prompt: string): OmakaseMockRuntime {
  const match = RUNTIME_MARKER.exec(prompt);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]) as OmakaseMockRuntime;
    } catch {
      // fall through
    }
  }
  return { mode: 'learn' };
}

export function parseContextHandles(prompt: string): OmakaseMockRuntime['contextHandles'] {
  const handles: NonNullable<OmakaseMockRuntime['contextHandles']> = [];
  SOURCE_BLOCK_RE.lastIndex = 0;
  for (const match of prompt.matchAll(SOURCE_BLOCK_RE)) {
    handles.push({
      handle: match[1]!,
      blockId: Number.parseInt(match[2]!, 10),
      excerpt: match[3]!.trim().slice(0, 120),
    });
  }
  return handles;
}

function promptToText(prompt: unknown): string {
  if (typeof prompt === 'string') return prompt;
  if (Array.isArray(prompt)) {
    return prompt
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const record = part as Record<string, unknown>;
          if (typeof record.content === 'string') return record.content;
          if (Array.isArray(record.content)) {
            return record.content
              .map((c) => {
                if (typeof c === 'string') return c;
                if (c && typeof c === 'object' && 'text' in c) {
                  return String((c as { text: unknown }).text);
                }
                return JSON.stringify(c);
              })
              .join('\n');
          }
          if (typeof record.text === 'string') return record.text;
        }
        return JSON.stringify(part);
      })
      .join('\n\n');
  }
  if (prompt && typeof prompt === 'object') {
    return JSON.stringify(prompt);
  }
  return '';
}

function extractLastUserMessage(prompt: string): string {
  const marker = '\n\nUser: ';
  const idx = prompt.lastIndexOf(marker);
  if (idx >= 0) return prompt.slice(idx + marker.length).trim();
  const userLine = [...prompt.split('\n')].reverse().find((l) => l.startsWith('User: '));
  if (userLine) return userLine.slice('User: '.length).trim();
  const alt = prompt
    .split('\n')
    .filter((l) => !l.startsWith('<!--'))
    .pop();
  return alt?.trim() ?? '';
}

function buildLearnResponse(runtime: OmakaseMockRuntime, userQuestion: string): LearningResponse {
  const handles = runtime.contextHandles ?? [];
  const primary = handles[0];
  const answerMarkdown =
    handles.length > 0
      ? `Based on your sources, here is a concise answer to "${userQuestion.slice(0, 80)}". ` +
        `The key point is documented in [${primary!.handle}] and relates to: ${primary!.excerpt.slice(0, 80)}…`
      : `Here is a general answer to "${userQuestion.slice(0, 80)}" without specific source citations.`;

  return LearningResponseSchema.parse({
    answerMarkdown,
    citations: handles.slice(0, 3).map((h) => ({
      handle: h.handle,
      claimSummary: h.excerpt.slice(0, 120),
    })),
    suggestedActions: [
      {
        type: handles.length > 0 ? 'read_section' : 'none',
        rationale:
          handles.length > 0
            ? 'Review the cited section in depth.'
            : 'No source passages were available for this answer.',
      },
    ],
    learningEvidenceProposals: [],
    possibleMisconceptions: [],
    sessionSummary: 'Mock learn turn completed.',
  });
}

function buildProbeResponse(runtime: OmakaseMockRuntime, userAnswer: string): ProbeTurnResult {
  const turn = runtime.probeTurn ?? 1;
  const excerpt =
    userAnswer.length >= 12 ? userAnswer.slice(0, Math.min(40, userAnswer.length)) : userAnswer;

  if (turn >= 3) {
    return ProbeTurnResultSchema.parse({
      feedback: 'You demonstrated solid understanding of the objective.',
      evidence: [
        {
          conceptName: runtime.probeObjective?.split(' ').slice(0, 3).join(' ') ?? 'Core concept',
          answerExcerpt: excerpt,
          demonstratedLevel: 'can_explain',
          confidence: 0.82,
          rationale: 'Answer included accurate terminology and causal reasoning.',
        },
      ],
      misconceptionHypotheses: [],
      shouldStop: true,
      stopReason: 'objective_met',
    });
  }

  return ProbeTurnResultSchema.parse({
    feedback: `Turn ${turn}: Good start. Let's probe a distinction next.`,
    evidence: [
      {
        conceptName: runtime.probeObjective?.split(' ').slice(0, 3).join(' ') ?? 'Core concept',
        answerExcerpt: excerpt,
        demonstratedLevel: 'encountered',
        confidence: 0.55,
        rationale: 'Partial explanation detected.',
      },
    ],
    misconceptionHypotheses: [],
    nextQuestion: {
      prompt: `You explained something about "${runtime.probeObjective ?? 'this topic'}". What would go wrong if someone treated that idea as a definition instead of a mechanism?`,
      purpose: 'Test conceptual distinction after initial explanation.',
      questionType: 'distinguish',
      rubric: {
        targetConcepts: [runtime.probeObjective?.split(' ')[0] ?? 'concept'],
        distinctions: ['mechanism vs outcome'],
        patterns: [],
        misconceptions: ['oversimplification'],
        evidenceLevel: 'can_explain',
        successCriteria: ['Names the distinction clearly', 'Uses terminology from sources'],
      },
    },
    shouldStop: false,
  });
}

function responseText(runtime: OmakaseMockRuntime, prompt: string): string {
  const userQuestion = extractLastUserMessage(prompt);
  if (runtime.mode === 'probe') {
    const result = buildProbeResponse(runtime, userQuestion);
    return JSON.stringify(result);
  }
  const result = buildLearnResponse(runtime, userQuestion);
  return JSON.stringify(result);
}

function streamChunks(text: string): Array<{ type: 'text-delta'; delta: string }> {
  const chunkSize = Math.max(8, Math.ceil(text.length / 6));
  const chunks: Array<{ type: 'text-delta'; delta: string }> = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({ type: 'text-delta', delta: text.slice(i, i + chunkSize) });
  }
  return chunks;
}

export function createOmakaseMockModel(options: {
  modelId?: string;
  mode?: 'learn' | 'research' | 'probe';
}): LanguageModel {
  const modelId = options.modelId ?? 'mock-learn-v1';

  return new MockLanguageModelV3({
    provider: 'omakase-mock',
    modelId,
    // AI SDK mock typings are stricter than needed for our deterministic fixture.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: (async ({ prompt }: { prompt: unknown }) => {
      const promptText = promptToText(prompt);
      const runtime = {
        ...parseMockRuntime(promptText),
        mode: options.mode ?? parseMockRuntime(promptText).mode,
      };
      if (!runtime.contextHandles?.length) {
        runtime.contextHandles = parseContextHandles(promptText);
      }
      const text = responseText(runtime, promptText);
      return {
        finishReason: 'stop' as const,
        usage: {
          inputTokens: 120,
          outputTokens: Math.ceil(text.length / 4),
          totalTokens: 120 + Math.ceil(text.length / 4),
        },
        content: [{ type: 'text' as const, text }],
        warnings: [],
      };
    }) as never,
    doStream: (async ({ prompt }: { prompt: unknown }) => {
      const promptText = promptToText(prompt);
      const runtime = {
        ...parseMockRuntime(promptText),
        mode: options.mode ?? parseMockRuntime(promptText).mode,
      };
      if (!runtime.contextHandles?.length) {
        runtime.contextHandles = parseContextHandles(promptText);
      }
      const text = responseText(runtime, promptText);
      const deltas = streamChunks(text).map((d, i) => ({
        type: 'text-delta' as const,
        id: `t${i}`,
        delta: d.delta,
      }));

      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 't0' },
            ...deltas,
            { type: 'text-end' as const, id: 't0' },
            {
              type: 'finish' as const,
              finishReason: 'stop' as const,
              usage: {
                inputTokens: 120,
                outputTokens: Math.ceil(text.length / 4),
                totalTokens: 120 + Math.ceil(text.length / 4),
              },
            },
          ],
        }),
      };
    }) as never,
  }) as unknown as LanguageModel;
}

export function parseMockStructuredOutput<T>(mode: 'learn' | 'probe', text: string): T {
  const parsed = JSON.parse(text) as T;
  if (mode === 'probe') {
    return ProbeTurnResultSchema.parse(parsed) as T;
  }
  return LearningResponseSchema.parse(parsed) as T;
}
