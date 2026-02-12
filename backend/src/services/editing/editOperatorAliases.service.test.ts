import { describe, expect, test } from "@jest/globals";
import { normalizeEditOperator } from "./editOperatorAliases.service";

describe("normalizeEditOperator", () => {
  test("keeps canonical operators unchanged", () => {
    const out = normalizeEditOperator("EDIT_PARAGRAPH", {
      domain: "docx",
      instruction: "rewrite this paragraph",
    });
    expect(out.operator).toBe("EDIT_PARAGRAPH");
    expect(out.strictActionAlias).toBeNull();
  });

  test("maps strict plan alias to sheets chart/table-aware default operator", () => {
    const outChart = normalizeEditOperator("edit.plan", {
      domain: "sheets",
      instruction: "create a chart with the selected range",
    });
    expect(outChart.operator).toBe("CREATE_CHART");
    expect(outChart.strictActionAlias).toBe("plan");

    const outTable = normalizeEditOperator("edit.plan", {
      domain: "sheets",
      instruction: "create a table using these selected cells",
    });
    expect(outTable.operator).toBe("COMPUTE_BUNDLE");

    const outSort = normalizeEditOperator("edit.plan", {
      domain: "sheets",
      instruction: "sort this table by column E descending",
    });
    expect(outSort.operator).toBe("COMPUTE_BUNDLE");
  });

  test("maps strict apply/undo aliases", () => {
    const apply = normalizeEditOperator("edit.apply", {
      domain: "docx",
      instruction: "apply this",
    });
    expect(apply.strictActionAlias).toBe("apply");
    expect(apply.operator).toBe("EDIT_PARAGRAPH");

    const undo = normalizeEditOperator("edit.undo", {
      domain: "docx",
      instruction: "undo",
    });
    expect(undo.strictActionAlias).toBe("undo");
    expect(undo.operator).toBe("EDIT_PARAGRAPH");
  });

  test("maps non-canonical sheets operator ids to canonical operators", () => {
    const chart = normalizeEditOperator("sheets.create_chart_from_range", {
      domain: "sheets",
      instruction: "create a bubble chart from selected range",
    });
    expect(chart.operator).toBe("CREATE_CHART");

    const conditional = normalizeEditOperator("sheets.apply_conditional_format", {
      domain: "sheets",
      instruction: "highlight values below zero",
    });
    expect(conditional.operator).toBe("COMPUTE_BUNDLE");

    const sort = normalizeEditOperator("sheets.sort_filter_dedup", {
      domain: "sheets",
      instruction: "sort this table",
    });
    expect(sort.operator).toBe("COMPUTE_BUNDLE");
  });
});
