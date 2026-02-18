import type { SheetModel } from "./spreadsheetModel.types";

export function setAutoFilterRange(sheet: SheetModel, range: string): void {
  sheet.grid.autoFilterRange = range;
}

export function clearAutoFilterRange(sheet: SheetModel): void {
  delete sheet.grid.autoFilterRange;
}
