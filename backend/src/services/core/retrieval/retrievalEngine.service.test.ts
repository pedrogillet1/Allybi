import { describe, expect, it } from "@jest/globals";

import { RetrievalEngineService } from "./retrievalEngine.service";

function makeRequiredBanks() {
  return {
    semantic_search_config: {
      config: {
        queryExpansionPolicy: { enabled: false },
        hybridPhases: [
          { id: "phase_semantic", type: "semantic", enabled: true, k: 8 },
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
            maxPerDocHard: 1,
            maxTotalChunksHard: 36,
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
            maxEvidenceItemsHard: 36,
            maxEvidencePerDocHard: 20,
            minFinalScore: 0,
          },
        },
      },
    },
  };
}

function makeEngine(overrides?: {
  banks?: Record<string, unknown>;
  missingBanks?: string[];
  semanticHits?: Array<{
    docId: string;
    location: Record<string, unknown>;
    snippet: string;
    score: number;
    locationKey?: string;
    chunkId?: string;
  }>;
}) {
  const banks = { ...makeRequiredBanks(), ...(overrides?.banks || {}) };
  for (const missing of overrides?.missingBanks || []) {
    delete (banks as Record<string, unknown>)[missing];
  }
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      if (!(bankId in banks)) {
        throw new Error(`missing required bank: ${bankId}`);
      }
      return banks[bankId] as T;
    },
  };

  const docStore = {
    async listDocs() {
      return [{ docId: "d1", title: "Budget", filename: "budget.xlsx" }];
    },
    async getDocMeta() {
      return null;
    },
  };

  const semanticIndex = {
    async search() {
      return (
        overrides?.semanticHits || [
          {
            docId: "d1",
            location: { page: 1 },
            snippet: "Q1 revenue is 120 and Q2 revenue is 180",
            score: 0.9,
            locationKey: "d:d1|p:1|c:1",
            chunkId: "c1",
          },
          {
            docId: "d1",
            location: { page: 2 },
            snippet: "Gross margin improved to 42 percent in Q2",
            score: 0.85,
            locationKey: "d:d1|p:2|c:2",
            chunkId: "c2",
          },
        ]
      );
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

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
  );
}

describe("RetrievalEngineService", () => {
  it("fails closed when required retrieval banks are missing", async () => {
    const engine = makeEngine({
      missingBanks: ["retrieval_negatives"],
    });

    await expect(
      engine.retrieve({
        query: "compare q1 and q2",
        env: "dev",
        signals: {},
      }),
    ).rejects.toThrow(/missing required bank: retrieval_negatives/);
  });

  it("emits phase-accurate stats counters", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve({
      query: "compare q1 and q2",
      env: "dev",
      signals: {},
    });

    expect(pack.stats.candidatesConsidered).toBe(2);
    expect(pack.stats.candidatesAfterNegatives).toBe(2);
    expect(pack.stats.candidatesAfterBoosts).toBe(2);
    expect(pack.stats.candidatesAfterDiversification).toBe(1);
    expect(pack.evidence.length).toBe(1);
  });

  it("respects disableDiversification override", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve({
      query: "compare q1 and q2",
      env: "dev",
      signals: {},
      overrides: {
        disableDiversification: true,
      },
    });

    expect(pack.stats.candidatesConsidered).toBe(2);
    expect(pack.stats.candidatesAfterDiversification).toBe(2);
    expect(pack.evidence.length).toBe(2);
  });
});
