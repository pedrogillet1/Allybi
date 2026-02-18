import type { SheetModel, ValidationRule } from "./spreadsheetModel.types";

export function setValidationRule(sheet: SheetModel, range: string, rule: ValidationRule): void {
  const list = Array.isArray(sheet.validations) ? sheet.validations : [];
  const key = range.toLowerCase();
  const filtered = list.filter((item) => String(item.range || "").toLowerCase() !== key);
  sheet.validations = [...filtered, { range, rule }];
}

export function clearValidationRule(sheet: SheetModel, range: string): void {
  const list = Array.isArray(sheet.validations) ? sheet.validations : [];
  const key = range.toLowerCase();
  sheet.validations = list.filter((item) => String(item.range || "").toLowerCase() !== key);
}
