import type { EvidenceReference } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { normalizeConceptName } from './concepts-repo.js';

const MAX_CONCEPT_MATCHES_PER_EVIDENCE = 12;
const MAX_RELATION_PAIRS_PER_EVIDENCE = 24;
const CO_MENTION_CONFIDENCE = 0.55;

export interface ConceptGraphUpdate {
  evidenceCount: number;
  matchedConceptCount: number;
  createdRelationCount: number;
  linkedRelationEvidenceCount: number;
}

interface StudioConceptRow {
  concept_id: string;
  canonical_name: string;
  normalized_name: string;
}

interface EvidenceBlockRow {
  evidence_id: string;
  source_block_id: number;
  text: string;
}

function includesWholePhrase(text: string, phrase: string): boolean {
  const paddedText = ` ${text} `;
  return paddedText.includes(` ${phrase} `);
}

function normalizeEvidenceText(text: string): string {
  return normalizeConceptName(text.replace(/[\p{P}\p{S}]+/gu, ' '));
}

/**
 * Builds only conservative, source-backed `related` edges. This is an
 * incremental baseline for the Studio graph: it does not infer direction,
 * invent concepts, or merge aliases. A future model-assisted reconciler may
 * propose richer edge types, but it must continue to attach the same evidence.
 */
export function reconcileConceptRelationships(
  db: Database.Database,
  studioId: string,
  evidenceReferences: EvidenceReference[],
): ConceptGraphUpdate {
  if (evidenceReferences.length === 0) {
    return {
      evidenceCount: 0,
      matchedConceptCount: 0,
      createdRelationCount: 0,
      linkedRelationEvidenceCount: 0,
    };
  }

  return db.transaction(() => {
    const concepts = db
      .prepare(
        `SELECT sc.concept_id, c.canonical_name, c.normalized_name
         FROM studio_concepts sc
         JOIN concepts c ON c.id = sc.concept_id
         WHERE sc.studio_id = ? AND sc.status <> 'removed'
         ORDER BY length(c.normalized_name) DESC, c.normalized_name ASC
         LIMIT 200`,
      )
      .all(studioId) as StudioConceptRow[];

    const blockByEvidence = new Map<string, EvidenceBlockRow>();
    const blockQuery = db.prepare(
      `SELECT e.id AS evidence_id, e.source_block_id, sb.text
       FROM evidence e
       JOIN source_blocks sb ON sb.id = e.source_block_id
       JOIN source_versions sv ON sv.id = e.source_version_id
       JOIN studio_sources ss ON ss.source_id = sv.source_id
       WHERE e.id = ? AND ss.studio_id = ?`,
    );
    for (const reference of evidenceReferences) {
      if (!reference.sourceBlockId) continue;
      const row = blockQuery.get(reference.id, studioId) as EvidenceBlockRow | undefined;
      if (row) blockByEvidence.set(reference.id, row);
    }

    let matchedConceptCount = 0;
    let createdRelationCount = 0;
    let linkedRelationEvidenceCount = 0;

    const addConceptEvidence = db.prepare(
      `INSERT INTO concept_evidence (concept_id, evidence_id)
       VALUES (?, ?)
       ON CONFLICT(concept_id, evidence_id) DO NOTHING`,
    );
    const addRelation = db.prepare(
      `INSERT INTO concept_relations (
         from_concept_id, to_concept_id, relation, confidence, created_by, created_at
       ) VALUES (?, ?, 'related', ?, 'system', ?)
       ON CONFLICT(from_concept_id, to_concept_id, relation) DO NOTHING`,
    );
    const addRelationEvidence = db.prepare(
      `INSERT INTO concept_relation_evidence (
         from_concept_id, to_concept_id, relation, evidence_id
       ) VALUES (?, ?, 'related', ?)
       ON CONFLICT(from_concept_id, to_concept_id, relation, evidence_id) DO NOTHING`,
    );

    for (const [evidenceId, block] of blockByEvidence) {
      const normalizedText = normalizeEvidenceText(block.text);
      const matched = concepts
        .filter((concept) => {
          // Avoid making short, generic tokens into graph anchors.
          if (concept.normalized_name.length < 4) return false;
          return includesWholePhrase(normalizedText, concept.normalized_name);
        })
        .slice(0, MAX_CONCEPT_MATCHES_PER_EVIDENCE);

      if (matched.length === 0) continue;
      matchedConceptCount += matched.length;
      for (const concept of matched) addConceptEvidence.run(concept.concept_id, evidenceId);

      let pairCount = 0;
      for (
        let left = 0;
        left < matched.length && pairCount < MAX_RELATION_PAIRS_PER_EVIDENCE;
        left += 1
      ) {
        for (
          let right = left + 1;
          right < matched.length && pairCount < MAX_RELATION_PAIRS_PER_EVIDENCE;
          right += 1
        ) {
          const first = matched[left];
          const second = matched[right];
          if (!first || !second || first.concept_id === second.concept_id) continue;

          // `related` is symmetric. Store one canonical direction so repeated
          // passages cannot create two indistinguishable edges.
          const [from, to] = [first.concept_id, second.concept_id].sort();
          const relationInsert = addRelation.run(from, to, CO_MENTION_CONFIDENCE, Date.now());
          createdRelationCount += relationInsert.changes;
          const evidenceInsert = addRelationEvidence.run(from, to, evidenceId);
          linkedRelationEvidenceCount += evidenceInsert.changes;
          pairCount += 1;
        }
      }
    }

    return {
      evidenceCount: blockByEvidence.size,
      matchedConceptCount,
      createdRelationCount,
      linkedRelationEvidenceCount,
    };
  })();
}
