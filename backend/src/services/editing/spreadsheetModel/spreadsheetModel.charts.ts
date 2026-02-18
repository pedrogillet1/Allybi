import type { ChartModel, ChartSpec, SpreadsheetModel } from "./spreadsheetModel.types";
import { cellKey, formatRangeA1, parseA1Range } from "./spreadsheetModel.range";

function scalarOf(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

export function extractChartDataFromRange(input: {
  model: SpreadsheetModel;
  sheetName: string;
  range: string;
  spec: ChartSpec;
}): ChartModel {
  const specSettings = input.spec?.settings && typeof input.spec.settings === "object"
    ? (input.spec.settings as Record<string, unknown>)
    : {};
  const labelRangeRaw = typeof specSettings.labelRange === "string" ? specSettings.labelRange : "";
  const valueRangeRaw = typeof specSettings.valueRange === "string" ? specSettings.valueRange : "";

  if (labelRangeRaw && valueRangeRaw) {
    const labelParsed = parseA1Range(labelRangeRaw, input.sheetName);
    const valueParsed = parseA1Range(valueRangeRaw, labelParsed.sheetName);
    const sheet = input.model.sheets.find((s) => s.name === labelParsed.sheetName);
    if (!sheet) throw new Error(`Sheet not found for chart range: ${labelParsed.sheetName}`);

    const categories: Array<string | number | null> = [];
    const seriesValues: Array<string | number | null> = [];
    const headerLabel = scalarOf(sheet.cells[cellKey(labelParsed.start.row, labelParsed.start.col)]?.v);
    const headerValue = scalarOf(sheet.cells[cellKey(valueParsed.start.row, valueParsed.start.col)]?.v);
    const hasHeader =
      typeof headerLabel === "string" &&
      typeof headerValue === "string" &&
      !/^-?[\d,.]+%?$/.test(headerLabel) &&
      !/^-?[\d,.]+%?$/.test(headerValue);

    const labelStart = hasHeader ? labelParsed.start.row + 1 : labelParsed.start.row;
    const valueStart = hasHeader ? valueParsed.start.row + 1 : valueParsed.start.row;
    const count = Math.min(labelParsed.end.row - labelStart + 1, valueParsed.end.row - valueStart + 1);

    for (let i = 0; i < count; i += 1) {
      categories.push(scalarOf(sheet.cells[cellKey(labelStart + i, labelParsed.start.col)]?.v));
      seriesValues.push(scalarOf(sheet.cells[cellKey(valueStart + i, valueParsed.start.col)]?.v));
    }

    const id = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      sheetName: labelParsed.sheetName,
      sourceRange: `${formatRangeA1(labelParsed)},${formatRangeA1(valueParsed)}`,
      locateRange: formatRangeA1(valueParsed),
      spec: {
        ...input.spec,
        type: String(input.spec?.type || "BAR").toUpperCase(),
        range: `${formatRangeA1(labelParsed)},${formatRangeA1(valueParsed)}`,
      },
      categories,
      series: [
        {
          name: typeof headerValue === "string" && headerValue ? headerValue : "Series 1",
          values: seriesValues,
        },
      ],
    };
  }

  const parsed = parseA1Range(input.range, input.sheetName);
  const sheet = input.model.sheets.find((s) => s.name === parsed.sheetName);
  if (!sheet) throw new Error(`Sheet not found for chart range: ${parsed.sheetName}`);

  const headerRow = parsed.start.row;
  const categories: Array<string | number | null> = [];
  const series: Array<{ name: string; values: Array<string | number | null> }> = [];

  for (let c = parsed.start.col + 1; c <= parsed.end.col; c += 1) {
    const headerCell = sheet.cells[cellKey(headerRow, c)];
    const label = headerCell?.v == null ? `Series ${c - parsed.start.col}` : String(headerCell.v);
    series.push({ name: label, values: [] });
  }

  for (let r = headerRow + 1; r <= parsed.end.row; r += 1) {
    const catCell = sheet.cells[cellKey(r, parsed.start.col)];
    categories.push(scalarOf(catCell?.v));
    for (let c = parsed.start.col + 1; c <= parsed.end.col; c += 1) {
      const target = sheet.cells[cellKey(r, c)];
      const idx = c - (parsed.start.col + 1);
      series[idx]?.values.push(scalarOf(target?.v));
    }
  }

  const id = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    sheetName: parsed.sheetName,
    sourceRange: formatRangeA1(parsed),
    locateRange: formatRangeA1(parsed),
    spec: {
      ...input.spec,
      type: String(input.spec?.type || "BAR").toUpperCase(),
      range: formatRangeA1(parsed),
    },
    categories,
    series,
  };
}
