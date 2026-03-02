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
});
