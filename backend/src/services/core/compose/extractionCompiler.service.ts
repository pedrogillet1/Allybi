/**
 * ExtractionCompiler — deterministic entity extraction from evidence.
 *
 * When a slot contract targets a specific entity role (e.g. "owner"),
 * this compiler scans evidence snippets for:
 *   1) Target-role anchor labels (boost -> candidate)
 *   2) Forbidden-role anchor labels (track -> forbiddenMentions)
 *   3) Capitalized names / quoted text near role anchors (entity candidates)
 *
 * Returns an ExtractionResult with status EXACT / INFERRED / NOT_FOUND,
 * candidate entities, and forbidden mentions.
 */

import { getBank } from "../banks/bankLoader.service";
import type { SlotContract } from "../retrieval/slotResolver.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtractionStatus = "EXACT" | "INFERRED" | "NOT_FOUND";

export interface ExtractionCandidate {
  entityText: string;
  roleId: string;
  confidence: number;
  evidenceSnippet: string;
  evidenceDocId: string;
  evidenceLocationKey: string;
}

export interface ExtractionResult {
  status: ExtractionStatus;
  targetSlotId: string;
  candidates: ExtractionCandidate[];
  forbiddenMentions: Array<{ role: string; entityText: string }>;
  compilerAnswer: string | null;
}

// ---------------------------------------------------------------------------
// Evidence item shape (subset used here)
// ---------------------------------------------------------------------------

interface EvidenceItemLike {
  docId: string;
  locationKey: string;
  snippet?: string;
  score?: { finalScore?: number };
}

// ---------------------------------------------------------------------------
// Bank shapes
// ---------------------------------------------------------------------------

interface RoleEntry {
  id: string;
  anchors: Record<string, string[]>;
  contextClues?: Record<string, string[]>;
}

interface OntologyBank {
  config: { proximityWindowChars: number; anchorMatchMinLength: number };
  roles: RoleEntry[];
}

interface ExtractionPolicyBank {
  config: { enabled: boolean; defaultMode: string };
  modes: Record<
    string,
    {
      allowInference: boolean;
      minConfidence: number;
    }
  >;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Common words to skip when detecting capitalized proper nouns
const SKIP_WORDS = new Set([
  "The",
  "This",
  "That",
  "Party",
  "Contract",
  "Agreement",
  "Section",
  "Article",
  "Clause",
  "Document",
  "Property",
  "Evidence",
  "Witness",
  "Owner",
  "Guarantor",
  "Signatory",
  "Beneficiary",
  "Tenant",
  "Signed",
  "Between",
  "Whereas",
  "Hereinafter",
  "Hereby",
]);

/**
 * Find all capitalized name sequences (entities) in a text, each with
 * its character position, so callers can filter by proximity.
 */
function findAllEntities(
  text: string,
): Array<{ entity: string; index: number }> {
  const found: Array<{ entity: string; index: number }> = [];
  let m: RegExpExecArray | null;

  // Quoted text
  const quoteRx = /[""\u201C]([^""\u201D]+)[""\u201D]/g;
  while ((m = quoteRx.exec(text)) !== null) {
    const val = (m[1] || "").trim();
    if (val.length >= 2) {
      found.push({ entity: val, index: m.index });
    }
  }

  // Multi-word capitalized names
  const nameRx =
    /\b([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+(?:de|da|do|dos|das|e|van|von|el|al|del)?\s*[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+)+)\b/g;
  while ((m = nameRx.exec(text)) !== null) {
    const val = m[1].trim();
    if (val.length >= 3 && !found.some((f) => f.entity === val)) {
      found.push({ entity: val, index: m.index });
    }
  }

  // Single capitalized words (fallback, only if no multi-word found)
  if (found.length === 0) {
    const singleRx = /\b([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]{2,})\b/g;
    while ((m = singleRx.exec(text)) !== null) {
      const val = m[1].trim();
      if (!SKIP_WORDS.has(val)) {
        found.push({ entity: val, index: m.index });
      }
    }
  }

  return found;
}

/**
 * For each anchor position, find the closest entity (by character distance).
 * Returns only the single closest entity per anchor hit, avoiding cross-
 * contamination when multiple roles appear in the same snippet.
 */
function extractClosestEntities(
  allEntities: Array<{ entity: string; index: number }>,
  anchorPositions: Array<{ anchor: string; index: number }>,
  windowChars: number,
): string[] {
  const result: string[] = [];
  for (const pos of anchorPositions) {
    // Find entities within window, sorted by distance
    const nearby = allEntities
      .filter((e) => Math.abs(e.index - pos.index) <= windowChars)
      .sort(
        (a, b) => Math.abs(a.index - pos.index) - Math.abs(b.index - pos.index),
      );

    // Take only the closest entity
    if (nearby.length > 0 && !result.includes(nearby[0].entity)) {
      result.push(nearby[0].entity);
    }
  }
  return result;
}

function findAnchorPositions(
  text: string,
  anchors: string[],
): Array<{ anchor: string; index: number }> {
  const lower = text.toLowerCase();
  const positions: Array<{ anchor: string; index: number }> = [];
  for (const anchor of anchors) {
    let searchFrom = 0;
    const anchorLower = anchor.toLowerCase();
    while (true) {
      const idx = lower.indexOf(anchorLower, searchFrom);
      if (idx === -1) break;
      positions.push({ anchor, index: idx });
      searchFrom = idx + anchorLower.length;
    }
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Main compile function
// ---------------------------------------------------------------------------

/**
 * Compile evidence into extraction candidates for a given slot contract.
 */
export function compile(
  evidence: EvidenceItemLike[],
  slot: SlotContract,
  lang: string,
): ExtractionResult {
  // Load ontology for anchor lookup
  let ontology: OntologyBank | null = null;
  let policy: ExtractionPolicyBank | null = null;
  try {
    ontology = getBank<OntologyBank>("entity_role_ontology");
  } catch {
    /* optional */
  }
  try {
    policy = getBank<ExtractionPolicyBank>("extraction_policy");
  } catch {
    /* optional */
  }

  if (!policy?.config?.enabled) {
    return {
      status: "NOT_FOUND",
      targetSlotId: slot.slotId,
      candidates: [],
      forbiddenMentions: [],
      compilerAnswer: null,
    };
  }

  const proximityWindow = ontology?.config?.proximityWindowChars ?? 200;

  // Get target role anchors from slot + ontology
  const targetAnchors = [...(slot.anchorLabels || [])];
  const ontologyRole = ontology?.roles?.find((r) => r.id === slot.targetRoleId);
  if (ontologyRole) {
    const extraAnchors =
      ontologyRole.anchors[lang] ?? ontologyRole.anchors["en"] ?? [];
    for (const a of extraAnchors) {
      if (!targetAnchors.includes(a)) targetAnchors.push(a);
    }
  }

  // Build forbidden anchors map: roleId -> anchors[]
  const forbiddenAnchorsMap = new Map<string, string[]>();
  for (const forbiddenRoleId of slot.forbidden) {
    const forbRole = ontology?.roles?.find((r) => r.id === forbiddenRoleId);
    if (forbRole) {
      const anchors = forbRole.anchors[lang] ?? forbRole.anchors["en"] ?? [];
      forbiddenAnchorsMap.set(forbiddenRoleId, anchors);
    }
  }

  const allCandidates: ExtractionCandidate[] = [];
  const allForbidden: Array<{ role: string; entityText: string }> = [];

  for (const item of evidence) {
    const snippet = item.snippet ?? "";
    if (!snippet.trim()) continue;

    // Pre-compute all entities in this snippet once
    const allEntities = findAllEntities(snippet);

    // Find target anchor positions and extract closest entities
    const targetPositions = findAnchorPositions(snippet, targetAnchors);
    const targetEntities = extractClosestEntities(
      allEntities,
      targetPositions,
      proximityWindow,
    );

    for (const entityText of targetEntities) {
      const existing = allCandidates.find(
        (c) => c.entityText.toLowerCase() === entityText.toLowerCase(),
      );
      if (existing) {
        existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      } else {
        allCandidates.push({
          entityText,
          roleId: slot.targetRoleId,
          confidence: 0.85 + (item.score?.finalScore ?? 0) * 0.1,
          evidenceSnippet: snippet.slice(0, 200),
          evidenceDocId: item.docId,
          evidenceLocationKey: item.locationKey,
        });
      }
    }

    // Detect forbidden-role entities for forbiddenMentions
    for (const [forbRoleId, forbAnchors] of forbiddenAnchorsMap) {
      const forbPositions = findAnchorPositions(snippet, forbAnchors);
      const forbEntities = extractClosestEntities(
        allEntities,
        forbPositions,
        proximityWindow,
      );
      for (const entityText of forbEntities) {
        if (
          !allForbidden.some(
            (f) =>
              f.entityText.toLowerCase() === entityText.toLowerCase() &&
              f.role === forbRoleId,
          )
        ) {
          allForbidden.push({ role: forbRoleId, entityText });
        }
      }
    }
  }

  // Remove candidates that also appear as forbidden mentions
  const cleanCandidates = allCandidates.filter(
    (c) =>
      !allForbidden.some(
        (f) => f.entityText.toLowerCase() === c.entityText.toLowerCase(),
      ),
  );

  // Sort by confidence descending
  cleanCandidates.sort((a, b) => b.confidence - a.confidence);

  // Determine status
  const modeKey = slot.extractionMode ?? policy.config.defaultMode;
  const modeConfig = policy.modes[modeKey] ?? policy.modes["STRICT_EXTRACT"];
  const minConfidence = modeConfig?.minConfidence ?? 0.85;

  let status: ExtractionStatus;
  let compilerAnswer: string | null = null;

  if (
    cleanCandidates.length > 0 &&
    cleanCandidates[0].confidence >= minConfidence
  ) {
    status = "EXACT";
    const names = cleanCandidates
      .filter((c) => c.confidence >= minConfidence)
      .map((c) => c.entityText);
    const unique = [...new Set(names)];
    compilerAnswer = unique.join(", ");
  } else if (cleanCandidates.length > 0 && modeConfig?.allowInference) {
    status = "INFERRED";
    const names = cleanCandidates.map((c) => c.entityText);
    compilerAnswer = [...new Set(names)].join(", ");
  } else {
    status = "NOT_FOUND";
  }

  return {
    status,
    targetSlotId: slot.slotId,
    candidates: cleanCandidates,
    forbiddenMentions: allForbidden,
    compilerAnswer,
  };
}
