import { describe, expect, test } from "@jest/globals";

import seeds from "../../services/core/retrieval/__fixtures__/doclock-benchmark.seeds.json";
import { RetrievalEngineService } from "../../services/core/retrieval/v2/RetrievalOrchestrator.service";
import { createDefaultQueryNormalizer } from "../../services/core/retrieval/v2/DefaultQueryNormalizer.service";
import { writeCertificationGateReport } from "./reporting";

type BenchmarkMode =
  | "explicit_lock"
  | "explicit_ref"
  | "single_doc_intent"
  | "docset_scope";

type Language = "en" | "pt" | "es";

const TARGET_DOC_ID = "doc-target";
const DOCSET_IDS = ["doc-target", "doc-secondary"];
const ALL_DOC_IDS = [
  "doc-target",
  "doc-secondary",
  "doc-noise-a",
  "doc-noise-b",
];

// ── Extended query sets ─────────────────────────────────────────────────
// We extend the seed queries to ensure 100+ total benchmark cases
// covering explicit lock, explicit ref, single doc intent, docset scope, and multi-language

const LOCK_QUERIES: Record<Language, string[]> = {
  en: [
    "summarize this document",
    "extract key risks from the file",
    "what are the top three findings here",
    "give me the contract obligations",
    "list action items from this report",
    "what does this spreadsheet say about revenue",
    "from the board packet, summarize the staffing risks in the current quarter",
    "in the procurement memo, extract penalties and renewal dates",
    "from the diligence report, list unresolved compliance items",
    "in the operations review, pull KPIs that missed target",
  ],
  pt: [
    "resuma este documento",
    "extraia os principais riscos do arquivo",
    "quais são os três principais pontos aqui",
    "me dê as obrigações do contrato",
    "liste as ações deste relatório",
    "o que esta planilha diz sobre receita",
    "no pacote do conselho, resuma os riscos de equipe do trimestre atual",
    "no memorando de compras, extraia multas e datas de renovação",
    "no relatório de diligência, liste itens de compliance pendentes",
    "na revisão operacional, extraia os KPIs abaixo da meta",
  ],
  es: [
    "resume este documento",
    "extrae los riesgos clave del archivo",
    "cuáles son los tres hallazgos principales aquí",
    "dame las obligaciones del contrato",
    "enumera acciones de este informe",
    "qué dice esta hoja sobre ingresos",
    "del paquete de junta, resume los riesgos de personal del trimestre actual",
    "en el memo de compras, extrae multas y fechas de renovación",
    "del informe de diligencia, lista ítems de cumplimiento pendientes",
    "en la revisión operativa, extrae KPIs por debajo de la meta",
  ],
};

// ── Engine factory (same pattern as wrong-doc.cert.test.ts) ─────────────

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

  // Returns mixed-doc results intentionally — engine should scope-guard
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
          docId: TARGET_DOC_ID,
          location: { page: 3 },
          snippet: `${opts.query} scoped evidence main`,
          score: 0.88,
          locationKey: `d:${TARGET_DOC_ID}|p:3|c:1`,
          chunkId: "target-1",
        },
        {
          docId: "doc-secondary",
          location: { page: 4 },
          snippet: `${opts.query} secondary data`,
          score: 0.85,
          locationKey: "d:doc-secondary|p:4|c:1",
          chunkId: "secondary-1",
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
    return { ...base, explicitDocLock: true, activeDocId: TARGET_DOC_ID };
  }
  if (mode === "explicit_ref") {
    return { ...base, explicitDocRef: true, resolvedDocId: TARGET_DOC_ID };
  }
  if (mode === "single_doc_intent") {
    return { ...base, singleDocIntent: true, activeDocId: TARGET_DOC_ID };
  }
  // docset_scope
  return {
    ...base,
    docScopeLock: {
      mode: "docset" as const,
      allowedDocumentIds: DOCSET_IDS,
      source: "attachments" as const,
    },
    explicitDocLock: true,
    hardScopeActive: true,
  };
}

function getExpectedDocIds(mode: BenchmarkMode): string[] {
  if (mode === "docset_scope") return DOCSET_IDS;
  return [TARGET_DOC_ID];
}

// ── Main test ────────────────────────────────────────────────────────────

describe("Certification: retrieval behavioral regression", () => {
  test("100+ benchmark queries maintain correct scope and zero wrong-doc rate", async () => {
    const engine = makeBenchmarkEngine();

    let totalCases = 0;
    let wrongDocCount = 0;
    let missCount = 0;
    let passCount = 0;

    const modes: BenchmarkMode[] = [
      "explicit_lock",
      "explicit_ref",
      "single_doc_intent",
      "docset_scope",
    ];

    const languages: Language[] = ["en", "pt", "es"];

    for (const lang of languages) {
      const queries = LOCK_QUERIES[lang];
      for (const query of queries) {
        for (const mode of modes) {
          totalCases++;
          const expectedDocs = getExpectedDocIds(mode);
          const pack = await engine.retrieve({
            query,
            env: "dev",
            signals: buildSignals(mode),
          });

          if (!Array.isArray(pack.evidence) || pack.evidence.length === 0) {
            missCount++;
            continue;
          }

          const hasWrongDoc = pack.evidence.some(
            (item) => !expectedDocs.includes(item.docId),
          );
          if (hasWrongDoc) {
            wrongDocCount++;
          } else {
            passCount++;
          }
        }
      }
    }

    const wrongDocRate = totalCases > 0 ? wrongDocCount / totalCases : 1;
    const missRate = totalCases > 0 ? missCount / totalCases : 1;
    const passRate = totalCases > 0 ? passCount / totalCases : 0;

    writeCertificationGateReport("retrieval-behavioral", {
      passed: wrongDocRate === 0 && missRate <= 0.02 && totalCases >= 100,
      metrics: {
        totalCases,
        wrongDocCount,
        wrongDocRate,
        missCount,
        missRate,
        passCount,
        passRate,
      },
      thresholds: {
        maxWrongDocRate: 0,
        maxMissRate: 0.02,
        minTotalCases: 100,
      },
      failures: [
        ...(wrongDocRate > 0 ? ["WRONG_DOC_RATE_NON_ZERO"] : []),
        ...(missRate > 0.02 ? ["MISS_RATE_TOO_HIGH"] : []),
        ...(totalCases < 100 ? ["TOTAL_CASES_TOO_FEW"] : []),
      ],
    });

    expect(totalCases).toBeGreaterThanOrEqual(100);
    expect(wrongDocRate).toBe(0);
    expect(missRate).toBeLessThanOrEqual(0.02);
  });
});
