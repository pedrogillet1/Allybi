import { describe, expect, test } from "@jest/globals";
import { ExcelSourceOfTruthService } from "./excelSourceOfTruth.service";

describe("ExcelSourceOfTruthService", () => {
  const service = new ExcelSourceOfTruthService();

  test("maps set range values to compute set_values", () => {
    const result = service.toComputeOps({
      message: "In SUMMARY 1!D35:D48, set every cell to 0",
      language: "en",
      viewerSheetName: "SUMMARY 1",
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.ops.length).toBeGreaterThan(0);
    expect(result.ops[0]?.kind).toBe("set_values");
    expect(result.ops[0]?.rangeA1).toBe("SUMMARY 1!D35:D48");
  });

  test("maps formula target cell correctly", () => {
    const result = service.toComputeOps({
      message: "Set formula =SUM(D5:D8) in D9",
      language: "en",
      viewerSheetName: "SUMMARY 1",
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    const formulaOp = result.ops.find((op) => op.kind === "set_formula");
    expect(formulaOp).toBeTruthy();
    expect(String(formulaOp?.a1 || "").toUpperCase()).toContain("D9");
  });

  test("returns unsupported when runtime op is not compute-mappable", () => {
    const result = service.toComputeOps({
      message: "Convert SUMMARY 1!D35:D48 to numeric values",
      language: "en",
      viewerSheetName: "SUMMARY 1",
    });

    // numeric conversion currently needs workbook-aware path and should fall back to legacy branch
    expect(["unsupported", "none"]).toContain(result.kind);
  });

  test("maps semantic row+metric write without explicit selection", () => {
    const result = service.toComputeOps({
      message: "For Ranch Hall, set Return on Cost to 27%",
      language: "en",
      viewerSheetName: "SUMMARY 1",
      cellFacts: [
        {
          sheet: "SUMMARY 1",
          cell: "C8",
          rowLabel: "Ranch Hall",
          colHeader: "Project",
        },
        {
          sheet: "SUMMARY 1",
          cell: "G8",
          rowLabel: "Ranch Hall",
          colHeader: "Return on Cost",
        },
      ],
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.ops[0]?.kind).toBe("set_values");
    expect(result.ops[0]?.rangeA1).toBe("SUMMARY 1!G8:G8");
    expect((result.ops[0] as any)?.values?.[0]?.[0]).toBe(0.27);
  });

  test("maps semantic metric formatting without explicit range", () => {
    const result = service.toComputeOps({
      message: "Format Return on Cost as percentage",
      language: "en",
      viewerSheetName: "SUMMARY 1",
      cellFacts: [
        { sheet: "SUMMARY 1", cell: "G5", rowLabel: "Bison Lodge", colHeader: "Return on Cost" },
        { sheet: "SUMMARY 1", cell: "G6", rowLabel: "Ridgetop", colHeader: "Return on Cost" },
        { sheet: "SUMMARY 1", cell: "G7", rowLabel: "Douglas Fir", colHeader: "Return on Cost" },
        { sheet: "SUMMARY 1", cell: "G8", rowLabel: "Ranch Hall", colHeader: "Return on Cost" },
      ],
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.ops[0]?.kind).toBe("set_number_format");
    expect(result.ops[0]?.rangeA1).toBe("SUMMARY 1!G5:G8");
  });

  test("format command does not degrade into set_values", () => {
    const result = service.toComputeOps({
      message: "Format F5:F20 as currency with zero decimals, keep existing values unchanged.",
      language: "en",
      viewerSheetName: "SUMMARY1",
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.ops[0]?.kind).toBe("set_number_format");
    expect(result.ops[0]?.rangeA1).toBe("SUMMARY1!F5:F20");
    expect((result.ops[0] as any)?.pattern).toBe("$#,##0");
  });

  test("insert row natural language is mapped without requiring selected cell range", () => {
    const result = service.toComputeOps({
      message: "Insert 1 row at SUMMARY1 row 9 and preserve nearby formatting",
      language: "en",
      viewerSheetName: "SUMMARY1",
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.ops[0]?.kind).toBe("insert_rows");
    expect((result.ops[0] as any)?.sheetName).toBe("SUMMARY1");
    expect((result.ops[0] as any)?.startIndex).toBe(8);
    expect((result.ops[0] as any)?.count).toBe(1);
  });

  test("chart intent with two ranges maps to create_chart spec with label/value ranges", () => {
    const result = service.toComputeOps({
      message: "Create a bar chart from SUMMARY1!C5:C12 and G5:G12 titled Return on Cost by Item",
      language: "en",
      viewerSheetName: "SUMMARY1",
    });

    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    expect(result.ops[0]?.kind).toBe("create_chart");
    expect((result.ops[0] as any)?.rangeA1).toBe("SUMMARY1!C5:C12");
    expect(((result.ops[0] as any)?.spec || {}).labelRange).toBe("SUMMARY1!C5:C12");
    expect(((result.ops[0] as any)?.spec || {}).valueRange).toBe("SUMMARY1!G5:G12");
  });
});
