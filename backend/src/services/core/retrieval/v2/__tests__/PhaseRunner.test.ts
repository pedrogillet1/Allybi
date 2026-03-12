import { describe, expect, test, jest, beforeEach } from "@jest/globals";

import { runPhases } from "../PhaseRunner.service";
import type {
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  RetrievalQueryVariant,
  RetrievalPhaseResult,
} from "../../retrieval.types";

// ── Mock the config so we can control timeouts deterministically ─────

jest.mock("../retrieval.config", () => ({
  RETRIEVAL_CONFIG: {
    phaseCallTimeoutMs: 200,
    phaseBudgetMs: 5000,
    extraVariantPhases: "all",
  },
}));

// ── Typed Helpers ────────────────────────────────────────────────────

function makeSemanticIndex(
  impl: SemanticIndex["search"] = async () => [],
): SemanticIndex {
  return { search: impl };
}

function makeLexicalIndex(
  impl: LexicalIndex["search"] = async () => [],
): LexicalIndex {
  return { search: impl };
}

function makeStructuralIndex(
  impl: StructuralIndex["search"] = async () => [],
): StructuralIndex {
  return { search: impl };
}

function makeVariant(overrides: Partial<RetrievalQueryVariant> = {}): RetrievalQueryVariant {
  return {
    text: "test query",
    weight: 1,
    sourceRuleId: "base_query",
    reason: "default",
    ...overrides,
  };
}

function semanticOnlyCfg(k = 80): Record<string, any> {
  return {
    config: {
      hybridPhases: [
        { type: "semantic", enabled: true, id: "phase_semantic", k },
      ],
    },
  };
}

function allPhasesCfg(k = 40): Record<string, any> {
  return {
    config: {
      hybridPhases: [
        { type: "semantic", enabled: true, id: "phase_semantic", k },
        { type: "lexical", enabled: true, id: "phase_lexical", k },
        { type: "structural", enabled: true, id: "phase_structural", k },
      ],
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("PhaseRunner — runPhases", () => {
  describe("single phase returns results", () => {
    test("semantic-only phase returns hits with correct structure", async () => {
      const semanticIndex = makeSemanticIndex(async () => [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: "Revenue was $5M in Q2",
          score: 0.92,
          locationKey: "loc-1",
          chunkId: "chunk-1",
        },
        {
          docId: "doc-2",
          location: { page: 3 },
          snippet: "Costs totalled $2M",
          score: 0.78,
          locationKey: "loc-2",
          chunkId: "chunk-2",
        },
      ]);

      const results = await runPhases({
        queryVariants: [makeVariant()],
        scopeDocIds: ["doc-1", "doc-2"],
        semanticCfg: semanticOnlyCfg(),
        semanticIndex,
        lexicalIndex: makeLexicalIndex(),
        structuralIndex: makeStructuralIndex(),
      });

      expect(results).toHaveLength(1);

      const phase = results[0];
      expect(phase.source).toBe("semantic");
      expect(phase.status).toBe("ok");
      expect(phase.failureCode).toBeUndefined();
      expect(phase.hits).toHaveLength(2);

      // Scores should be clamped between 0 and 1
      const firstHit = phase.hits[0] as Record<string, unknown>;
      expect(typeof firstHit.score).toBe("number");
      expect(firstHit.score).toBeGreaterThanOrEqual(0);
      expect(firstHit.score).toBeLessThanOrEqual(1);
    });
  });

  describe("phase timeout returns empty hits", () => {
    test("a phase that exceeds phaseCallTimeoutMs returns timed_out with empty hits", async () => {
      const slowSemantic = makeSemanticIndex(
        () =>
          new Promise((resolve) => {
            // Resolve after 500ms — well past the 200ms mock timeout
            setTimeout(
              () =>
                resolve([
                  {
                    docId: "doc-1",
                    location: { page: 1 },
                    snippet: "late result",
                    score: 0.9,
                    locationKey: "loc-1",
                  },
                ]),
              500,
            );
          }),
      );

      const results = await runPhases({
        queryVariants: [makeVariant()],
        scopeDocIds: [],
        semanticCfg: semanticOnlyCfg(),
        semanticIndex: slowSemantic,
        lexicalIndex: makeLexicalIndex(),
        structuralIndex: makeStructuralIndex(),
      });

      expect(results).toHaveLength(1);

      const phase = results[0];
      expect(phase.status).toBe("timed_out");
      expect(phase.failureCode).toBe("semantic_search_timed_out");
      expect(phase.hits).toHaveLength(0);
      expect(phase.note).toContain("timed out");
    });
  });

  describe("multiple phases merge results", () => {
    test("semantic + lexical + structural all return and produce 3 phase results", async () => {
      const semanticIndex = makeSemanticIndex(async () => [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: "semantic hit",
          score: 0.9,
          locationKey: "loc-sem",
        },
      ]);
      const lexicalIndex = makeLexicalIndex(async () => [
        {
          docId: "doc-1",
          location: { page: 2 },
          snippet: "lexical hit",
          score: 0.7,
          locationKey: "loc-lex",
        },
      ]);
      const structuralIndex = makeStructuralIndex(async () => [
        {
          docId: "doc-2",
          location: { page: 1 },
          snippet: "structural hit",
          score: 0.5,
          locationKey: "loc-str",
        },
      ]);

      const results = await runPhases({
        queryVariants: [makeVariant()],
        scopeDocIds: ["doc-1", "doc-2"],
        semanticCfg: allPhasesCfg(),
        semanticIndex,
        lexicalIndex,
        structuralIndex,
      });

      expect(results).toHaveLength(3);

      const sources = results.map((r) => r.source);
      expect(sources).toContain("semantic");
      expect(sources).toContain("lexical");
      expect(sources).toContain("structural");

      // All phases should succeed
      for (const phase of results) {
        expect(phase.status).toBe("ok");
        expect(phase.hits.length).toBeGreaterThanOrEqual(1);
      }
    });

    test("variant weight is applied to hit scores", async () => {
      const semanticIndex = makeSemanticIndex(async () => [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: "weighted hit",
          score: 0.8,
          locationKey: "loc-1",
        },
      ]);

      const results = await runPhases({
        queryVariants: [makeVariant({ weight: 0.5 })],
        scopeDocIds: [],
        semanticCfg: semanticOnlyCfg(),
        semanticIndex,
        lexicalIndex: makeLexicalIndex(),
        structuralIndex: makeStructuralIndex(),
      });

      const hit = results[0].hits[0] as Record<string, unknown>;
      // 0.8 * 0.5 = 0.4
      expect(hit.score).toBeCloseTo(0.4, 2);
    });
  });

  describe("edge case: all phases timeout", () => {
    test("every phase times out and all results have timed_out status with empty hits", async () => {
      const delay = (ms: number) =>
        new Promise<never[]>((resolve) => setTimeout(() => resolve([]), ms));

      const slowSemantic = makeSemanticIndex(() => delay(500));
      const slowLexical = makeLexicalIndex(() => delay(500));
      const slowStructural = makeStructuralIndex(() => delay(500));

      const results = await runPhases({
        queryVariants: [makeVariant()],
        scopeDocIds: [],
        semanticCfg: allPhasesCfg(),
        semanticIndex: slowSemantic,
        lexicalIndex: slowLexical,
        structuralIndex: slowStructural,
      });

      expect(results).toHaveLength(3);

      for (const phase of results) {
        expect(phase.status).toBe("timed_out");
        expect(phase.hits).toHaveLength(0);
        expect(phase.failureCode).toMatch(/_timed_out$/);
        expect(phase.note).toBeDefined();
      }
    });
  });

  describe("edge case: empty queryVariants uses default", () => {
    test("passing empty array still produces results using default variant", async () => {
      const semanticIndex = makeSemanticIndex(async () => [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: "fallback hit",
          score: 0.6,
          locationKey: "loc-1",
        },
      ]);

      const results = await runPhases({
        queryVariants: [],
        scopeDocIds: [],
        semanticCfg: semanticOnlyCfg(),
        semanticIndex,
        lexicalIndex: makeLexicalIndex(),
        structuralIndex: makeStructuralIndex(),
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("ok");
      expect(results[0].phaseId).toContain("base_query");
    });
  });

  describe("edge case: disabled phases are skipped", () => {
    test("disabled phase does not produce a result entry", async () => {
      const cfg = {
        config: {
          hybridPhases: [
            { type: "semantic", enabled: true, id: "phase_semantic", k: 40 },
            { type: "lexical", enabled: false, id: "phase_lexical", k: 40 },
          ],
        },
      };

      const semanticIndex = makeSemanticIndex(async () => [
        {
          docId: "doc-1",
          location: { page: 1 },
          snippet: "hit",
          score: 0.5,
          locationKey: "loc-1",
        },
      ]);

      const results = await runPhases({
        queryVariants: [makeVariant()],
        scopeDocIds: [],
        semanticCfg: cfg,
        semanticIndex,
        lexicalIndex: makeLexicalIndex(),
        structuralIndex: makeStructuralIndex(),
      });

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe("semantic");
    });
  });

  describe("phase failure returns failed status", () => {
    test("a phase that throws returns failed status with empty hits", async () => {
      const failingSemantic = makeSemanticIndex(async () => {
        throw new Error("connection refused");
      });

      const results = await runPhases({
        queryVariants: [makeVariant()],
        scopeDocIds: [],
        semanticCfg: semanticOnlyCfg(),
        semanticIndex: failingSemantic,
        lexicalIndex: makeLexicalIndex(),
        structuralIndex: makeStructuralIndex(),
      });

      expect(results).toHaveLength(1);

      const phase = results[0];
      expect(phase.status).toBe("failed");
      expect(phase.failureCode).toBe("semantic_search_failed");
      expect(phase.hits).toHaveLength(0);
      expect(phase.note).toContain("connection refused");
    });
  });
});
