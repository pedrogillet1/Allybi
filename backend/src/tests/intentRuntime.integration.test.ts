import { describe, it, expect, beforeAll } from "vitest";
import { analyzeMessageToPlan, clearCaches } from "../services/editing/intentRuntime";
import type { IntentPlan, ClarificationNeeded } from "../services/editing/intentRuntime";
import * as fs from "fs";
import * as path from "path";

interface GoldenTestCase {
  id: string;
  input: string;
  context: { domain: "excel" | "docx"; sheetName?: string; selection?: unknown; language?: "en" | "pt" };
  expected: { intentIds: string[]; plan: Array<{ op: string }>; clarificationRequired: boolean };
  pairId?: string;
}

function loadTestCases(file: string): GoldenTestCase[] {
  const filePath = path.join(__dirname, "intent_cases", file);
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(raw?.cases) ? raw.cases : [];
}

describe("intentRuntime integration", () => {
  beforeAll(() => { clearCaches(); });

  const files = ["excel.en.json", "excel.pt.json", "docx.en.json", "docx.pt.json"];

  for (const file of files) {
    const cases = loadTestCases(file);
    if (cases.length === 0) continue;

    describe(file, () => {
      for (const tc of cases) {
        it(`${tc.id}: ${tc.input.slice(0, 60)}`, () => {
          const domain = tc.context.domain === "docx" ? "docx" : "excel";
          const result = analyzeMessageToPlan({
            message: tc.input,
            domain,
            viewerContext: { selection: tc.context.selection, sheetName: tc.context.sheetName },
            language: tc.context.language as "en" | "pt" | undefined,
          });

          if (tc.expected.clarificationRequired) {
            expect(result).not.toBeNull();
            expect(result!.kind).toBe("clarification");
            return;
          }

          expect(result).not.toBeNull();
          expect(result!.kind).toBe("plan");
          const plan = result as IntentPlan;
          const actualOps = plan.ops.map(o => o.op);
          const expectedOps = tc.expected.plan.map(p => p.op);

          // Every expected op should appear in actual
          for (const expectedOp of expectedOps) {
            expect(actualOps).toContain(expectedOp);
          }
        });
      }
    });
  }

  describe("EN/PT parity", () => {
    it("should have matching operator coverage between EN and PT for Excel", () => {
      const en = loadTestCases("excel.en.json");
      const pt = loadTestCases("excel.pt.json");
      const enOps = new Set(en.flatMap(tc => tc.expected.plan.map(p => p.op)));
      const ptOps = new Set(pt.flatMap(tc => tc.expected.plan.map(p => p.op)));
      for (const op of enOps) { expect(ptOps).toContain(op); }
    });

    it("should have matching operator coverage between EN and PT for DOCX", () => {
      const en = loadTestCases("docx.en.json");
      const pt = loadTestCases("docx.pt.json");
      const enOps = new Set(en.flatMap(tc => tc.expected.plan.map(p => p.op)));
      const ptOps = new Set(pt.flatMap(tc => tc.expected.plan.map(p => p.op)));
      for (const op of enOps) { expect(ptOps).toContain(op); }
    });
  });

  describe("specific scenarios from spec", () => {
    it("should handle: In SUMMARY 1!D35:D48, set every cell to 0", () => {
      const result = analyzeMessageToPlan({
        message: "In SUMMARY 1!D35:D48, set every cell to 0",
        domain: "excel",
        viewerContext: { sheetName: "SUMMARY 1" },
        language: "en",
      });
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("plan");
      const plan = result as IntentPlan;
      expect(plan.ops.some(o => o.op === "XLSX_SET_RANGE_VALUES")).toBe(true);
    });

    it("should handle PT: Na faixa SUMMARY 1!D35:D48, defina todas as células como 0", () => {
      const result = analyzeMessageToPlan({
        message: "Na faixa SUMMARY 1!D35:D48, defina todas as células como 0",
        domain: "excel",
        viewerContext: { sheetName: "SUMMARY 1" },
        language: "pt",
      });
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("plan");
    });

    it("should handle multi-intent: convert + format + bold", () => {
      const result = analyzeMessageToPlan({
        message: "Convert SUMMARY 1!D35:D48 to numeric values, then apply currency format $#,##0.00 and bold",
        domain: "excel",
        viewerContext: { sheetName: "SUMMARY 1" },
        language: "en",
      });
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("plan");
      const plan = result as IntentPlan;
      expect(plan.ops.length).toBeGreaterThanOrEqual(2);
    });
  });
});
