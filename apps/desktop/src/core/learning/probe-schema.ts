import { type ProbeTurnResult, ProbeTurnResultSchema } from '@omakase/contracts';
import { z } from 'zod';

/**
 * Provider-facing shape of a probe evaluation.
 *
 * OpenAI structured outputs run in strict mode: every property must be
 * required, and numeric or string bounds are rejected. The internal
 * `ProbeTurnResultSchema` uses optional fields and bounds, so the model is
 * asked for this flatter shape and the result is validated against the real
 * schema afterwards. The model never writes learner state directly either way.
 */

const DemonstratedLevel = z.enum([
  'encountered',
  'can_recall',
  'can_explain',
  'can_apply',
  'can_transfer',
]);

const QuestionType = z.enum([
  'explain',
  'distinguish',
  'predict',
  'apply',
  'diagnose',
  'design',
  'compare',
  'critique',
  'connect',
]);

const StopReason = z.enum([
  'objective_met',
  'prerequisite_gap',
  'teach_before_continue',
  'turn_limit',
  'user_stopped',
]);

const Evidence = z.object({
  conceptName: z.string().describe('Short name of the concept the learner demonstrated.'),
  answerExcerpt: z
    .string()
    .describe(
      'Copy a contiguous substring from the LEARNER ANSWER only. Do not paraphrase. Do not use source text.',
    ),
  demonstratedLevel: DemonstratedLevel,
  confidence: z.number().describe('Between 0 and 1.'),
  rationale: z.string(),
});

const Misconception = z.object({
  conceptName: z.string(),
  description: z.string(),
  answerExcerpt: z.string().describe('A verbatim substring copied from the learner answer.'),
  confidence: z.number().describe('Between 0 and 1.'),
});

const Rubric = z.object({
  targetConcepts: z.array(z.string()),
  distinctions: z.array(z.string()),
  patterns: z.array(z.string()),
  misconceptions: z.array(z.string()),
  evidenceLevel: DemonstratedLevel,
  successCriteria: z.array(z.string()),
});

const NextQuestion = z.object({
  prompt: z.string().describe('One open-ended question. Never ask more than one thing at a time.'),
  purpose: z.string(),
  questionType: QuestionType,
  rubric: Rubric,
});

export const ProbeEvaluationSchema = z.object({
  feedback: z.string(),
  evidence: z.array(Evidence),
  misconceptionHypotheses: z.array(Misconception),
  nextQuestion: NextQuestion.nullable(),
  shouldStop: z.boolean(),
  stopReason: StopReason.nullable(),
});
export type ProbeEvaluation = z.infer<typeof ProbeEvaluationSchema>;

const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(CONFIDENCE_MAX, Math.max(CONFIDENCE_MIN, value));
}

/** Normalises the provider shape into the schema the rest of the app trusts. */
export function toProbeTurnResult(evaluation: ProbeEvaluation): ProbeTurnResult {
  return ProbeTurnResultSchema.parse({
    feedback: evaluation.feedback,
    evidence: evaluation.evidence.slice(0, 10).map((item) => ({
      conceptName: item.conceptName.slice(0, 200),
      answerExcerpt: item.answerExcerpt.slice(0, 4000),
      demonstratedLevel: item.demonstratedLevel,
      confidence: clampConfidence(item.confidence),
      rationale: item.rationale.slice(0, 2000) || 'No rationale supplied.',
    })),
    misconceptionHypotheses: evaluation.misconceptionHypotheses.slice(0, 5).map((item) => ({
      conceptName: item.conceptName.slice(0, 200),
      description: item.description.slice(0, 2000),
      answerExcerpt: item.answerExcerpt.slice(0, 4000),
      confidence: clampConfidence(item.confidence),
    })),
    nextQuestion: evaluation.nextQuestion
      ? {
          prompt: evaluation.nextQuestion.prompt.slice(0, 4000),
          purpose: evaluation.nextQuestion.purpose.slice(0, 1000) || 'Probe the next gap.',
          questionType: evaluation.nextQuestion.questionType,
          rubric: {
            targetConcepts: takeNonEmpty(evaluation.nextQuestion.rubric.targetConcepts, [
              'objective',
            ]),
            distinctions: evaluation.nextQuestion.rubric.distinctions.slice(0, 20),
            patterns: evaluation.nextQuestion.rubric.patterns.slice(0, 20),
            misconceptions: evaluation.nextQuestion.rubric.misconceptions.slice(0, 20),
            evidenceLevel: evaluation.nextQuestion.rubric.evidenceLevel,
            successCriteria: takeNonEmpty(evaluation.nextQuestion.rubric.successCriteria, [
              'Coherent explanation',
            ]),
          },
        }
      : undefined,
    shouldStop: evaluation.shouldStop,
    stopReason: evaluation.stopReason ?? undefined,
  });
}

function takeNonEmpty(values: string[], fallback: string[]): string[] {
  const filtered = values.filter((value) => value.trim().length > 0).slice(0, 20);
  return filtered.length > 0 ? filtered : fallback;
}
