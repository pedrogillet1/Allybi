import * as XLSX from "xlsx";
import { extractXlsxWithAnchors } from "../xlsxExtractor.service";

function buildWorkbookBuffer(rows: Array<Array<string | number>>): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

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

  it("keeps structured facts for rows beyond text rendering limits", async () => {
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
    expect(result.text).toContain(
      "... omitted 120 middle rows for compact output ...",
    );
    expect(result.text).toContain('Row 520: "Item 520" | "520"');
  });
});
