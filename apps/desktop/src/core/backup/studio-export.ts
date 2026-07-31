import fs from 'node:fs';
import path from 'node:path';
import type { Studio } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { projectConceptStateForStudio } from '../learning/projector.js';
import { nowMs } from '../storage/ids.js';

export interface StudioExportOptions {
  db: Database.Database;
  studio: Studio;
  destDir: string;
}

export interface StudioExportResult {
  jsonPath: string;
  markdownPath: string;
}

interface SourceSummary {
  id: string;
  title: string;
  kind: string;
  role: string | null;
  lifecycleStatus: string;
  processingStatus: string;
  blockCount: number;
}

interface GoalSummary {
  id: string;
  statement: string;
  status: string;
  isPrimary: boolean;
}

interface EvidenceSummary {
  conceptName: string;
  masteryLevel: string;
  certaintyStatus: string;
  evidenceCount: number;
  lastDemonstratedAt: number | null;
}

export function buildStudioExportPayload(
  db: Database.Database,
  studio: Studio,
): Record<string, unknown> {
  const goals = db
    .prepare(
      `SELECT id, statement, status, is_primary FROM studio_goals
       WHERE studio_id = ? ORDER BY priority DESC, created_at ASC`,
    )
    .all(studio.id) as Array<{
    id: string;
    statement: string;
    status: string;
    is_primary: number;
  }>;

  const sourceRows = db
    .prepare(
      `SELECT s.id, s.title, s.kind, s.lifecycle_status, s.processing_status, ss.role,
              (SELECT COUNT(*) FROM source_blocks sb
               JOIN source_active_versions sav ON sav.source_version_id = sb.source_version_id
               WHERE sav.source_id = s.id) AS block_count
       FROM studio_sources ss
       JOIN sources s ON s.id = ss.source_id
       WHERE ss.studio_id = ? AND s.deleted_at IS NULL
       ORDER BY ss.position ASC, ss.added_at DESC`,
    )
    .all(studio.id) as Array<Record<string, unknown>>;

  const conceptNotes = db
    .prepare(
      `SELECT c.canonical_name, sc.notes
       FROM studio_concepts sc
       JOIN concepts c ON c.id = sc.concept_id
       WHERE sc.studio_id = ? AND sc.notes IS NOT NULL AND sc.notes <> ''`,
    )
    .all(studio.id) as Array<{ canonical_name: string; notes: string }>;

  const conceptStates = projectConceptStateForStudio(db, studio.id);
  const evidenceSummaries: EvidenceSummary[] = conceptStates.map((state) => ({
    conceptName: state.conceptName,
    masteryLevel: state.masteryLevel,
    certaintyStatus: state.certaintyStatus,
    evidenceCount: state.evidenceCount,
    lastDemonstratedAt: state.lastDemonstratedAt,
  }));

  return {
    exportedAt: nowMs(),
    studio,
    goals: goals.map(
      (g): GoalSummary => ({
        id: g.id,
        statement: g.statement,
        status: g.status,
        isPrimary: g.is_primary === 1,
      }),
    ),
    sources: sourceRows.map(
      (row): SourceSummary => ({
        id: row.id as string,
        title: row.title as string,
        kind: row.kind as string,
        role: (row.role as string | null) ?? null,
        lifecycleStatus: row.lifecycle_status as string,
        processingStatus: row.processing_status as string,
        blockCount: Number(row.block_count ?? 0),
      }),
    ),
    conceptNotes,
    evidenceSummaries,
    redactionNotice: 'API keys and full source text are excluded from this export.',
  };
}

export function renderStudioExportMarkdown(payload: Record<string, unknown>): string {
  const studio = payload.studio as Studio;
  const goals = payload.goals as GoalSummary[];
  const sources = payload.sources as SourceSummary[];
  const conceptNotes = payload.conceptNotes as Array<{ canonical_name: string; notes: string }>;
  const evidenceSummaries = payload.evidenceSummaries as EvidenceSummary[];

  const lines: string[] = [
    `# ${studio.name}`,
    '',
    studio.description ? `${studio.description}\n` : '',
    studio.primaryObjective ? `**Primary objective:** ${studio.primaryObjective}\n` : '',
    '## Goals',
  ];

  if (goals.length === 0) {
    lines.push('- (none)');
  } else {
    for (const goal of goals) {
      lines.push(`- ${goal.statement}${goal.isPrimary ? ' *(primary)*' : ''} — ${goal.status}`);
    }
  }

  lines.push('', '## Sources');
  if (sources.length === 0) {
    lines.push('- (none)');
  } else {
    for (const source of sources) {
      lines.push(
        `- **${source.title}** (${source.kind}, ${source.processingStatus}) — ${source.blockCount} blocks`,
      );
    }
  }

  lines.push('', '## Concept notes');
  if (conceptNotes.length === 0) {
    lines.push('- (none)');
  } else {
    for (const note of conceptNotes) {
      lines.push(`- **${note.canonical_name}:** ${note.notes}`);
    }
  }

  lines.push('', '## Learner evidence');
  if (evidenceSummaries.length === 0) {
    lines.push('- (none)');
  } else {
    for (const evidence of evidenceSummaries) {
      lines.push(
        `- **${evidence.conceptName}:** ${evidence.masteryLevel} (${evidence.certaintyStatus}, ${evidence.evidenceCount} events)`,
      );
    }
  }

  lines.push('', '---', '*Exported without API keys or full source text.*');
  return lines.filter((line, index) => !(line === '' && index === lines.length - 1)).join('\n');
}

export function exportStudioBundle(options: StudioExportOptions): StudioExportResult {
  const { db, studio, destDir } = options;
  fs.mkdirSync(destDir, { recursive: true });

  const payload = buildStudioExportPayload(db, studio);
  const jsonPath = path.join(destDir, 'studio.json');
  const markdownPath = path.join(destDir, 'studio.md');

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, renderStudioExportMarkdown(payload), 'utf8');

  return { jsonPath, markdownPath };
}
