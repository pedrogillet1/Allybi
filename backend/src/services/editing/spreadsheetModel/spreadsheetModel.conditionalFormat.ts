import type {
  ConditionalFormatRule,
  SheetModel,
} from "./spreadsheetModel.types";

export function setConditionalFormat(
  sheet: SheetModel,
  range: string,
  rule: ConditionalFormatRule,
): void {
  const list = Array.isArray(sheet.conditionalFormats)
    ? sheet.conditionalFormats
    : [];
  const key = `${range}|${String(rule.type || "")}`.toLowerCase();
  const filtered = list.filter(
    (item) =>
      `${item.range}|${String(item.rule?.type || "")}`.toLowerCase() !== key,
  );
  sheet.conditionalFormats = [...filtered, { range, rule }];
}
