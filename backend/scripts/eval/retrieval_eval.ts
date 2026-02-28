/* eslint-disable no-console */

import {
  RetrievalEngineService,
  type RetrievalRequest,
} from "../../src/services/core/retrieval/retrievalEngine.service";

type Domain = "finance" | "legal" | "medical" | "ops";

type SeedDoc = {
  docId: string;
  title: string;
  filename: string;
  domain: Domain;
  docType: string;
  sectionKey: string;
  keywords: string[];
  content: string;
};

type EvalCase = {
  id: string;
  query: string;
  domain: Domain;
  operator: string;
  intent: string;
  expectedDocIds: string[];
  explicitDocIds?: string[];
  explicitDocTypes?: string[];
  explicitDocDomains?: string[];
  evalGroup: "retrieval" | "gating";
};

const TOP_K = 3;

const DOCS: SeedDoc[] = [
  {
    docId: "fin-budget-2025",
    title: "FY25 Budget Plan",
    filename: "budget_fy25.xlsx",
    domain: "finance",
    docType: "budget_report",
    sectionKey: "assumptions",
    keywords: [
      "budget",
      "plan",
      "forecast",
      "revenue target",
      "opex",
      "fy25",
    ],
    content: "Budget assumptions, forecast drivers, and revenue targets.",
  },
  {
    docId: "fin-actual-2025",
    title: "FY25 Actuals",
    filename: "actuals_fy25.xlsx",
    domain: "finance",
    docType: "variance_report",
    sectionKey: "variance_analysis",
    keywords: ["actual", "realized", "variance", "budget vs actual", "fy25"],
    content: "Actual performance and variance versus budget.",
  },
  {
    docId: "fin-ap-aging",
    title: "Accounts Payable Aging",
    filename: "ap_aging_q2.csv",
    domain: "finance",
    docType: "ap_aging_report",
    sectionKey: "aging_bucket",
    keywords: [
      "accounts payable",
      "payables",
      "vendor invoice",
      "aging",
      "days outstanding",
    ],
    content: "Accounts payable aging by vendor and due-date buckets.",
  },
  {
    docId: "fin-pl",
    title: "Income Statement",
    filename: "dre_income_statement.xlsx",
    domain: "finance",
    docType: "profit_and_loss",
    sectionKey: "summary",
    keywords: ["income statement", "p&l", "dre", "gross margin", "ebitda"],
    content: "Income statement summary and margin profile.",
  },
  {
    docId: "legal-msa",
    title: "Master Services Agreement",
    filename: "msa_allybi_vendor.pdf",
    domain: "legal",
    docType: "msa",
    sectionKey: "liability",
    keywords: [
      "msa",
      "master services agreement",
      "liability cap",
      "indemnity",
      "termination",
    ],
    content: "MSA clauses including liability cap and indemnity.",
  },
  {
    docId: "legal-lease",
    title: "Office Lease",
    filename: "lease_hq.pdf",
    domain: "legal",
    docType: "lease_agreement",
    sectionKey: "termination",
    keywords: [
      "lease",
      "rent",
      "premises",
      "term",
      "termination for convenience",
    ],
    content: "Lease terms, rent schedule, and termination clauses.",
  },
  {
    docId: "med-lab-cbc",
    title: "CBC Lab Report",
    filename: "cbc_lab_report.pdf",
    domain: "medical",
    docType: "lab_report",
    sectionKey: "results",
    keywords: [
      "lab report",
      "cbc",
      "wbc",
      "leukocytes",
      "reference range",
    ],
    content: "Lab panel with WBC values and reference ranges.",
  },
  {
    docId: "ops-incident",
    title: "SEV-1 Incident Report",
    filename: "incident_sev1.md",
    domain: "ops",
    docType: "incident_report",
    sectionKey: "timeline",
    keywords: [
      "incident",
      "outage",
      "timeline",
      "root cause",
      "mitigation",
    ],
    content: "Incident timeline, root cause, and mitigation actions.",
  },
];

const CASES: EvalCase[] = [
  {
    id: "q1",
    query: "show ap aging trend by vendor",
    domain: "finance",
    operator: "extract",
    intent: "documents",
    expectedDocIds: ["fin-ap-aging"],
    explicitDocTypes: ["ap_aging_report"],
    evalGroup: "retrieval",
  },
  {
    id: "q2",
    query: "compare budget vs actual fy25",
    domain: "finance",
    operator: "compare",
    intent: "documents",
    expectedDocIds: ["fin-budget-2025", "fin-actual-2025"],
    explicitDocIds: ["fin-budget-2025", "fin-actual-2025"],
    explicitDocTypes: ["budget_report", "variance_report"],
    explicitDocDomains: ["finance"],
    evalGroup: "retrieval",
  },
  {
    id: "q3",
    query: "show dre margins for fy25",
    domain: "finance",
    operator: "summarize",
    intent: "documents",
    expectedDocIds: ["fin-pl"],
    explicitDocTypes: ["profit_and_loss"],
    evalGroup: "retrieval",
  },
  {
    id: "q4",
    query: "liability cap in the msa",
    domain: "legal",
    operator: "locate",
    intent: "documents",
    expectedDocIds: ["legal-msa"],
    explicitDocTypes: ["msa"],
    evalGroup: "retrieval",
  },
  {
    id: "q5",
    query: "termination rights in lease contract",
    domain: "legal",
    operator: "extract",
    intent: "documents",
    expectedDocIds: ["legal-lease"],
    explicitDocTypes: ["lease_agreement"],
    evalGroup: "retrieval",
  },
  {
    id: "q6",
    query: "wbc value and reference range",
    domain: "medical",
    operator: "extract",
    intent: "documents",
    expectedDocIds: ["med-lab-cbc"],
    explicitDocTypes: ["lab_report"],
    evalGroup: "retrieval",
  },
  {
    id: "q7",
    query: "incident timeline and root cause",
    domain: "ops",
    operator: "summarize",
    intent: "documents",
    expectedDocIds: ["ops-incident"],
    explicitDocTypes: ["incident_report"],
    evalGroup: "retrieval",
  },
  {
    id: "q8",
    query: "compare budget vs actual",
    domain: "finance",
    operator: "compare",
    intent: "documents",
    expectedDocIds: [],
    explicitDocTypes: ["budget_report", "variance_report"],
    evalGroup: "gating",
  },
];

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function overlapScore(query: string, doc: SeedDoc): number {
  const queryTokens = new Set(tokenize(query));
  const docTokens = new Set(
    tokenize(`${doc.title} ${doc.content} ${doc.keywords.join(" ")}`),
  );
  let overlap = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) overlap += 1;
  }
  const querySize = Math.max(queryTokens.size, 1);
  return overlap / querySize;
}

function rankDocs(query: string, docs: SeedDoc[]): SeedDoc[] {
  return docs
    .map((doc) => ({
      doc,
      score:
        overlapScore(query, doc) +
        (query.toLowerCase().includes(doc.docType.replace(/_/g, " ")) ? 0.2 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.doc.docId.localeCompare(b.doc.docId);
    })
    .map((entry) => entry.doc);
}

function makeBankLoader() {
  return {
    getBank<T = unknown>(bankId: string): T {
      const banks: Record<string, unknown> = {
        semantic_search_config: {
          config: {
            queryExpansionPolicy: { enabled: false },
            hybridPhases: [
              { id: "phase_semantic", type: "semantic", enabled: true, k: 12 },
              { id: "phase_lexical", type: "lexical", enabled: true, k: 12 },
              { id: "phase_structural", type: "structural", enabled: true, k: 8, anchors: ["summary", "termination", "results", "timeline"] },
            ],
          },
        },
        retrieval_ranker_config: {
          config: {
            weights: {
              semantic: 0.6,
              lexical: 0.25,
              structural: 0.15,
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
                maxTotalChunksHard: 20,
                maxNearDuplicatesPerDoc: 3,
                nearDuplicateWindowChars: 200,
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
        synonym_expansion: { config: { enabled: false }, groups: [] },
      };
      const resolved = banks[bankId];
      if (!resolved) {
        throw new Error(`Missing required bank: ${bankId}`);
      }
      return resolved as T;
    },
  };
}

function makeDocStore() {
  return {
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
        ? { docId: doc.docId, title: doc.title, filename: doc.filename }
        : null;
    },
  };
}

function makeIndexes() {
  const search = async (query: string, docIds?: string[]) => {
    const docs = DOCS.filter(
      (doc) => !docIds || docIds.length === 0 || docIds.includes(doc.docId),
    );
    return rankDocs(query, docs);
  };

  return {
    semanticIndex: {
      async search(opts: { query: string; docIds?: string[]; k: number }) {
        const ranked = await search(opts.query, opts.docIds);
        return ranked.slice(0, opts.k).map((doc, idx) => ({
          docId: doc.docId,
          docType: doc.docType,
          title: doc.title,
          filename: doc.filename,
          location: { page: 1, sectionKey: doc.sectionKey },
          snippet: doc.content,
          score: Math.max(0.05, 0.9 - idx * 0.08),
          chunkId: `${doc.docId}:semantic`,
          locationKey: `${doc.docId}|semantic`,
        }));
      },
    },
    lexicalIndex: {
      async search(opts: { query: string; docIds?: string[]; k: number }) {
        const ranked = await search(opts.query, opts.docIds);
        return ranked.slice(0, opts.k).map((doc, idx) => ({
          docId: doc.docId,
          docType: doc.docType,
          title: doc.title,
          filename: doc.filename,
          location: { page: 1, sectionKey: doc.sectionKey },
          snippet: doc.content,
          score: Math.max(0.05, 0.7 - idx * 0.07),
          chunkId: `${doc.docId}:lexical`,
          locationKey: `${doc.docId}|lexical`,
        }));
      },
    },
    structuralIndex: {
      async search(opts: {
        query: string;
        docIds?: string[];
        k: number;
        anchors: string[];
      }) {
        const ranked = await search(opts.query, opts.docIds);
        const anchors = new Set((opts.anchors || []).map((anchor) => anchor.toLowerCase()));
        const filtered = ranked.filter((doc) => anchors.has(doc.sectionKey));
        return filtered.slice(0, opts.k).map((doc, idx) => ({
          docId: doc.docId,
          docType: doc.docType,
          title: doc.title,
          filename: doc.filename,
          location: { page: 1, sectionKey: doc.sectionKey },
          snippet: doc.content,
          score: Math.max(0.05, 0.65 - idx * 0.06),
          chunkId: `${doc.docId}:structural`,
          locationKey: `${doc.docId}|structural`,
        }));
      },
    },
  };
}

function makeDocumentIntelligenceBanks(opts: { rewritesEnabled: boolean }) {
  const financeRewriteRules = opts.rewritesEnabled
    ? [
        {
          id: "finance_ap_guarded",
          enabled: true,
          priority: 90,
          domains: ["finance"],
          patterns: ["\\bap\\b"],
          requireContextAny: ["aging", "vendor", "payable"],
          rewrites: [{ value: "accounts payable", weight: 1.4 }],
        },
        {
          id: "finance_dre_expand",
          enabled: true,
          priority: 85,
          domains: ["finance"],
          patterns: ["\\bdre\\b"],
          rewrites: [{ value: "income statement", weight: 1.2 }],
        },
      ]
    : [];

  return {
    getCrossDocGroundingPolicy() {
      return {
        config: { enabled: true },
        retrievalPolicy: {
          allowWhenDocLock: false,
          requireDomainMatch: true,
          maxSourceDocuments: 4,
        },
        rules: [
          {
            id: "compare_requires_two_docs",
            enabled: true,
            intents: ["documents"],
            operators: ["compare"],
            minExplicitResolvedDocs: 2,
            requireDomainMatch: true,
            allowWhenDocLock: false,
            maxCandidates: 3,
            priority: 100,
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
            id: "finance_boost_ap_aging",
            enabled: true,
            priority: 100,
            domains: ["finance"],
            operators: ["extract", "summarize"],
            conditions: { requireDomainMatch: true },
            boostDocTypes: [{ docType: "ap_aging_report", weight: 3 }],
            boostSections: [{ section: "aging_bucket", weight: 2 }],
          },
          {
            id: "finance_boost_budget_compare",
            enabled: true,
            priority: 95,
            domains: ["finance"],
            operators: ["compare"],
            conditions: { requireDomainMatch: true },
            boostDocTypes: [
              { docType: "budget_report", weight: 2 },
              { docType: "variance_report", weight: 2 },
            ],
            boostSections: [{ section: "variance_analysis", weight: 2 }],
          },
        ],
      };
    },
    getQueryRewriteRules(domain: Domain) {
      if (domain !== "finance") return { config: { maxRewriteTerms: 8 }, rules: [] };
      return {
        config: { maxRewriteTerms: 8 },
        rules: financeRewriteRules,
      };
    },
    getSectionPriorityRules(domain: Domain) {
      if (domain === "finance") {
        return {
          priorities: [
            {
              id: "finance_compare_priority",
              enabled: true,
              intents: ["documents"],
              operators: ["compare"],
              docTypes: ["budget_report", "variance_report"],
              sections: ["variance_analysis", "assumptions", "summary"],
              priority: 100,
              requireDomainMatch: true,
              domains: ["finance"],
            },
          ],
        };
      }
      if (domain === "legal") {
        return {
          priorities: [
            {
              id: "legal_clause_priority",
              enabled: true,
              intents: ["documents"],
              operators: ["extract", "locate"],
              sections: ["termination", "liability", "definitions"],
              priority: 100,
            },
          ],
        };
      }
      return { priorities: [] };
    },
  };
}

function createEngine(opts: { rewritesEnabled: boolean }): RetrievalEngineService {
  const indexes = makeIndexes();
  return new RetrievalEngineService(
    makeBankLoader() as any,
    makeDocStore() as any,
    indexes.semanticIndex as any,
    indexes.lexicalIndex as any,
    indexes.structuralIndex as any,
    undefined,
    makeDocumentIntelligenceBanks({
      rewritesEnabled: opts.rewritesEnabled,
    }) as any,
  );
}

function buildRequest(evalCase: EvalCase): RetrievalRequest {
  return {
    query: evalCase.query,
    env: "dev",
    signals: {
      intentFamily: evalCase.intent,
      operator: evalCase.operator,
      domainHint: evalCase.domain,
      explicitDocIds: evalCase.explicitDocIds || [],
      explicitDocTypes: evalCase.explicitDocTypes || [],
      explicitDocDomains: evalCase.explicitDocDomains || [evalCase.domain],
      allowExpansion: false,
      corpusSearchAllowed: false,
    },
  };
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function main() {
  const engineWithRewrites = createEngine({ rewritesEnabled: true });
  const engineWithoutRewrites = createEngine({ rewritesEnabled: false });

  let precisionNumerator = 0;
  let precisionDenominator = 0;
  let wrongDocCount = 0;
  let retrievalCases = 0;
  let rewriteTriggeredCases = 0;
  let rewriteUsefulCases = 0;
  let rewriteNeutralOrNegativeCases = 0;
  const eventNameCounts = new Map<string, number>();
  const ruleHitCounts = new Map<string, number>();

  const queryDiagnostics: Array<Record<string, unknown>> = [];

  for (const evalCase of CASES) {
    const withRewrite = await engineWithRewrites.retrieve(buildRequest(evalCase));
    const withoutRewrite = await engineWithoutRewrites.retrieve(
      buildRequest(evalCase),
    );

    const topWith = withRewrite.evidence.slice(0, TOP_K).map((item) => item.docId);
    const topWithout = withoutRewrite.evidence
      .slice(0, TOP_K)
      .map((item) => item.docId);
    const expectedSet = new Set(evalCase.expectedDocIds);
    const relevantWith = topWith.filter((docId) => expectedSet.has(docId)).length;

    if (evalCase.evalGroup === "retrieval") {
      retrievalCases += 1;
      precisionNumerator += relevantWith;
      precisionDenominator += TOP_K;
      if (topWith.some((docId) => !expectedSet.has(docId))) {
        wrongDocCount += 1;
      }
    }

    const rewriteEvents = (withRewrite.telemetry?.ruleEvents || []).filter(
      (event) => event.event === "retrieval.rewrite_applied",
    );
    if (rewriteEvents.length > 0) {
      rewriteTriggeredCases += 1;
      const hitWith = topWith.some((docId) => expectedSet.has(docId));
      const hitWithout = topWithout.some((docId) => expectedSet.has(docId));
      if (hitWith && !hitWithout) rewriteUsefulCases += 1;
      else rewriteNeutralOrNegativeCases += 1;
    }

    for (const event of withRewrite.telemetry?.ruleEvents || []) {
      eventNameCounts.set(event.event, (eventNameCounts.get(event.event) || 0) + 1);
      const ruleId = String(event.payload.ruleId || "").trim();
      if (ruleId) {
        ruleHitCounts.set(ruleId, (ruleHitCounts.get(ruleId) || 0) + 1);
      }
    }

    queryDiagnostics.push({
      id: evalCase.id,
      query: evalCase.query,
      evalGroup: evalCase.evalGroup,
      expectedDocIds: evalCase.expectedDocIds,
      topDocs: topWith,
      firedEvents: (withRewrite.telemetry?.ruleEvents || []).map((event) => ({
        event: event.event,
        ruleId: String(event.payload.ruleId || "") || null,
      })),
      summary: withRewrite.telemetry?.summary || null,
    });
  }

  const precisionAtK =
    precisionDenominator > 0 ? precisionNumerator / precisionDenominator : 0;
  const wrongDocRate = retrievalCases > 0 ? wrongDocCount / retrievalCases : 0;
  const rewriteUsefulness =
    rewriteTriggeredCases > 0 ? rewriteUsefulCases / rewriteTriggeredCases : 0;

  const totalQueries = CASES.length;
  const ruleHitRateDistribution = Array.from(ruleHitCounts.entries())
    .map(([ruleId, hits]) => ({
      ruleId,
      hits,
      hitRate: totalQueries > 0 ? hits / totalQueries : 0,
    }))
    .sort((a, b) => {
      if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.ruleId.localeCompare(b.ruleId);
    });

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: {
      docs: DOCS.length,
      queries: CASES.length,
      retrievalQueries: retrievalCases,
      topK: TOP_K,
    },
    metrics: {
      precisionAtKEstimate: round(precisionAtK),
      wrongDocRateEstimate: round(wrongDocRate),
      rewriteUsefulness: {
        triggeredCases: rewriteTriggeredCases,
        usefulCases: rewriteUsefulCases,
        neutralOrNegativeCases: rewriteNeutralOrNegativeCases,
        usefulnessRate: round(rewriteUsefulness),
      },
      eventCounts: Array.from(eventNameCounts.entries())
        .map(([event, count]) => ({ event, count }))
        .sort((a, b) => a.event.localeCompare(b.event)),
      ruleHitRateDistribution: ruleHitRateDistribution.map((entry) => ({
        ruleId: entry.ruleId,
        hits: entry.hits,
        hitRate: round(entry.hitRate),
      })),
    },
    queryDiagnostics,
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error("[retrieval_eval] failed:", error);
  process.exitCode = 1;
});

