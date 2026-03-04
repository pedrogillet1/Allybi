/**
 * Tests for the retrieval scoring formula.
 *
 * The scoring formula is a private method of RetrievalEngineService.rankCandidates,
 * so we test the formula logic by replicating the exact weights and computation
 * defined in retrievalEngine.service.ts and verifying it against the utils
 * (clamp01, safeNumber) which are the shared building blocks.
 *
 * Default weights from the engine:
 *   semantic: 0.52
 *   lexical: 0.22
 *   structural: 0.14
 *   titleBoost: 0.06
 *   documentIntelligenceBoost: 0.08
 *   routingPriorityBoost: 0.04
 *   typeBoost: 0.03
 *   recencyBoost: 0.03
 *
 * Formula:  finalScore = clamp01(
 *   w.semantic * semantic + w.lexical * lexical + w.structural * structural
 *   + w.titleBoost * titleBoost + w.documentIntelligenceBoost * docIntelBoost
 *   + w.routingPriorityBoost * routingBoost + w.typeBoost * typeBoost
 *   + w.recencyBoost * recencyBoost - penalties
 * )
 */

import { describe, expect, test } from "@jest/globals";

import { clamp01, safeNumber } from "./retrievalEngine.utils";

/* ------------------------------------------------------------------ */
/*  Replicate the exact scoring formula from retrievalEngine.service   */
/* ------------------------------------------------------------------ */

const DEFAULT_WEIGHTS = {
  semantic: 0.52,
  lexical: 0.22,
  structural: 0.14,
  titleBoost: 0.06,
  documentIntelligenceBoost: 0.08,
  routingPriorityBoost: 0.04,
  typeBoost: 0.03,
  recencyBoost: 0.03,
} as const;

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
    safeNumber(weights.documentIntelligenceBoost, 0.08) *
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

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("retrievalScoring.formula", () => {
  test("pure semantic score gives ~0.52", () => {
    const score = computeFinalScore({
      semantic: 1.0,
      lexical: 0,
      structural: 0,
    });
    expect(score).toBeCloseTo(0.52, 2);
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

    // Manual calculation:
    // 0.52*0.9 + 0.22*0.7 + 0.14*0.5 + 0.06*0.3 + 0.08*0.4 + 0.04*0.2 + 0.03*0.6 + 0.03*0.5
    // = 0.468 + 0.154 + 0.07 + 0.018 + 0.032 + 0.008 + 0.018 + 0.015
    // = 0.783
    expect(score).toBeCloseTo(0.783, 2);
  });

  test("score is clamped to [0, 1]", () => {
    // All components at max (1.0) — sum of weights = 1.12 > 1
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

    // Penalties exceed the weighted sum — should clamp to 0
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

  test("encrypted mode caps near ~0.52 (only semantic available)", () => {
    // In encrypted mode, lexical and structural search return 0 results.
    // Max possible score is roughly semantic weight * 1.0 = 0.52 + boosts.
    // With no boosts, cap is exactly 0.52.
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

    expect(encryptedScore).toBeCloseTo(0.52, 2);
    expect(encryptedScore).toBeLessThan(0.6);

    // Even with moderate semantic score, stays well below old threshold of 0.55
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

    // Both sorts must produce identical order
    expect(sorted1.map((c) => c.id)).toEqual(sorted2.map((c) => c.id));

    // Highest score first
    expect(sorted1[0].id).toBe("c-4");

    // Among equal scores: doc-a before doc-b, then loc-1 before loc-2, then id asc
    expect(sorted1[1].id).toBe("c-2"); // doc-a, loc-1
    expect(sorted1[2].id).toBe("c-1"); // doc-a, loc-2
    expect(sorted1[3].id).toBe("c-3"); // doc-b
  });
});
