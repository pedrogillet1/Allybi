import { describe, expect, test } from "@jest/globals";
import type { XlsxExtractionResult } from "./extractionResult.types";

describe("XlsxExtractionResult cellFacts type", () => {
  test("cellFacts support scaleFactor and footnotes fields", () => {
    const result: XlsxExtractionResult = {
      sourceType: "xlsx",
      text: "test",
      wordCount: 1,
      confidence: 1,
      sheetCount: 1,
      sheets: [{ sheetName: "Sheet1", textContent: "test" }],
      cellFacts: [
        {
          sheet: "Sheet1",
          cell: "B2",
          rowLabel: "Revenue",
          colHeader: "Q1",
          value: "1250",
          displayValue: "1,250",
          scaleFactor: "thousands",
          footnotes: ["(1) Restated"],
        },
      ],
    };
    expect(result.cellFacts![0].scaleFactor).toBe("thousands");
    expect(result.cellFacts![0].footnotes).toEqual(["(1) Restated"]);
  });
});
