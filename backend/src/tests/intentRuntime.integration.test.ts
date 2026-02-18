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

  test("EN 'convert bullets to paragraphs' produces LIST_REMOVE + MERGE_PARAGRAPHS", () => {
    const result = analyzeMessageToPlan({
      message: "Convert bullets to paragraphs",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [
            { paragraphId: "docx:p:10", text: "Bullet A" },
            { paragraphId: "docx:p:11", text: "Bullet B" },
          ],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const ops = result.ops.map((o) => o.op);
    expect(ops).toContain("DOCX_LIST_REMOVE");
    expect(ops).toContain("DOCX_MERGE_PARAGRAPHS");
  });

  test("EN 'merge these paragraphs' resolves targetIds (not literal $targets)", () => {
    const result = analyzeMessageToPlan({
      message: "Merge these paragraphs",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [
            { paragraphId: "docx:p:20", text: "Para A" },
            { paragraphId: "docx:p:21", text: "Para B" },
          ],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const mergeStep = result.ops.find((o) => o.op === "DOCX_MERGE_PARAGRAPHS");
    expect(mergeStep).toBeTruthy();
    const targetIds = mergeStep?.params?.targetIds;
    // targetIds should not be the literal string "$targets"
    expect(targetIds).not.toBe("$targets");
    expect(targetIds).not.toEqual(["$targets"]);
  });

  test("PT heading set produces 'Heading 2' with space", () => {
    const result = analyzeMessageToPlan({
      message: "Aplique título 2",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [{ paragraphId: "docx:p:30", text: "Some heading" }],
        },
      },
      language: "pt",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const styleStep = result.ops.find((o) => o.op === "DOCX_SET_PARAGRAPH_STYLE");
    expect(styleStep).toBeTruthy();
    expect(styleStep?.params?.styleName).toBe("Heading 2");
  });
});

