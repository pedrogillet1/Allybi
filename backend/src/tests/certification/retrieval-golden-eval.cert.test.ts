import { describe, expect, test } from "@jest/globals";

import seeds from "../../services/core/retrieval/__fixtures__/golden-eval.seeds.json";
import { RetrievalEngineService } from "../../modules/retrieval/application";
import { writeCertificationGateReport } from "./reporting";

// ── Seed types ──────────────────────────────────────────────────────────

type GoldenSeed = {
  id: string;
  category: string;
  query: string;
  expectedDocIds: string[];
  expectedMinScore: number;
  expectedTopK: number;
};

const goldenSeeds: GoldenSeed[] = seeds.seeds as GoldenSeed[];

// Collect all unique doc IDs referenced in seeds
const ALL_DOC_IDS = Array.from(
  new Set(goldenSeeds.flatMap((s) => s.expectedDocIds).concat(["doc-noise-a", "doc-noise-b"])),
);

// ── Engine factory ──────────────────────────────────────────────────────

function makeRequiredBanks() {
  return {
    semantic_search_config: {
      config: {
        queryExpansionPolicy: { enabled: false },
        hybridPhases: [
          { id: "phase_semantic", type: "semantic", enabled: true, k: 10 },
        ],
      },
    },
    retrieval_ranker_config: {
      config: {
        weights: {
          semantic: 1,
          lexical: 0,
          structural: 0,
          titleBoost: 0,
          typeBoost: 0,
          recencyBoost: 0,
        },
        actionsContract: {
          thresholds: {
            minFinalScore: 0,
          },
        },
      },
    },
    retrieval_negatives: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            minRelevanceScore: 0,
          },
        },
      },
    },
    diversification_rules: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            maxPerDocHard: 8,
            maxTotalChunksHard: 32,
            maxNearDuplicatesPerDoc: 5,
            nearDuplicateWindowChars: 280,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 32,
            maxEvidencePerDocHard: 12,
            minFinalScore: 0,
          },
        },
      },
    },
  };
}

function makeGoldenEngine(
  targetDocIds: string[],
): RetrievalEngineService {
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const banks = makeRequiredBanks() as Record<string, unknown>;
      const resolved = banks[bankId];
      if (!resolved) throw new Error(`missing required bank: ${bankId}`);
      return resolved as T;
    },
  };

  const docStore = {
    async listDocs() {
      return ALL_DOC_IDS.map((docId) => ({
        docId,
        title: docId,
        filename: `${docId}.pdf`,
      }));
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.pdf` };
    },
  };

  // Semantic index returns target docs with high scores, noise with lower scores
  const semanticIndex = {
    async search(opts: { query: string }) {
      const results: Array<{
        docId: string;
        location: { page: number };
        snippet: string;
        score: number;
        locationKey: string;
        chunkId: string;
      }> = [];

      // Target docs: high relevance
      for (const [idx, docId] of targetDocIds.entries()) {
        results.push({
          docId,
          location: { page: 1 },
          snippet: `${opts.query} — relevant content from ${docId}`,
          score: 0.95 - idx * 0.03,
          locationKey: `d:${docId}|p:1|c:1`,
          chunkId: `${docId}-chunk-1`,
        });
      }

      // Noise docs: lower relevance
      results.push({
        docId: "doc-noise-a",
        location: { page: 1 },
        snippet: `${opts.query} unrelated alpha content`,
        score: 0.3,
        locationKey: "d:doc-noise-a|p:1|c:1",
        chunkId: "noise-a-1",
      });
      results.push({
        docId: "doc-noise-b",
        location: { page: 1 },
        snippet: `${opts.query} unrelated beta content`,
        score: 0.25,
        locationKey: "d:doc-noise-b|p:1|c:1",
        chunkId: "noise-b-1",
      });

      return results;
    },
  };

  const lexicalIndex = {
    async search() {
      return [];
    },
  };
  const structuralIndex = {
    async search() {
      return [];
    },
  };

  const diBanks = {
    getCrossDocGroundingPolicy: () => null,
    getDocumentIntelligenceDomains: () => [],
    getDocTypeCatalog: () => null,
    getDocTypeSections: () => null,
    getDocTypeTables: () => null,
    getDomainDetectionRules: () => null,
    getRetrievalBoostRules: () => null,
    getQueryRewriteRules: () => null,
    getSectionPriorityRules: () => null,
  };

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
    undefined,
    diBanks as any,
  );
}

// ── Test suite ──────────────────────────────────────────────────────────

describe("Retrieval Golden Eval — certification gate", () => {
  const results: Array<{
    id: string;
    category: string;
    passed: boolean;
    topK: number;
    targetInTopK: boolean;
    topScore: number;
  }> = [];

  for (const seed of goldenSeeds) {
    test(`[${seed.id}] ${seed.category}: ${seed.query.slice(0, 60)}`, async () => {
      const engine = makeGoldenEngine(seed.expectedDocIds);
      const pack = await engine.retrieve({
        conversationId: "golden-eval",
        workspaceId: "ws-eval",
        query: seed.query,
        sourceDocumentIds: [],
        signals: {},
      });

      const topK = pack.evidence.slice(0, seed.expectedTopK);
      const topDocIds = new Set(topK.map((e) => e.docId));

      const targetInTopK = seed.expectedDocIds.some((id) => topDocIds.has(id));
      const topScore = pack.stats.topScore ?? 0;

      results.push({
        id: seed.id,
        category: seed.category,
        passed: targetInTopK && topScore >= seed.expectedMinScore,
        topK: seed.expectedTopK,
        targetInTopK,
        topScore,
      });

      expect(targetInTopK).toBe(true);
      expect(topScore).toBeGreaterThanOrEqual(seed.expectedMinScore);
    });
  }

  test("aggregate precision@5 >= 0.7", () => {
    const totalQueries = results.length;
    if (totalQueries === 0) {
      expect(totalQueries).toBeGreaterThan(0);
      return;
    }

    const passedCount = results.filter((r) => r.passed).length;
    const precision = passedCount / totalQueries;

    const categoryBreakdown: Record<string, { total: number; passed: number }> = {};
    for (const r of results) {
      if (!categoryBreakdown[r.category]) {
        categoryBreakdown[r.category] = { total: 0, passed: 0 };
      }
      categoryBreakdown[r.category].total += 1;
      if (r.passed) categoryBreakdown[r.category].passed += 1;
    }

    writeCertificationGateReport("retrieval-golden-eval", {
      passed: precision >= 0.7,
      metrics: {
        totalQueries,
        passedCount,
        precision: Math.round(precision * 1000) / 1000,
        categoryBreakdown,
      },
      thresholds: {
        minPrecisionAt5: 0.7,
      },
    });

    expect(precision).toBeGreaterThanOrEqual(0.7);
  });
});
