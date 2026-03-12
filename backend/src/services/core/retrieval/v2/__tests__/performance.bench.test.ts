/**
 * B4: Performance benchmark tests
 *
 * Verifies throughput, phase budget compliance, cache speedup, and memory
 * bounds for the V2 retrieval orchestrator. Uses `performance.now()` for
 * high-resolution timing. All budgets include a generous grace margin
 * to avoid flaky CI failures.
 */

import { describe, expect, test, jest, beforeEach } from "@jest/globals";

import type {
  BankLoader,
  DocStore,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  RetrievalRequest,
  DocMeta,
} from "../../retrieval.types";

// ── Mock retrieval.config ───────────────────────────────────────────

const mockConfig = {
  RETRIEVAL_CONFIG: {
    phaseCallTimeoutMs: 200,
    phaseBudgetMs: 5000,
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

// ── Import AFTER mocking ────────────────────────────────────────────

import { RetrievalOrchestratorV2 } from "../RetrievalOrchestrator.service";

// ── Helpers ─────────────────────────────────────────────────────────

function makeBankLoader(): BankLoader {
  const banks: Record<string, any> = {
    semantic_search_config: {
      config: {
        hybridPhases: [
          { type: "semantic", enabled: true, id: "phase_semantic", k: 80 },
          { type: "lexical", enabled: true, id: "phase_lexical", k: 80 },
          { type: "structural", enabled: true, id: "phase_structural", k: 80 },
        ],
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
    diversification_rules: { config: { maxPerDoc: 10, maxTotal: 40, nearDupThreshold: 0.95 } },
    retrieval_negatives: { config: { minRelevanceScore: 0.10 }, rules: [] },
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
  };
  return {
    getBank<T = unknown>(bankId: string): T {
      return (banks[bankId] ?? {}) as T;
    },
  };
}

/**
 * Generate N synthetic semantic hits spread across multiple docs.
 * This simulates a large candidate set for throughput testing.
 */
function generateHits(count: number): Array<{
  docId: string;
  location: { page: number };
  snippet: string;
  score: number;
  locationKey: string;
  chunkId: string;
}> {
  const hits = [];
  const docCount = Math.max(1, Math.floor(count / 10));
  for (let i = 0; i < count; i++) {
    const docIndex = (i % docCount) + 1;
    const page = Math.floor(i / docCount) + 1;
    hits.push({
      docId: `doc-${docIndex}`,
      location: { page },
      snippet: `Synthetic evidence chunk number ${i + 1} with meaningful content about financial data and revenue figures for testing purposes.`,
      score: 0.95 - (i / count) * 0.6, // scores from 0.95 down to ~0.35
      locationKey: `doc-${docIndex}:p${page}:c${i}`,
      chunkId: `chunk-${i}`,
    });
  }
  return hits;
}

function makeDocs(count: number): DocMeta[] {
  return Array.from({ length: count }, (_, i) => ({
    docId: `doc-${i + 1}`,
    title: `Document ${i + 1}`,
    filename: `doc-${i + 1}.pdf`,
  }));
}

function makeDocStore(count: number): DocStore {
  const docs = makeDocs(count);
  return {
    listDocs: jest.fn<() => Promise<DocMeta[]>>().mockResolvedValue(docs),
    getDocMeta: jest.fn<(id: string) => Promise<DocMeta | null>>().mockImplementation(
      async (id: string) => docs.find((d) => d.docId === id) ?? null,
    ),
  };
}

function makeRequest(): RetrievalRequest {
  return {
    query: "What is the total revenue for the fiscal year?",
    env: "local",
    signals: {},
  };
}

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

// ── Tests ───────────────────────────────────────────────────────────

describe("performance benchmarks", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockConfig.RETRIEVAL_CONFIG.multiLevelCacheEnabled = false;
  });

  // ── 1. Pipeline throughput — 600 candidates under 500ms ───────────

  test("full pipeline with 600 candidates completes under 500ms", async () => {
    const CANDIDATE_COUNT = 600;
    const MAX_DURATION_MS = 500;

    const hits = generateHits(CANDIDATE_COUNT);
    const docCount = Math.max(1, Math.floor(CANDIDATE_COUNT / 10));

    const semanticIndex: SemanticIndex = {
      search: jest.fn<SemanticIndex["search"]>().mockResolvedValue(
        hits.slice(0, Math.floor(CANDIDATE_COUNT * 0.6)),
      ),
    };
    const lexicalIndex: LexicalIndex = {
      search: jest.fn<LexicalIndex["search"]>().mockResolvedValue(
        hits.slice(Math.floor(CANDIDATE_COUNT * 0.6), Math.floor(CANDIDATE_COUNT * 0.85)),
      ),
    };
    const structuralIndex: StructuralIndex = {
      search: jest.fn<StructuralIndex["search"]>().mockResolvedValue(
        hits.slice(Math.floor(CANDIDATE_COUNT * 0.85)),
      ),
    };

    const orchestrator = new RetrievalOrchestratorV2(
      makeBankLoader(),
      makeDocStore(docCount),
      semanticIndex,
      lexicalIndex,
      structuralIndex,
      undefined,
      stubDocIntelBanks,
    );

    const start = performance.now();
    const pack = await orchestrator.retrieve(makeRequest());
    const elapsed = performance.now() - start;

    expect(pack).toBeDefined();
    expect(pack.runtimeStatus).toBe("ok");
    expect(pack.stats.candidatesConsidered).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(MAX_DURATION_MS);
  });

  // ── 2. Phase budget respected — phases complete within budget + 50% grace ─

  test("all phases complete within configured budget + 50% grace", async () => {
    const PHASE_BUDGET_MS = mockConfig.RETRIEVAL_CONFIG.phaseBudgetMs;
    const GRACE_FACTOR = 1.5;
    const MAX_ALLOWED_MS = PHASE_BUDGET_MS * GRACE_FACTOR;

    // Use moderately sized data so phases are non-trivial
    const hits = generateHits(200);

    const semanticIndex: SemanticIndex = {
      search: jest.fn<SemanticIndex["search"]>().mockResolvedValue(hits.slice(0, 100)),
    };
    const lexicalIndex: LexicalIndex = {
      search: jest.fn<LexicalIndex["search"]>().mockResolvedValue(hits.slice(100, 160)),
    };
    const structuralIndex: StructuralIndex = {
      search: jest.fn<StructuralIndex["search"]>().mockResolvedValue(hits.slice(160)),
    };

    const orchestrator = new RetrievalOrchestratorV2(
      makeBankLoader(),
      makeDocStore(20),
      semanticIndex,
      lexicalIndex,
      structuralIndex,
      undefined,
      stubDocIntelBanks,
    );

    const start = performance.now();
    const pack = await orchestrator.retrieve(makeRequest());
    const elapsed = performance.now() - start;

    expect(pack).toBeDefined();
    expect(pack.runtimeStatus).toBe("ok");
    expect(elapsed).toBeLessThan(MAX_ALLOWED_MS);
  });

  // ── 3. Cache speedup — second identical request under 5ms ─────────

  test("cached request completes under 5ms", async () => {
    mockConfig.RETRIEVAL_CONFIG.multiLevelCacheEnabled = true;

    try {
      const hits = generateHits(100);

      const semanticIndex: SemanticIndex = {
        search: jest.fn<SemanticIndex["search"]>().mockResolvedValue(hits),
      };
      const lexicalIndex: LexicalIndex = {
        search: jest.fn<LexicalIndex["search"]>().mockResolvedValue([]),
      };
      const structuralIndex: StructuralIndex = {
        search: jest.fn<StructuralIndex["search"]>().mockResolvedValue([]),
      };

      const orchestrator = new RetrievalOrchestratorV2(
        makeBankLoader(),
        makeDocStore(10),
        semanticIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest();

      // Warm-up call to populate cache
      const pack1 = await orchestrator.retrieve(req);
      expect(pack1.runtimeStatus).toBe("ok");

      // Cached call should be fast
      const start = performance.now();
      const pack2 = await orchestrator.retrieve(req);
      const elapsed = performance.now() - start;

      expect(pack2.runtimeStatus).toBe("ok");
      expect(pack2.evidence.length).toBe(pack1.evidence.length);
      expect(elapsed).toBeLessThan(5);
    } finally {
      mockConfig.RETRIEVAL_CONFIG.multiLevelCacheEnabled = false;
    }
  });

  // ── 4. Memory — heap delta < 10MB for 600 candidates ─────────────

  test("heap memory delta stays under 10MB for 600-candidate pipeline", async () => {
    const CANDIDATE_COUNT = 600;
    const MAX_HEAP_DELTA_BYTES = 10 * 1024 * 1024; // 10 MB

    const hits = generateHits(CANDIDATE_COUNT);
    const docCount = Math.max(1, Math.floor(CANDIDATE_COUNT / 10));

    const semanticIndex: SemanticIndex = {
      search: jest.fn<SemanticIndex["search"]>().mockResolvedValue(hits),
    };
    const lexicalIndex: LexicalIndex = {
      search: jest.fn<LexicalIndex["search"]>().mockResolvedValue([]),
    };
    const structuralIndex: StructuralIndex = {
      search: jest.fn<StructuralIndex["search"]>().mockResolvedValue([]),
    };

    const orchestrator = new RetrievalOrchestratorV2(
      makeBankLoader(),
      makeDocStore(docCount),
      semanticIndex,
      lexicalIndex,
      structuralIndex,
      undefined,
      stubDocIntelBanks,
    );

    // Force GC if available (node --expose-gc)
    if (typeof globalThis.gc === "function") {
      globalThis.gc();
    }

    const heapBefore = process.memoryUsage().heapUsed;
    const pack = await orchestrator.retrieve(makeRequest());
    const heapAfter = process.memoryUsage().heapUsed;

    expect(pack).toBeDefined();
    expect(pack.runtimeStatus).toBe("ok");

    const heapDelta = heapAfter - heapBefore;
    // heapDelta can be negative due to GC; we only care about growth
    if (heapDelta > 0) {
      expect(heapDelta).toBeLessThan(MAX_HEAP_DELTA_BYTES);
    }
  });
});
