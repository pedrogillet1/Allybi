import ExcelJS from "exceljs";
import { cellKey, parseA1Range, parseCellKey } from "./spreadsheetModel.range";
import type { SpreadsheetModel, StyleModel } from "./spreadsheetModel.types";

function toArgb(hex: string | undefined): string | undefined {
  const raw = String(hex || "").trim();
  const m = raw.match(/^#?([0-9A-Fa-f]{6})$/);
  if (!m?.[1]) return undefined;
  return `FF${m[1].toUpperCase()}`;
}

function applyStyle(cell: ExcelJS.Cell, style: StyleModel | undefined): void {
  if (!style) return;

  if (style.font) {
    const font: Partial<ExcelJS.Font> = {
      ...(style.font.name ? { name: style.font.name } : {}),
      ...(typeof style.font.size === "number" ? { size: style.font.size } : {}),
      ...(typeof style.font.bold === "boolean"
        ? { bold: style.font.bold }
        : {}),
      ...(typeof style.font.italic === "boolean"
        ? { italic: style.font.italic }
        : {}),
      ...(typeof style.font.underline === "boolean"
        ? { underline: style.font.underline }
        : {}),
      ...(toArgb(style.font.color)
        ? { color: { argb: toArgb(style.font.color)! } }
        : {}),
    };
    cell.font = font as ExcelJS.Font;
  }

  if (style.fill?.color) {
    const argb = toArgb(style.fill.color);
    if (argb) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb },
      } as ExcelJS.Fill;
    }
  }

  if (style.align) {
    cell.alignment = {
      ...(style.align.h ? { horizontal: style.align.h } : {}),
      ...(style.align.v
        ? { vertical: style.align.v === "middle" ? "middle" : style.align.v }
        : {}),
      ...(typeof style.align.wrap === "boolean"
        ? { wrapText: style.align.wrap }
        : {}),
    } as ExcelJS.Alignment;
  }

  if (style.border && Object.keys(style.border).length) {
    cell.border = { ...(style.border as any) };
  }
}

export async function compileSpreadsheetModelToXlsx(
  model: SpreadsheetModel,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  for (const sheet of model.sheets) {
    const ws = wb.addWorksheet(sheet.name);

    const maxRow = Math.max(1, Number(sheet.grid.maxRow || 1));
    const maxCol = Math.max(1, Number(sheet.grid.maxCol || 1));

    for (let r = 1; r <= maxRow; r += 1) {
      const h = sheet.grid.rowHeights?.[r];
      if (typeof h === "number" && Number.isFinite(h)) ws.getRow(r).height = h;
    }

    for (let c = 1; c <= maxCol; c += 1) {
      const w = sheet.grid.colWidths?.[c];
      if (typeof w === "number" && Number.isFinite(w))
        ws.getColumn(c).width = w;
    }

    // Hidden rows
    const hiddenRows = Array.isArray(sheet.grid.hiddenRows)
      ? sheet.grid.hiddenRows
      : [];
    for (const r of hiddenRows) {
      ws.getRow(r).hidden = true;
    }

    // Hidden columns
    const hiddenCols = Array.isArray(sheet.grid.hiddenColumns)
      ? sheet.grid.hiddenColumns
      : [];
    for (const c of hiddenCols) {
      ws.getColumn(c).hidden = true;
    }

    for (const [key, cellModel] of Object.entries(sheet.cells)) {
      const pos = parseCellKey(key);
      if (!pos) continue;
      const cell = ws.getCell(pos.row, pos.col);

      if (cellModel.f) {
        const result = cellModel.v == null ? undefined : cellModel.v;
        cell.value = {
          formula: String(cellModel.f),
          ...(result !== undefined ? { result } : {}),
        } as any;
      } else if (cellModel.v !== undefined) {
        if (cellModel.t === "d" && typeof cellModel.v === "string") {
          const d = new Date(cellModel.v);
          cell.value = Number.isNaN(d.getTime()) ? cellModel.v : d;
        } else {
          cell.value = cellModel.v as any;
        }
      }

      if (cellModel.nf) cell.numFmt = cellModel.nf;
      if (cellModel.s) applyStyle(cell, model.styles[cellModel.s]);

      if (cellModel.note) {
        (cell as any).note = cellModel.note;
      }

      if (cellModel.validation) {
        (cell as any).dataValidation = cellModel.validation as any;
      }
    }

    const merges = Array.isArray(sheet.grid.merges) ? sheet.grid.merges : [];
    for (const merge of merges) {
      const left = ws.getCell(merge.r1, merge.c1).address;
      const right = ws.getCell(merge.r2, merge.c2).address;
      if (left === right) continue;
      try {
        ws.mergeCells(`${left}:${right}`);
      } catch {
        // ignore invalid overlap
      }
    }

    if (sheet.grid.freeze) {
      ws.views = [
        {
          state: "frozen",
          xSplit: Number(sheet.grid.freeze.colSplit || 0),
          ySplit: Number(sheet.grid.freeze.rowSplit || 0),
        } as any,
      ];
    }

    if (sheet.grid.autoFilterRange) {
      try {
        const parsed = parseA1Range(sheet.grid.autoFilterRange, sheet.name);
        (ws as any).autoFilter = {
          from: { row: parsed.start.row, column: parsed.start.col },
          to: { row: parsed.end.row, column: parsed.end.col },
        };
      } catch {
        // ignore invalid filter ranges
      }
    }

    const conditionalFormats = Array.isArray(sheet.conditionalFormats)
      ? sheet.conditionalFormats
      : [];
    if (typeof (ws as any).addConditionalFormatting === "function") {
      for (const item of conditionalFormats) {
        const ruleType = String(item.rule?.type || "NUMBER_GREATER").toUpperCase();
        try {
          const parsed = parseA1Range(item.range, sheet.name);
          const ref = `${ws.getCell(parsed.start.row, parsed.start.col).address}:${ws.getCell(parsed.end.row, parsed.end.col).address}`;

          if (ruleType === "DATA_BARS") {
            (ws as any).addConditionalFormatting({
              ref,
              rules: [
                {
                  type: "dataBar",
                  minLength: 0,
                  maxLength: 100,
                  gradient: true,
                  border: false,
                  negativeBarColorSameAsPositive: false,
                  axisPosition: "auto",
                },
              ],
            });
          } else if (ruleType === "COLOR_SCALE") {
            (ws as any).addConditionalFormatting({
              ref,
              rules: [
                {
                  type: "colorScale",
                  cfvo: [
                    { type: "min" },
                    ...(item.rule?.midColor ? [{ type: "percentile", value: 50 }] : []),
                    { type: "max" },
                  ],
                  color: [
                    { argb: toArgb(item.rule?.minColor) || "FFFF0000" },
                    ...(item.rule?.midColor ? [{ argb: toArgb(item.rule.midColor) || "FFFFFF00" }] : []),
                    { argb: toArgb(item.rule?.maxColor) || "FF00FF00" },
                  ],
                },
              ],
            });
          } else if (ruleType === "TOP_N") {
            const bg = toArgb(item.rule?.backgroundHex) || "FFFFC000";
            (ws as any).addConditionalFormatting({
              ref,
              rules: [
                {
                  type: "top10",
                  rank: Number(item.rule?.n ?? 10),
                  percent: Boolean(item.rule?.percent),
                  style: {
                    fill: {
                      type: "pattern",
                      pattern: "solid",
                      fgColor: { argb: bg },
                    },
                  },
                },
              ],
            });
          } else {
            const op = ruleType === "NUMBER_LESS" ? "lessThan" : "greaterThan";
            const bg = toArgb(item.rule?.backgroundHex) || "FFFEF3C7";
            const value = String(item.rule?.value ?? 0);
            (ws as any).addConditionalFormatting({
              ref,
              rules: [
                {
                  type: "cellIs",
                  operator: op,
                  formulae: [value],
                  style: {
                    fill: {
                      type: "pattern",
                      pattern: "solid",
                      fgColor: { argb: bg },
                    },
                  },
                },
              ],
            });
          }
        } catch {
          // ignore invalid conditional range
        }
      }
    }

    const tables = (model.tables || []).filter(
      (item) => item.sheetName === sheet.name,
    );
    for (const table of tables) {
      try {
        const parsed = parseA1Range(table.range, sheet.name);
        const start = ws.getCell(parsed.start.row, parsed.start.col);
        const headers: string[] = [];
        for (let c = parsed.start.col; c <= parsed.end.col; c += 1) {
          const headerCell = ws.getCell(parsed.start.row, c);
          const label = String(
            (headerCell.value as any) ?? `Column${c - parsed.start.col + 1}`,
          );
          headers.push(label || `Column${c - parsed.start.col + 1}`);
        }

        const rows: any[][] = [];
        const dataStart =
          table.hasHeader === false ? parsed.start.row : parsed.start.row + 1;
        for (let r = dataStart; r <= parsed.end.row; r += 1) {
          const row: any[] = [];
          for (let c = parsed.start.col; c <= parsed.end.col; c += 1) {
            row.push(ws.getCell(r, c).value ?? null);
          }
          rows.push(row);
        }

        ws.addTable({
          name:
            table.id.replace(/[^A-Za-z0-9_]/g, "").slice(0, 30) ||
            `Table${Math.floor(Math.random() * 1e6)}`,
          ref: start.address,
          headerRow: table.hasHeader !== false,
          totalsRow: false,
          style: {
            theme: "TableStyleMedium2",
            showRowStripes: true,
          },
          columns: headers.map((name) => ({ name })),
          rows,
        } as any);
      } catch {
        // best effort only
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
