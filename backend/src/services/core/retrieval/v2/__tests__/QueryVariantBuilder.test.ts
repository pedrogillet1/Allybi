import { describe, expect, test } from "@jest/globals";

import {
  buildQueryVariants,
  buildDocTypeBoostPlan,
} from "../QueryVariantBuilder.service";

import type {
  RetrievalQueryVariant,
  DocTypeBoostPlan,
} from "../../retrieval.types";
import type { QueryVariant } from "../../../../retrieval/document_intelligence/ruleInterpreter";
import type { DocumentIntelligenceDomain } from "../../../banks/documentIntelligenceBanks.service";

// ── Helpers ─────────────────────────────────────────────────────────

function makeDefaultBuildOpts(
  overrides: Partial<Parameters<typeof buildQueryVariants>[0]> = {},
): Parameters<typeof buildQueryVariants>[0] {
  return {
    baseQuery: overrides.baseQuery ?? "test query",
    expandedQueries: overrides.expandedQueries ?? [],
    rewriteVariants: overrides.rewriteVariants ?? [],
    plannerQueryVariants: overrides.plannerQueryVariants ?? [],
    requiredTerms: overrides.requiredTerms ?? [],
    maxVariants: overrides.maxVariants ?? 6,
  };
}

function makeQueryVariant(
  overrides: Partial<QueryVariant> = {},
): QueryVariant {
  return {
    text: overrides.text ?? "rewritten query",
    weight: overrides.weight ?? 1.0,
    sourceRuleId: overrides.sourceRuleId ?? "rule-1",
    reason: overrides.reason ?? "test rewrite",
  };
}

// ── buildQueryVariants ──────────────────────────────────────────────

describe("buildQueryVariants", () => {
  test("always includes base query as first variant with weight 1", () => {
    const opts = makeDefaultBuildOpts({ baseQuery: "what is revenue" });

    const result = buildQueryVariants(opts);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toEqual({
      text: "what is revenue",
      weight: 1,
      sourceRuleId: "base_query",
      reason: "normalized query",
    });
  });

  test("returns only base query when no expansions or variants", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "simple query",
      expandedQueries: [],
      rewriteVariants: [],
      plannerQueryVariants: [],
      requiredTerms: [],
    });

    const result = buildQueryVariants(opts);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("simple query");
  });

  test("includes synonym expansion variants with weight 0.85", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "roi analysis",
      expandedQueries: ["return on investment analysis"],
    });

    const result = buildQueryVariants(opts);

    const expansionVariant = result.find(
      (v) => v.text === "return on investment analysis",
    );
    expect(expansionVariant).toBeDefined();
    expect(expansionVariant!.weight).toBe(0.85);
    expect(expansionVariant!.reason).toBe("synonym expansion");
  });

  test("includes planner variants with weight 0.95", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "quarterly earnings",
      plannerQueryVariants: ["q4 earnings report"],
    });

    const result = buildQueryVariants(opts);

    const plannerVariant = result.find(
      (v) => v.text === "q4 earnings report",
    );
    expect(plannerVariant).toBeDefined();
    expect(plannerVariant!.weight).toBe(0.95);
    expect(plannerVariant!.reason).toBe("retrieval planner variant");
  });

  test("includes required term variants with weight 0.72", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "financial summary",
      requiredTerms: ["ebitda"],
    });

    const result = buildQueryVariants(opts);

    const termVariant = result.find((v) => v.text === "ebitda");
    expect(termVariant).toBeDefined();
    expect(termVariant!.weight).toBe(0.72);
    expect(termVariant!.reason).toBe("required term hint");
  });

  test("includes rewrite variants with clamped weights", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "contract terms",
      rewriteVariants: [
        makeQueryVariant({ text: "agreement clauses", weight: 2.5 }),
      ],
    });

    const result = buildQueryVariants(opts);

    const rewriteVariant = result.find(
      (v) => v.text === "agreement clauses",
    );
    expect(rewriteVariant).toBeDefined();
    expect(rewriteVariant!.weight).toBe(2.5);
  });

  test("clamps rewrite weight to minimum of 0.1", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "test",
      rewriteVariants: [
        makeQueryVariant({ text: "low weight variant", weight: 0.01 }),
      ],
    });

    const result = buildQueryVariants(opts);

    const rewriteVariant = result.find(
      (v) => v.text === "low weight variant",
    );
    expect(rewriteVariant).toBeDefined();
    expect(rewriteVariant!.weight).toBe(0.1);
  });

  test("clamps rewrite weight to maximum of 3", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "test",
      rewriteVariants: [
        makeQueryVariant({ text: "high weight variant", weight: 10 }),
      ],
    });

    const result = buildQueryVariants(opts);

    const rewriteVariant = result.find(
      (v) => v.text === "high weight variant",
    );
    expect(rewriteVariant).toBeDefined();
    expect(rewriteVariant!.weight).toBe(3);
  });

  test("deduplicates variants by lowercased text", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "revenue",
      expandedQueries: ["INCOME"],
      plannerQueryVariants: ["income"],
    });

    const result = buildQueryVariants(opts);

    const incomeVariants = result.filter((v) => v.text === "income");
    expect(incomeVariants).toHaveLength(1);
  });

  test("excludes expansion variants that match the base query", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "test query",
      expandedQueries: ["test query", "different query"],
    });

    const result = buildQueryVariants(opts);

    // base query appears once (as base), "different query" appears once
    expect(result).toHaveLength(2);
    expect(result[0].sourceRuleId).toBe("base_query");
    expect(result[1].text).toBe("different query");
  });

  test("sorts extras by weight descending before dedup", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "base",
      expandedQueries: ["expansion a"],   // weight 0.85
      plannerQueryVariants: ["planner b"], // weight 0.95
      requiredTerms: ["term c"],          // weight 0.72
    });

    const result = buildQueryVariants(opts);

    // After base (weight 1), order should be: planner (0.95) > expansion (0.85) > term (0.72)
    const nonBase = result.slice(1);
    for (let i = 0; i < nonBase.length - 1; i++) {
      expect(nonBase[i].weight).toBeGreaterThanOrEqual(nonBase[i + 1].weight);
    }
  });

  test("caps total variants at maxVariants", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "base",
      expandedQueries: ["exp-1", "exp-2", "exp-3"],
      plannerQueryVariants: ["plan-1", "plan-2"],
      requiredTerms: ["term-1", "term-2"],
      maxVariants: 3,
    });

    const result = buildQueryVariants(opts);

    expect(result).toHaveLength(3);
    expect(result[0].sourceRuleId).toBe("base_query");
  });

  test("maxVariants of 0 falls back to default 6 due to falsy guard", () => {
    // When maxVariants is 0, `opts.maxVariants || 6` evaluates to 6
    // because 0 is falsy in JS — so it behaves like the default cap.
    const opts = makeDefaultBuildOpts({
      baseQuery: "base",
      expandedQueries: ["exp-1"],
      maxVariants: 0,
    });

    const result = buildQueryVariants(opts);

    // 0 is falsy so falls back to 6 — base + exp-1 = 2
    expect(result).toHaveLength(2);
    expect(result[0].sourceRuleId).toBe("base_query");
  });

  test("maxVariants of 1 allows base plus one extra (cap checked after push)", () => {
    // The base query is unconditionally added. The loop then pushes one
    // extra and checks `out.length >= maxVariants` (1), which triggers
    // the break — so we get base + 1 = 2 total.
    const opts = makeDefaultBuildOpts({
      baseQuery: "base",
      expandedQueries: ["exp-1", "exp-2"],
      maxVariants: 1,
    });

    const result = buildQueryVariants(opts);

    expect(result).toHaveLength(2);
    expect(result[0].sourceRuleId).toBe("base_query");
    expect(result[1].text).toBe("exp-1");
  });

  test("handles empty strings in expanded queries", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "test",
      expandedQueries: ["", "  ", "valid expansion"],
    });

    const result = buildQueryVariants(opts);

    const texts = result.map((v) => v.text);
    expect(texts).toContain("valid expansion");
    expect(texts).not.toContain("");
  });

  test("handles all sources combined", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "balance sheet analysis",
      expandedQueries: ["balance sheet review"],
      rewriteVariants: [
        makeQueryVariant({
          text: "financial statement analysis",
          weight: 1.5,
          sourceRuleId: "rewrite-fin",
        }),
      ],
      plannerQueryVariants: ["balance sheet breakdown"],
      requiredTerms: ["assets liabilities"],
      maxVariants: 6,
    });

    const result = buildQueryVariants(opts);

    expect(result[0].text).toBe("balance sheet analysis");
    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBeLessThanOrEqual(6);

    // All texts should be unique
    const texts = result.map((v) => v.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test("lowercases all variant texts", () => {
    const opts = makeDefaultBuildOpts({
      baseQuery: "base",
      expandedQueries: ["UPPER CASE QUERY"],
      plannerQueryVariants: ["Mixed Case Query"],
    });

    const result = buildQueryVariants(opts);

    for (const variant of result.slice(1)) {
      expect(variant.text).toBe(variant.text.toLowerCase());
    }
  });
});

// ── buildDocTypeBoostPlan ───────────────────────────────────────────

describe("buildDocTypeBoostPlan", () => {
  const domain: DocumentIntelligenceDomain = "finance";

  test("returns null for empty docTypeId", () => {
    const banks = {};

    const result = buildDocTypeBoostPlan(domain, "", banks);

    expect(result).toBeNull();
  });

  test("returns null for whitespace-only docTypeId", () => {
    const banks = {};

    const result = buildDocTypeBoostPlan(domain, "   ", banks);

    expect(result).toBeNull();
  });

  test("returns plan with empty anchors when banks have no methods", () => {
    const banks = {};

    const result = buildDocTypeBoostPlan(domain, "invoice", banks);

    expect(result).not.toBeNull();
    expect(result!.domain).toBe("finance");
    expect(result!.docTypeId).toBe("invoice");
    expect(result!.sectionAnchors).toEqual([]);
    expect(result!.tableAnchors).toEqual([]);
    expect(result!.reasons).toEqual([
      "doc_type_sections:0",
      "doc_type_tables:0",
    ]);
  });

  test("extracts section anchors from banks", () => {
    const banks = {
      getDocTypeSections: (_domain: DocumentIntelligenceDomain, _docType: string) => ({
        sections: [
          {
            id: "header",
            name: { en: "Header Section", pt: "Cabecalho" },
            order: 1,
          },
          {
            id: "items",
            name: { en: "Line Items", pt: "Itens" },
            order: 2,
          },
        ],
      }),
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "invoice", banks);

    expect(result).not.toBeNull();
    expect(result!.sectionAnchors).toContain("header");
    expect(result!.sectionAnchors).toContain("header section");
    expect(result!.sectionAnchors).toContain("cabecalho");
    expect(result!.sectionAnchors).toContain("items");
    expect(result!.sectionAnchors).toContain("line items");
    expect(result!.sectionAnchors).toContain("itens");
  });

  test("orders section anchors by section order field", () => {
    const banks = {
      getDocTypeSections: () => ({
        sections: [
          { id: "footer", name: { en: "Footer", pt: "" }, order: 3 },
          { id: "header", name: { en: "Header", pt: "" }, order: 1 },
          { id: "body", name: { en: "Body", pt: "" }, order: 2 },
        ],
      }),
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "contract", banks);

    expect(result).not.toBeNull();
    // header (order 1) anchors come before body (order 2) which come before footer (order 3)
    const headerIdx = result!.sectionAnchors.indexOf("header");
    const bodyIdx = result!.sectionAnchors.indexOf("body");
    const footerIdx = result!.sectionAnchors.indexOf("footer");
    expect(headerIdx).toBeLessThan(bodyIdx);
    expect(bodyIdx).toBeLessThan(footerIdx);
  });

  test("extracts table anchors from tableHeaderMappings", () => {
    const banks = {
      getDocTypeSections: () => null,
      getDocTypeTables: () => ({
        tableHeaderMappings: [
          {
            canonicalHeader: "Total Amount",
            synonyms: ["Grand Total", "Sum"],
          },
        ],
        tables: [],
      }),
    };

    const result = buildDocTypeBoostPlan(domain, "invoice", banks);

    expect(result).not.toBeNull();
    expect(result!.tableAnchors).toContain("total amount");
    expect(result!.tableAnchors).toContain("grand total");
    expect(result!.tableAnchors).toContain("sum");
  });

  test("extracts table anchors from tables array", () => {
    const banks = {
      getDocTypeSections: () => null,
      getDocTypeTables: () => ({
        tableHeaderMappings: [],
        tables: [
          {
            id: "revenue_table",
            name: { en: "Revenue Table", pt: "Tabela de Receita" },
            expectedColumns: ["Q1", "Q2", "Q3", "Q4"],
          },
        ],
      }),
    };

    const result = buildDocTypeBoostPlan(domain, "income_statement", banks);

    expect(result).not.toBeNull();
    expect(result!.tableAnchors).toContain("revenue_table");
    expect(result!.tableAnchors).toContain("revenue table");
    expect(result!.tableAnchors).toContain("tabela de receita");
    expect(result!.tableAnchors).toContain("q1");
    expect(result!.tableAnchors).toContain("q4");
  });

  test("deduplicates section anchors", () => {
    const banks = {
      getDocTypeSections: () => ({
        sections: [
          { id: "summary", name: { en: "Summary", pt: "summary" }, order: 1 },
        ],
      }),
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "report", banks);

    expect(result).not.toBeNull();
    // "summary" appears as both id and en and pt — should be deduped
    const summaryCount = result!.sectionAnchors.filter(
      (a) => a === "summary",
    ).length;
    expect(summaryCount).toBe(1);
  });

  test("deduplicates table anchors", () => {
    const banks = {
      getDocTypeSections: () => null,
      getDocTypeTables: () => ({
        tableHeaderMappings: [
          { canonicalHeader: "Amount", synonyms: ["amount", "Amount"] },
        ],
        tables: [],
      }),
    };

    const result = buildDocTypeBoostPlan(domain, "invoice", banks);

    expect(result).not.toBeNull();
    const amountCount = result!.tableAnchors.filter(
      (a) => a === "amount",
    ).length;
    expect(amountCount).toBe(1);
  });

  test("caps section anchors at 16", () => {
    const manySections = Array.from({ length: 25 }, (_, i) => ({
      id: `section-${i}`,
      name: { en: `Section ${i}`, pt: `Secao ${i}` },
      order: i,
    }));

    const banks = {
      getDocTypeSections: () => ({ sections: manySections }),
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "large_doc", banks);

    expect(result).not.toBeNull();
    expect(result!.sectionAnchors.length).toBeLessThanOrEqual(16);
  });

  test("caps table anchors at 16", () => {
    const manyMappings = Array.from({ length: 25 }, (_, i) => ({
      canonicalHeader: `Header ${i}`,
      synonyms: [],
    }));

    const banks = {
      getDocTypeSections: () => null,
      getDocTypeTables: () => ({
        tableHeaderMappings: manyMappings,
        tables: [],
      }),
    };

    const result = buildDocTypeBoostPlan(domain, "wide_table_doc", banks);

    expect(result).not.toBeNull();
    expect(result!.tableAnchors.length).toBeLessThanOrEqual(16);
  });

  test("normalizes docTypeId to lowercase", () => {
    const banks = {};

    const result = buildDocTypeBoostPlan(domain, "INVOICE", banks);

    expect(result).not.toBeNull();
    expect(result!.docTypeId).toBe("invoice");
  });

  test("generates reasons array with anchor counts", () => {
    const banks = {
      getDocTypeSections: () => ({
        sections: [
          { id: "s1", name: { en: "Sec 1", pt: "" }, order: 1 },
        ],
      }),
      getDocTypeTables: () => ({
        tableHeaderMappings: [
          { canonicalHeader: "Col A", synonyms: [] },
        ],
        tables: [],
      }),
    };

    const result = buildDocTypeBoostPlan(domain, "report", banks);

    expect(result).not.toBeNull();
    expect(result!.reasons).toHaveLength(2);
    expect(result!.reasons[0]).toMatch(/^doc_type_sections:\d+$/);
    expect(result!.reasons[1]).toMatch(/^doc_type_tables:\d+$/);
  });

  test("handles getDocTypeSections returning null gracefully", () => {
    const banks = {
      getDocTypeSections: () => null,
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "memo", banks);

    expect(result).not.toBeNull();
    expect(result!.sectionAnchors).toEqual([]);
    expect(result!.tableAnchors).toEqual([]);
  });

  test("handles sections bank with missing sections array", () => {
    const banks = {
      getDocTypeSections: () => ({ otherField: true }),
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "memo", banks);

    expect(result).not.toBeNull();
    expect(result!.sectionAnchors).toEqual([]);
  });

  test("handles tables bank with missing arrays", () => {
    const banks = {
      getDocTypeSections: () => null,
      getDocTypeTables: () => ({ otherField: true }),
    };

    const result = buildDocTypeBoostPlan(domain, "memo", banks);

    expect(result).not.toBeNull();
    expect(result!.tableAnchors).toEqual([]);
  });

  test("filters out empty string anchors from sections", () => {
    const banks = {
      getDocTypeSections: () => ({
        sections: [
          { id: "", name: { en: "", pt: "" }, order: 1 },
          { id: "valid", name: { en: "Valid", pt: "" }, order: 2 },
        ],
      }),
      getDocTypeTables: () => null,
    };

    const result = buildDocTypeBoostPlan(domain, "doc", banks);

    expect(result).not.toBeNull();
    expect(result!.sectionAnchors).toContain("valid");
    expect(result!.sectionAnchors).not.toContain("");
  });
});
