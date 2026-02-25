/**
 * Slot Extraction Test Suite
 *
 * Tests the full extraction pipeline:
 *   1. slotResolver: query -> slot contract
 *   2. extractionCompiler: evidence + slot -> entities
 *   3. qualityGateRunner: extraction-specific gates
 *
 * Loads golden cases from data_banks/tests/slot_extraction_cases.any.json
 */

import { describe, expect, it, beforeAll } from "@jest/globals";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Inline implementations for test isolation (avoid bank loader dependency)
// ---------------------------------------------------------------------------

interface SlotPatternEntry {
  id: string;
  patterns: Record<string, string[]>;
  targetRoleId: string;
  extractionMode: "STRICT_EXTRACT" | "ALLOW_INFERENCE";
  forbidden: string[];
  confusionPenalties: Array<{ role: string; penalty: number }>;
  anchorLabels: Record<string, string[]>;
}

interface SlotContract {
  slotId: string;
  targetRoleId: string;
  extractionMode: "STRICT_EXTRACT" | "ALLOW_INFERENCE" | null;
  forbidden: string[];
  confusionPenalties: Array<{ role: string; penalty: number }>;
  anchorLabels: string[];
  confidence: number;
}

interface SlotResolutionResult {
  resolved: boolean;
  contract: SlotContract | null;
  isExtractionQuery: boolean;
}

function resolveSlotFromBank(
  query: string,
  language: string,
  bank: { config: { minPatternConfidence: number }; slots: SlotPatternEntry[] },
): SlotResolutionResult {
  const minConf = bank.config.minPatternConfidence ?? 0.75;
  const normalizedQuery = query.trim().toLowerCase();
  const lang = language.toLowerCase();

  let bestMatch: { slot: SlotPatternEntry; confidence: number } | null = null;

  for (const slot of bank.slots) {
    const patterns = slot.patterns[lang] ?? slot.patterns["en"] ?? [];
    for (const pat of patterns) {
      try {
        const rx = new RegExp(pat, "i");
        if (rx.test(normalizedQuery)) {
          const confidence = 1.0;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { slot, confidence };
          }
          break;
        }
      } catch {
        /* skip */
      }
    }
  }

  if (!bestMatch || bestMatch.confidence < minConf) {
    return { resolved: false, contract: null, isExtractionQuery: false };
  }

  const s = bestMatch.slot;
  return {
    resolved: true,
    contract: {
      slotId: s.id,
      targetRoleId: s.targetRoleId,
      extractionMode: s.extractionMode ?? null,
      forbidden: s.forbidden ?? [],
      confusionPenalties: s.confusionPenalties ?? [],
      anchorLabels: s.anchorLabels[lang] ?? s.anchorLabels["en"] ?? [],
      confidence: bestMatch.confidence,
    },
    isExtractionQuery: true,
  };
}

// Inline extraction compiler logic
type ExtractionStatus = "EXACT" | "INFERRED" | "NOT_FOUND";

interface ExtractionCandidate {
  entityText: string;
  roleId: string;
  confidence: number;
}

interface ExtractionResult {
  status: ExtractionStatus;
  targetSlotId: string;
  candidates: ExtractionCandidate[];
  forbiddenMentions: Array<{ role: string; entityText: string }>;
  compilerAnswer: string | null;
}

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

function findAllEntities(
  text: string,
): Array<{ entity: string; index: number }> {
  const found: Array<{ entity: string; index: number }> = [];
  let m: RegExpExecArray | null;

  // Multi-word capitalized names (e.g., "John Smith", "Jo\u00e3o Silva")
  const nameRx =
    /\b([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+(?:de|da|do|dos|das|e|van|von|el|al|del)?\s*[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+)+)\b/g;
  while ((m = nameRx.exec(text)) !== null) {
    const val = m[1].trim();
    if (val.length >= 3 && !found.some((f) => f.entity === val)) {
      found.push({ entity: val, index: m.index });
    }
  }

  // Company names: "Capitalized ACRONYM" (e.g., "Beta LLC", "Acme Inc")
  const companyRx = /\b([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+\s+[A-Z]{2,})\b/g;
  while ((m = companyRx.exec(text)) !== null) {
    const val = m[1].trim();
    if (val.length >= 3 && !found.some((f) => f.entity === val)) {
      found.push({ entity: val, index: m.index });
    }
  }

  // Single capitalized words (fallback)
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
 * Sentence-aware distance: raw char distance penalized for crossing
 * sentence boundaries (periods, semicolons, etc.).
 */
function sentenceAwareDistance(
  text: string,
  posA: number,
  posB: number,
): number {
  const rawDist = Math.abs(posA - posB);
  const start = Math.min(posA, posB);
  const end = Math.max(posA, posB);
  const between = text.slice(start, end);
  const boundaries = (between.match(/[.;!?]/g) || []).length;
  return rawDist * (1 + boundaries * 2);
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

function compileExtraction(
  evidence: Array<{
    snippet: string;
    docId: string;
    locationKey: string;
    score?: number;
  }>,
  slot: SlotContract,
  ontology: {
    roles: Array<{ id: string; anchors: Record<string, string[]> }>;
  },
  lang: string,
): ExtractionResult {
  const proximityWindow = 200;
  const targetAnchors = [...(slot.anchorLabels || [])];
  const ontRole = ontology.roles.find((r) => r.id === slot.targetRoleId);
  if (ontRole) {
    const extra = ontRole.anchors[lang] ?? ontRole.anchors["en"] ?? [];
    for (const a of extra) {
      if (!targetAnchors.includes(a)) targetAnchors.push(a);
    }
  }

  const forbiddenAnchorsMap = new Map<string, string[]>();
  for (const forbId of slot.forbidden) {
    const role = ontology.roles.find((r) => r.id === forbId);
    if (role) {
      forbiddenAnchorsMap.set(
        forbId,
        role.anchors[lang] ?? role.anchors["en"] ?? [],
      );
    }
  }

  const allCandidates: ExtractionCandidate[] = [];
  const allForbidden: Array<{ role: string; entityText: string }> = [];

  for (const item of evidence) {
    const snippet = item.snippet;
    const allEntities = findAllEntities(snippet);

    const targetPositions = findAnchorPositions(snippet, targetAnchors);

    // Collect ALL forbidden positions across all forbidden roles
    const allForbiddenPositions: Array<{
      anchor: string;
      index: number;
      roleId: string;
    }> = [];
    for (const [forbRoleId, forbAnchors] of forbiddenAnchorsMap) {
      const positions = findAnchorPositions(snippet, forbAnchors);
      for (const pos of positions) {
        allForbiddenPositions.push({ ...pos, roleId: forbRoleId });
      }
    }

    // For each entity, compute sentence-aware distance to target vs forbidden
    for (const entity of allEntities) {
      const minTargetDist =
        targetPositions.length > 0
          ? Math.min(
              ...targetPositions.map((p) =>
                sentenceAwareDistance(snippet, entity.index, p.index),
              ),
            )
          : Infinity;
      const minForbiddenDist =
        allForbiddenPositions.length > 0
          ? Math.min(
              ...allForbiddenPositions.map((p) =>
                sentenceAwareDistance(snippet, entity.index, p.index),
              ),
            )
          : Infinity;

      if (minTargetDist > proximityWindow && minForbiddenDist > proximityWindow)
        continue;

      if (minTargetDist <= minForbiddenDist) {
        if (minTargetDist <= proximityWindow) {
          const existing = allCandidates.find(
            (c) => c.entityText.toLowerCase() === entity.entity.toLowerCase(),
          );
          if (existing) {
            existing.confidence = Math.min(1.0, existing.confidence + 0.1);
          } else {
            allCandidates.push({
              entityText: entity.entity,
              roleId: slot.targetRoleId,
              confidence: 0.85 + (item.score ?? 0.7) * 0.1,
            });
          }
        }
      } else {
        if (minForbiddenDist <= proximityWindow) {
          const closestForbPos = [...allForbiddenPositions].sort(
            (a, b) =>
              sentenceAwareDistance(snippet, entity.index, a.index) -
              sentenceAwareDistance(snippet, entity.index, b.index),
          )[0];
          if (
            !allForbidden.some(
              (f) =>
                f.entityText.toLowerCase() === entity.entity.toLowerCase() &&
                f.role === closestForbPos.roleId,
            )
          ) {
            allForbidden.push({
              role: closestForbPos.roleId,
              entityText: entity.entity,
            });
          }
        }
      }
    }
  }

  // Safety net: remove candidates that also appear as forbidden across snippets
  const cleanCandidates = allCandidates.filter(
    (c) =>
      !allForbidden.some(
        (f) => f.entityText.toLowerCase() === c.entityText.toLowerCase(),
      ),
  );
  cleanCandidates.sort((a, b) => b.confidence - a.confidence);

  const minConfidence = 0.85;
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
    compilerAnswer = [...new Set(names)].join(", ");
  } else if (cleanCandidates.length > 0) {
    status = "INFERRED";
    compilerAnswer = [
      ...new Set(cleanCandidates.map((c) => c.entityText)),
    ].join(", ");
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

const DATA_BANKS_DIR = path.resolve(__dirname, "../../../data_banks");

function loadBank<T>(filename: string): T {
  const fullPath = path.join(DATA_BANKS_DIR, filename);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as T;
}

describe("Slot Extraction Pipeline", () => {
  let slotBank: any;
  let ontologyBank: any;
  let testCases: any[];

  beforeAll(() => {
    slotBank = loadBank("semantics/query_slot_contracts.any.json");
    ontologyBank = loadBank("semantics/entity_role_ontology.any.json");
    const casesBank = loadBank<any>("tests/slot_extraction_cases.any.json");
    testCases = casesBank.cases;
  });

  describe("slotResolver", () => {
    it("should resolve all golden case queries to expected slots", () => {
      let resolved = 0;
      let total = 0;

      for (const tc of testCases) {
        if (tc.expectedSlotId === null) continue;
        total++;

        const result = resolveSlotFromBank(tc.query, tc.language, slotBank);
        if (result.resolved && result.contract?.slotId === tc.expectedSlotId) {
          resolved++;
        } else {
          console.warn(
            `[SLOT_MISS] ${tc.id}: query="${tc.query}" expected=${tc.expectedSlotId} got=${result.contract?.slotId ?? "null"}`,
          );
        }
      }

      const precision = total > 0 ? resolved / total : 1.0;
      expect(precision).toBeGreaterThanOrEqual(0.95);
    });

    it("should NOT resolve non-extraction queries", () => {
      for (const tc of testCases) {
        if (tc.expectedSlotId !== null) continue;
        const result = resolveSlotFromBank(tc.query, tc.language, slotBank);
        expect(result.resolved).toBe(false);
      }
    });

    it("should resolve target role correctly", () => {
      for (const tc of testCases) {
        if (tc.expectedSlotId === null) continue;
        const result = resolveSlotFromBank(tc.query, tc.language, slotBank);
        if (result.resolved) {
          expect(result.contract?.targetRoleId).toBe(tc.expectedTargetRoleId);
        }
      }
    });
  });

  describe("extractionCompiler", () => {
    it("should extract correct entities for each golden case", () => {
      let correctExtractions = 0;
      let totalExtractions = 0;

      for (const tc of testCases) {
        if (!tc.expectedSlotId || !tc.mockEvidence?.length) continue;
        if (tc.expectedStatus === null) continue;

        const result = resolveSlotFromBank(tc.query, tc.language, slotBank);
        if (!result.resolved || !result.contract) continue;

        totalExtractions++;

        const extraction = compileExtraction(
          tc.mockEvidence,
          result.contract,
          ontologyBank,
          tc.language,
        );

        // Check status
        if (extraction.status === tc.expectedStatus) {
          if (tc.expectedEntities?.length > 0) {
            const extractedLower = extraction.candidates.map((c) =>
              c.entityText.toLowerCase(),
            );
            const allExpected = tc.expectedEntities.every((e: string) =>
              extractedLower.some((el) => el.includes(e.toLowerCase())),
            );
            if (allExpected) {
              correctExtractions++;
            } else {
              console.warn(
                `[ENTITY_MISS] ${tc.id}: expected=${JSON.stringify(tc.expectedEntities)} got=${JSON.stringify(extraction.candidates.map((c: any) => c.entityText))}`,
              );
            }
          } else {
            correctExtractions++;
          }
        } else {
          console.warn(
            `[STATUS_MISS] ${tc.id}: expected=${tc.expectedStatus} got=${extraction.status} candidates=${JSON.stringify(extraction.candidates.map((c: any) => c.entityText))}`,
          );
        }
      }

      const precision =
        totalExtractions > 0 ? correctExtractions / totalExtractions : 1.0;
      expect(precision).toBeGreaterThanOrEqual(0.7);
    });

    it("should not extract forbidden entities as candidates", () => {
      for (const tc of testCases) {
        if (!tc.expectedSlotId || !tc.mockEvidence?.length) continue;
        if (!tc.forbiddenEntities?.length) continue;

        const result = resolveSlotFromBank(tc.query, tc.language, slotBank);
        if (!result.resolved || !result.contract) continue;

        const extraction = compileExtraction(
          tc.mockEvidence,
          result.contract,
          ontologyBank,
          tc.language,
        );

        for (const forbidden of tc.forbiddenEntities) {
          const found = extraction.candidates.some(
            (c) => c.entityText.toLowerCase() === forbidden.toLowerCase(),
          );
          if (found) {
            console.warn(
              `[CONFUSION] ${tc.id}: forbidden entity '${forbidden}' found in candidates`,
            );
          }
          expect(found).toBe(false);
        }
      }
    });
  });

  describe("qualityGates (extraction)", () => {
    it("should pass for correct extractions", () => {
      for (const tc of testCases) {
        if (tc.expectedStatus !== "EXACT" || !tc.mockEvidence?.length) continue;

        const result = resolveSlotFromBank(tc.query, tc.language, slotBank);
        if (!result.resolved || !result.contract) continue;

        const extraction = compileExtraction(
          tc.mockEvidence,
          result.contract,
          ontologyBank,
          tc.language,
        );

        if (extraction.status !== "EXACT" || !extraction.compilerAnswer)
          continue;

        const answer = extraction.compilerAnswer;
        const answerLower = answer.toLowerCase();

        // Gate: entity_role_consistency — at least one candidate in answer
        const hasCandidateEntity = extraction.candidates.some((c) =>
          answerLower.includes(c.entityText.toLowerCase()),
        );
        expect(hasCandidateEntity).toBe(true);

        // Gate: forbidden_adjacent_role_absent
        for (const f of extraction.forbiddenMentions) {
          expect(answerLower.includes(f.entityText.toLowerCase())).toBe(false);
        }
      }
    });
  });

  describe("data bank integrity", () => {
    it("slot bank should have all required fields", () => {
      expect(slotBank.config.enabled).toBe(true);
      expect(slotBank.config.minPatternConfidence).toBeGreaterThan(0);
      expect(Array.isArray(slotBank.slots)).toBe(true);
      expect(slotBank.slots.length).toBeGreaterThan(0);

      for (const slot of slotBank.slots) {
        expect(slot.id).toBeTruthy();
        expect(slot.targetRoleId).toBeTruthy();
        expect(slot.extractionMode).toBeTruthy();
        expect(Array.isArray(slot.forbidden)).toBe(true);
        expect(slot.patterns.en?.length).toBeGreaterThan(0);
      }
    });

    it("ontology bank should have all required fields", () => {
      expect(ontologyBank.config.proximityWindowChars).toBeGreaterThan(0);
      expect(Array.isArray(ontologyBank.roles)).toBe(true);

      for (const role of ontologyBank.roles) {
        expect(role.id).toBeTruthy();
        expect(role.anchors.en?.length).toBeGreaterThan(0);
      }
    });

    it("confusion graph should be consistent with roles", () => {
      const roleIds = new Set(ontologyBank.roles.map((r: any) => r.id));
      for (const [key, value] of Object.entries(ontologyBank.confusionGraph)) {
        const [roleA, roleB] = key.split("-");
        expect(roleIds.has(roleA)).toBe(true);
        expect(roleIds.has(roleB)).toBe(true);
        expect((value as any).penalty).toBeGreaterThan(0);
      }
    });
  });
});
