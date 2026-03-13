import { describe, expect, test } from "@jest/globals";

import { RetrievalEngineService } from "./retrievalEngine.service";

function makeService(overrides: Record<string, unknown> = {}) {
  const bankLoader = {
    getBank<T = unknown>(bankId: string): T {
      const banks: Record<string, unknown> = {
        semantic_search_config: { phases: [] },
        retrieval_ranker_config: {},
        diversification_rules: {},
        retrieval_negatives: { config: { enabled: false } },
        evidence_packaging: {},
        headings_map: {
          headings: [
            {
              canonical: "income_statement",
              synonyms: {
                en: ["Income Statement"],
                pt: ["Demonstracao de Resultado"],
              },
              domainTags: ["finance"],
            },
          ],
        },
        table_header_ontology_finance: {
          headers: [
            {
              canonical: "revenue",
              synonyms: ["revenue", "net revenue", "receita"],
            },
          ],
        },
        ...overrides,
      };
      const value = banks[bankId];
      if (value == null) {
        throw new Error(`missing bank ${bankId}`);
      }
      return value as T;
    },
  };

  const semanticBanks = {
    getCrossDocGroundingPolicy() {
      return null;
    },
    getDocumentIntelligenceDomains() {
      return ["finance", "legal"];
    },
    getDomainDetectionRules(domain: string) {
      if (domain !== "finance") return { rules: [] };
      return {
        rules: [
          {
            id: "finance_word",
            patterns: ["revenue", "cash flow"],
            weight: 1,
          },
        ],
      };
    },
    getDiDomains() {
      return [
        { id: "finance", label: "Finance", labelPt: "Financas" },
        { id: "legal", label: "Legal", labelPt: "Juridico" },
      ];
    },
    getDiDocTypes() {
      return [
        {
          id: "fin_income_statement",
          domainId: "finance",
          label: "Income Statement",
          labelPt: "Demonstracao de Resultado",
          aliases: {
            en: ["income statement", "p&l"],
            pt: ["dre"],
          },
          packRefs: {
            sections: ["sec_summary"],
            tables: ["statement_table"],
          },
        },
      ];
    },
    getDiSections() {
      return [
        {
          id: "sec_summary",
          label: "Summary",
          labelPt: "Resumo",
          headerVariants: {
            en: ["summary", "executive summary"],
            pt: ["resumo"],
          },
          domains: ["finance"],
        },
      ];
    },
    getDiMetrics() {
      return [
        {
          id: "metric_revenue",
          domain: "finance",
          unitId: "usd",
          label: "Revenue",
          labelPt: "Receita",
          aliases: {
            en: ["revenue", "net revenue"],
            pt: ["receita"],
          },
          typicalTableHeaders: {
            en: ["revenue"],
            pt: ["receita"],
          },
        },
      ];
    },
    getDiUnits() {
      return [
        {
          id: "usd",
          familyId: "currency",
          label: "US Dollar",
          labelPt: "Dolar",
          symbols: ["$", "usd"],
          aliases: {
            en: ["usd", "dollar"],
            pt: ["dolar"],
          },
        },
        {
          id: "percent",
          familyId: "percentage",
          label: "Percent",
          labelPt: "Percentual",
          symbols: ["%"],
          aliases: {
            en: ["percent"],
            pt: ["percentual"],
          },
        },
      ];
    },
    getFieldRoleOntology() {
      return {
        roles: [
          {
            id: "owner",
            entityRoleId: "owner",
            exactAnchors: {
              en: ["owner", "property owner"],
              pt: ["proprietario"],
            },
            semanticAliases: {
              en: ["landlord"],
              pt: ["locador"],
            },
          },
          {
            id: "signatory",
            entityRoleId: "signatory",
            exactAnchors: {
              en: ["signatory"],
              pt: ["signatario"],
            },
            semanticAliases: {
              en: ["signed by"],
              pt: ["assinado por"],
            },
          },
        ],
      };
    },
    getDocTypeCatalog() {
      return { docTypes: [] };
    },
    getDocTypeSections() {
      return { sections: [] };
    },
    getDocTypeTables() {
      return { tables: [], tableHeaderMappings: [] };
    },
    getRetrievalBoostRules() {
      return null;
    },
    getQueryRewriteRules() {
      return null;
    },
    getSectionPriorityRules() {
      return null;
    },
  };

  return new RetrievalEngineService(
    bankLoader as any,
    { listDocs: async () => [], getDocMeta: async () => null } as any,
    { search: async () => [] } as any,
    { search: async () => [] } as any,
    { search: async () => [] } as any,
    undefined,
    semanticBanks as any,
  );
}

describe("RetrievalEngineService semantic banks", () => {
  test("classifies domain and doc type from semantic ontologies", () => {
    const service = makeService() as any;

    const result = service.classifyDocumentContext({
      query: "Show the income statement revenue",
      normalizedQuery: "show the income statement revenue",
      hintedDomain: null,
      explicitDocTypes: [],
      explicitDocDomains: [],
    });

    expect(result.domain).toBe("finance");
    expect(result.docTypeId).toBe("fin_income_statement");
    expect(result.reasons).toContain("doc_type_ontology:income statement");
  });

  test("builds section anchors from semantic sections and headings map", () => {
    const service = makeService() as any;

    const plan = service.buildDocTypeBoostPlan("finance", "fin_income_statement");

    expect(plan.sectionAnchors).toContain("sec_summary");
    expect(plan.sectionAnchors).toContain("summary");
    expect(plan.sectionAnchors).toContain("income_statement");
  });

  test("interprets table headers through shared table-header ontology", () => {
    const service = makeService() as any;

    const anchors = service.lookupSemanticTableAnchorsForDocType(
      "finance",
      "fin_income_statement",
    );

    expect(anchors).toContain("revenue");
    expect(anchors).toContain("statement_table");
  });

  test("matches field roles exactly from field-role ontology", () => {
    const service = makeService() as any;

    const owner = service.matchFieldRole("who is the property owner", "en");
    const signatory = service.matchFieldRole("who signed by this party", "en");

    expect(owner.roleId).toBe("owner");
    expect(owner.entityRoleId).toBe("owner");
    expect(signatory.roleId).toBe("signatory");
  });

  test("normalizes metric and unit from semantic ontologies", () => {
    const service = makeService() as any;

    const normalized = service.normalizeMetricAndUnit(
      "Revenue was $125 this month",
      "finance",
    );

    expect(normalized.metricId).toBe("metric_revenue");
    expect(normalized.unitId).toBe("usd");
  });
});
