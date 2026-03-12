import { afterEach, describe, expect, test } from "@jest/globals";

import { RetrievalEngineService } from "./retrievalEngine.legacy.service";

const originalFailMode = process.env.RETRIEVAL_FAIL_MODE;

afterEach(() => {
  if (originalFailMode === undefined) delete process.env.RETRIEVAL_FAIL_MODE;
  else process.env.RETRIEVAL_FAIL_MODE = originalFailMode;
});

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
        actionsContract: { thresholds: { minFinalScore: 0 } },
      },
    },
    retrieval_negatives: {
      config: {
        enabled: true,
        actionsContract: { thresholds: { minRelevanceScore: 0 } },
      },
    },
    diversification_rules: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            maxPerDocHard: 4,
            maxTotalChunksHard: 16,
            maxNearDuplicatesPerDoc: 2,
            nearDuplicateWindowChars: 180,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 8,
            maxEvidencePerDocHard: 4,
            minFinalScore: 0,
          },
        },
      },
    },
  } as const;
}

describe("RetrievalEngineService", () => {
  test("returns explicit failed runtime pack when super retrieval throws", async () => {
    const bankLoader = {
      getBank() {
        throw new Error("bank loader unavailable");
      },
    };

    const emptyDocStore = {
      async listDocs() {
        return [];
      },
      async getDocMeta() {
        return null;
      },
    };
    const emptyIndex = {
      async search() {
        return [];
      },
    };

    const engine = new RetrievalEngineService(
      bankLoader as any,
      emptyDocStore as any,
      emptyIndex as any,
      emptyIndex as any,
      emptyIndex as any,
    );

    const pack = await engine.retrieve({
      query: "summarize",
      env: "dev",
      signals: {},
    });

    expect(pack.runtimeStatus).toBe("failed");
    expect(pack.runtimeError?.code).toBe("runtime_invariant_breach");
    expect(pack.evidence).toEqual([]);
  });

  test("marks runtime as failed when all retrieval phases fail in fail-closed mode", async () => {
    process.env.RETRIEVAL_FAIL_MODE = "closed";
    const banks = makeRequiredBanks();
    const bankLoader = {
      getBank<T = unknown>(bankId: string): T {
        const value = (banks as Record<string, unknown>)[bankId];
        if (!value) throw new Error(`missing bank: ${bankId}`);
        return value as T;
      },
    };
    const docStore = {
      async listDocs() {
        return [{ docId: "doc-1", title: "Doc 1", filename: "doc-1.pdf" }];
      },
      async getDocMeta(docId: string) {
        return { docId, title: "Doc 1", filename: "doc-1.pdf" };
      },
    };
    const failingSemantic = {
      async search() {
        throw new Error("semantic backend down");
      },
    };
    const emptyIndex = {
      async search() {
        return [];
      },
    };

    const engine = new RetrievalEngineService(
      bankLoader as any,
      docStore as any,
      failingSemantic as any,
      emptyIndex as any,
      emptyIndex as any,
    );

    const pack = await engine.retrieve({
      query: "invoice amount",
      env: "dev",
      signals: { intentFamily: "documents" },
    });

    expect(pack.runtimeStatus).toBe("failed");
    expect(pack.runtimeError?.code).toMatch(/timeout|dependency_unavailable/);
    expect(pack.debug?.reasonCodes || []).toContain("semantic_search_failed");
    expect(pack.evidence).toHaveLength(0);
  });
});
