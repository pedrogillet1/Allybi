import type { SemanticIndex, SheetModel, SpreadsheetModel } from "./spreadsheetModel.types";
import { cellKey } from "./spreadsheetModel.range";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function detectHeaderRow(sheet: SheetModel): number | undefined {
  const maxScan = Math.min(sheet.grid.maxRow || 0, 20);
  let bestRow = 0;
  let bestScore = 0;

  for (let r = 1; r <= maxScan; r += 1) {
    let textCount = 0;
    for (let c = 1; c <= Math.min(sheet.grid.maxCol || 0, 40); c += 1) {
      const cell = sheet.cells[cellKey(r, c)];
      const text = toText(cell?.v);
      if (text) textCount += 1;
    }
    if (textCount > bestScore) {
      bestScore = textCount;
      bestRow = r;
    }
  }

  return bestRow > 0 ? bestRow : undefined;
}

function detectColumnKind(header: string): "currency" | "percent" | "text" | "date" {
  const h = header.toLowerCase();
  if (h.includes("%") || h.includes("percent") || h.includes("margin")) return "percent";
  if (h.includes("date") || h.includes("month") || h.includes("year")) return "date";
  if (h.includes("cost") || h.includes("capex") || h.includes("revenue") || h.includes("price") || h.includes("noi")) {
    return "currency";
  }
  return "text";
}

function detectRowGroups(sheet: SheetModel): Array<{ label: string; startRow: number; endRow: number }> {
  const out: Array<{ label: string; startRow: number; endRow: number }> = [];
  let open: { label: string; startRow: number } | null = null;

  for (let r = 1; r <= sheet.grid.maxRow; r += 1) {
    const lead = toText(sheet.cells[cellKey(r, 1)]?.v) || toText(sheet.cells[cellKey(r, 2)]?.v);
    if (!lead) continue;
    if (/^phase\s+\d+/i.test(lead) || /^section\s+/i.test(lead) || /^group\s+/i.test(lead)) {
      if (open) out.push({ label: open.label, startRow: open.startRow, endRow: r - 1 });
      open = { label: lead, startRow: r };
    }
  }

  if (open) out.push({ label: open.label, startRow: open.startRow, endRow: sheet.grid.maxRow });
  return out;
}

export function buildSemanticIndex(model: SpreadsheetModel): Record<string, SemanticIndex> {
  const out: Record<string, SemanticIndex> = {};

  for (const sheet of model.sheets) {
    const headerRow = detectHeaderRow(sheet);
    const columns: SemanticIndex["columns"] = {};

    if (headerRow) {
      for (let c = 1; c <= sheet.grid.maxCol; c += 1) {
        const header = toText(sheet.cells[cellKey(headerRow, c)]?.v);
        if (!header) continue;
        columns[c] = {
          header,
          kind: detectColumnKind(header),
        };
      }
    }

    const keyCells: SemanticIndex["keyCells"] = {};
    for (let r = 1; r <= sheet.grid.maxRow; r += 1) {
      for (let c = 1; c <= Math.min(sheet.grid.maxCol, 25); c += 1) {
        const value = toText(sheet.cells[cellKey(r, c)]?.v);
        if (!value) continue;
        const lower = value.toLowerCase();
        if (lower === "capex" || lower === "noi" || lower.includes("return on cost")) {
          keyCells[value] = { role: "metric", row: r, col: c };
        }
      }
    }

    out[sheet.name] = {
      sheetName: sheet.name,
      headerRow,
      columns,
      rowGroups: detectRowGroups(sheet),
      keyCells,
    };
  }

  return out;
}
