import { describe, expect, test } from "@jest/globals";

import { RetrievalEngineService } from "../../modules/retrieval/application";

const ALL_DOC_IDS = [
  "doc-target",
  "doc-secondary",
  "doc-noise-a",
  "doc-noise-b",
];

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

function makeScopeTestEngine(): RetrievalEngineService {
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
        filename: `${docId}.txt`,
      }));
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.txt` };
    },
  };

  const semanticIndex = {
    async search(opts: { query: string }) {
      return ALL_DOC_IDS.map((docId, i) => ({
        docId,
        location: { page: i + 1 },
        snippet: `${opts.query} result from ${docId}`,
        score: 0.9 - i * 0.05,
        locationKey: `d:${docId}|p:${i + 1}|c:1`,
        chunkId: `chunk-${docId}`,
      }));
    },
  };

  const lexicalIndex = { async search() { return []; } };
  const structuralIndex = { async search() { return []; } };

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
  );
}

describe("Certification: scope resolution", () => {
  test("corpus-wide search with incidental activeDocId does NOT set hardScopeActive", async () => {
    const engine = makeScopeTestEngine();
    const pack = await engine.retrieve({
      query: "what is the total revenue across all documents?",
      env: "dev",
      signals: {
        activeDocId: "doc-target",
        // No explicitDocLock, no singleDocIntent, no resolvedDocId
      },
    });
    expect(pack.scope.hardScopeActive).toBe(false);
  });

  test("corpus-wide search without any scope signals has hardScopeActive=false", async () => {
    const engine = makeScopeTestEngine();
    const pack = await engine.retrieve({
      query: "compare revenue between all reports",
      env: "dev",
      signals: {},
    });
    expect(pack.scope.hardScopeActive).toBe(false);
  });

  test("explicit hardScopeActive signal still activates hard scope", async () => {
    const engine = makeScopeTestEngine();
    const pack = await engine.retrieve({
      query: "test query",
      env: "dev",
      signals: {
        hardScopeActive: true,
      },
    });
    expect(pack.scope.hardScopeActive).toBe(true);
  });

  test("explicitDocLock with activeDocId still activates hard scope", async () => {
    const engine = makeScopeTestEngine();
    const pack = await engine.retrieve({
      query: "summarize this document",
      env: "dev",
      signals: {
        explicitDocLock: true,
        activeDocId: "doc-target",
      },
    });
    expect(pack.scope.hardScopeActive).toBe(true);
  });
});
