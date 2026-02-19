import type { SpreadsheetModel, TableModel } from "./spreadsheetModel.types";

export function upsertTable(model: SpreadsheetModel, table: TableModel): void {
  const list = Array.isArray(model.tables) ? model.tables : [];
  const key = `${table.sheetName}|${table.range}`.toLowerCase();
  const filtered = list.filter(
    (item) => `${item.sheetName}|${item.range}`.toLowerCase() !== key,
  );
  model.tables = [...filtered, table];
}
