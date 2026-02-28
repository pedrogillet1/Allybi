/**
 * Excel Semantic Classification Tests.
 *
 * Verifies that the intent runtime correctly classifies compute-related
 * messages to the expected operator IDs. These operators live in the
 * python_calc intent pattern banks and are loaded alongside the excel
 * patterns by the intentRuntime loader.
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import {
  analyzeMessageToPlan,
  clearCaches,
} from "../../services/editing/intentRuntime";
import type {
  IntentPlan,
  ClarificationNeeded,
} from "../../services/editing/intentRuntime";

type PlanResult = IntentPlan | ClarificationNeeded | null;

function isPlan(r: PlanResult): r is IntentPlan {
  return r !== null && r.kind === "plan";
}

function isClarification(r: PlanResult): r is ClarificationNeeded {
  return r !== null && r.kind === "clarification";
}

beforeEach(() => {
  clearCaches();
});

describe("Excel Semantic Classification", () => {
  const semanticCases: Array<{
    message: string;
    expectedOp: string;
  }> = [
    { message: "forecast next quarter sales", expectedOp: "XLSX_FORECAST" },
    { message: "clean up the missing values", expectedOp: "XLSX_CLEAN_DATA" },
    { message: "deduplicate the data", expectedOp: "XLSX_DEDUPE" },
    { message: "find outliers in revenue", expectedOp: "XLSX_ANOMALY_DETECT" },
    { message: "run a regression on the data", expectedOp: "XLSX_REGRESSION" },
    { message: "create a pivot table by region", expectedOp: "XLSX_PIVOT" },
    { message: "cluster these customers", expectedOp: "XLSX_CLUSTERING" },
    { message: "explain this formula", expectedOp: "XLSX_EXPLAIN_FORMULA" },
  ];

  for (const c of semanticCases) {
    test(`"${c.message}" classifies to ${c.expectedOp}`, () => {
      const plan = analyzeMessageToPlan({
        message: c.message,
        domain: "excel",
        viewerContext: {},
        language: "en",
      });

      // Plan should exist
      expect(plan).not.toBeNull();

      if (isPlan(plan)) {
        // Extract all operator IDs from plan steps
        const ops = plan.ops.map((s) => s.op);
        expect(ops).toContain(c.expectedOp);
      } else if (isClarification(plan)) {
        // If the plan requires clarification, the partial ops should reference the operator
        const partialOps = plan.partialOps.map((s) => s.op);
        expect(partialOps).toContain(c.expectedOp);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Structural operators (from core excel pattern bank)
  // -----------------------------------------------------------------------

  const structuralCases: Array<{
    message: string;
    expectedOp: string;
  }> = [
    {
      message: "sort A1:D100 by date descending",
      expectedOp: "XLSX_SORT_RANGE",
    },
    { message: "insert 3 rows above", expectedOp: "XLSX_INSERT_ROWS" },
    { message: "merge cells A1 to D1", expectedOp: "XLSX_MERGE_CELLS" },
    { message: "freeze the top row", expectedOp: "XLSX_FREEZE_PANES" },
    { message: "create a bar chart", expectedOp: "XLSX_CHART_CREATE" },
  ];

  for (const c of structuralCases) {
    test(`"${c.message}" classifies to ${c.expectedOp}`, () => {
      const plan = analyzeMessageToPlan({
        message: c.message,
        domain: "excel",
        viewerContext: {},
        language: "en",
      });

      expect(plan).not.toBeNull();

      if (isPlan(plan)) {
        const ops = plan.ops.map((s) => s.op);
        expect(ops).toContain(c.expectedOp);
      } else if (isClarification(plan)) {
        const partialOps = plan.partialOps.map((s) => s.op);
        expect(partialOps).toContain(c.expectedOp);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Negative: gibberish should not classify to any known compute operator
  // -----------------------------------------------------------------------

  test("gibberish does not produce any compute operator", () => {
    const plan = analyzeMessageToPlan({
      message: "flubberwocky zingbat",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    expect(plan).toBeNull();
  });
});
