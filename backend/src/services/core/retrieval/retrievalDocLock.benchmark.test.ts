import { describe, expect, it } from "@jest/globals";

import seeds from "./__fixtures__/doclock-benchmark.seeds.json";
import { RetrievalEngineService } from "./retrievalEngine.service";

type BenchmarkMode =
  | "explicit_lock"
  | "explicit_ref"
  | "single_doc_intent"
  | "lock_with_time";

interface BenchmarkCase {
  id: string;
  query: string;
  mode: BenchmarkMode;
  language: "en" | "pt" | "es";
  corpusType: "synthetic" | "realLike";
}

const LOCKED_DOC_ID = "doc-lock";
const DOC_IDS = ["doc-lock", "doc-noise-a", "doc-noise-b", "doc-noise-c"];

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

function makeBenchmarkEngine(): RetrievalEngineService {
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

  // Intentionally ignore docIds to pressure-test engine-level scope guards.
  const semanticIndex = {
    async search(opts: { query: string }) {
      return [
        {
          docId: "doc-noise-a",
          location: { page: 1 },
          snippet: `${opts.query} distractor alpha`,
          score: 0.98,
          locationKey: "d:doc-noise-a|p:1|c:1",
          chunkId: "noise-a-1",
        },
        {
          docId: "doc-noise-b",
          location: { page: 2 },
          snippet: `${opts.query} distractor beta`,
          score: 0.97,
          locationKey: "d:doc-noise-b|p:2|c:1",
          chunkId: "noise-b-1",
        },
        {
          docId: "doc-noise-c",
          location: { page: 3 },
          snippet: `${opts.query} distractor gamma`,
          score: 0.96,
          locationKey: "d:doc-noise-c|p:3|c:1",
          chunkId: "noise-c-1",
        },
        {
          docId: LOCKED_DOC_ID,
          location: { page: 4 },
          snippet: `${opts.query} scoped evidence main`,
          score: 0.88,
          locationKey: "d:doc-lock|p:4|c:1",
          chunkId: "lock-1",
        },
        {
          docId: LOCKED_DOC_ID,
          location: { page: 5 },
          snippet: `${opts.query} scoped evidence support`,
          score: 0.87,
          locationKey: "d:doc-lock|p:5|c:1",
          chunkId: "lock-2",
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

function buildSignals(mode: BenchmarkMode) {
  const base = {
    intentFamily: "documents",
    allowExpansion: false,
  } as const;

  if (mode === "explicit_lock") {
    return {
      ...base,
      explicitDocLock: true,
      activeDocId: LOCKED_DOC_ID,
    };
  }

  if (mode === "explicit_ref") {
    return {
      ...base,
      explicitDocRef: true,
      resolvedDocId: LOCKED_DOC_ID,
    };
  }

  if (mode === "single_doc_intent") {
    return {
      ...base,
      singleDocIntent: true,
      activeDocId: LOCKED_DOC_ID,
    };
  }

  return {
    ...base,
    explicitDocLock: true,
    activeDocId: LOCKED_DOC_ID,
    timeConstraintsPresent: true,
    explicitYearOrQuarterComparison: true,
  };
}

function toQueriesByLang(input: unknown): Record<"en" | "pt" | "es", string[]> {
  const safe = input as Record<string, string[]>;
  return {
    en: Array.isArray(safe.en) ? safe.en : [],
    pt: Array.isArray(safe.pt) ? safe.pt : [],
    es: Array.isArray(safe.es) ? safe.es : [],
  };
}

function buildBenchmarkCases(): BenchmarkCase[] {
  const synthetic = toQueriesByLang((seeds as any).synthetic);
  const realLike = toQueriesByLang((seeds as any).realLike);
  const modes: BenchmarkMode[] = [
    "explicit_lock",
    "explicit_ref",
    "single_doc_intent",
    "lock_with_time",
  ];
  const out: BenchmarkCase[] = [];

  const addCorpusCases = (
    corpusType: BenchmarkCase["corpusType"],
    queriesByLang: Record<"en" | "pt" | "es", string[]>,
  ) => {
    for (const language of ["en", "pt", "es"] as const) {
      const queries = queriesByLang[language];
      for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
        const query = queries[queryIndex];
        for (const mode of modes) {
          out.push({
            id: `${corpusType}.${language}.q${queryIndex + 1}.${mode}`,
            query,
            mode,
            language,
            corpusType,
          });
        }
      }
    }
  };

  addCorpusCases("synthetic", synthetic);
  addCorpusCases("realLike", realLike);
  return out;
}

describe("Retrieval Doc-lock Benchmark", () => {
  const engine = makeBenchmarkEngine();
  const benchmarkCases = buildBenchmarkCases();

  it("contains 120+ adversarial multi-doc benchmark cases", () => {
    expect(benchmarkCases.length).toBeGreaterThanOrEqual(120);
  });

  it.each(benchmarkCases)("$id", async (benchmarkCase) => {
    const pack = await engine.retrieve({
      query: benchmarkCase.query,
      env: "dev",
      signals: buildSignals(benchmarkCase.mode),
    });

    expect(pack.evidence.length).toBeGreaterThan(0);
    const evidenceDocIds = Array.from(
      new Set(pack.evidence.map((item) => item.docId)),
    );
    expect(evidenceDocIds).toEqual([LOCKED_DOC_ID]);
    expect(pack.evidence[0]?.docId).toBe(LOCKED_DOC_ID);
    expect(pack.stats.scopeCandidatesDropped).toBeGreaterThanOrEqual(1);

    if (benchmarkCase.mode === "lock_with_time") {
      expect(
        pack.evidence.every(
          (item) => (item.score.boosts?.recencyBoost ?? 0) === 0,
        ),
      ).toBe(true);
    }
  });
});
