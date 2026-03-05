import { describe, expect, test } from "@jest/globals";

import { RetrievalEngineService } from "../../services/core/retrieval/retrievalEngine.service";

type HeuristicEngineRunner = (
  snippet: string,
  tableExpected: boolean,
  explicitTable?: { header: string[]; rows: Array<Array<string | number>> },
) => Promise<any>;

function makeHeuristicTableEngine(): HeuristicEngineRunner {
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
            maxPerDocHard: 8, maxTotalChunksHard: 32,
            maxNearDuplicatesPerDoc: 5, nearDuplicateWindowChars: 280,
          },
        },
      },
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: { maxEvidenceItemsHard: 32, maxEvidencePerDocHard: 12, minFinalScore: 0 },
        },
      },
    },
    table_render_policy: {
      config: { maxRowsPerChunk: 140 },
    },
  };

  return (
    snippet: string,
    tableExpected: boolean,
    explicitTable?: { header: string[]; rows: Array<Array<string | number>> },
  ) => {
    const bankLoader = {
      getBank<T = unknown>(bankId: string): T {
        const resolved = banks[bankId];
        if (!resolved) throw new Error(`missing required bank: ${bankId}`);
        return resolved as T;
      },
    };

    const docStore = {
      async listDocs() {
        return [{ docId: "doc-1", title: "doc-1", filename: "doc-1.txt" }];
      },
      async getDocMeta() {
        return { docId: "doc-1", title: "doc-1", filename: "doc-1.txt" };
      },
    };

    const semanticIndex = {
      async search() {
        return [{
          docId: "doc-1",
          location: { page: 1 },
          snippet,
          table: explicitTable,
          score: 0.95,
          locationKey: "d:doc-1|p:1|c:1",
          chunkId: "chunk-1",
        }];
      },
    };
    const lexicalIndex = { async search() { return []; } };
    const structuralIndex = { async search() { return []; } };

    const engine = new RetrievalEngineService(
      bankLoader as any,
      docStore as any,
      semanticIndex as any,
      lexicalIndex as any,
      structuralIndex as any,
    );

    return engine.retrieve({
      query: "show table data",
      env: "dev",
      signals: { tableExpected },
    });
  };
}

describe("Certification: heuristic table reparse guard", () => {
  const runEngine = makeHeuristicTableEngine();

  test("tableExpected never reconstructs table payload from plain snippet", async () => {
    const snippet = "Metric\tQ1\tQ2\nRevenue\t$1,250\t$2,300\nCost\t$800\t$900";
    const pack = await runEngine(snippet, true);
    const tableEvidence = pack.evidence.find((e) => e.table);
    expect(tableEvidence?.table).toBeFalsy();
  });

  test("comma-delimited text is not parsed as table evidence", async () => {
    const snippet = "Name,Amount,Date\nRevenue,$1,250,Jan\nCost,$800,Feb";
    const pack = await runEngine(snippet, true);
    const tableEvidence = pack.evidence.find((e) => e.table);
    expect(tableEvidence?.table).toBeFalsy();
  });

  test("pipe-delimited text is not parsed heuristically either", async () => {
    const snippet = "Metric | Q1 | Q2\nRevenue | 1250 | 2300\nCost | 800 | 900";
    const pack = await runEngine(snippet, true);
    const tableEvidence = pack.evidence.find((e) => e.table);
    expect(tableEvidence?.table).toBeFalsy();
  });

  test("structured table payload is preserved when extractor provides it", async () => {
    const pack = await runEngine("Revenue table", true, {
      header: ["Metric", "Q1"],
      rows: [["Revenue", "$1,250"]],
    });
    const tableEvidence = pack.evidence.find((e) => e.table);
    expect(tableEvidence?.table).toBeDefined();
    expect(tableEvidence?.table?.header).toEqual(["Metric", "Q1"]);
    expect(tableEvidence?.table?.rows?.[0]?.[1]).toBe("$1,250");
  });
});
