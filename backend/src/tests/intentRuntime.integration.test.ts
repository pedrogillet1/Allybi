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

  // ---------------------------------------------------------------------------
  // Structural editing integration tests
  // ---------------------------------------------------------------------------

  test("EN 'add bullets to paragraphs' produces LIST_APPLY_BULLETS", () => {
    const result = analyzeMessageToPlan({
      message: "Add bullets to paragraphs 2-4",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [
            { paragraphId: "docx:p:2", text: "Para 2" },
            { paragraphId: "docx:p:3", text: "Para 3" },
            { paragraphId: "docx:p:4", text: "Para 4" },
          ],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const ops = result.ops.map((o) => o.op);
    expect(ops).toContain("DOCX_LIST_APPLY_BULLETS");
  });

  test("EN 'remove bullets from the list' produces LIST_REMOVE", () => {
    const result = analyzeMessageToPlan({
      message: "Remove bullets from the list",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [
            { paragraphId: "docx:p:5", text: "Bullet A" },
            { paragraphId: "docx:p:6", text: "Bullet B" },
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
  });

  test("EN 'center the title' produces SET_ALIGNMENT", () => {
    const result = analyzeMessageToPlan({
      message: "Center the title",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [{ paragraphId: "docx:p:1", text: "My Title" }],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const ops = result.ops.map((o) => o.op);
    expect(ops).toContain("DOCX_SET_ALIGNMENT");
    const alignStep = result.ops.find((o) => o.op === "DOCX_SET_ALIGNMENT");
    expect(alignStep?.params?.alignment).toBe("center");
  });

  test("EN 'make it uppercase' produces SET_TEXT_CASE", () => {
    const result = analyzeMessageToPlan({
      message: "Make it uppercase",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [{ paragraphId: "docx:p:10", text: "some text" }],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const ops = result.ops.map((o) => o.op);
    expect(ops).toContain("DOCX_SET_TEXT_CASE");
    const caseStep = result.ops.find((o) => o.op === "DOCX_SET_TEXT_CASE");
    expect(caseStep?.params?.targetCase).toBe("uppercase");
  });

  test("EN 'delete paragraph 3' produces DELETE_PARAGRAPH", () => {
    const result = analyzeMessageToPlan({
      message: "Delete paragraph 3",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [{ paragraphId: "docx:p:3", text: "To be deleted" }],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const ops = result.ops.map((o) => o.op);
    expect(ops).toContain("DOCX_DELETE_PARAGRAPH");
  });

  test("EN 'split this paragraph after the first sentence' produces SPLIT_PARAGRAPH", () => {
    const result = analyzeMessageToPlan({
      message: "Split this paragraph after the first sentence",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [{ paragraphId: "docx:p:7", text: "First sentence. Second sentence." }],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    const ops = result.ops.map((o) => o.op);
    expect(ops).toContain("DOCX_SPLIT_PARAGRAPH");
  });

  test("plan steps include uiMeta with label and icon", () => {
    const result = analyzeMessageToPlan({
      message: "Bold the selected text",
      domain: "docx",
      viewerContext: {
        selection: {
          ranges: [{ paragraphId: "docx:p:1", text: "Hello" }],
        },
      },
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("plan");
    if (result?.kind !== "plan") return;
    expect(result.ops.length).toBeGreaterThan(0);
    for (const step of result.ops) {
      expect(step.uiMeta).toBeDefined();
      expect(step.uiMeta?.label).toBeTruthy();
      expect(["format", "structure", "content"]).toContain(step.uiMeta?.icon);
    }
  });
});

