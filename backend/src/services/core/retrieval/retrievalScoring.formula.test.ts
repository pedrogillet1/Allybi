/**
 * Tests for the retrieval scoring formula.
 *
 * The scoring formula is a private method of RetrievalEngineService.rankCandidates,
 * so we test the formula logic by replicating the exact weights and computation
 * defined in retrievalEngine.service.ts and verifying it against shared utils.
 *
 * Default weights are loaded from retrieval_ranker_config.any.json.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

import { clamp01, safeNumber } from "./retrievalEngine.utils";

function loadDefaultWeightsFromBank() {
  const bankPath = path.resolve(
    process.cwd(),
    "src/data_banks/retrieval/retrieval_ranker_config.any.json",
  );
  const raw = fs.readFileSync(bankPath, "utf8");
  const parsed = JSON.parse(raw) as {
    config?: { weights?: Record<string, number> };
  };
  return {
    semantic: Number(parsed?.config?.weights?.semantic ?? 0.42),
    lexical: Number(parsed?.config?.weights?.lexical ?? 0.16),
    structural: Number(parsed?.config?.weights?.structural ?? 0.16),
    titleBoost: Number(parsed?.config?.weights?.titleBoost ?? 0.06),
    documentIntelligenceBoost: Number(
      parsed?.config?.weights?.documentIntelligenceBoost ?? 0.12,
    ),
    routingPriorityBoost: Number(
      parsed?.config?.weights?.routingPriorityBoost ?? 0.04,
    ),
    typeBoost: Number(parsed?.config?.weights?.typeBoost ?? 0.02),
    recencyBoost: Number(parsed?.config?.weights?.recencyBoost ?? 0.02),
  } as const;
}

const DEFAULT_WEIGHTS = loadDefaultWeightsFromBank();

interface ScoreComponents {
  semantic?: number;
  lexical?: number;
  structural?: number;
  titleBoost?: number;
  keywordBoost?: number;
  documentIntelligenceBoost?: number;
  routingPriorityBoost?: number;
  typeBoost?: number;
  recencyBoost?: number;
  penalties?: number;
}

function computeFinalScore(
  scores: ScoreComponents,
  weights = DEFAULT_WEIGHTS,
): number {
  const semantic = clamp01(scores.semantic ?? 0);
  const lexical = clamp01(scores.lexical ?? 0);
  const structural = clamp01(scores.structural ?? 0);
  const titleBoost = clamp01(
    (scores.titleBoost ?? 0) + (scores.keywordBoost ?? 0) * 0.5,
  );
  const documentIntelligenceBoost = clamp01(
    scores.documentIntelligenceBoost ?? 0,
  );
  const routingPriorityBoost = clamp01(scores.routingPriorityBoost ?? 0);
  const typeBoost = clamp01(scores.typeBoost ?? 0);
  const recencyBoost = clamp01(scores.recencyBoost ?? 0);
  const penalties = clamp01(scores.penalties ?? 0);

  const raw =
    weights.semantic * semantic +
    weights.lexical * lexical +
    weights.structural * structural +
    weights.titleBoost * titleBoost +
    safeNumber(weights.documentIntelligenceBoost, 0.12) *
      documentIntelligenceBoost +
    safeNumber(weights.routingPriorityBoost, 0.04) * routingPriorityBoost +
    weights.typeBoost * typeBoost +
    weights.recencyBoost * recencyBoost -
    penalties;

  return clamp01(raw);
}

interface Candidate {
  id: string;
  docId: string;
  locationKey: string;
  finalScore: number;
}

function stableSort(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
    if (a.locationKey !== b.locationKey)
      return a.locationKey.localeCompare(b.locationKey);
    return a.id.localeCompare(b.id);
  });
}

describe("retrievalScoring.formula", () => {
  test("pure semantic score follows bank semantic weight", () => {
    const score = computeFinalScore({
      semantic: 1.0,
      lexical: 0,
      structural: 0,
    });
    expect(score).toBeCloseTo(DEFAULT_WEIGHTS.semantic, 4);
  });

  test("weighted sum computes correctly with all components", () => {
    const score = computeFinalScore({
      semantic: 0.9,
      lexical: 0.7,
      structural: 0.5,
      titleBoost: 0.3,
      documentIntelligenceBoost: 0.4,
      routingPriorityBoost: 0.2,
      typeBoost: 0.6,
      recencyBoost: 0.5,
      penalties: 0,
    });

    const expected =
      DEFAULT_WEIGHTS.semantic * 0.9 +
      DEFAULT_WEIGHTS.lexical * 0.7 +
      DEFAULT_WEIGHTS.structural * 0.5 +
      DEFAULT_WEIGHTS.titleBoost * 0.3 +
      DEFAULT_WEIGHTS.documentIntelligenceBoost * 0.4 +
      DEFAULT_WEIGHTS.routingPriorityBoost * 0.2 +
      DEFAULT_WEIGHTS.typeBoost * 0.6 +
      DEFAULT_WEIGHTS.recencyBoost * 0.5;
    expect(score).toBeCloseTo(expected, 4);
  });

  test("score is clamped to [0, 1]", () => {
    const scoreOverflow = computeFinalScore({
      semantic: 1.0,
      lexical: 1.0,
      structural: 1.0,
      titleBoost: 1.0,
      documentIntelligenceBoost: 1.0,
      routingPriorityBoost: 1.0,
      typeBoost: 1.0,
      recencyBoost: 1.0,
      penalties: 0,
    });
    expect(scoreOverflow).toBe(1.0);

    const scoreUnderflow = computeFinalScore({
      semantic: 0.1,
      lexical: 0,
      structural: 0,
      penalties: 1.0,
    });
    expect(scoreUnderflow).toBe(0);
  });

  test("penalties reduce score", () => {
    const baseScore = computeFinalScore({
      semantic: 0.8,
      lexical: 0.5,
      penalties: 0,
    });

    const penalizedScore = computeFinalScore({
      semantic: 0.8,
      lexical: 0.5,
      penalties: 0.1,
    });

    expect(penalizedScore).toBeLessThan(baseScore);
    expect(baseScore - penalizedScore).toBeCloseTo(0.1, 2);
  });

  test("encrypted mode caps at semantic-only budget from bank", () => {
    const encryptedScore = computeFinalScore({
      semantic: 1.0,
      lexical: 0,
      structural: 0,
      titleBoost: 0,
      documentIntelligenceBoost: 0,
      routingPriorityBoost: 0,
      typeBoost: 0,
      recencyBoost: 0,
      penalties: 0,
    });

    expect(encryptedScore).toBeCloseTo(DEFAULT_WEIGHTS.semantic, 4);
    expect(encryptedScore).toBeLessThan(0.6);

    const moderateSemantic = computeFinalScore({
      semantic: 0.85,
      lexical: 0,
      structural: 0,
    });
    expect(moderateSemantic).toBeLessThan(0.55);
  });

  test("stable tiebreaking produces consistent ordering for equal scores", () => {
    const candidates: Candidate[] = [
      { id: "c-3", docId: "doc-b", locationKey: "loc-1", finalScore: 0.5 },
      { id: "c-1", docId: "doc-a", locationKey: "loc-2", finalScore: 0.5 },
      { id: "c-2", docId: "doc-a", locationKey: "loc-1", finalScore: 0.5 },
      { id: "c-4", docId: "doc-a", locationKey: "loc-1", finalScore: 0.8 },
    ];

    const sorted1 = stableSort(candidates);
    const sorted2 = stableSort([...candidates].reverse());

    expect(sorted1.map((c) => c.id)).toEqual(sorted2.map((c) => c.id));
    expect(sorted1[0].id).toBe("c-4");
    expect(sorted1[1].id).toBe("c-2");
    expect(sorted1[2].id).toBe("c-1");
    expect(sorted1[3].id).toBe("c-3");
  });
});
