import type { OmakaseMockRuntime } from '../providers/mock-model.js';
import type { RetrievedBlock } from '../retrieval/hybrid.js';

export interface ContextBlockView {
  handle: string;
  sourceBlockId: number;
  sourceId: string;
  sourceVersionId: string;
  kind: string;
  headingPathText: string;
  text: string;
  locatorJson: string;
}

export function blocksToContextViews(
  blocks: RetrievedBlock[],
  sourceIdByVersion: Map<string, string>,
): ContextBlockView[] {
  return blocks.map(({ block, handle }) => ({
    handle,
    sourceBlockId: block.id,
    sourceId: sourceIdByVersion.get(block.sourceVersionId) ?? '',
    sourceVersionId: block.sourceVersionId,
    kind: block.kind,
    headingPathText: block.headingPathText,
    text: block.text,
    locatorJson: JSON.stringify(block.locator),
  }));
}

export function formatUntrustedSourceBlock(block: ContextBlockView): string {
  return [
    `<<<UNTRUSTED_SOURCE handle="${block.handle}" blockId="${block.sourceBlockId}">>>`,
    `[${block.kind}] ${block.headingPathText}`,
    block.text,
    '<<<END_SOURCE>>>',
  ].join('\n');
}

export function buildAgentPromptParts(options: {
  mode: 'learn' | 'research' | 'probe';
  objective?: string;
  studioSummary?: string;
  learnerSummary?: string;
  contextBlocks: ContextBlockView[];
  recentTurns?: Array<{ role: 'user' | 'assistant'; text: string }>;
  userMessage: string;
  runtimeExtras?: Partial<OmakaseMockRuntime>;
}): { system: string; prompt: string } {
  const runtime: OmakaseMockRuntime = {
    mode: options.mode,
    probeObjective: options.objective,
    contextHandles: options.contextBlocks.map((b) => ({
      handle: b.handle,
      blockId: b.sourceBlockId,
      excerpt: b.text.slice(0, 160),
    })),
    ...options.runtimeExtras,
  };

  const system = [
    `<!-- omakase-runtime: ${JSON.stringify(runtime)} -->`,
    options.studioSummary ? `Studio:\n${options.studioSummary}` : '',
    options.learnerSummary ? `Learner:\n${options.learnerSummary}` : '',
    options.objective ? `Objective: ${options.objective}` : '',
    options.contextBlocks.length > 0
      ? `Untrusted sources (${options.contextBlocks.length} blocks):`
      : 'No source blocks in context.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const contextSection = options.contextBlocks.map(formatUntrustedSourceBlock).join('\n\n');
  const history = (options.recentTurns ?? [])
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
    .join('\n\n');

  const prompt = [contextSection, history, `User: ${options.userMessage}`]
    .filter(Boolean)
    .join('\n\n');

  return { system, prompt };
}

export function resolveSourceIdsByVersion(
  db: import('better-sqlite3').Database,
  versionIds: string[],
): Map<string, string> {
  if (versionIds.length === 0) return new Map();
  const placeholders = versionIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, source_id FROM source_versions WHERE id IN (${placeholders})`)
    .all(...versionIds) as Array<{ id: string; source_id: string }>;
  return new Map(rows.map((r) => [r.id, r.source_id]));
}
