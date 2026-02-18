import { describe, expect, test } from "@jest/globals";
import { extractChartDataFromRange } from "./spreadsheetModel.charts";
import { cellKey } from "./spreadsheetModel.range";
import type { SpreadsheetModel } from "./spreadsheetModel.types";

function model(): SpreadsheetModel {
  return {
    version: 1,
    workbook: { locale: "en-US" },
    styles: {},
    sheets: [
      {
        id: "s1",
        name: "SUMMARY1",
        grid: { maxRow: 12, maxCol: 8 },
        cells: {
          [cellKey(5, 3)]: { v: "Capex/Cabin", t: "s" },
          [cellKey(6, 3)]: { v: "Bison", t: "s" },
          [cellKey(7, 3)]: { v: "Ridgetop", t: "s" },
          [cellKey(5, 7)]: { v: "Return on Cost", t: "s" },
          [cellKey(6, 7)]: { v: 0.37, t: "n" },
          [cellKey(7, 7)]: { v: 0.24, t: "n" },
        },
      },
    ],
    charts: [],
    tables: [],
    namedRanges: [],
    meta: { source: "xlsx_import", buildHash: "x" },
  };
}

describe("spreadsheetModel charts", () => {
  test("extracts chart data from label/value split ranges", () => {
    const chart = extractChartDataFromRange({
      model: model(),
      sheetName: "SUMMARY1",
      range: "SUMMARY1!C5:C7",
      spec: {
        type: "BAR",
        settings: {
          labelRange: "SUMMARY1!C5:C7",
          valueRange: "SUMMARY1!G5:G7",
        },
      },
    });

    expect(chart.series.length).toBe(1);
    expect(chart.series[0]?.name).toBe("Return on Cost");
    expect(chart.categories).toEqual(["Bison", "Ridgetop"]);
    expect(chart.series[0]?.values).toEqual([0.37, 0.24]);
  });
});
