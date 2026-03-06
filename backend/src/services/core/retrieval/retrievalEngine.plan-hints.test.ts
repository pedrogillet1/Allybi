import { describe, expect, test } from "@jest/globals";

import {
  RetrievalEngineService,
  type RetrievalRequest,
} from "./retrievalEngine.service";

function buildBanks() {
  return {
    getBank<T = unknown>(bankId: string): T {
      const banks: Record<string, unknown> = {
        semantic_search_config: {
          config: {
            queryExpansionPolicy: { enabled: false },
            hybridPhases: [
              { id: "phase_semantic", type: "semantic", enabled: true, k: 8 },
            ],
          },
        },
        retrieval_ranker_config: {
          config: {
            weights: {
              semantic: 0.8,
              lexical: 0,
              structural: 0,
              titleBoost: 0.1,
              documentIntelligenceBoost: 0,
              routingPriorityBoost: 0,
              typeBoost: 0.05,
              recencyBoost: 0.05,
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
            actionsContract: { thresholds: { minRelevanceScore: 0 } },
          },
        },
        diversification_rules: {
          config: {
            enabled: false,
            actionsContract: {
              thresholds: {
                maxPerDocHard: 4,
                maxTotalChunksHard: 12,
                maxNearDuplicatesPerDoc: 2,
                nearDuplicateWindowChars: 120,
              },
            },
          },
        },
        evidence_packaging: {
          config: {
            actionsContract: {
              thresholds: {
                maxEvidenceItemsHard: 8,
                maxEvidencePerDocHard: 4,
                minFinalScore: 0,
              },
            },
          },
        },
        keyword_boost_rules: { config: { enabled: false }, rules: [] },
        doc_title_boost_rules: { config: { enabled: false }, rules: [] },
        doc_type_boost_rules: { config: { enabled: false }, rules: [] },
        recency_boost_rules: { config: { enabled: false }, rules: [] },
        routing_priority: { config: { enabled: false } },
      };
      const value = banks[bankId];
      if (!value) throw new Error(`missing bank: ${bankId}`);
      return value as T;
    },
  };
}

function buildDocumentIntelligenceBanks() {
  return {
    getCrossDocGroundingPolicy() {
      return { config: { enabled: false }, retrievalPolicy: {}, rules: [] };
    },
    getDocumentIntelligenceDomains() {
      return { domains: [] };
    },
    getDocTypeCatalog() {
      return { docTypes: [] };
    },
    getDocTypeSections() {
      return { sections: [] };
    },
    getDocTypeTables() {
      return { tables: [], headerMappings: [] };
    },
    getDomainDetectionRules() {
      return { config: {}, rules: [] };
    },
    getRetrievalBoostRules() {
      return { config: {}, rules: [] };
    },
    getQueryRewriteRules() {
      return { config: { maxRewriteTerms: 10 }, rules: [] };
    },
    getSectionPriorityRules() {
      return { priorities: [] };
    },
  };
}

function buildRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    query: "show budget details",
    env: "dev",
    signals: {
      intentFamily: "documents",
      operator: "extract",
      allowExpansion: false,
    },
    ...overrides,
  };
}

describe("RetrievalEngineService retrieval-plan integration", () => {
  test("includes planner query variants and required terms as real query variants", async () => {
    const semanticQueries: string[] = [];
    const engine = new RetrievalEngineService(
      buildBanks() as any,
      {
        async listDocs() {
          return [{ docId: "doc-1", title: "Budget", filename: "budget.xlsx" }];
        },
        async getDocMeta() {
          return null;
        },
      } as any,
      {
        async search(opts: { query: string; k: number }) {
          semanticQueries.push(opts.query);
          return [
            {
              docId: "doc-1",
              title: "Budget",
              filename: "budget.xlsx",
              snippet: "Budget baseline",
              location: { page: 1, sectionKey: "summary" },
              score: 0.9,
              chunkId: `${opts.query}:semantic`,
            },
          ].slice(0, opts.k);
        },
      } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      undefined,
      buildDocumentIntelligenceBanks() as any,
    );

    await engine.retrieve(
      buildRequest({
        query: "show ap aging",
        retrievalPlan: {
          schemaVersion: "koda_retrieval_plan_v1",
          queryVariants: ["accounts payable aging report"],
          requiredTerms: ["vendor aging"],
        },
      }),
    );

    expect(semanticQueries).toContain("show ap aging");
    expect(semanticQueries).toContain("accounts payable aging report");
    expect(semanticQueries).toContain("vendor aging");
  });

  test("applies required and excluded terms as bounded ranking hints", async () => {
    const engine = new RetrievalEngineService(
      buildBanks() as any,
      {
        async listDocs() {
          return [
            { docId: "doc-good", title: "Final Budget", filename: "budget.xlsx" },
            {
              docId: "doc-bad",
              title: "Draft Budget",
              filename: "budget_draft.xlsx",
            },
          ];
        },
        async getDocMeta() {
          return null;
        },
      } as any,
      {
        async search() {
          return [
            {
              docId: "doc-good",
              title: "Final Budget",
              filename: "budget.xlsx",
              snippet: "CapEx approved in the final budget.",
              location: { page: 1, sectionKey: "capex" },
              score: 0.8,
              chunkId: "good",
            },
            {
              docId: "doc-bad",
              title: "Draft Budget",
              filename: "budget_draft.xlsx",
              snippet: "Draft budget still pending review.",
              location: { page: 1, sectionKey: "summary" },
              score: 0.8,
              chunkId: "bad",
            },
          ];
        },
      } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      undefined,
      buildDocumentIntelligenceBanks() as any,
    );

    const pack = await engine.retrieve(
      buildRequest({
        retrievalPlan: {
          schemaVersion: "koda_retrieval_plan_v1",
          requiredTerms: ["capex"],
          excludedTerms: ["draft"],
        },
      }),
    );

    expect(pack.evidence.length).toBeGreaterThan(0);
    expect(pack.evidence[0]?.docId).toBe("doc-good");
  });

  test("merges extraction hints with domain entity schema hints", () => {
    const engine = new RetrievalEngineService(
      buildBanks() as any,
      {
        async listDocs() {
          return [];
        },
        async getDocMeta() {
          return null;
        },
      } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      undefined,
      {
        ...buildDocumentIntelligenceBanks(),
        getDocTypeExtractionHints() {
          return {
            hints: [{ id: "policy_number", hint: "Policy number field" }],
          };
        },
        getDomainEntitySchema() {
          return {
            entities: [
              {
                id: "deductible_amount",
                description: "Deductible amount",
                required: false,
              },
            ],
          };
        },
      } as any,
    );

    const hints = (engine as any).lookupExtractionHints(
      "insurance",
      "ins_policy_document",
    );
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.some((hint: any) => String(hint.id) === "policy_number")).toBe(
      true,
    );
    expect(
      hints.some(
        (hint: any) =>
          String(hint.id) === "deductible_amount" &&
          String(hint.source) === "entity_schema",
      ),
    ).toBe(true);
  });

  test("normalizes malformed detection patterns in doc type classification", () => {
    const engine = new RetrievalEngineService(
      buildBanks() as any,
      {
        async listDocs() {
          return [];
        },
        async getDocMeta() {
          return null;
        },
      } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      undefined,
      {
        ...buildDocumentIntelligenceBanks(),
        getDocTypeCatalog(domain: string) {
          if (domain !== "banking") return { docTypes: [] };
          return {
            docTypes: [
              {
                id: "banking_wire_transfer_confirmation",
                detectionPatterns: [
                  "\\bwire\\\\s\\+transfer\\\\s\\+confirmation\\b",
                  "\\btransfer\\\\s\\+confirmation\\b",
                ],
                priority: 95,
              },
            ],
          };
        },
      } as any,
    );

    const result = (engine as any).classifyDocTypeForDomain(
      "banking",
      "show wire transfer confirmation details",
    );
    expect(result?.docTypeId).toBe("banking_wire_transfer_confirmation");
  });

  test("buildDocTypeBoostPlan uses requiredHeaders, tableHeaderSynonyms and table ontology anchors", () => {
    const engine = new RetrievalEngineService(
      buildBanks() as any,
      {
        async listDocs() {
          return [];
        },
        async getDocMeta() {
          return null;
        },
      } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      { async search() { return []; } } as any,
      undefined,
      {
        ...buildDocumentIntelligenceBanks(),
        getDocTypeSections() {
          return {
            sections: [
              {
                id: "summary",
                order: 1,
                name: { en: "Summary", pt: "Resumo" },
              },
            ],
          };
        },
        getDocTypeTables() {
          return {
            tableHeaderSynonyms: {
              amount: ["amount", "valor"],
            },
            tables: [
              {
                id: "income_table",
                name: { en: "Income Statement", pt: "Demonstracao de Resultado" },
                requiredHeaders: ["amount", "gross_margin", "period"],
              },
            ],
          };
        },
        getTableHeaderOntology() {
          return {
            headers: [
              {
                canonical: "account_amount",
                synonyms: ["account amount", "valor da conta"],
              },
              {
                canonical: "net_income",
                synonyms: ["net income", "lucro liquido"],
              },
            ],
          };
        },
        getDiOntology(type: string) {
          if (type !== "table") return null;
          return {
            tableFamilies: [
              {
                familyCategory: "statement",
                domains: ["finance"],
                label: "Statement",
                labelPt: "Demonstrativo",
                headerFamilies: {
                  en: ["statement table"],
                  pt: ["tabela de demonstrativo"],
                },
                columnArchetypes: ["period", "amount"],
              },
            ],
          };
        },
      } as any,
    );

    const plan = (engine as any).buildDocTypeBoostPlan(
      "finance",
      "fin_income_statement",
    );

    expect(plan).toBeTruthy();
    expect(plan.tableAnchors).toContain("amount");
    expect(plan.tableAnchors).toContain("gross_margin");
    expect(plan.tableAnchors).toContain("statement");
    expect(plan.tableAnchors.length).toBeGreaterThan(16);
  });
});
