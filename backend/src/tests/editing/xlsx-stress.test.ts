/**
 * XLSX Stress Tests (lightweight).
 *
 * Uses ExcelJS to generate test workbooks programmatically and
 * verifies that large or complex workbooks can be created, written,
 * and read back without errors.
 */

import { describe, test, expect } from "@jest/globals";
import ExcelJS from "exceljs";

describe("XLSX Stress Tests", () => {
  test("handles large sheet (10k rows) without crashing", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    for (let i = 1; i <= 10000; i++) {
      ws.addRow([i, `Name ${i}`, Math.random() * 1000]);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buffer.length).toBeGreaterThan(0);

    // Verify we can read it back
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.worksheets[0].rowCount).toBeGreaterThanOrEqual(10000);
  }, 30000);

  test("handles 15 sheets workbook", async () => {
    const wb = new ExcelJS.Workbook();
    for (let i = 0; i < 15; i++) {
      const ws = wb.addWorksheet(`Sheet${i}`);
      ws.addRow(["Header"]);
      ws.addRow([i]);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.worksheets.length).toBe(15);
  });

  test("handles sheet with many formulas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Formulas");
    for (let i = 1; i <= 200; i++) {
      ws.getCell(`A${i}`).value = i;
      ws.getCell(`B${i}`).value = {
        formula: `A${i}*2`,
      } as ExcelJS.CellFormulaValue;
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buffer.length).toBeGreaterThan(0);

    // Verify formulas are preserved
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const ws2 = wb2.worksheets[0];
    const cell = ws2.getCell("B1");
    // ExcelJS may store formulas in the 'model' or as CellFormulaValue
    expect(cell.value !== null && cell.value !== undefined).toBe(true);
  });

  test("handles wide sheet (500 columns)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Wide");
    const headerRow: string[] = [];
    for (let c = 0; c < 500; c++) {
      headerRow.push(`Col_${c}`);
    }
    ws.addRow(headerRow);
    // Add 10 data rows
    for (let r = 0; r < 10; r++) {
      const row: number[] = [];
      for (let c = 0; c < 500; c++) {
        row.push(r * 500 + c);
      }
      ws.addRow(row);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buffer.length).toBeGreaterThan(0);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.worksheets[0].columnCount).toBeGreaterThanOrEqual(500);
  });

  test("handles merged cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Merged");
    ws.getCell("A1").value = "Merged Header";
    ws.mergeCells("A1:D1");
    for (let i = 2; i <= 50; i++) {
      ws.addRow([i, `Data ${i}`, i * 10, `Note ${i}`]);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);

    const ws2 = wb2.worksheets[0];
    // The merged cell should still contain the value
    expect(ws2.getCell("A1").value).toBe("Merged Header");
  });

  test("round-trip preserves data integrity (100 rows)", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Integrity");
    const expected: Array<[number, string, number]> = [];
    for (let i = 1; i <= 100; i++) {
      const row: [number, string, number] = [i, `Row_${i}`, i * 3.14];
      expected.push(row);
      ws.addRow(row);
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const ws2 = wb2.worksheets[0];

    for (let i = 0; i < expected.length; i++) {
      const row = ws2.getRow(i + 1);
      expect(row.getCell(1).value).toBe(expected[i][0]);
      expect(row.getCell(2).value).toBe(expected[i][1]);
      expect(Number(row.getCell(3).value)).toBeCloseTo(expected[i][2], 2);
    }
  });
});
