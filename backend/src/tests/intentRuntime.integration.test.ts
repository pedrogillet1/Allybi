import { describe, expect, test, beforeAll } from "@jest/globals";
import { analyzeMessageToPlan, clearCaches } from "../services/editing/intentRuntime";

describe("intentRuntime integration (critical editing paths)", () => {
  beforeAll(() => {
    clearCaches();
  });

  test("classifies EN multi-intent excel edit chain", () => {
    const result = analyzeMessageToPlan({
      message:
        "Convert SUMMARY 1!D35:D48 to numeric values, then apply currency format $#,##0.00 and bold",
      domain: "excel",
      viewerContext: { sheetName: "SUMMARY 1" },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    const ops = result && result.kind === "plan" ? result.ops.map((o) => o.op) : [];
    expect(ops.length).toBeGreaterThanOrEqual(2);
    expect(ops).toContain("XLSX_SET_RANGE_VALUES");
  });

  test("classifies PT bullet list to paragraph conversion", () => {
    const result = analyzeMessageToPlan({
      message:
        "Transforme todos os bullets selecionados em um único parágrafo, mantendo exatamente o mesmo conteúdo.",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [
            { paragraphId: "docx:p:1", text: "Item A" },
            { paragraphId: "docx:p:2", text: "Item B" },
          ],
        },
      },
      language: "pt",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    const ops = result && result.kind === "plan" ? result.ops.map((o) => o.op) : [];
    expect(ops.some((op) => op.startsWith("DOCX_LIST_"))).toBe(true);
  });

  test("parses explicit formula target cell", () => {
    const result = analyzeMessageToPlan({
      message: "Set formula =SUM(D5:D8) in D9",
      domain: "excel",
      viewerContext: {},
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const op = result.ops.find((step) => step.op === "XLSX_SET_CELL_FORMULA");
    expect(op).toBeTruthy();
    expect(String(op?.params?.rangeA1 || "").toUpperCase()).toContain("D9");
  });
});

