import { z } from 'zod';
import { DemonstratedLevelSchema, EpochMillisSchema, MasteryLevelSchema } from './common.js';
import { UuidV7Schema } from './ids.js';
import { LocatorSchema } from './sources.js';

export const ProbeQuestionTypeSchema = z.enum([
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
export type ProbeQuestionType = z.infer<typeof ProbeQuestionTypeSchema>;

export const ProbeRubricSchema = z.object({
  targetConcepts: z.array(z.string()).min(1).max(20),
  distinctions: z.array(z.string()).max(20).default([]),
  patterns: z.array(z.string()).max(20).default([]),
  misconceptions: z.array(z.string()).max(20).default([]),
  evidenceLevel: DemonstratedLevelSchema,
  successCriteria: z.array(z.string()).min(1).max(20),
});
export type ProbeRubric = z.infer<typeof ProbeRubricSchema>;

export const LearningEvidenceProposalSchema = z.object({
  conceptId: UuidV7Schema.optional(),
  conceptName: z.string().min(1).max(200).optional(),
  answerExcerpt: z.string().min(1).max(4000),
  demonstratedLevel: DemonstratedLevelSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(2000),
});
export type LearningEvidenceProposal = z.infer<typeof LearningEvidenceProposalSchema>;

export const MisconceptionProposalSchema = z.object({
  conceptId: UuidV7Schema.optional(),
  conceptName: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000),
  answerExcerpt: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
});
export type MisconceptionProposal = z.infer<typeof MisconceptionProposalSchema>;

export const ProbeTurnResultSchema = z.object({
  feedback: z.string().min(1).max(4000),
  evidence: z.array(LearningEvidenceProposalSchema).max(10),
  misconceptionHypotheses: z.array(MisconceptionProposalSchema).max(5),
  nextQuestion: z
    .object({
      prompt: z.string().min(1).max(4000),
      purpose: z.string().min(1).max(1000),
      questionType: ProbeQuestionTypeSchema,
      rubric: ProbeRubricSchema,
    })
    .optional(),
  shouldStop: z.boolean(),
  stopReason: z
    .enum([
      'objective_met',
      'prerequisite_gap',
      'teach_before_continue',
      'turn_limit',
      'user_stopped',
    ])
    .optional(),
});
export type ProbeTurnResult = z.infer<typeof ProbeTurnResultSchema>;

export const CitationProposalSchema = z.object({
  handle: z.string().min(1).max(64),
  claimSummary: z.string().max(300),
});
export type CitationProposal = z.infer<typeof CitationProposalSchema>;

export const LearningResponseSchema = z.object({
  answerMarkdown: z.string(),
  citations: z.array(CitationProposalSchema).max(30),
  suggestedActions: z
    .array(
      z.object({
        type: z.enum([
          'read_section',
          'start_probe',
          'compare_sources',
          'review_concept',
          'research',
          'none',
        ]),
        rationale: z.string(),
        sourceId: UuidV7Schema.optional(),
        locator: LocatorSchema.optional(),
      }),
    )
    .max(3),
  learningEvidenceProposals: z.array(LearningEvidenceProposalSchema).max(10),
  possibleMisconceptions: z.array(MisconceptionProposalSchema).max(5),
  sessionSummary: z.string().max(2000),
});
export type LearningResponse = z.infer<typeof LearningResponseSchema>;

export const ConceptStateSchema = z.object({
  scopeKey: z.string(),
  scopeType: z.enum(['global', 'studio']),
  studioId: UuidV7Schema.nullable(),
  conceptId: UuidV7Schema,
  conceptName: z.string(),
  masteryLevel: MasteryLevelSchema,
  confidence: z.number().min(0).max(1),
  certaintyStatus: z.enum(['unassessed', 'secure', 'uncertain', 'contradicted', 'retired']),
  evidenceCount: z.number().int().nonnegative(),
  contradictoryCount: z.number().int().nonnegative(),
  lastDemonstratedAt: EpochMillisSchema.nullable(),
  nextReviewAt: EpochMillisSchema.nullable(),
});
export type ConceptState = z.infer<typeof ConceptStateSchema>;

export const LearningMapSchema = z.object({
  studioId: UuidV7Schema,
  secure: z.array(ConceptStateSchema),
  uncertain: z.array(ConceptStateSchema),
  misconceptions: z.array(
    z.object({
      conceptId: UuidV7Schema,
      conceptName: z.string(),
      description: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  prerequisites: z.array(ConceptStateSchema),
  evidenceSummaries: z.array(
    z.object({
      conceptId: UuidV7Schema,
      conceptName: z.string(),
      excerpt: z.string(),
      level: DemonstratedLevelSchema,
      createdAt: EpochMillisSchema,
    }),
  ),
  nextAction: z
    .object({
      id: UuidV7Schema,
      title: z.string(),
      rationale: z.string(),
      actionType: z.string(),
      sourceId: UuidV7Schema.nullable().optional(),
      sourceBlockId: z.number().int().positive().nullable().optional(),
    })
    .nullable(),
});
export type LearningMap = z.infer<typeof LearningMapSchema>;

export const StartProbeInputSchema = z.object({
  studioId: UuidV7Schema,
  sourceId: UuidV7Schema.optional(),
  objective: z.string().min(1).max(4000),
  desiredDepth: z.enum(['explain', 'apply', 'compare_or_critique']).default('explain'),
  maxTurns: z.number().int().min(1).max(12).default(5),
});
export type StartProbeInput = z.infer<typeof StartProbeInputSchema>;

export const AnswerProbeInputSchema = z.object({
  probeId: UuidV7Schema,
  answer: z.string().min(1).max(20_000),
});
export type AnswerProbeInput = z.infer<typeof AnswerProbeInputSchema>;
