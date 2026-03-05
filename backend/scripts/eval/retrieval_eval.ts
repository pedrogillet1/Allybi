/* eslint-disable no-console */

import path from "path";
import {
  RetrievalEngineService,
  type RetrievalRequest,
} from "../../src/services/core/retrieval/retrievalEngine.service";
import {
  getBankLoaderInstance,
  initializeBanks,
} from "../../src/services/core/banks/bankLoader.service";
import {
  getDocumentIntelligenceBanksInstance,
  type DocumentIntelligenceBanksService,
} from "../../src/services/core/banks/documentIntelligenceBanks.service";

type Domain = "finance" | "legal" | "medical" | "ops";
type EvalMode = "mock" | "real_banks";

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
const DEFAULT_EVAL_MODE: EvalMode = "mock";

type DocumentIntelligenceSubset = Pick<
  DocumentIntelligenceBanksService,
  | "getCrossDocGroundingPolicy"
  | "getDocumentIntelligenceDomains"
  | "getDocTypeCatalog"
  | "getDocTypeSections"
  | "getDocTypeTables"
  | "getDomainDetectionRules"
  | "getRetrievalBoostRules"
  | "getQueryRewriteRules"
  | "getSectionPriorityRules"
>;

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
      "payables ledger",
      "due-date buckets",
      "days outstanding",
    ],
    content: "Accounts payable ledger by due-date buckets and days outstanding.",
  },
  {
    docId: "fin-pl",
    title: "Income Statement",
    filename: "dre_income_statement.xlsx",
    domain: "finance",
    docType: "profit_and_loss",
    sectionKey: "summary",
    keywords: ["income statement", "p&l", "gross margin", "ebitda"],
    content: "Income statement summary and margin profile.",
  },
  {
    docId: "fin-forecast-2025",
    title: "FY25 Rolling Forecast",
    filename: "forecast_fy25.xlsx",
    domain: "finance",
    docType: "forecast_report",
    sectionKey: "forecast",
    keywords: [
      "forecast",
      "rolling forecast",
      "fy25",
      "expected revenue",
      "projected opex",
    ],
    content: "Rolling forecast covering expected revenue and opex changes.",
  },
  {
    docId: "legal-msa",
    title: "Master Services Agreement",
    filename: "master_services_agreement_vendor.pdf",
    domain: "legal",
    docType: "msa",
    sectionKey: "liability",
    keywords: [
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
    docId: "legal-nda",
    title: "Mutual NDA",
    filename: "nda_partner.pdf",
    domain: "legal",
    docType: "nda",
    sectionKey: "confidentiality",
    keywords: [
      "nda",
      "non-disclosure",
      "confidentiality",
      "permitted disclosure",
      "term",
    ],
    content: "NDA confidentiality obligations and permitted disclosure carve-outs.",
  },
  {
    docId: "med-lab-cbc",
    title: "Complete Blood Count Report",
    filename: "complete_blood_count_report.pdf",
    domain: "medical",
    docType: "lab_report",
    sectionKey: "results",
    keywords: [
      "lab report",
      "complete blood count",
      "wbc",
      "leukocytes",
      "differential",
      "reference range",
      "white blood cell count",
    ],
    content:
      "Complete blood count panel with leukocyte differential, white blood cell count values, and reference range.",
  },
  {
    docId: "med-lab-lipid",
    title: "Lipid Panel Report",
    filename: "lipid_panel_report.pdf",
    domain: "medical",
    docType: "lab_report",
    sectionKey: "results",
    keywords: [
      "lipid panel",
      "hdl",
      "ldl",
      "triglycerides",
      "reference range",
    ],
    content: "Lipid panel values with HDL, LDL, and reference ranges.",
  },
  {
    docId: "ops-incident",
    title: "Production Incident Report",
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
  {
    docId: "ops-postmortem",
    title: "SEV-1 Postmortem",
    filename: "incident_postmortem.md",
    domain: "ops",
    docType: "incident_report",
    sectionKey: "timeline",
    keywords: [
      "incident",
      "postmortem",
      "timeline",
      "root cause analysis",
      "corrective actions",
    ],
    content: "Postmortem timeline, root cause analysis, and corrective actions.",
  },
];

const CASES: EvalCase[] = [
  {
    id: "q1",
    query: "show ap vendor invoice status",
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
    query: "show gross margin summary for fy25",
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
    query: "compare budget, forecast, and actual fy25",
    domain: "finance",
    operator: "compare",
    intent: "documents",
    expectedDocIds: ["fin-budget-2025", "fin-forecast-2025", "fin-actual-2025"],
    explicitDocIds: ["fin-budget-2025", "fin-forecast-2025", "fin-actual-2025"],
    explicitDocTypes: ["budget_report", "forecast_report", "variance_report"],
    explicitDocDomains: ["finance"],
    evalGroup: "retrieval",
  },
  {
    id: "q9",
    query: "compare msa and nda confidentiality obligations",
    domain: "legal",
    operator: "compare",
    intent: "documents",
    expectedDocIds: ["legal-msa", "legal-nda"],
    explicitDocIds: ["legal-msa", "legal-nda"],
    explicitDocTypes: ["msa", "nda"],
    explicitDocDomains: ["legal"],
    evalGroup: "retrieval",
  },
  {
    id: "q10",
    query: "compare cbc and lipid panel reference ranges",
    domain: "medical",
    operator: "compare",
    intent: "documents",
    expectedDocIds: ["med-lab-cbc", "med-lab-lipid"],
    explicitDocIds: ["med-lab-cbc", "med-lab-lipid"],
    explicitDocTypes: ["lab_report"],
    explicitDocDomains: ["medical"],
    evalGroup: "retrieval",
  },
  {
    id: "q11",
    query: "compare sev1 incident and postmortem timeline root cause",
    domain: "ops",
    operator: "compare",
    intent: "documents",
    expectedDocIds: ["ops-incident", "ops-postmortem"],
    explicitDocIds: ["ops-incident", "ops-postmortem"],
    explicitDocTypes: ["incident_report"],
    explicitDocDomains: ["ops"],
    evalGroup: "retrieval",
  },
  {
    id: "q12",
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

function uniqueDocIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
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

function parseEvalModeArg(argv: string[]): EvalMode {
  const flag = argv.find((arg) => arg.startsWith("--mode="));
  if (!flag) return DEFAULT_EVAL_MODE;
  const value = flag.slice("--mode=".length).trim().toLowerCase();
  if (value === "real_banks") return "real_banks";
  if (value === "mock") return "mock";
  throw new Error(
    `Unsupported --mode value "${value}". Expected "mock" or "real_banks".`,
  );
}

function buildNoRewriteProxy(
  source: DocumentIntelligenceSubset,
): DocumentIntelligenceSubset {
  return {
    getCrossDocGroundingPolicy: () => source.getCrossDocGroundingPolicy(),
    getDocumentIntelligenceDomains: () =>
      source.getDocumentIntelligenceDomains(),
    getDocTypeCatalog: () => source.getDocTypeCatalog(),
    getDocTypeSections: (docTypeId) => source.getDocTypeSections(docTypeId),
    getDocTypeTables: (docTypeId) => source.getDocTypeTables(docTypeId),
    getDomainDetectionRules: (domain) => source.getDomainDetectionRules(domain),
    getRetrievalBoostRules: (domain) => source.getRetrievalBoostRules(domain),
    getQueryRewriteRules: (domain) => {
      const bank = source.getQueryRewriteRules(domain);
      return { ...bank, rules: [] };
    },
    getSectionPriorityRules: (domain) => source.getSectionPriorityRules(domain),
  };
}

function createEngineWithDeps(opts: {
  rewritesEnabled: boolean;
  mode: EvalMode;
  runtimeBankLoader?: ReturnType<typeof getBankLoaderInstance>;
  runtimeDiBanks?: DocumentIntelligenceSubset;
}): RetrievalEngineService {
  const indexes = makeIndexes();
  const bankLoader =
    opts.mode === "real_banks" ? opts.runtimeBankLoader : makeBankLoader();
  if (!bankLoader) {
    throw new Error("Runtime bank loader is required in real_banks mode.");
  }

  const diBanks =
    opts.mode === "real_banks"
      ? opts.rewritesEnabled
        ? opts.runtimeDiBanks
        : opts.runtimeDiBanks
          ? buildNoRewriteProxy(opts.runtimeDiBanks)
          : null
      : makeDocumentIntelligenceBanks({ rewritesEnabled: opts.rewritesEnabled });
  if (!diBanks) {
    throw new Error("Runtime document intelligence banks are required.");
  }

  return new RetrievalEngineService(
    bankLoader as any,
    makeDocStore() as any,
    indexes.semanticIndex as any,
    indexes.lexicalIndex as any,
    indexes.structuralIndex as any,
    undefined,
    diBanks as any,
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

export async function runRetrievalEval(
  mode: EvalMode = DEFAULT_EVAL_MODE,
): Promise<Record<string, any>> {
  let runtimeLoadedBankIds: string[] = [];

  let runtimeBankLoader: ReturnType<typeof getBankLoaderInstance> | undefined;
  let runtimeDiBanks: DocumentIntelligenceSubset | undefined;
  if (mode === "real_banks") {
    await initializeBanks({
      env: "dev",
      rootDir: path.resolve(__dirname, "../../src/data_banks"),
      strict: false,
      validateSchemas: false,
      allowEmptyChecksumsInNonProd: true,
      enableHotReload: false,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });
    runtimeBankLoader = getBankLoaderInstance();
    runtimeLoadedBankIds = runtimeBankLoader.listLoaded();
    runtimeDiBanks = getDocumentIntelligenceBanksInstance() as any;
  }

  const engineWithRewrites = createEngineWithDeps({
    rewritesEnabled: true,
    mode,
    runtimeBankLoader,
    runtimeDiBanks,
  });
  const engineWithoutRewrites = createEngineWithDeps({
    rewritesEnabled: false,
    mode,
    runtimeBankLoader,
    runtimeDiBanks,
  });

  let precisionNumerator = 0;
  let precisionDenominator = 0;
  let precisionDenominatorRequested = 0;
  let precisionEffectiveNumerator = 0;
  let precisionEffectiveDenominator = 0;
  let top1HitCount = 0;
  let top1WrongCount = 0;
  let topKContaminationCount = 0;
  let retrievalCases = 0;
  let rewriteTriggeredCases = 0;
  let rewriteUsefulCases = 0;
  let rewriteNeutralOrNegativeCases = 0;
  let rewriteHarmfulCases = 0;
  let rewriteTop1ImprovedCases = 0;
  let rewritePrecisionImprovedCases = 0;
  let rewriteContaminationReducedCases = 0;
  const eventNameCounts = new Map<string, number>();
  const ruleHitCounts = new Map<string, number>();
  const rewriteByDomain = new Map<
    Domain,
    {
      queries: number;
        triggeredCases: number;
        usefulCases: number;
        neutralOrNegativeCases: number;
        harmfulCases: number;
      }
  >();

  const queryDiagnostics: Array<Record<string, unknown>> = [];

  for (const evalCase of CASES) {
    const withRewrite = await engineWithRewrites.retrieve(buildRequest(evalCase));
    const withoutRewrite = await engineWithoutRewrites.retrieve(
      buildRequest(evalCase),
    );

    const topWithRaw = withRewrite.evidence.slice(0, TOP_K).map((item) => item.docId);
    const topWithoutRaw = withoutRewrite.evidence
      .slice(0, TOP_K)
      .map((item) => item.docId);
    const topWith = uniqueDocIds(topWithRaw);
    const topWithout = uniqueDocIds(topWithoutRaw);
    const expectedSet = new Set(evalCase.expectedDocIds);
    const relevantWith = topWith.filter((docId) => expectedSet.has(docId)).length;
    const relevantWithout = topWithout.filter((docId) => expectedSet.has(docId)).length;
    const top1WithHit = topWith.length > 0 && expectedSet.has(topWith[0]);
    const top1WithoutHit =
      topWithout.length > 0 && expectedSet.has(topWithout[0]);
    const contaminationWith = topWith.filter((docId) => !expectedSet.has(docId)).length;
    const contaminationWithout = topWithout.filter(
      (docId) => !expectedSet.has(docId),
    ).length;

    if (evalCase.evalGroup === "retrieval") {
      retrievalCases += 1;
      precisionNumerator += relevantWith;
      precisionDenominator += Math.min(TOP_K, Math.max(1, topWith.length));
      precisionDenominatorRequested += TOP_K;
      const effectiveDenominator = Math.min(TOP_K, Math.max(1, expectedSet.size));
      precisionEffectiveDenominator += effectiveDenominator;
      precisionEffectiveNumerator += Math.min(relevantWith, effectiveDenominator);
      if (top1WithHit) top1HitCount += 1;
      else top1WrongCount += 1;
      if (contaminationWith > 0) topKContaminationCount += 1;
      const domainState = rewriteByDomain.get(evalCase.domain) || {
        queries: 0,
        triggeredCases: 0,
        usefulCases: 0,
        neutralOrNegativeCases: 0,
        harmfulCases: 0,
      };
      domainState.queries += 1;
      rewriteByDomain.set(evalCase.domain, domainState);
    }

    const rewriteEvents = (withRewrite.telemetry?.ruleEvents || []).filter(
      (event) => event.event === "retrieval.rewrite_applied",
    );
    if (rewriteEvents.length > 0) {
      rewriteTriggeredCases += 1;
      const improvedTop1 = top1WithHit && !top1WithoutHit;
      const improvedPrecision = relevantWith > relevantWithout;
      const reducedContamination = contaminationWith < contaminationWithout;
      const degradedTop1 = !top1WithHit && top1WithoutHit;
      const degradedPrecision = relevantWith < relevantWithout;
      const worsenedContamination = contaminationWith > contaminationWithout;
      const harmful =
        degradedTop1 || degradedPrecision || worsenedContamination;

      if (improvedTop1) rewriteTop1ImprovedCases += 1;
      if (improvedPrecision) rewritePrecisionImprovedCases += 1;
      if (reducedContamination) rewriteContaminationReducedCases += 1;

      if (!harmful && (improvedTop1 || improvedPrecision || reducedContamination)) {
        rewriteUsefulCases += 1;
        if (evalCase.evalGroup === "retrieval") {
          const domainState = rewriteByDomain.get(evalCase.domain);
          if (domainState) domainState.usefulCases += 1;
        }
      } else {
        rewriteNeutralOrNegativeCases += 1;
        if (evalCase.evalGroup === "retrieval") {
          const domainState = rewriteByDomain.get(evalCase.domain);
          if (domainState) domainState.neutralOrNegativeCases += 1;
          if (domainState && harmful) domainState.harmfulCases += 1;
        }
        if (harmful) rewriteHarmfulCases += 1;
      }
      if (evalCase.evalGroup === "retrieval") {
        const domainState = rewriteByDomain.get(evalCase.domain);
        if (domainState) domainState.triggeredCases += 1;
      }
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
      topDocsWithoutRewrite: topWithout,
      firedEvents: (withRewrite.telemetry?.ruleEvents || []).map((event) => ({
        event: event.event,
        ruleId: String(event.payload.ruleId || "") || null,
      })),
      rewriteImpact:
        rewriteEvents.length > 0
          ? {
              top1Improved: top1WithHit && !top1WithoutHit,
              precisionDeltaAtK: relevantWith - relevantWithout,
              contaminationDelta: contaminationWith - contaminationWithout,
            }
          : null,
      summary: withRewrite.telemetry?.summary || null,
    });
  }

  const precisionAtK =
    precisionDenominator > 0 ? precisionNumerator / precisionDenominator : 0;
  const precisionAtKRequested =
    precisionDenominatorRequested > 0
      ? precisionNumerator / precisionDenominatorRequested
      : 0;
  const precisionAtKEffective =
    precisionEffectiveDenominator > 0
      ? precisionEffectiveNumerator / precisionEffectiveDenominator
      : 0;
  const top1HitRate = retrievalCases > 0 ? top1HitCount / retrievalCases : 0;
  const top1WrongDocRate =
    retrievalCases > 0 ? top1WrongCount / retrievalCases : 0;
  const topKContaminationRate =
    retrievalCases > 0 ? topKContaminationCount / retrievalCases : 0;
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
    evaluationMode: mode,
    dataset: {
      docs: DOCS.length,
      queries: CASES.length,
      retrievalQueries: retrievalCases,
      topK: TOP_K,
    },
    metrics: {
      precisionAtKRequestedEstimate: round(precisionAtKRequested),
      precisionAtKEstimate: round(precisionAtK),
      precisionAtKEffectiveEstimate: round(precisionAtKEffective),
      top1HitRateEstimate: round(top1HitRate),
      top1WrongDocRateEstimate: round(top1WrongDocRate),
      topKContaminationRateEstimate: round(topKContaminationRate),
      wrongDocRateEstimate: round(topKContaminationRate),
      rewriteUsefulness: {
        triggeredCases: rewriteTriggeredCases,
        usefulCases: rewriteUsefulCases,
        neutralOrNegativeCases: rewriteNeutralOrNegativeCases,
        harmfulCases: rewriteHarmfulCases,
        top1ImprovedCases: rewriteTop1ImprovedCases,
        precisionImprovedCases: rewritePrecisionImprovedCases,
        contaminationReducedCases: rewriteContaminationReducedCases,
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
      rewriteByDomain: Array.from(rewriteByDomain.entries())
        .map(([domain, stats]) => ({
          domain,
          queries: stats.queries,
          triggeredCases: stats.triggeredCases,
          usefulCases: stats.usefulCases,
          neutralOrNegativeCases: stats.neutralOrNegativeCases,
          harmfulCases: stats.harmfulCases,
          triggerRate:
            stats.queries > 0 ? round(stats.triggeredCases / stats.queries) : 0,
          usefulnessRate:
            stats.triggeredCases > 0
              ? round(stats.usefulCases / stats.triggeredCases)
              : 0,
        }))
        .sort((a, b) => a.domain.localeCompare(b.domain)),
    },
    banks:
      mode === "real_banks"
        ? {
            loadedCount: runtimeLoadedBankIds.length,
            loadedIdsSample: runtimeLoadedBankIds.slice(0, 25),
          }
        : {
            loadedCount: 0,
            loadedIdsSample: [],
          },
    queryDiagnostics,
  };

  return report;
}

async function main() {
  const mode = parseEvalModeArg(process.argv.slice(2));
  const report = await runRetrievalEval(mode);
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  void main().catch((error) => {
    console.error("[retrieval_eval] failed:", error);
    process.exitCode = 1;
  });
}
