import type { AgentRuntimeContext } from '@omakase/contracts';
import { SearchLibraryInputSchema } from '@omakase/contracts';
import { type ToolSet, tool } from 'ai';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { EmbeddingService } from '../retrieval/embeddings.js';
import { resolveStudioSourceVersionIds } from '../retrieval/fts.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';

function assertStudioScope(studioId: string, ctx: AgentRuntimeContext): void {
  if (ctx.studioId && ctx.studioId !== studioId) {
    throw new Error('Tool call outside session studio scope');
  }
}

function assertSourceScope(sourceIds: string[], ctx: AgentRuntimeContext): void {
  if (ctx.sourceIds.length === 0) return;
  for (const id of sourceIds) {
    if (!ctx.sourceIds.includes(id)) {
      throw new Error(`Source ${id} outside session scope`);
    }
  }
}

export interface AgentToolDeps {
  db: Database.Database;
  embeddingService: EmbeddingService;
  runtimeContext: AgentRuntimeContext;
  probeId?: string;
}

export function buildAgentTools(deps: AgentToolDeps): ToolSet {
  const { db, embeddingService, runtimeContext, probeId } = deps;

  const searchLibrary = tool({
    description: 'Search the studio library for relevant source blocks.',
    inputSchema: SearchLibraryInputSchema,
    execute: async (input) => {
      assertStudioScope(input.studioId, runtimeContext);
      if (input.sourceIds) assertSourceScope(input.sourceIds, runtimeContext);
      const blocks = await hybridRetrieve(db, embeddingService, {
        studioId: input.studioId,
        query: input.query,
        sourceIds: input.sourceIds,
        maxResults: input.limit,
      });
      return blocks.map((b, i) => ({
        handle: `S${i + 1}`,
        sourceBlockId: b.block.id,
        heading: b.block.headingPathText,
        excerpt: b.block.text.slice(0, 400),
        score: b.score,
      }));
    },
  });

  const getSourceOutline = tool({
    description: 'Get heading outline for a source version.',
    inputSchema: z.object({
      sourceId: z.string().uuid(),
      studioId: z.string().uuid(),
    }),
    execute: async (input) => {
      assertStudioScope(input.studioId, runtimeContext);
      assertSourceScope([input.sourceId], runtimeContext);
      const versionRow = db
        .prepare(
          `SELECT sav.source_version_id AS version_id
           FROM studio_sources ss
           JOIN source_active_versions sav ON sav.source_id = ss.source_id
           WHERE ss.studio_id = ? AND ss.source_id = ?`,
        )
        .get(input.studioId, input.sourceId) as { version_id: string } | undefined;
      if (!versionRow) return { headings: [] };

      const rows = db
        .prepare(
          `SELECT ordinal, heading_path_text, kind FROM source_blocks
           WHERE source_version_id = ? AND kind = 'heading'
           ORDER BY ordinal ASC`,
        )
        .all(versionRow.version_id) as Array<{
        ordinal: number;
        heading_path_text: string;
        kind: string;
      }>;
      return { headings: rows };
    },
  });

  const readSourceBlocks = tool({
    description: 'Read specific source blocks by ID within scope.',
    inputSchema: z.object({
      studioId: z.string().uuid(),
      sourceBlockIds: z.array(z.number().int().positive()).max(20),
    }),
    execute: async (input) => {
      assertStudioScope(input.studioId, runtimeContext);
      const versionIds = resolveStudioSourceVersionIds(
        db,
        input.studioId,
        runtimeContext.sourceIds,
      );
      if (versionIds.length === 0) return { blocks: [] };
      const placeholders = input.sourceBlockIds.map(() => '?').join(', ');
      const versionPlaceholders = versionIds.map(() => '?').join(', ');
      const rows = db
        .prepare(
          `SELECT id, kind, heading_path_text, text, locator_json
           FROM source_blocks
           WHERE id IN (${placeholders}) AND source_version_id IN (${versionPlaceholders})`,
        )
        .all(...input.sourceBlockIds, ...versionIds) as Array<Record<string, unknown>>;
      return {
        blocks: rows.map((r) => ({
          sourceBlockId: r.id as number,
          kind: r.kind as string,
          heading: r.heading_path_text as string,
          text: (r.text as string).slice(0, 2000),
          locator: JSON.parse(r.locator_json as string),
        })),
      };
    },
  });

  const getStudioState = tool({
    description: 'Compact studio goals and source list.',
    inputSchema: z.object({ studioId: z.string().uuid() }),
    execute: async (input) => {
      assertStudioScope(input.studioId, runtimeContext);
      const studio = db
        .prepare('SELECT name, primary_objective, teaching_style FROM studios WHERE id = ?')
        .get(input.studioId) as
        | { name: string; primary_objective: string | null; teaching_style: string }
        | undefined;
      const sources = db
        .prepare(
          `SELECT s.id, s.title, ss.role FROM studio_sources ss
           JOIN sources s ON s.id = ss.source_id WHERE ss.studio_id = ?`,
        )
        .all(input.studioId) as Array<{ id: string; title: string; role: string }>;
      return { studio, sources };
    },
  });

  const getLearnerState = tool({
    description: 'Compact learner concept states for the studio.',
    inputSchema: z.object({ studioId: z.string().uuid() }),
    execute: async (input) => {
      assertStudioScope(input.studioId, runtimeContext);
      const rows = db
        .prepare(
          `SELECT cs.concept_id, c.canonical_name, cs.mastery_level, cs.confidence, cs.certainty_status
           FROM concept_state cs
           JOIN concepts c ON c.id = cs.concept_id
           WHERE cs.studio_id = ?
           ORDER BY cs.confidence DESC LIMIT 30`,
        )
        .all(input.studioId);
      return { concepts: rows };
    },
  });

  const getProbeObjective = tool({
    description: 'Get the active probe objective and turn state.',
    inputSchema: z.object({ probeId: z.string().uuid() }),
    execute: async (input) => {
      if (probeId && probeId !== input.probeId) {
        throw new Error('Probe outside session scope');
      }
      const probe = db
        .prepare('SELECT objective, desired_depth, status, max_turns FROM probes WHERE id = ?')
        .get(input.probeId) as Record<string, unknown> | undefined;
      const turns = db
        .prepare(
          'SELECT turn_number, status, purpose FROM probe_turns WHERE probe_id = ? ORDER BY turn_number',
        )
        .all(input.probeId);
      return { probe, turns };
    },
  });

  const getRelevantSourceBlocks = tool({
    description: 'Retrieve source blocks relevant to the probe objective.',
    inputSchema: z.object({
      probeId: z.string().uuid(),
      query: z.string().min(1).max(2000),
      limit: z.number().int().min(1).max(12).default(8),
    }),
    execute: async (input) => {
      if (probeId && probeId !== input.probeId) {
        throw new Error('Probe outside session scope');
      }
      const probe = db.prepare('SELECT studio_id FROM probes WHERE id = ?').get(input.probeId) as
        | { studio_id: string }
        | undefined;
      if (!probe) return { blocks: [] };
      assertStudioScope(probe.studio_id, runtimeContext);
      const blocks = await hybridRetrieve(db, embeddingService, {
        studioId: probe.studio_id,
        query: input.query,
        sourceIds: runtimeContext.sourceIds,
        maxResults: input.limit,
      });
      return blocks.map((b, i) => ({
        handle: `S${i + 1}`,
        sourceBlockId: b.block.id,
        excerpt: b.block.text.slice(0, 400),
      }));
    },
  });

  return {
    search_library: searchLibrary,
    get_source_outline: getSourceOutline,
    read_source_blocks: readSourceBlocks,
    get_studio_state: getStudioState,
    get_learner_state: getLearnerState,
    get_probe_objective: getProbeObjective,
    get_relevant_source_blocks: getRelevantSourceBlocks,
  };
}

export function toolsForMode(mode: 'learn' | 'research' | 'probe', all: ToolSet): ToolSet {
  if (mode === 'probe') {
    const selected: ToolSet = {};
    if (all.get_probe_objective) selected.get_probe_objective = all.get_probe_objective;
    if (all.get_relevant_source_blocks) {
      selected.get_relevant_source_blocks = all.get_relevant_source_blocks;
    }
    if (all.get_learner_state) selected.get_learner_state = all.get_learner_state;
    return selected;
  }
  const selected: ToolSet = {};
  if (all.search_library) selected.search_library = all.search_library;
  if (all.get_source_outline) selected.get_source_outline = all.get_source_outline;
  if (all.read_source_blocks) selected.read_source_blocks = all.read_source_blocks;
  if (all.get_studio_state) selected.get_studio_state = all.get_studio_state;
  if (all.get_learner_state) selected.get_learner_state = all.get_learner_state;
  return selected;
}
