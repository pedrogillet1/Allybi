/**
 * B2: Encrypted mode — integration tests
 *
 * Verifies encrypted-mode-specific behaviour: weight redistribution,
 * lowered relevance thresholds, lowered min final score, and end-to-end
 * orchestrator evidence production with low Pinecone similarity scores.
 */

import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";

import type {
  BankLoader,
  DocStore,
  SemanticIndex,
  LexicalIndex,
  StructuralIndex,
  RetrievalRequest,
  CandidateChunk,
  DocMeta,
  RetrievalScopeMetrics,
} from "../../retrieval.types";

// ── Mock retrieval.config for encrypted mode ────────────────────────

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
    isEncryptedOnlyMode: true,
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

// ── Import modules AFTER mocking ────────────────────────────────────

import { RetrievalOrchestratorV2 } from "../RetrievalOrchestrator.service";
import { rankCandidates } from "../Ranker.service";
import { applyRetrievalNegatives } from "../NegativeRules.service";
import { packageEvidence } from "../EvidencePackager.service";

// ── Helpers ─────────────────────────────────────────────────────────

const savedEnv = process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY;

function makeBankLoader(): BankLoader {
  const banks: Record<string, any> = {
    semantic_search_config: {
      config: {
        hybridPhases: [
          { type: "semantic", enabled: true, id: "phase_semantic", k: 40 },
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
    diversification_rules: { config: { maxPerDoc: 5, maxTotal: 20, nearDupThreshold: 0.95 } },
    retrieval_negatives: {
      config: { minRelevanceScore: 0.55, headerFooterPenalty: 0.5, tocPenalty: 0.6 },
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
            minFinalScore: 0.15,
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

function makeDocStore(docs?: DocMeta[]): DocStore {
  const allDocs = docs ?? [
    { docId: "doc-enc-1", title: "Encrypted Doc 1", filename: "enc1.pdf" },
    { docId: "doc-enc-2", title: "Encrypted Doc 2", filename: "enc2.pdf" },
  ];
  return {
    listDocs: jest.fn<() => Promise<DocMeta[]>>().mockResolvedValue(allDocs),
    getDocMeta: jest.fn<(id: string) => Promise<DocMeta | null>>().mockImplementation(
      async (id: string) => allDocs.find((d) => d.docId === id) ?? null,
    ),
  };
}

function makeCandidate(overrides: Partial<CandidateChunk> = {}): CandidateChunk {
  return {
    candidateId: "c-1",
    type: "text",
    source: "semantic",
    docId: "doc-enc-1",
    docType: null,
    title: "Encrypted Doc 1",
    filename: "enc1.pdf",
    location: { page: 1 },
    locationKey: "doc-enc-1:p1",
    snippet: "Encrypted content about quarterly revenue for analysis purposes.",
    rawText: null,
    table: null,
    scores: { semantic: 0.35, lexical: 0, structural: 0, penalties: 0, final: 0 },
    signals: {},
    provenanceOk: true,
    ...overrides,
  } as any;
}

function makeRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    query: "What is the revenue?",
    env: "local",
    signals: {},
    ...overrides,
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

// ── Test Setup ──────────────────────────────────────────────────────

describe("encrypted mode — integration", () => {
  beforeEach(() => {
    process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = "true";
    mockConfig.RETRIEVAL_CONFIG.isEncryptedOnlyMode = true;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY = savedEnv;
    } else {
      delete process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY;
    }
    mockConfig.RETRIEVAL_CONFIG.isEncryptedOnlyMode = false;
  });

  // ── 1. Weight redistribution via Ranker ───────────────────────────

  describe("weight redistribution in encrypted mode", () => {
    test("semantic weight receives extra redistribution in encrypted mode", () => {
      const candidates = [
        makeCandidate({
          candidateId: "c-1",
          scores: { semantic: 0.45, lexical: 0, structural: 0, penalties: 0, final: 0 },
        }),
        makeCandidate({
          candidateId: "c-2",
          scores: { semantic: 0.30, lexical: 0, structural: 0, penalties: 0, final: 0 },
        }),
      ];

      const rankerCfg = {
        config: {
          weights: {
            semantic: 0.52,
            lexical: 0.22,
            structural: 0.14,
            titleBoost: 0,
            documentIntelligenceBoost: 0,
            routingPriorityBoost: 0,
            typeBoost: 0,
            recencyBoost: 0,
          },
        },
      };

      const req = makeRequest();

      // isEncryptedOnlyMode = true (6th arg)
      const rankedEncrypted = rankCandidates(candidates, req, req.signals, rankerCfg, undefined, true);
      // isEncryptedOnlyMode = false
      const rankedNormal = rankCandidates(
        candidates.map((c) => ({ ...c, scores: { ...c.scores, final: 0 } })),
        req, req.signals, rankerCfg, undefined, false,
      );

      // In encrypted mode, semantic gets redistributed weight from lexical+structural
      // so the final scores should differ (encrypted scores should be higher since
      // semantic is the only non-zero source and gets more weight)
      expect(rankedEncrypted[0].scores.final).toBeGreaterThan(0);
      expect(rankedNormal[0].scores.final).toBeGreaterThan(0);

      // With only semantic scores available, encrypted mode redistributes
      // lexical + structural weight to semantic, producing higher final scores
      expect(rankedEncrypted[0].scores.final).toBeGreaterThanOrEqual(
        rankedNormal[0].scores.final,
      );
    });
  });

  // ── 2. Min relevance lowered in negatives ─────────────────────────

  describe("minRelevanceScore lowered in encrypted mode", () => {
    test("low-similarity candidates survive negatives when encrypted mode active", () => {
      // In encrypted mode, minRelevanceScore is Math.min(cfg, 0.10) — so 0.10
      // Normal cfg = 0.55, meaning a candidate at 0.35 would be dropped in normal
      // but should survive in encrypted mode
      const candidates = [
        makeCandidate({
          candidateId: "c-low",
          docId: "doc-enc-1",
          scores: { semantic: 0.35, lexical: 0, structural: 0, final: 0.35 },
        }),
      ];

      const req = makeRequest();
      const scope = { candidateDocIds: ["doc-enc-1"], hardScopeActive: false };
      const negatives = {
        config: {
          enabled: true,
          minRelevanceScore: 0.55,
          actionsContract: {
            thresholds: {
              minRelevanceScore: 0.55,
            },
          },
        },
        rules: [],
      };
      const bankLoader = makeBankLoader();
      const scopeMetrics: RetrievalScopeMetrics = {
        scopeCandidatesDropped: 0,
        scopeViolationsDetected: 0,
        scopeViolationsThrown: 0,
      };

      // encrypted mode = true
      const survivorsEncrypted = applyRetrievalNegatives(
        candidates, req, req.signals, scope, negatives, bankLoader, true, scopeMetrics,
      );

      // encrypted mode = false
      const survivorsNormal = applyRetrievalNegatives(
        candidates.map((c) => ({ ...c })), req, req.signals, scope, negatives, bankLoader, false, scopeMetrics,
      );

      // In encrypted mode, the candidate at 0.35 should survive (threshold 0.10)
      expect(survivorsEncrypted.length).toBe(1);
      // In normal mode, the candidate at 0.35 should be dropped (threshold 0.55)
      expect(survivorsNormal.length).toBe(0);
    });
  });

  // ── 3. Min final score lowered in packaging ───────────────────────

  describe("minFinalScore lowered in encrypted mode", () => {
    test("low-scoring candidates are included in evidence when encrypted", () => {
      const candidates = [
        makeCandidate({
          candidateId: "c-low-final",
          docId: "doc-enc-1",
          scores: { semantic: 0.12, lexical: 0, structural: 0, final: 0.10 },
          snippet: "Low scoring but valid encrypted mode evidence content",
        }),
      ];

      const req = makeRequest();
      const packagingBank = {
        config: {
          actionsContract: {
            thresholds: {
              maxEvidenceItemsHard: 36,
              maxEvidencePerDocHard: 10,
              maxDistinctDocsNonCompare: 3,
              maxDistinctDocsExploratoryNonCompare: 5,
              minFinalScore: 0.15,
            },
          },
        },
      };
      const bankLoader = makeBankLoader();

      const ctx = {
        queryOriginal: "revenue",
        queryNormalized: "revenue",
        expandedQueries: [],
        scope: { candidateDocIds: ["doc-enc-1"], hardScopeActive: false } as any,
        compareIntent: false,
        exploratoryMode: false,
        classification: { confidence: 0.5, domain: null, docTypeId: null, reasons: [], matchedDomainRuleIds: [] } as any,
        resolvedDocTypes: [],
        phaseCounts: { considered: 1, afterNegatives: 1, afterBoosts: 1, afterDiversification: 1 },
        scopeMetrics: { scopeCandidatesDropped: 0, scopeViolationsDetected: 0, scopeViolationsThrown: 0 },
        bankLoader,
        documentIntelligenceBanks: stubDocIntelBanks as any,
        isEncryptedOnlyMode: true,
      };

      const pack = packageEvidence(candidates, req, req.signals, packagingBank, ctx);

      // In encrypted mode, minFinalScore should be lowered from 0.15 to 0.05
      // So a candidate with finalScore 0.10 should survive
      expect(pack.evidence.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 4. End-to-end encrypted mode produces evidence ────────────────

  describe("end-to-end encrypted mode with low Pinecone scores", () => {
    test("orchestrator produces evidence for low-similarity encrypted hits", async () => {
      // Simulate Pinecone returning low cosine similarities (typical in encrypted mode)
      const lowScoreSemantic: SemanticIndex = {
        search: jest.fn<SemanticIndex["search"]>().mockResolvedValue([
          {
            docId: "doc-enc-1",
            location: { page: 2 },
            snippet: "Encrypted chunk about financial quarterly performance metrics",
            score: 0.38,
            locationKey: "doc-enc-1:p2",
            chunkId: "enc-chunk-1",
          },
          {
            docId: "doc-enc-1",
            location: { page: 5 },
            snippet: "Encrypted chunk about revenue figures and projections data",
            score: 0.32,
            locationKey: "doc-enc-1:p5",
            chunkId: "enc-chunk-2",
          },
        ]),
      };

      const emptyLexical: LexicalIndex = {
        search: jest.fn<LexicalIndex["search"]>().mockResolvedValue([]),
      };
      const emptyStructural: StructuralIndex = {
        search: jest.fn<StructuralIndex["search"]>().mockResolvedValue([]),
      };

      const orchestrator = new RetrievalOrchestratorV2(
        makeBankLoader(),
        makeDocStore(),
        lowScoreSemantic,
        emptyLexical,
        emptyStructural,
        undefined,
        stubDocIntelBanks,
      );

      const req = makeRequest({ query: "What is the revenue?" });
      const pack = await orchestrator.retrieve(req);

      expect(pack).toBeDefined();
      expect(pack.runtimeStatus).toBe("ok");
      // Encrypted mode should not filter out these low-scoring candidates
      expect(pack.evidence.length).toBeGreaterThan(0);
      expect(pack.stats.uniqueDocsInEvidence).toBeGreaterThanOrEqual(1);

      // Verify the evidence scores are within expected encrypted-mode range
      for (const item of pack.evidence) {
        expect(item.score.finalScore).toBeGreaterThan(0);
        expect(item.score.finalScore).toBeLessThanOrEqual(1);
      }
    });
  });
});
