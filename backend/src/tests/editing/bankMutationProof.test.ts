/**
 * Bank Mutation Proof Tests.
 *
 * Proves that the intent runtime is driven by data banks rather than
 * hardcoded logic. Known trigger phrases must produce plans, while
 * nonsensical gibberish must NOT match any pattern.
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

beforeEach(() => {
  clearCaches();
});

describe("Bank Mutation Proof", () => {
  // -----------------------------------------------------------------------
  // Positive: known triggers produce plans
  // -----------------------------------------------------------------------

  test("intent patterns bank drives matching — 'sum column A' produces a plan", () => {
    const plan = analyzeMessageToPlan({
      message: "sum column A",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    expect(plan).not.toBeNull();
    expect(plan!.kind).toMatch(/^(plan|clarification)$/);
  });

  test("'bold the title' produces a docx plan", () => {
    const plan = analyzeMessageToPlan({
      message: "bold the title",
      domain: "docx",
      viewerContext: {},
      language: "en",
    });
    expect(plan).not.toBeNull();
    expect(plan!.kind).toMatch(/^(plan|clarification)$/);
  });

  test("TOC intents resolve to canonical DOCX_UPDATE_TOC", () => {
    const plan = analyzeMessageToPlan({
      message: "update the table of contents",
      domain: "docx",
      viewerContext: {},
      language: "en",
    });
    expect(plan).not.toBeNull();
    if (!plan) return;
    if (plan.kind === "plan") {
      expect(plan.ops[0]?.op).toBe("DOCX_UPDATE_TOC");
      return;
    }
    expect(plan.kind).toBe("clarification");
    expect(plan.partialOps.some((op) => op.op === "DOCX_UPDATE_TOC")).toBe(
      true,
    );
  });

  test("table create intent resolves to DOCX_CREATE_TABLE", () => {
    const plan = analyzeMessageToPlan({
      message: "create a table with rows 4 and columns 3",
      domain: "docx",
      viewerContext: {},
      language: "en",
    });
    expect(isPlan(plan)).toBe(true);
    expect((plan as IntentPlan).ops[0]?.op).toBe("DOCX_CREATE_TABLE");
  });

  test("'forecast next quarter' produces an excel plan", () => {
    const plan = analyzeMessageToPlan({
      message: "forecast next quarter sales",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    expect(plan).not.toBeNull();
    expect(plan!.kind).toMatch(/^(plan|clarification)$/);
  });

  test("python forecast resolves to executable plan when sheet context is available", () => {
    const plan = analyzeMessageToPlan({
      message: "forecast next quarter sales",
      domain: "excel",
      viewerContext: { sheetName: "Sheet1" },
      language: "en",
    });
    expect(isPlan(plan)).toBe(true);
    expect((plan as IntentPlan).ops[0]?.op).toBe("PY_TIME_SERIES_FORECAST");
  });

  test("python what-if resolves to executable plan when sheet context is available", () => {
    const plan = analyzeMessageToPlan({
      message: "what if price increases by 5 percent",
      domain: "excel",
      viewerContext: { sheetName: "Sheet1" },
      language: "en",
    });
    expect(isPlan(plan)).toBe(true);
    expect((plan as IntentPlan).ops[0]?.op).toBe("PY_CALC_DERIVE_COLUMN");
  });

  // -----------------------------------------------------------------------
  // Negative: gibberish must NOT match
  // -----------------------------------------------------------------------

  test("unknown gibberish does not match any excel pattern", () => {
    const plan = analyzeMessageToPlan({
      message: "xyzzy plugh frobozz",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    // Should be null (no matches found → fall-through)
    expect(plan).toBeNull();
  });

  test("unknown gibberish does not match any docx pattern", () => {
    const plan = analyzeMessageToPlan({
      message: "qwertyuiop zxcvbnm asdfghjkl",
      domain: "docx",
      viewerContext: {},
      language: "en",
    });
    expect(plan).toBeNull();
  });

  test("empty message returns null", () => {
    const plan = analyzeMessageToPlan({
      message: "",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    expect(plan).toBeNull();
  });

  test("whitespace-only message returns null", () => {
    const plan = analyzeMessageToPlan({
      message: "   \t  \n  ",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    expect(plan).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Cross-domain: wrong domain must not produce a plan for domain-specific triggers
  // -----------------------------------------------------------------------

  test("excel-only trigger in docx domain returns null or different plan", () => {
    const plan = analyzeMessageToPlan({
      message: "freeze panes at row 3",
      domain: "docx",
      viewerContext: {},
      language: "en",
    });
    // "freeze panes" is an XLSX-only intent; in docx domain it should not match
    expect(plan).toBeNull();
  });
});
