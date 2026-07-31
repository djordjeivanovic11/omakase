import type { MasteryLevel } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';

export function normalizeConceptName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '');
}

export interface ConceptRecord {
  id: string;
  canonicalName: string;
  normalizedName: string;
  description: string | null;
}

export class ConceptsRepo {
  constructor(private readonly db: Database.Database) {}

  findByNormalizedName(normalizedName: string): ConceptRecord | null {
    const row = this.db
      .prepare('SELECT * FROM concepts WHERE normalized_name = ?')
      .get(normalizedName) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      canonicalName: row.canonical_name as string,
      normalizedName: row.normalized_name as string,
      description: (row.description as string | null) ?? null,
    };
  }

  findByAlias(normalizedAlias: string): ConceptRecord | null {
    const row = this.db
      .prepare(
        `SELECT c.* FROM concept_aliases a
         JOIN concepts c ON c.id = a.concept_id
         WHERE a.normalized_alias = ?`,
      )
      .get(normalizedAlias) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      canonicalName: row.canonical_name as string,
      normalizedName: row.normalized_name as string,
      description: (row.description as string | null) ?? null,
    };
  }

  findOrCreate(name: string, createdBy: 'user' | 'model' | 'system' = 'model'): ConceptRecord {
    const normalized = normalizeConceptName(name);
    const existing = this.findByNormalizedName(normalized) ?? this.findByAlias(normalized);
    if (existing) return existing;

    const id = newId();
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO concepts (id, canonical_name, normalized_name, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, name.trim(), normalized, createdBy, ts, ts);

    const concept = this.findByNormalizedName(normalized);
    if (!concept) throw new Error('Failed to create concept');
    return concept;
  }

  linkToStudio(studioId: string, conceptId: string): void {
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO studio_concepts (studio_id, concept_id, importance, status, created_at, updated_at)
         VALUES (?, ?, 0, 'active', ?, ?)
         ON CONFLICT(studio_id, concept_id) DO NOTHING`,
      )
      .run(studioId, conceptId, ts, ts);
  }
}

const LEVEL_ORDER: MasteryLevel[] = [
  'unassessed',
  'encountered',
  'can_explain',
  'can_apply',
  'can_compare_or_critique',
];

export function compareMastery(a: MasteryLevel, b: MasteryLevel): number {
  return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
}

export function maxMastery(a: MasteryLevel, b: MasteryLevel): MasteryLevel {
  return compareMastery(a, b) >= 0 ? a : b;
}

export function canTransitionMastery(from: MasteryLevel, to: MasteryLevel): boolean {
  const fromIdx = LEVEL_ORDER.indexOf(from);
  const toIdx = LEVEL_ORDER.indexOf(to);
  if (toIdx <= fromIdx) return true;
  return toIdx === fromIdx + 1;
}
