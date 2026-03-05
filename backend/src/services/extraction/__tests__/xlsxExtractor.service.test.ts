import * as XLSX from "xlsx";
import { extractXlsxWithAnchors } from "../xlsxExtractor.service";
import { resetMetrics, getMetricsSummary } from "../../ingestion/pipeline/pipelineMetrics.service";

function buildWorkbookBuffer(rows: Array<Array<string | number>>): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

beforeEach(() => {
  resetMetrics();
  delete process.env.XLSX_TEXT_RENDER_MODE;
  delete process.env.XLSX_TEXT_RENDER_ROW_LIMIT;
});

describe("xlsxExtractor structured extraction", () => {
  it("emits cell facts for generic tables without financial/temporal signals", async () => {
    const buffer = buildWorkbookBuffer([
      ["City", "Population"],
      ["Austin", "964177"],
      ["Dallas", "1304379"],
    ]);

    const result = await extractXlsxWithAnchors(buffer);
    const cityFact = result.cellFacts.find(
      (fact: any) =>
        fact.rowLabel === "Austin" &&
        fact.colHeader === "Population" &&
        fact.value === "964177",
    );

    expect(cityFact).toBeDefined();
    expect(result.sheets[0].isFinancial).toBe(false);
    expect(result.sheets[0].hasTemporalColumns).toBe(false);
  });

  it("keeps structured facts and text rows for large sheets", async () => {
    const rows: Array<Array<string | number>> = [["Item", "Value"]];
    for (let i = 1; i <= 520; i++) {
      rows.push([`Item ${i}`, i]);
    }

    const buffer = buildWorkbookBuffer(rows);
    const result = await extractXlsxWithAnchors(buffer);

    const lateRowFact = result.cellFacts.find(
      (fact: any) => fact.rowLabel === "Item 520" && fact.value === "520",
    );
    expect(lateRowFact).toBeDefined();
    expect(result.text).toContain('Row 2: "Item 2" | "2"');
    expect(result.text).toContain('Row 520: "Item 520" | "520"');
  });

  it("does not truncate large sheets or emit truncation metrics", async () => {
    const rows: Array<Array<string | number>> = [["Item", "Value"]];
    for (let i = 1; i <= 500; i++) {
      rows.push([`Item ${i}`, i]);
    }

    const buffer = buildWorkbookBuffer(rows);
    const result = await extractXlsxWithAnchors(buffer);

    expect(result.text).toContain('Row 250: "Item 250" | "250"');
    expect(result.extractionWarnings).toBeUndefined();

    const summary = getMetricsSummary();
    expect(summary.xlsxRowsTruncatedTotal).toBe(0);
  });

  it("truncates only text rendering in adaptive mode while keeping all cellFacts", async () => {
    process.env.XLSX_TEXT_RENDER_MODE = "adaptive";
    process.env.XLSX_TEXT_RENDER_ROW_LIMIT = "80";

    const rows: Array<Array<string | number>> = [["Item", "Value"]];
    for (let i = 1; i <= 500; i++) {
      rows.push([`Item ${i}`, i]);
    }

    const buffer = buildWorkbookBuffer(rows);
    const result = await extractXlsxWithAnchors(buffer);

    const lateFact = result.cellFacts.find(
      (fact: any) => fact.rowLabel === "Item 500" && fact.value === "500",
    );
    expect(lateFact).toBeDefined();
    expect(result.text).not.toContain('Row 300: "Item 300" | "300"');
    expect(result.extractionWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("xlsx_text_rows_truncated"),
      ]),
    );

    const summary = getMetricsSummary();
    expect(summary.xlsxRowsTruncatedTotal).toBeGreaterThan(0);
  });

  it("does NOT emit extractionWarnings for small spreadsheets", async () => {
    const buffer = buildWorkbookBuffer([
      ["City", "Population"],
      ["Austin", "964177"],
      ["Dallas", "1304379"],
    ]);

    const result = await extractXlsxWithAnchors(buffer);
    expect(result.extractionWarnings).toBeUndefined();
  });

  it("backfills merged row labels across merged ranges", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Metric", "2024", "2025"],
      ["Revenue", 100, 120],
      ["", 110, 130],
    ]);
    sheet["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    const result = await extractXlsxWithAnchors(buffer);

    const mergedRowFact = result.cellFacts.find(
      (fact: any) =>
        fact.cell === "B3" &&
        fact.rowLabel === "Revenue" &&
        fact.colHeader === "2024" &&
        fact.value === "110",
    );
    expect(mergedRowFact).toBeDefined();
    expect(result.extractionWarnings?.[0]).toContain(
      "xlsx_merged_cells_backfilled",
    );
  });

  it("backfills merged header cells for consistent colHeader values", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Metric", "FY 2024", ""],
      ["Revenue", 100, 120],
    ]);
    sheet["!merges"] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    const result = await extractXlsxWithAnchors(buffer);
    const mergedHeaderFact = result.cellFacts.find(
      (fact: any) => fact.cell === "C2" && fact.colHeader === "FY 2024",
    );
    expect(mergedHeaderFact).toBeDefined();
  });
});
