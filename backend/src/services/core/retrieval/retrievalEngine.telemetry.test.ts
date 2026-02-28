import { describe, expect, test } from "@jest/globals";

import {
  RetrievalEngineService,
  type RetrievalRequest,
} from "./retrievalEngine.service";

type Domain = "finance" | "legal" | "medical" | "ops";

type SeedDoc = {
  docId: string;
  title: string;
  filename: string;
  domain: Domain;
  docType: string;
  sectionKey: string;
  content: string;
};

const DOCS: SeedDoc[] = [
  {
    docId: "fin-ap-aging",
    title: "Accounts Payable Aging",
    filename: "ap_aging.csv",
    domain: "finance",
    docType: "ap_aging_report",
    sectionKey: "aging_bucket",
    content: "Accounts payable aging by vendor.",
  },
  {
    docId: "fin-budget",
    title: "Budget FY25",
    filename: "budget.xlsx",
    domain: "finance",
    docType: "budget_report",
    sectionKey: "assumptions",
    content: "Budget assumptions and planned spend.",
  },
  {
    docId: "fin-actual",
    title: "Actual FY25",
    filename: "actual.xlsx",
    domain: "finance",
    docType: "variance_report",
    sectionKey: "variance_analysis",
    content: "Actuals and variance outcomes.",
  },
];

function makeEngine(): RetrievalEngineService {
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const banks: Record<string, unknown> = {
        semantic_search_config: {
          config: {
            queryExpansionPolicy: { enabled: false },
            hybridPhases: [
              { id: "phase_semantic", type: "semantic", enabled: true, k: 8 },
              { id: "phase_lexical", type: "lexical", enabled: true, k: 8 },
              {
                id: "phase_structural",
                type: "structural",
                enabled: true,
                k: 6,
              },
            ],
          },
        },
        retrieval_ranker_config: {
          config: {
            weights: {
              semantic: 0.65,
              lexical: 0.25,
              structural: 0.1,
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
                maxPerDocHard: 4,
                maxTotalChunksHard: 12,
                maxNearDuplicatesPerDoc: 2,
                nearDuplicateWindowChars: 160,
              },
            },
          },
        },
        evidence_packaging: {
          config: {
            actionsContract: {
              thresholds: {
                maxEvidenceItemsHard: 8,
                maxEvidencePerDocHard: 2,
                minFinalScore: 0,
              },
            },
          },
        },
        keyword_boost_rules: { rules: [] },
        doc_title_boost_rules: { rules: [] },
        doc_type_boost_rules: { rules: [] },
        recency_boost_rules: { rules: [] },
      };
      const value = banks[bankId];
      if (!value) throw new Error(`missing bank: ${bankId}`);
      return value as T;
    },
  };

  const docStore = {
    async listDocs() {
      return DOCS.map((doc) => ({
        docId: doc.docId,
        title: doc.title,
        filename: doc.filename,
      }));
    },
    async getDocMeta(docId: string) {
      const doc = DOCS.find((entry) => entry.docId === docId);
      return doc
        ? {
            docId: doc.docId,
            title: doc.title,
            filename: doc.filename,
          }
        : null;
    },
  };

  const semanticIndex = {
    async search(opts: { docIds?: string[]; k: number }) {
      const docs = DOCS.filter(
        (doc) => !opts.docIds || opts.docIds.includes(doc.docId),
      );
      return docs.slice(0, opts.k).map((doc, idx) => ({
        docId: doc.docId,
        docType: doc.docType,
        title: doc.title,
        filename: doc.filename,
        location: { page: 1, sectionKey: doc.sectionKey },
        snippet: doc.content,
        score: 0.9 - idx * 0.08,
        chunkId: `${doc.docId}:semantic`,
      }));
    },
  };

  const lexicalIndex = {
    async search(opts: { docIds?: string[]; k: number }) {
      const docs = DOCS.filter(
        (doc) => !opts.docIds || opts.docIds.includes(doc.docId),
      );
      return docs.slice(0, opts.k).map((doc, idx) => ({
        docId: doc.docId,
        docType: doc.docType,
        title: doc.title,
        filename: doc.filename,
        location: { page: 1, sectionKey: doc.sectionKey },
        snippet: doc.content,
        score: 0.7 - idx * 0.07,
        chunkId: `${doc.docId}:lexical`,
      }));
    },
  };

  const structuralIndex = {
    async search(opts: { docIds?: string[]; k: number; anchors: string[] }) {
      const anchorSet = new Set(
        (opts.anchors || []).map((entry) => entry.toLowerCase()),
      );
      const docs = DOCS.filter(
        (doc) =>
          (!opts.docIds || opts.docIds.includes(doc.docId)) &&
          anchorSet.has(doc.sectionKey),
      );
      return docs.slice(0, opts.k).map((doc, idx) => ({
        docId: doc.docId,
        docType: doc.docType,
        title: doc.title,
        filename: doc.filename,
        location: { page: 1, sectionKey: doc.sectionKey },
        snippet: doc.content,
        score: 0.6 - idx * 0.06,
        chunkId: `${doc.docId}:structural`,
      }));
    },
  };

  const banks = {
    getCrossDocGroundingPolicy() {
      return {
        config: { enabled: true },
        retrievalPolicy: {
          maxSourceDocuments: 3,
          requireDomainMatch: true,
          allowWhenDocLock: false,
        },
        rules: [
          {
            id: "compare_requires_two_docs",
            operators: ["compare"],
            minExplicitResolvedDocs: 2,
            requireDomainMatch: true,
            allowWhenDocLock: false,
            maxCandidates: 3,
            priority: 100,
            enabled: true,
          },
        ],
      };
    },
    getRetrievalBoostRules(domain: Domain) {
      if (domain !== "finance") return { config: {}, rules: [] };
      return {
        config: { maxMatchedRules: 3, maxDocumentIntelligenceBoost: 0.45 },
        rules: [
          {
            id: "finance_ap_boost",
            enabled: true,
            priority: 90,
            operators: ["extract", "summarize"],
            conditions: { requireDomainMatch: true, domains: ["finance"] },
            boostDocTypes: [{ docType: "ap_aging_report", weight: 3 }],
            boostSections: [{ section: "aging_bucket", weight: 2 }],
          },
        ],
      };
    },
    getQueryRewriteRules(domain: Domain) {
      if (domain !== "finance")
        return { config: { maxRewriteTerms: 8 }, rules: [] };
      return {
        config: { maxRewriteTerms: 8 },
        rules: [
          {
            id: "finance_ap_guarded",
            enabled: true,
            priority: 100,
            patterns: ["\\bap\\b"],
            domains: ["finance"],
            requireContextAny: ["aging", "vendor", "payable"],
            rewrites: [{ value: "accounts payable", weight: 1.3 }],
          },
        ],
      };
    },
    getSectionPriorityRules(domain: Domain) {
      if (domain !== "finance") return { priorities: [] };
      return {
        priorities: [
          {
            id: "finance_extract_section_priority",
            enabled: true,
            operators: ["extract", "summarize"],
            sections: ["aging_bucket", "summary"],
            priority: 80,
            requireDomainMatch: true,
            domains: ["finance"],
          },
        ],
      };
    },
  };

  return new RetrievalEngineService(
    bankLoader as any,
    docStore as any,
    semanticIndex as any,
    lexicalIndex as any,
    structuralIndex as any,
    undefined,
    banks as any,
  );
}

function buildRequest(
  overrides: Partial<RetrievalRequest> = {},
): RetrievalRequest {
  return {
    query: "show ap aging by vendor",
    env: "dev",
    signals: {
      intentFamily: "documents",
      operator: "extract",
      domainHint: "finance",
      explicitDocIds: ["fin-ap-aging"],
      explicitDocTypes: ["ap_aging_report"],
      explicitDocDomains: ["finance"],
      allowExpansion: false,
    },
    ...overrides,
  };
}

describe("RetrievalEngineService telemetry", () => {
  test("emits boost/rewrite/section telemetry events with deterministic summaries", async () => {
    const engine = makeEngine();
    const pack = await engine.retrieve(buildRequest());

    expect(pack.evidence.length).toBeGreaterThan(0);
    expect(pack.telemetry).toBeDefined();
    const events = pack.telemetry?.ruleEvents || [];

    expect(
      events.some((event) => event.event === "retrieval.boost_rule_hit"),
    ).toBe(true);
    expect(
      events.some((event) => event.event === "retrieval.boost_rule_applied"),
    ).toBe(true);
    expect(
      events.some((event) => event.event === "retrieval.rewrite_applied"),
    ).toBe(true);
    expect(
      events.some((event) => event.event === "retrieval.section_plan_selected"),
    ).toBe(true);

    expect(pack.telemetry?.summary.matchedBoostRuleIds).toContain(
      "finance_ap_boost",
    );
    expect(pack.telemetry?.summary.appliedBoostRuleIds).toContain(
      "finance_ap_boost",
    );
    expect(pack.telemetry?.summary.rewriteRuleIds).toContain(
      "finance_ap_guarded",
    );
    expect(pack.telemetry?.summary.selectedSectionRuleId).toBe(
      "finance_extract_section_priority",
    );
  });

  test("emits crossdoc gated telemetry when compare has fewer than required explicit docs", async () => {
    const engine = makeEngine();
    const request = buildRequest({
      query: "compare budget vs actual",
      signals: {
        intentFamily: "documents",
        operator: "compare",
        domainHint: "finance",
        explicitDocIds: ["fin-budget"],
        explicitDocTypes: ["budget_report"],
        explicitDocDomains: ["finance"],
        allowExpansion: false,
      },
    });
    const pack = await engine.retrieve(request);

    expect(pack.evidence).toHaveLength(0);
    const gatedEvent = (pack.telemetry?.ruleEvents || []).find(
      (event) => event.event === "retrieval.crossdoc_gated",
    );
    expect(gatedEvent).toBeDefined();
    expect(gatedEvent?.payload.reason).toBe(
      "cross_doc_compare_needs_explicit_docs",
    );
    expect(gatedEvent?.payload.requiredExplicitDocs).toBe(2);
    expect(gatedEvent?.payload.actualExplicitDocs).toBe(1);
  });
});
