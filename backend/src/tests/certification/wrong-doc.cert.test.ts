import { describe, expect, test } from "@jest/globals";

import seeds from "../../services/core/retrieval/__fixtures__/doclock-benchmark.seeds.json";
import { RetrievalEngineService } from "../../services/core/retrieval/v2/RetrievalOrchestrator.service";
import { createDefaultQueryNormalizer } from "../../services/core/retrieval/v2/DefaultQueryNormalizer.service";
import { writeCertificationGateReport } from "./reporting";

type BenchmarkMode =
  | "explicit_lock"
  | "explicit_ref"
  | "single_doc_intent"
  | "lock_with_time";

type Language = "en" | "pt" | "es";

const LOCKED_DOC_ID = "doc-lock";
const DOCSET_LOCK_IDS = ["doc-lock", "doc-noise-b"];
const DOC_IDS = ["doc-lock", "doc-noise-a", "doc-noise-b", "doc-noise-c"];

function toQueriesByLang(input: unknown): Record<Language, string[]> {
  const safe = input as Record<string, string[]>;
  return {
    en: Array.isArray(safe.en) ? safe.en : [],
    pt: Array.isArray(safe.pt) ? safe.pt : [],
    es: Array.isArray(safe.es) ? safe.es : [],
  };
}

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

  // Intentionally return mixed-doc results to ensure engine-level scope guard is fail-closed.
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
          docId: LOCKED_DOC_ID,
          location: { page: 3 },
          snippet: `${opts.query} scoped evidence main`,
          score: 0.88,
          locationKey: "d:doc-lock|p:3|c:1",
          chunkId: "lock-1",
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
    createDefaultQueryNormalizer(),
  );
}

function buildSignals(mode: BenchmarkMode) {
  const base = {
    intentFamily: "documents",
    allowExpansion: false,
  } as const;
  if (mode === "explicit_lock") {
    return { ...base, explicitDocLock: true, activeDocId: LOCKED_DOC_ID };
  }
  if (mode === "explicit_ref") {
    return { ...base, explicitDocRef: true, resolvedDocId: LOCKED_DOC_ID };
  }
  if (mode === "single_doc_intent") {
    return { ...base, singleDocIntent: true, activeDocId: LOCKED_DOC_ID };
  }
  return {
    ...base,
    explicitDocLock: true,
    activeDocId: LOCKED_DOC_ID,
    timeConstraintsPresent: true,
    explicitYearOrQuarterComparison: true,
  };
}

describe("Certification: wrong-doc contamination", () => {
  test("hard-lock benchmark has zero out-of-scope evidence", async () => {
    const engine = makeBenchmarkEngine();
    const benchmarkBatches = [
      toQueriesByLang((seeds as any).synthetic),
      toQueriesByLang((seeds as any).realLike),
    ];
    const modes: BenchmarkMode[] = [
      "explicit_lock",
      "explicit_ref",
      "single_doc_intent",
      "lock_with_time",
    ];

    let totalCases = 0;
    let outOfScopeCases = 0;
    let emptyEvidenceCases = 0;
    let multiDocsetCases = 0;
    let multiDocsetOutOfScopeCases = 0;

    for (const queriesByLang of benchmarkBatches) {
      for (const language of ["en", "pt", "es"] as const) {
        const languageQueries = queriesByLang[language];
        for (const query of languageQueries) {
          for (const mode of modes) {
            totalCases += 1;
            const pack = await engine.retrieve({
              query,
              env: "dev",
              signals: buildSignals(mode),
            });
            if (!Array.isArray(pack.evidence) || pack.evidence.length === 0) {
              emptyEvidenceCases += 1;
              continue;
            }
            const hasOutOfScope = pack.evidence.some(
              (item) => item.docId !== LOCKED_DOC_ID,
            );
            if (hasOutOfScope) outOfScopeCases += 1;
          }

          // Multi-attachment lock: strict docset only (no corpus leakage).
          multiDocsetCases += 1;
          const docsetPack = await engine.retrieve({
            query,
            env: "dev",
            signals: {
              intentFamily: "documents",
              allowExpansion: false,
              docScopeLock: {
                mode: "docset",
                allowedDocumentIds: DOCSET_LOCK_IDS,
                source: "attachments",
              },
              explicitDocLock: true,
              hardScopeActive: true,
            },
          });
          expect(docsetPack.evidence.length).toBeGreaterThan(0);
          const hasDocsetLeak = docsetPack.evidence.some(
            (item) => !DOCSET_LOCK_IDS.includes(item.docId),
          );
          if (hasDocsetLeak) multiDocsetOutOfScopeCases += 1;
        }
      }
    }

    const wrongDocRate = totalCases > 0 ? outOfScopeCases / totalCases : 1;
    const emptyEvidenceRate =
      totalCases > 0 ? emptyEvidenceCases / totalCases : 1;
    const multiDocsetWrongDocRate =
      multiDocsetCases > 0 ? multiDocsetOutOfScopeCases / multiDocsetCases : 1;

    writeCertificationGateReport("wrong-doc", {
      passed:
        wrongDocRate === 0 &&
        emptyEvidenceRate === 0 &&
        multiDocsetWrongDocRate === 0 &&
        multiDocsetCases > 0,
      metrics: {
        totalCases,
        outOfScopeCases,
        wrongDocRate,
        emptyEvidenceCases,
        emptyEvidenceRate,
        multiDocsetCases,
        multiDocsetOutOfScopeCases,
        multiDocsetWrongDocRate,
      },
      thresholds: {
        maxWrongDocRate: 0,
        maxEmptyEvidenceRate: 0,
        maxMultiDocsetWrongDocRate: 0,
        minMultiDocsetCases: 30,
        minTotalCases: 100,
      },
      failures: [
        ...(wrongDocRate > 0 ? ["WRONG_DOC_RATE_NON_ZERO"] : []),
        ...(emptyEvidenceRate > 0 ? ["EMPTY_EVIDENCE_RATE_NON_ZERO"] : []),
        ...(multiDocsetWrongDocRate > 0
          ? ["MULTI_DOCSET_WRONG_DOC_RATE_NON_ZERO"]
          : []),
        ...(multiDocsetCases < 30 ? ["MULTI_DOCSET_CASES_TOO_FEW"] : []),
        ...(totalCases < 100 ? ["TOTAL_CASES_TOO_FEW"] : []),
      ],
    });

    expect(totalCases).toBeGreaterThanOrEqual(100);
    expect(wrongDocRate).toBe(0);
    expect(emptyEvidenceRate).toBe(0);
    expect(multiDocsetCases).toBeGreaterThanOrEqual(30);
    expect(multiDocsetWrongDocRate).toBe(0);
  });
});
