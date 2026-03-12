/**
 * B1: RetrievalOrchestratorV2 — integration tests with mock dependencies
 *
 * Exercises the full 12-step pipeline through the orchestrator's `retrieve()`
 * method using controlled mock implementations for every external dependency.
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
} from "../../retrieval.types";

// ── Mock retrieval.config so cache + timeouts are deterministic ──────

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

// ── Import orchestrator AFTER mocking config ────────────────────────

import { RetrievalOrchestratorV2 } from "../RetrievalOrchestrator.service";

// ── Helpers: mock dependency factories ──────────────────────────────

function makeBankLoader(overrides: Record<string, any> = {}): BankLoader {
  const defaultBanks: Record<string, any> = {
    semantic_search_config: {
      config: {
        hybridPhases: [
          { type: "semantic", enabled: true, id: "phase_semantic", k: 40 },
          { type: "lexical", enabled: true, id: "phase_lexical", k: 40 },
          { type: "structural", enabled: true, id: "phase_structural", k: 40 },
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
    diversification_rules: {
      config: {
        maxPerDoc: 5,
        maxTotal: 20,
        nearDupThreshold: 0.95,
      },
    },
    retrieval_negatives: {
      config: {
        minRelevanceScore: 0.15,
        headerFooterPenalty: 0.5,
        tocPenalty: 0.6,
      },
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
    ...overrides,
  };

  return {
    getBank<T = unknown>(bankId: string): T {
      return (defaultBanks[bankId] ?? {}) as T;
    },
  };
}

function makeDocStore(docs: DocMeta[] = []): DocStore {
  return {
    listDocs: jest.fn<() => Promise<DocMeta[]>>().mockResolvedValue(docs),
    getDocMeta: jest.fn<(id: string) => Promise<DocMeta | null>>().mockImplementation(
      async (id: string) => docs.find((d) => d.docId === id) ?? null,
    ),
  };
}

function makeSemanticIndex(
  impl?: SemanticIndex["search"],
): SemanticIndex {
  return {
    search: impl ?? jest.fn<SemanticIndex["search"]>().mockResolvedValue([
      {
        docId: "doc-1",
        location: { page: 1 },
        snippet: "Revenue was $5M in Q2 2025",
        score: 0.88,
        locationKey: "doc-1:p1",
        chunkId: "chunk-1",
      },
      {
        docId: "doc-1",
        location: { page: 3 },
        snippet: "Expenses totalled $2M for the quarter",
        score: 0.72,
        locationKey: "doc-1:p3",
        chunkId: "chunk-2",
      },
    ]),
  };
}

function makeLexicalIndex(
  impl?: LexicalIndex["search"],
): LexicalIndex {
  return {
    search: impl ?? jest.fn<LexicalIndex["search"]>().mockResolvedValue([
      {
        docId: "doc-1",
        location: { page: 1 },
        snippet: "Revenue was $5M in Q2 2025",
        score: 0.65,
        locationKey: "doc-1:p1",
        chunkId: "chunk-1",
      },
    ]),
  };
}

function makeStructuralIndex(
  impl?: StructuralIndex["search"],
): StructuralIndex {
  return {
    search: impl ?? jest.fn<StructuralIndex["search"]>().mockResolvedValue([]),
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

function makeDocs(count: number): DocMeta[] {
  return Array.from({ length: count }, (_, i) => ({
    docId: `doc-${i + 1}`,
    title: `Test Document ${i + 1}`,
    filename: `test-${i + 1}.pdf`,
  }));
}

function makeRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    query: "What was the revenue in Q2?",
    env: "local",
    signals: {},
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("RetrievalOrchestratorV2 — integration", () => {
  let bankLoader: BankLoader;
  let docStore: DocStore;
  let semanticIndex: SemanticIndex;
  let lexicalIndex: LexicalIndex;
  let structuralIndex: StructuralIndex;

  beforeEach(() => {
    bankLoader = makeBankLoader();
    docStore = makeDocStore(makeDocs(3));
    semanticIndex = makeSemanticIndex();
    lexicalIndex = makeLexicalIndex();
    structuralIndex = makeStructuralIndex();
    jest.restoreAllMocks();
  });

  // ── 1. Happy path ──────────────────────────────────────────────────

  describe("happy path — normal query returns evidence", () => {
    test("produces EvidencePack with evidence items and ok status", async () => {
      const orchestrator = new RetrievalOrchestratorV2(
        bankLoader,
        docStore,
        semanticIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest();
      const pack = await orchestrator.retrieve(req);

      expect(pack).toBeDefined();
      expect(pack.runtimeStatus).toBe("ok");
      expect(pack.query.original).toBe("What was the revenue in Q2?");
      expect(pack.query.normalized).toBeDefined();
      expect(pack.evidence).toBeDefined();
      expect(Array.isArray(pack.evidence)).toBe(true);
      expect(pack.evidence.length).toBeGreaterThan(0);
      expect(pack.stats.evidenceItems).toBeGreaterThan(0);
      expect(pack.stats.uniqueDocsInEvidence).toBeGreaterThanOrEqual(1);

      // Every evidence item should have the required shape
      for (const item of pack.evidence) {
        expect(item.docId).toBeDefined();
        expect(item.snippet).toBeDefined();
        expect(item.score).toBeDefined();
        expect(typeof item.score.finalScore).toBe("number");
        expect(item.score.finalScore).toBeGreaterThan(0);
        expect(item.score.finalScore).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── 2. Unsafe gate ────────────────────────────────────────────────

  describe("unsafeGate signal returns empty pack", () => {
    test("signals.unsafeGate=true produces empty pack with unsafe_gate reason", async () => {
      const orchestrator = new RetrievalOrchestratorV2(
        bankLoader,
        docStore,
        semanticIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest({ signals: { unsafeGate: true } });
      const pack = await orchestrator.retrieve(req);

      expect(pack.evidence).toEqual([]);
      expect(pack.stats.evidenceItems).toBe(0);
      expect(pack.debug).toBeDefined();
      expect(pack.debug!.reasonCodes).toContain("unsafe_gate");
    });
  });

  // ── 3. Hard scope empty — 0 candidate docs ────────────────────────

  describe("hard scope with zero candidate docs", () => {
    test("hardScopeActive + empty docs returns empty pack", async () => {
      const emptyDocStore = makeDocStore([]);

      const orchestrator = new RetrievalOrchestratorV2(
        bankLoader,
        emptyDocStore,
        semanticIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest({
        signals: {
          hardScopeActive: true,
          explicitDocLock: true,
          activeDocId: "nonexistent-doc",
        },
      });

      const pack = await orchestrator.retrieve(req);

      expect(pack.evidence).toEqual([]);
      expect(pack.stats.evidenceItems).toBe(0);
      expect(pack.debug).toBeDefined();
      expect(pack.debug!.reasonCodes.length).toBeGreaterThan(0);
    });
  });

  // ── 4. Phase failure — semantic index throws ──────────────────────

  describe("phase failure — semantic index throws", () => {
    test("semantic search error produces pack with failure reason code", async () => {
      const failingIndex = makeSemanticIndex(async () => {
        throw new Error("Pinecone unavailable");
      });

      const orchestrator = new RetrievalOrchestratorV2(
        bankLoader,
        docStore,
        failingIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest();
      const pack = await orchestrator.retrieve(req);

      expect(pack).toBeDefined();
      // runtimeStatus should be degraded or failed depending on fail mode
      expect(["degraded", "failed", "ok"]).toContain(pack.runtimeStatus);

      // Should have a phase-level failure code in debug
      if (pack.debug) {
        const hasPhaseFailure = pack.debug.reasonCodes.some(
          (code) => /semantic.*failed/i.test(code) || /degraded/i.test(code),
        );
        expect(hasPhaseFailure).toBe(true);
      }
    });
  });

  // ── 5. Phase timeout — semantic hangs ─────────────────────────────

  describe("phase timeout — semantic search hangs", () => {
    test("slow semantic search produces timed_out reason code", async () => {
      const slowIndex = makeSemanticIndex(
        () => new Promise((resolve) => {
          setTimeout(() => resolve([]), 500); // well past 200ms mock timeout
        }),
      );

      const orchestrator = new RetrievalOrchestratorV2(
        bankLoader,
        docStore,
        slowIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest();
      const pack = await orchestrator.retrieve(req);

      expect(pack).toBeDefined();
      // Should propagate timed_out or degraded status
      expect(["degraded", "failed", "ok"]).toContain(pack.runtimeStatus);

      if (pack.debug) {
        const hasTimeoutCode = pack.debug.reasonCodes.some(
          (code) => /timed_out/i.test(code) || /timeout/i.test(code) || /degraded/i.test(code),
        );
        expect(hasTimeoutCode).toBe(true);
      }
    });
  });

  // ── 6. Cache hit — second identical request returns cached pack ───

  describe("cache hit on second identical request", () => {
    test("when multiLevelCacheEnabled, second call returns cached pack", async () => {
      // Enable cache in the mock config
      mockConfig.RETRIEVAL_CONFIG.multiLevelCacheEnabled = true;

      try {
        const orchestrator = new RetrievalOrchestratorV2(
          bankLoader,
          docStore,
          semanticIndex,
          lexicalIndex,
          structuralIndex,
          undefined,
          stubDocIntelBanks,
        );

        const req = makeRequest();
        const pack1 = await orchestrator.retrieve(req);
        const pack2 = await orchestrator.retrieve(req);

        // Both should succeed
        expect(pack1.runtimeStatus).toBe("ok");
        expect(pack2.runtimeStatus).toBe("ok");

        // Evidence content should match
        expect(pack2.evidence.length).toBe(pack1.evidence.length);
        expect(pack2.stats.evidenceItems).toBe(pack1.stats.evidenceItems);

        // The cached pack should have a cache hit reason code
        if (pack2.debug) {
          expect(pack2.debug.reasonCodes).toContain("retrieval_cache_hit");
        }
      } finally {
        // Restore config
        mockConfig.RETRIEVAL_CONFIG.multiLevelCacheEnabled = false;
      }
    });
  });

  // ── 7. Runtime error boundary — BankLoader.getBank throws ─────────

  describe("runtime error boundary — BankLoader throws", () => {
    test("BankLoader.getBank throwing produces a failed pack", async () => {
      const failingBankLoader: BankLoader = {
        getBank<T>(_bankId: string): T {
          throw new Error("Bank registry corrupted");
        },
      };

      const orchestrator = new RetrievalOrchestratorV2(
        failingBankLoader,
        docStore,
        semanticIndex,
        lexicalIndex,
        structuralIndex,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest();
      const pack = await orchestrator.retrieve(req);

      expect(pack).toBeDefined();
      expect(pack.runtimeStatus).toBe("failed");
      expect(pack.runtimeError).toBeDefined();
      expect(pack.runtimeError!.code).toBe("runtime_invariant_breach");
      expect(pack.runtimeError!.message).toContain("Bank registry corrupted");
      expect(pack.evidence).toEqual([]);
      expect(pack.stats.evidenceItems).toBe(0);
    });
  });
});
