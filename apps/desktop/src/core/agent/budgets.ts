/**
 * Soft agent operation budgets for local-first use.
 * Prompts never relax these; identical-call loop guards stay tight.
 * Cost ceilings are unset (0) so personal libraries are not blocked.
 */

export type AgentMode = 'learn' | 'research' | 'probe';

export interface ModeBudget {
  maxSteps: number;
  timeoutMs: number;
  maxToolCalls: number;
  maxIdenticalToolCalls: number;
  maxRetrievedBlocks: number;
  maxContextChars: number;
  /** Soft estimated cost ceiling in micro-USD; 0 means unset. */
  maxCostMicrousd: number;
}

/** Generous local defaults — large Studio libraries (dozens of PDFs) are in scope. */
export const MODE_LIMITS: Record<AgentMode, ModeBudget> = {
  learn: {
    maxSteps: 48,
    timeoutMs: 600_000,
    maxToolCalls: 96,
    maxIdenticalToolCalls: 5,
    maxRetrievedBlocks: 48,
    maxContextChars: 200_000,
    maxCostMicrousd: 0,
  },
  research: {
    maxSteps: 64,
    timeoutMs: 900_000,
    maxToolCalls: 128,
    maxIdenticalToolCalls: 5,
    maxRetrievedBlocks: 64,
    maxContextChars: 320_000,
    maxCostMicrousd: 0,
  },
  probe: {
    maxSteps: 24,
    timeoutMs: 480_000,
    maxToolCalls: 48,
    maxIdenticalToolCalls: 4,
    maxRetrievedBlocks: 32,
    maxContextChars: 160_000,
    maxCostMicrousd: 0,
  },
} as const;

export interface ToolCallBudgetState {
  totalCalls: number;
  bySignature: Map<string, number>;
}

export function createToolCallBudgetState(): ToolCallBudgetState {
  return { totalCalls: 0, bySignature: new Map() };
}

export function recordToolCall(
  state: ToolCallBudgetState,
  toolName: string,
  argsFingerprint: string,
  limits: ModeBudget,
): { allowed: boolean; reason?: string } {
  state.totalCalls += 1;
  if (state.totalCalls > limits.maxToolCalls) {
    return { allowed: false, reason: 'max_tool_calls' };
  }
  const signature = `${toolName}:${argsFingerprint}`;
  const count = (state.bySignature.get(signature) ?? 0) + 1;
  state.bySignature.set(signature, count);
  if (count > limits.maxIdenticalToolCalls) {
    return { allowed: false, reason: 'max_identical_tool_calls' };
  }
  return { allowed: true };
}

export function clampRetrievedBlocks<T>(blocks: T[], limits: ModeBudget): T[] {
  return blocks.slice(0, limits.maxRetrievedBlocks);
}

export function contextWithinBudget(totalChars: number, limits: ModeBudget): boolean {
  return totalChars <= limits.maxContextChars;
}

export function userFacingBudgetMessage(code: string): string {
  switch (code) {
    case 'max_tool_calls':
    case 'max_identical_tool_calls':
    case 'max_steps':
      return 'This learning step took too many internal actions and was stopped to keep things reliable. Try a narrower question.';
    case 'timeout':
      return 'The model took too long to respond. Your progress is saved — try again in a moment.';
    case 'budget_exceeded':
    case 'max_cost':
      return 'The usage limit for this Studio was reached. Adjust limits in You, or try again later.';
    case 'max_context':
      return 'Too much source material was selected for one answer. Narrow the source or ask a more specific question.';
    default:
      return 'This step could not finish safely. Your library and learner progress were not erased.';
  }
}
