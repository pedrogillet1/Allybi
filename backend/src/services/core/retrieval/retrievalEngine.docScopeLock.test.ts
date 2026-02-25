import { describe, expect, it } from "@jest/globals";

import {
  RetrievalEngineService,
  RetrievalScopeLockConfigurationError,
} from "./retrievalEngine.service";

const DOC_IDS = ["doc-a", "doc-b", "doc-c"];

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

function makeEngine(): RetrievalEngineService {
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
      return DOC_IDS.map((docId) => ({
        docId,
        title: docId,
        filename: `${docId}.txt`,
      }));
    },
    async getDocMeta(docId: string) {
      return { docId, title: docId, filename: `${docId}.txt` };
    },
  };

  // Intentionally returns off-scope docs first; scope lock must filter hard.
  const semanticIndex = {
    async search(opts: { query: string }) {
      return [
        {
          docId: "doc-c",
          location: { page: 1 },
          snippet: `${opts.query} off-scope candidate`,
          score: 0.99,
          locationKey: "d:doc-c|p:1|c:1",
          chunkId: "doc-c-1",
        },
        {
          docId: "doc-b",
          location: { page: 2 },
          snippet: `${opts.query} docset candidate`,
          score: 0.95,
          locationKey: "d:doc-b|p:2|c:1",
          chunkId: "doc-b-1",
        },
        {
          docId: "doc-a",
          location: { page: 3 },
          snippet: `${opts.query} single lock candidate`,
          score: 0.9,
          locationKey: "d:doc-a|p:3|c:1",
          chunkId: "doc-a-1",
        },
      ];
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

describe("RetrievalEngine docScopeLock", () => {
  it("enforces multi-doc docset lock for attachments", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve({
      query: "docset query",
      env: "dev",
      signals: {
        intentFamily: "documents",
        allowExpansion: false,
        docScopeLock: {
          mode: "docset",
          allowedDocumentIds: ["doc-a", "doc-b"],
          source: "attachments",
        },
        explicitDocLock: true,
        hardScopeActive: true,
      },
    });

    expect(pack.evidence.length).toBeGreaterThan(0);
    expect(
      pack.evidence.every((item) => ["doc-a", "doc-b"].includes(item.docId)),
    ).toBe(true);
    expect(pack.scope.candidateDocIds.sort()).toEqual(["doc-a", "doc-b"]);
  });

  it("enforces single-doc lock for one attachment", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve({
      query: "single lock query",
      env: "dev",
      signals: {
        intentFamily: "documents",
        allowExpansion: false,
        docScopeLock: {
          mode: "single_doc",
          allowedDocumentIds: ["doc-a"],
          activeDocumentId: "doc-a",
          source: "attachments",
        },
        explicitDocLock: true,
        activeDocId: "doc-a",
        hardScopeActive: true,
      },
    });

    expect(pack.evidence.length).toBeGreaterThan(0);
    expect(pack.evidence.every((item) => item.docId === "doc-a")).toBe(true);
    expect(pack.scope.candidateDocIds).toEqual(["doc-a"]);
  });

  it("fails closed when docset lock has empty allowedDocumentIds", async () => {
    const engine = makeEngine();

    await expect(
      engine.retrieve({
        query: "invalid lock query",
        env: "dev",
        signals: {
          intentFamily: "documents",
          allowExpansion: false,
          docScopeLock: {
            mode: "docset",
            allowedDocumentIds: [],
            source: "attachments",
          },
          explicitDocLock: true,
          hardScopeActive: true,
        },
      }),
    ).rejects.toBeInstanceOf(RetrievalScopeLockConfigurationError);
  });
});
