import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clampRetrievedBlocks,
  createToolCallBudgetState,
  MODE_LIMITS,
  recordToolCall,
  userFacingBudgetMessage,
} from '../../src/core/agent/budgets.js';
import { withToolCallBudget } from '../../src/core/agent/tools.js';

describe('agent budgets', () => {
  it('stops identical tool-call loops', () => {
    const limits = MODE_LIMITS.learn;
    const state = createToolCallBudgetState();
    for (let i = 0; i < limits.maxIdenticalToolCalls; i += 1) {
      expect(recordToolCall(state, 'search_library', 'q=gradient', limits).allowed).toBe(true);
    }
    const blocked = recordToolCall(state, 'search_library', 'q=gradient', limits);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('max_identical_tool_calls');
  });

  it('enforces max tool calls', () => {
    const limits = { ...MODE_LIMITS.probe, maxToolCalls: 2, maxIdenticalToolCalls: 10 };
    const state = createToolCallBudgetState();
    expect(recordToolCall(state, 'a', '1', limits).allowed).toBe(true);
    expect(recordToolCall(state, 'b', '2', limits).allowed).toBe(true);
    expect(recordToolCall(state, 'c', '3', limits).allowed).toBe(false);
  });

  it('clamps retrieved blocks', () => {
    const limit = MODE_LIMITS.learn.maxRetrievedBlocks;
    const blocks = Array.from({ length: limit + 20 }, (_, i) => i);
    expect(clampRetrievedBlocks(blocks, MODE_LIMITS.learn)).toHaveLength(limit);
  });

  it('returns plain-language budget messages', () => {
    expect(userFacingBudgetMessage('timeout')).not.toMatch(/RAG|embedding|MCP/i);
    expect(userFacingBudgetMessage('max_tool_calls')).toMatch(/narrower question/i);
  });

  it('applies the call budget to executable tools', async () => {
    const execute = vi.fn(async () => 'ok');
    const tools = withToolCallBudget(
      {
        echo: tool({ inputSchema: z.object({ value: z.string() }), execute }),
      },
      { ...MODE_LIMITS.learn, maxToolCalls: 1, maxIdenticalToolCalls: 5 },
    );
    const wrapped = tools.echo as {
      execute: (input: { value: string }, options: never) => Promise<string>;
    };

    await expect(wrapped.execute({ value: 'one' }, undefined as never)).resolves.toBe('ok');
    await expect(
      Promise.resolve().then(() => wrapped.execute({ value: 'two' }, undefined as never)),
    ).rejects.toThrow(/narrower question/i);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
