import { describe, expect, test } from "@jest/globals";

import { RetrievalPlanParserService } from "./retrievalPlanParser.service";

describe("RetrievalPlanParserService", () => {
  const parser = new RetrievalPlanParserService();

  test("parses strict JSON plan and normalizes deterministic fields", () => {
    const plan = parser.parse(
      JSON.stringify({
        schemaVersion: "koda_retrieval_plan_v1",
        queryVariants: ["  Revenue by Vendor ", "revenue by vendor"],
        requiredTerms: ["CapEx", "capex", "  EBITDA "],
        excludedTerms: ["draft", "Draft"],
        entities: ["Q4 2025"],
        metrics: ["Gross Margin"],
        timeHints: ["FY2025"],
        docTypePreferences: ["Budget_Report", "budget_report"],
        locationTargets: [
          { type: "sheet", value: "Summary" },
          "cell|B12",
          { type: "sheet", value: "Summary" },
        ],
        confidenceNotes: ["likely monthly table"],
      }),
    );

    expect(plan.queryVariants).toEqual(["revenue by vendor"]);
    expect(plan.requiredTerms).toEqual(["capex", "ebitda"]);
    expect(plan.excludedTerms).toEqual(["draft"]);
    expect(plan.docTypePreferences).toEqual(["budget_report"]);
    expect(plan.locationTargets).toEqual([
      { type: "sheet", value: "Summary" },
      { type: "cell", value: "B12" },
    ]);
  });

  test("accepts fenced JSON while keeping strict object parsing", () => {
    const raw = [
      "```json",
      JSON.stringify({
        schemaVersion: "koda_retrieval_plan_v1",
        queryVariants: ["cash flow statement"],
      }),
      "```",
    ].join("\n");

    const plan = parser.parse(raw);
    expect(plan.schemaVersion).toBe("koda_retrieval_plan_v1");
    expect(plan.queryVariants).toEqual(["cash flow statement"]);
  });

  test("rejects non-JSON output", () => {
    expect(() =>
      parser.parse("queryVariants:\n- revenue\nrequiredTerms:\n- capex"),
    ).toThrow();
  });

  test("rejects unknown top-level fields", () => {
    expect(() =>
      parser.parse(
        JSON.stringify({
          schemaVersion: "koda_retrieval_plan_v1",
          queryVariants: ["revenue"],
          debug: true,
        }),
      ),
    ).toThrow();
  });
});
