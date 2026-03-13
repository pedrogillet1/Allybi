/**
 * Retrieval factory contract — single active V2 engine tests.
 */

import { describe, expect, test, jest, beforeEach } from "@jest/globals";

import type {
  BankLoader,
  DocStore,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  RetrievalRequest,
  EvidencePack,
  DocMeta,
  IRetrievalEngine,
} from "../../retrieval.types";

// ── Mock retrieval.config ───────────────────────────────────────────

const mockConfig = {
  RETRIEVAL_CONFIG: {
    phaseCallTimeoutMs: 500,
    phaseBudgetMs: 10000,
    extraVariantPhases: "all",
    maxQueryVariants: 6,
    rewriteCacheMax: 100,
    rewriteCacheTtlMs: 60_000,
    retrievalCacheMax: 100,
    retrievalCacheTtlMs: 60_000,
    multiLevelCacheEnabled: false,
    modelVersion: "test-v1",
    failMode: "open",
    isEncryptedOnlyMode: false,
  },
  BANK_IDS: {
    semanticSearchConfig: "semantic_search_config",
    retrievalRankerConfig: "retrieval_ranker_config",
    keywordBoostRules: "keyword_boost_rules",
    docTitleBoostRules: "doc_title_boost_rules",
    docTypeBoostRules: "doc_type_boost_rules",
    recencyBoostRules: "recency_boost_rules",
    routingPriority: "routing_priority",
    diversificationRules: "diversification_rules",
    retrievalNegatives: "retrieval_negatives",
    evidencePackaging: "evidence_packaging",
    tableRenderPolicy: "table_render_policy",
    snippetCompressionPolicy: "snippet_compression_policy",
    evidencePackagingPolicy: "evidence_packaging_policy",
    entityRoleOntology: "entity_role_ontology",
    synonymExpansion: "synonym_expansion",
  },
  isFailClosedMode: () => false,
};

jest.mock("../retrieval.config", () => mockConfig);

// ── Import factory AFTER mocking ────────────────────────────────────

import {
  createRetrievalEngine,
  type RetrievalEngineDeps,
} from "../RetrievalEngineFactory";
import { createDefaultQueryNormalizer } from "../DefaultQueryNormalizer.service";

// ── Helpers ─────────────────────────────────────────────────────────

const stubDocIntelBanks = {
  getCrossDocGroundingPolicy: () => ({ enabled: false, rules: [] }),
  getDocumentIntelligenceDomains: () => [],
  getDocTypeCatalog: () => ({ docTypes: [] }),
  getDocTypeSections: () => null,
  getDocTypeTables: () => null,
  getDomainDetectionRules: () => ({ rules: [] }),
  getRetrievalBoostRules: () => null,
  getQueryRewriteRules: () => null,
  getSectionPriorityRules: () => null,
  getDocTypeExtractionHints: () => null,
};

function makeBankLoader(): BankLoader {
  const banks: Record<string, any> = {
    semantic_search_config: {
      config: {
        hybridPhases: [
          { type: "semantic", enabled: true, id: "phase_semantic", k: 40 },
          { type: "lexical", enabled: true, id: "phase_lexical", k: 40 },
          { type: "structural", enabled: true, id: "phase_structural", k: 40 },
        ],
        expansionPolicy: { default: { enabled: false } },
        topK: 40,
        topKMultiplier: 4,
        minSimilarity: 0.10,
      },
    },
    retrieval_ranker_config: {
      config: {
        weights: {
          semantic: 0.52,
          lexical: 0.22,
          structural: 0.14,
          titleBoost: 0.03,
          documentIntelligenceBoost: 0,
          routingPriorityBoost: 0,
          typeBoost: 0,
          recencyBoost: 0,
        },
      },
    },
    keyword_boost_rules: null,
    doc_title_boost_rules: null,
    doc_type_boost_rules: null,
    recency_boost_rules: null,
    routing_priority: null,
    diversification_rules: { config: { maxPerDoc: 5, maxTotal: 20, nearDupThreshold: 0.95 } },
    retrieval_negatives: {
      config: { minRelevanceScore: 0.10, headerFooterPenalty: 0.5, tocPenalty: 0.6 },
      rules: [],
    },
    evidence_packaging: {
      config: {
        actionsContract: {
          thresholds: {
            maxEvidenceItemsHard: 36,
            maxEvidencePerDocHard: 10,
            maxDistinctDocsNonCompare: 3,
            maxDistinctDocsExploratoryNonCompare: 5,
            minFinalScore: 0.05,
          },
        },
      },
    },
    snippet_compression_policy: { config: { maxChars: 1200, preserveNumericUnits: true, preserveHeadings: true } },
    entity_role_ontology: {},
    synonym_expansion: { config: { enabled: false } },
  };
  return {
    getBank<T = unknown>(bankId: string): T {
      return (banks[bankId] ?? {}) as T;
    },
  };
}

function makeDocs(count: number): DocMeta[] {
  return Array.from({ length: count }, (_, i) => ({
    docId: `doc-${i + 1}`,
    title: `Test Document ${i + 1}`,
    filename: `test-${i + 1}.pdf`,
  }));
}

function makeDocStore(docs?: DocMeta[]): DocStore {
  const allDocs = docs ?? makeDocs(3);
  return {
    listDocs: jest.fn<() => Promise<DocMeta[]>>().mockResolvedValue(allDocs),
    getDocMeta: jest.fn<(id: string) => Promise<DocMeta | null>>().mockImplementation(
      async (id: string) => allDocs.find((d) => d.docId === id) ?? null,
    ),
  };
}

function makeSemanticIndex(): SemanticIndex {
  return {
    search: jest.fn<SemanticIndex["search"]>().mockResolvedValue([
      {
        docId: "doc-1",
        location: { page: 1 },
        snippet: "Revenue was $5M in Q2 2025 according to financial report",
        score: 0.88,
        locationKey: "doc-1:p1",
        chunkId: "chunk-1",
      },
      {
        docId: "doc-1",
        location: { page: 3 },
        snippet: "Operating expenses totalled $2M for the current quarter",
        score: 0.72,
        locationKey: "doc-1:p3",
        chunkId: "chunk-2",
      },
      {
        docId: "doc-2",
        location: { page: 1 },
        snippet: "Net income projection for Q3 is estimated at $3M range",
        score: 0.55,
        locationKey: "doc-2:p1",
        chunkId: "chunk-3",
      },
    ]),
  };
}

function makeLexicalIndex(): LexicalIndex {
  return {
    search: jest.fn<LexicalIndex["search"]>().mockResolvedValue([
      {
        docId: "doc-1",
        location: { page: 1 },
        snippet: "Revenue was $5M in Q2 2025 according to financial report",
        score: 0.60,
        locationKey: "doc-1:p1",
        chunkId: "chunk-1",
      },
    ]),
  };
}

function makeStructuralIndex(): StructuralIndex {
  return {
    search: jest.fn<StructuralIndex["search"]>().mockResolvedValue([]),
  };
}

function makeDeps(): RetrievalEngineDeps {
  return {
    bankLoader: makeBankLoader(),
    docStore: makeDocStore(),
    semanticIndex: makeSemanticIndex(),
    lexicalIndex: makeLexicalIndex(),
    structuralIndex: makeStructuralIndex(),
    queryNormalizer: createDefaultQueryNormalizer(),
    documentIntelligenceBanks: stubDocIntelBanks,
  };
}

// ── Seed requests ───────────────────────────────────────────────────

const seedRequests: Array<{ name: string; request: RetrievalRequest; skipParity?: boolean }> = [
  {
    name: "single-doc query",
    request: {
      query: "What was the revenue in Q2?",
      env: "local",
      signals: { activeDocId: "doc-1", explicitDocLock: true, hardScopeActive: true },
    },
  },
  {
    name: "multi-doc query",
    request: {
      query: "Compare revenue across all documents",
      env: "local",
      signals: {},
    },
  },
  {
    name: "encrypted-mode query",
    request: {
      query: "What are the financial figures?",
      env: "local",
      signals: {},
    },
    // V1 and V2 handle encrypted mode config differently (V2 reads from RETRIEVAL_CONFIG)
    skipParity: true,
  },
  {
    name: "compare-intent query",
    request: {
      query: "Compare revenue between doc-1 and doc-2",
      env: "local",
      signals: {
        intentFamily: "comparison",
        explicitDocIds: ["doc-1", "doc-2"],
      },
    },
    // Compare intent resolution differs between V1 and V2 so doc-level results may vary
    skipParity: true,
  },
  {
    name: "exploratory query",
    request: {
      query: "Tell me about the documents",
      env: "local",
      signals: { corpusSearchAllowed: true },
    },
    // Exploratory mode triggers different boost/diversification paths in V1 vs V2,
    // causing score divergence beyond 5%. Skip for deterministic parity.
    skipParity: true,
  },
];

// ── Tests ───────────────────────────────────────────────────────────

describe("retrieval factory contract", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test("factory always creates the active V2 engine", () => {
    const engine = createRetrievalEngine(makeDeps());
    expect(engine).toBeDefined();
    expect(typeof engine.retrieve).toBe("function");
    expect(engine.constructor.name).toBe("RetrievalOrchestratorV2");
  });

  test("active engine satisfies IRetrievalEngine", async () => {
    const engine = createRetrievalEngine(makeDeps());
    const pack = await engine.retrieve(seedRequests[0].request);
    assertValidEvidencePack(pack);
  });

  for (const seed of seedRequests) {
    test(`active engine handles ${seed.name}`, async () => {
      const engine = createRetrievalEngine(makeDeps());
      const pack = await engine.retrieve(seed.request);
      assertValidEvidencePack(pack);
      expect(["ok", "degraded", "failed"]).toContain(pack.runtimeStatus);
    });
  }
});

// ── Assertion helpers ───────────────────────────────────────────────

function assertValidEvidencePack(pack: EvidencePack): void {
  expect(pack).toBeDefined();
  expect(["ok", "degraded", "failed"]).toContain(pack.runtimeStatus);

  expect(pack.query).toBeDefined();
  expect(typeof pack.query.original).toBe("string");
  expect(typeof pack.query.normalized).toBe("string");

  expect(pack.scope).toBeDefined();
  expect(Array.isArray(pack.scope.candidateDocIds)).toBe(true);

  expect(pack.stats).toBeDefined();
  expect(typeof pack.stats.candidatesConsidered).toBe("number");
  expect(typeof pack.stats.evidenceItems).toBe("number");
  expect(typeof pack.stats.uniqueDocsInEvidence).toBe("number");

  expect(Array.isArray(pack.evidence)).toBe(true);
  for (const item of pack.evidence) {
    expect(typeof item.docId).toBe("string");
    expect(item.score).toBeDefined();
    expect(typeof item.score.finalScore).toBe("number");
  }
}
