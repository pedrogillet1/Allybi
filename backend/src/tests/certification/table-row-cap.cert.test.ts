import { describe, expect, test } from "@jest/globals";

import { RetrievalEngineService } from "../../services/core/retrieval/v2/RetrievalOrchestrator.service";
import { createDefaultQueryNormalizer } from "../../services/core/retrieval/v2/DefaultQueryNormalizer.service";

function makeRowCapEngine(bankMaxRows: number): RetrievalEngineService {
  const banks: Record<string, unknown> = {
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
          semantic: 1, lexical: 0, structural: 0,
          titleBoost: 0, typeBoost: 0, recencyBoost: 0,
        },
        actionsContract: { thresholds: { minFinalScore: 0 } },
      },
    },
    retrieval_negatives: {
      config: { enabled: true, actionsContract: { thresholds: { minRelevanceScore: 0 } } },
    },
    diversification_rules: {
      config: {
        enabled: true,
        actionsContract: {
          thresholds: {
            maxPerDocHard: 100, maxTotalChunksHard: 200,
            maxNearDuplicatesPerDoc: 100, nearDuplicateWindowChars: 280,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: { maxEvidenceItemsHard: 100, maxEvidencePerDocHard: 100, minFinalScore: 0 },
        },
      },
    },
    table_render_policy: {
      config: { maxRowsPerChunk: bankMaxRows },
    },
  };

  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const resolved = banks[bankId];
      if (!resolved) throw new Error(`missing required bank: ${bankId}`);
      return resolved as T;
    },
  };

  const bigTable = {
    header: ["A", "B"],
    rows: Array.from({ length: 50 }, (_, i) => [i, i * 2]),
    structureScore: 0.95,
  };

  const docStore = {
    async listDocs() {
      return [{ docId: "doc-1", title: "doc-1", filename: "doc-1.xlsx" }];
    },
    async getDocMeta() {
      return { docId: "doc-1", title: "doc-1", filename: "doc-1.xlsx" };
    },
  };

  const semanticIndex = {
    async search() {
      return [{
        docId: "doc-1",
        location: { page: 1 },
        snippet: "big table data",
        score: 0.95,
        locationKey: "d:doc-1|p:1|c:1",
        chunkId: "chunk-1",
        table: bigTable,
      }];
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
    createDefaultQueryNormalizer(),
  );
}

describe("Certification: table row cap from bank config", () => {
  test("extractTablePayload respects bank maxRowsPerChunk (not hardcoded 12)", async () => {
    const engine = makeRowCapEngine(140);
    const pack = await engine.retrieve({
      query: "show me all the data",
      env: "dev",
      signals: {},
    });
    // With 50-row table and bank cap of 140, all 50 rows should survive
    const tableEvidence = pack.evidence.find((e) => e.table);
    expect(tableEvidence).toBeDefined();
    expect(tableEvidence!.table!.rows!.length).toBe(50);
  });

  test("extractTablePayload caps at bank maxRowsPerChunk when table exceeds it", async () => {
    const engine = makeRowCapEngine(20);
    const pack = await engine.retrieve({
      query: "show me all the data",
      env: "dev",
      signals: {},
    });
    const tableEvidence = pack.evidence.find((e) => e.table);
    expect(tableEvidence).toBeDefined();
    expect(tableEvidence!.table!.rows!.length).toBe(20);
  });
});
