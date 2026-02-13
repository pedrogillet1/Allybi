import { describe, expect, test } from "@jest/globals";
import ExcelJS from "exceljs";
import { XlsxFileEditorService } from "./xlsxFileEditor.service";

async function buildWorkbookBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell("A1").value = "Product";
  ws.getCell("B1").value = "Revenue";
  ws.getCell("A2").value = "Laptop Pro";
  ws.getCell("B2").value = 245000;
  ws.getCell("A3").value = "Tablet Air";
  ws.getCell("B3").value = 182000;
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

describe("XlsxFileEditorService computeOps", () => {
  test("creates table from selected range in-place", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        {
          kind: "create_table",
          rangeA1: "Sheet1!A1:B3",
          hasHeader: true,
          name: "RevenueTable",
        },
      ],
    });

    const edited = await svc.computeOps(input, payload);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet("Sheet1");
    const tables = ((ws as any)?.model?.tables || []) as Array<{ name?: string }>;

    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBeGreaterThan(0);
    expect(String(tables[0]?.name || "")).toContain("RevenueTable");
  });

  test("rejects chart creation in local XLSX fallback to avoid false success", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        {
          kind: "create_chart",
          type: "COLUMN",
          range: "Sheet1!A1:B3",
          title: "Revenue by Product",
        },
      ],
    });

    await expect(svc.computeOps(input, payload)).rejects.toThrow("CHART_ENGINE_UNAVAILABLE");
  });

  test("sorts a selected range by numeric column ascending", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        {
          kind: "sort_range",
          rangeA1: "Sheet1!A1:B3",
          hasHeader: true,
          sortSpecs: [{ column: "B", order: "ASC" }],
        },
      ],
    });

    const edited = await svc.computeOps(input, payload);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet("Sheet1");
    expect(ws.getCell("A2").value).toBe("Tablet Air");
    expect(ws.getCell("B2").value).toBe(182000);
    expect(ws.getCell("A3").value).toBe("Laptop Pro");
    expect(ws.getCell("B3").value).toBe(245000);
  });

  test("applies number format and auto-filter on a range", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        { kind: "set_number_format", rangeA1: "Sheet1!B2:B3", pattern: "#,##0" },
        { kind: "filter_range", rangeA1: "Sheet1!A1:B3" },
      ],
    });

    const edited = await svc.computeOps(input, payload);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet("Sheet1");
    expect(ws.getCell("B2").numFmt).toBe("#,##0");
    expect((ws as any).autoFilter).toBeDefined();
  });

  test("sets list data validation for a selected range", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        {
          kind: "set_data_validation",
          rangeA1: "Sheet1!A2:A3",
          rule: { type: "ONE_OF_LIST", values: ["Approved", "Pending"] },
        },
      ],
    });

    const edited = await svc.computeOps(input, payload);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet("Sheet1");
    const dv = (ws.getCell("A2") as any).dataValidation;
    expect(dv).toBeDefined();
    expect(String(dv?.type || "").toLowerCase()).toBe("list");
  });

  test("applies format_range font styling including font family", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        {
          kind: "format_range",
          rangeA1: "Sheet1!A2:B2",
          format: {
            bold: true,
            italic: true,
            fontFamily: "Times New Roman",
            fontSizePt: 14,
            color: "#2563EB",
          },
        },
      ],
    });

    const edited = await svc.computeOps(input, payload);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet("Sheet1");
    const fontA2 = (ws.getCell("A2").font || {}) as any;
    expect(fontA2.bold).toBe(true);
    expect(fontA2.italic).toBe(true);
    expect(fontA2.name).toBe("Times New Roman");
    expect(fontA2.size).toBe(14);
    expect(fontA2.color?.argb).toBe("FF2563EB");
  });

  test("broadcasts scalar set_values across full target range", async () => {
    const svc = new XlsxFileEditorService();
    const input = await buildWorkbookBuffer();
    const payload = JSON.stringify({
      ops: [
        {
          kind: "set_values",
          rangeA1: "Sheet1!A2:B3",
          values: [[0]],
        },
      ],
    });

    const edited = await svc.computeOps(input, payload);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(edited);
    const ws = wb.getWorksheet("Sheet1");
    expect(ws.getCell("A2").value).toBe(0);
    expect(ws.getCell("B2").value).toBe(0);
    expect(ws.getCell("A3").value).toBe(0);
    expect(ws.getCell("B3").value).toBe(0);
  }, 15000);
});
