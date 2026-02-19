import ExcelJS from "exceljs";

export type XlsxCellValue = string | number | boolean | Date | null;

function normalizeSheetName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("sheet name is required");
  // Excel constraints: no : \ / ? * [ ]
  const cleaned = trimmed
    .replace(/[:\\/?*[\]]/g, "-")
    .slice(0, 100)
    .trim();
  if (!cleaned) throw new Error("sheet name is invalid");
  return cleaned;
}

function unquoteSheetName(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  const unwrapped =
    t.startsWith("'") && t.endsWith("'") && t.length >= 2 ? t.slice(1, -1) : t;
  // Excel/Sheets escape: a literal apostrophe is represented as two apostrophes inside quotes.
  return unwrapped.replace(/''/g, "'");
}

function parseTargetId(targetId: string): { sheetName: string; a1: string } {
  const raw = String(targetId || "").trim();
  // Accept:
  // - "xlsx:Sheet1!B12"
  // - "Sheet1!B12"
  // - "'My Sheet'!B12"
  const withoutPrefix = raw.startsWith("xlsx:")
    ? raw.slice("xlsx:".length)
    : raw;
  const bang = withoutPrefix.indexOf("!");
  if (bang <= 0) throw new Error(`Invalid XLSX target: ${targetId}`);
  const sheetPart = unquoteSheetName(withoutPrefix.slice(0, bang));
  const a1 = withoutPrefix.slice(bang + 1).trim();
  if (!sheetPart || !a1) throw new Error(`Invalid XLSX target: ${targetId}`);
  return { sheetName: sheetPart, a1 };
}

function parseSimpleValue(text: string): XlsxCellValue | { formula: string } {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (/^(null|empty)$/i.test(t)) return null;
  // Formula (ExcelJS expects formula without leading "=")
  if (t.startsWith("=") && t.length > 1) return { formula: t.slice(1).trim() };
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  // Number (allow commas)
  const num = Number(t.replace(/,/g, ""));
  if (Number.isFinite(num) && /^-?[\d,]+(\.\d+)?$/.test(t)) return num;
  // ISO date
  const d = new Date(t);
  if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(t)) return d;
  return t;
}

function parseRangeA1(rangeA1: string): { sheetName: string; a1: string } {
  const raw = String(rangeA1 || "").trim();
  const bang = raw.indexOf("!");
  if (bang <= 0) return { sheetName: "Sheet1", a1: raw };
  const sheetPart = unquoteSheetName(raw.slice(0, bang));
  const a1 = raw.slice(bang + 1).trim();
  return { sheetName: sheetPart || "Sheet1", a1 };
}

function parseA1RectOnWorksheet(
  ws: ExcelJS.Worksheet,
  a1: string,
): {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} {
  const raw = String(a1 || "").trim();
  if (!raw) throw new Error("A1 range is required");
  const [startRef, endRefRaw] = raw.includes(":") ? raw.split(":") : [raw, raw];
  const endRef = endRefRaw || startRef;
  const startCell = ws.getCell(startRef);
  const endCell = ws.getCell(endRef);
  const startRow = Math.min(
    Number((startCell as any).row),
    Number((endCell as any).row),
  );
  const endRow = Math.max(
    Number((startCell as any).row),
    Number((endCell as any).row),
  );
  const startCol = Math.min(
    Number((startCell as any).col),
    Number((endCell as any).col),
  );
  const endCol = Math.max(
    Number((startCell as any).col),
    Number((endCell as any).col),
  );
  return { startRow, endRow, startCol, endCol };
}

function parseColumnFromCellRef(cellRef: string): number {
  const m = String(cellRef || "")
    .replace(/\$/g, "")
    .toUpperCase()
    .match(/^([A-Z]+)/);
  if (!m) return 0;
  let out = 0;
  for (const ch of m[1]) out = out * 26 + (ch.charCodeAt(0) - 64);
  return out - 1;
}

function toArgb(hex: string): string | null {
  const raw = String(hex || "").trim();
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return `FF${m[1].toUpperCase()}`;
}

function normalizeSortValue(v: any): string | number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (
    v &&
    typeof v === "object" &&
    "result" in v &&
    Number.isFinite(Number((v as any).result))
  )
    return Number((v as any).result);
  const s = String(v ?? "").trim();
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : s.toLowerCase();
}

function parseTsvOrCsvGrid(text: string): string[][] {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("range values are empty");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
}

/**
 * Resolve the number format for a cell by looking at nearby cells in the same column.
 * Returns a non-General format string if one is found, otherwise undefined.
 */
function inferColumnNumFmt(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
): string | undefined {
  // Check the cell's own format first.
  try {
    const own = ws.getCell(row, col).numFmt;
    if (own && own !== "General") return own;
  } catch {
    /* ignore */
  }

  // Scan up to 10 cells above and below for a format (prefer above).
  for (let offset = 1; offset <= 10; offset++) {
    if (row - offset >= 1) {
      try {
        const c = ws.getCell(row - offset, col);
        if (c.numFmt && c.numFmt !== "General" && c.value != null)
          return c.numFmt;
      } catch {
        /* ignore */
      }
    }
    try {
      const c = ws.getCell(row + offset, col);
      if (c.numFmt && c.numFmt !== "General" && c.value != null)
        return c.numFmt;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export class XlsxFileEditorService {
  async editCell(
    buffer: Buffer,
    targetId: string,
    proposedText: string,
  ): Promise<Buffer> {
    const { sheetName, a1 } = parseTargetId(targetId);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

    const cell = ws.getCell(a1);
    // Infer column number format before overwriting so numeric values keep currency/pct/etc.
    const numFmt = inferColumnNumFmt(
      ws,
      Number((cell as any).row),
      Number((cell as any).col),
    );
    cell.value = parseSimpleValue(proposedText) as any;
    if (
      numFmt &&
      (typeof cell.value === "number" ||
        (cell.value &&
          typeof cell.value === "object" &&
          "formula" in cell.value))
    ) {
      cell.numFmt = numFmt;
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async editRange(
    buffer: Buffer,
    targetId: string,
    proposedText: string,
  ): Promise<Buffer> {
    const { sheetName, a1 } = parseTargetId(targetId);
    if (!a1.includes(":"))
      throw new Error(
        "EDIT_RANGE target must be an A1 range like Sheet1!A1:B2",
      );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

    const grid = parseTsvOrCsvGrid(proposedText);
    const [startCell] = a1.split(":");
    const start = ws.getCell(startCell);
    const startRow = Number((start as any).row);
    const startCol = Number((start as any).col);

    for (let r = 0; r < grid.length; r += 1) {
      for (let c = 0; c < grid[r].length; c += 1) {
        const v = grid[r][c];
        const targetCell = ws.getCell(startRow + r, startCol + c);
        const numFmt = inferColumnNumFmt(ws, startRow + r, startCol + c);
        const parsed = parseSimpleValue(v);
        targetCell.value = parsed as any;
        if (numFmt && typeof parsed === "number") {
          targetCell.numFmt = numFmt;
        }
      }
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async addSheet(buffer: Buffer, proposedSheetName: string): Promise<Buffer> {
    const name = normalizeSheetName(proposedSheetName);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    if (wb.getWorksheet(name)) throw new Error(`Sheet already exists: ${name}`);
    wb.addWorksheet(name);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async renameSheet(
    buffer: Buffer,
    fromName: string,
    toName: string,
  ): Promise<Buffer> {
    const from = normalizeSheetName(fromName);
    const to = normalizeSheetName(toName);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    const ws = wb.getWorksheet(from);
    if (!ws) throw new Error(`Sheet not found: ${from}`);
    if (wb.getWorksheet(to)) throw new Error(`Sheet already exists: ${to}`);

    ws.name = to;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * Process a batch of structured COMPUTE ops locally via ExcelJS.
   * Supports: set_values, set_formula, insert_rows, delete_rows,
   *           insert_columns, delete_columns, add_sheet, rename_sheet, create_table,
   *           sort_range, filter_range, clear_filter, set_number_format,
   *           set_freeze_panes, set_data_validation, clear_data_validation,
   *           apply_conditional_format, set_print_layout.
   * create_chart/update_chart require a Sheets-capable engine.
   */
  async computeOps(buffer: Buffer, opsJson: string): Promise<Buffer> {
    let payload: any = {};
    try {
      payload = JSON.parse(String(opsJson || "{}"));
    } catch {
      throw new Error('COMPUTE requires JSON content like {"ops":[...]}');
    }
    const ops = Array.isArray(payload?.ops) ? payload.ops : [];
    if (ops.length === 0) throw new Error("COMPUTE ops array is empty");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);

    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      const kind = String((op as any).kind || "").trim();

      if (kind === "set_values") {
        const rangeA1 = String((op as any).rangeA1 || "").trim();
        const values: any[][] = (op as any).values;
        const copyStyleFrom = String((op as any).copyStyleFrom || "").trim();
        if (!rangeA1 || !Array.isArray(values))
          throw new Error("set_values requires rangeA1 and values[][]");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const [startRef] = a1.split(":");
        const anchor = ws.getCell(startRef);
        const startRow = Number((anchor as any).row);
        const startCol = Number((anchor as any).col);
        const rect = parseA1RectOnWorksheet(ws, a1);
        const firstRow = Array.isArray(values?.[0]) ? values[0] : [];
        const scalarFill =
          values.length === 1 && firstRow.length === 1
            ? firstRow[0]
            : undefined;
        const rowsToWrite =
          scalarFill !== undefined
            ? rect.endRow - rect.startRow + 1
            : values.length;
        const colsToWrite =
          scalarFill !== undefined
            ? rect.endCol - rect.startCol + 1
            : Math.max(
                0,
                ...values.map((row) => (Array.isArray(row) ? row.length : 0)),
              );
        for (let r = 0; r < rowsToWrite; r++) {
          for (let c = 0; c < colsToWrite; c++) {
            const row = Array.isArray(values[r]) ? values[r] : [];
            const v = scalarFill !== undefined ? scalarFill : row[c];
            if (v === undefined) continue;
            const raw = v === "" || v == null ? null : v;
            const parsed =
              typeof raw === "string" ? parseSimpleValue(raw) : raw;
            const targetCell = ws.getCell(startRow + r, startCol + c);
            // Infer column number format before overwriting.
            const colFmt = !copyStyleFrom
              ? inferColumnNumFmt(ws, startRow + r, startCol + c)
              : undefined;
            targetCell.value = parsed as any;
            if (copyStyleFrom) {
              try {
                const src = parseRangeA1(copyStyleFrom);
                const srcWs = wb.getWorksheet(src.sheetName);
                const srcCell = srcWs?.getCell(src.a1);
                if (srcCell) {
                  targetCell.numFmt = srcCell.numFmt || targetCell.numFmt;
                  targetCell.font = srcCell.font
                    ? { ...(srcCell.font as any) }
                    : targetCell.font;
                  targetCell.alignment = srcCell.alignment
                    ? { ...(srcCell.alignment as any) }
                    : targetCell.alignment;
                }
              } catch {
                // Ignore style copy errors; value update is primary.
              }
            } else if (colFmt && typeof parsed === "number") {
              targetCell.numFmt = colFmt;
            }
          }
        }
      } else if (kind === "set_formula") {
        const a1Full = String((op as any).a1 || "").trim();
        const formula = String((op as any).formula || "").trim();
        if (!a1Full || !formula)
          throw new Error("set_formula requires a1 and formula");
        const { sheetName, a1 } = parseRangeA1(a1Full);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const fCell = ws.getCell(a1);
        const numFmt = inferColumnNumFmt(
          ws,
          Number((fCell as any).row),
          Number((fCell as any).col),
        );
        fCell.value = { formula } as any;
        if (numFmt) fCell.numFmt = numFmt;
      } else if (kind === "create_table") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        const hasHeader = (op as any).hasHeader !== false;
        const styleRaw = String((op as any).style || "")
          .trim()
          .toLowerCase();
        const colorSpec =
          (op as any).colors && typeof (op as any).colors === "object"
            ? (op as any).colors
            : null;
        const toArgb = (raw: any): string | null => {
          const s = String(raw || "").trim();
          if (!s) return null;
          const hex = s.startsWith("#") ? s.slice(1) : s;
          if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
          return `FF${hex.toUpperCase()}`;
        };
        const tableTheme = (() => {
          if (styleRaw === "blue") return "TableStyleMedium2";
          if (styleRaw === "green") return "TableStyleMedium7";
          if (styleRaw === "orange") return "TableStyleMedium10";
          if (styleRaw === "teal") return "TableStyleMedium9";
          if (styleRaw === "gray" || styleRaw === "light_gray")
            return "TableStyleMedium1";
          return "TableStyleMedium2";
        })();
        if (!rangeA1) throw new Error("create_table requires rangeA1");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        if (!a1.includes(":"))
          throw new Error(
            "create_table range must be an A1 range like Sheet1!A1:D20",
          );
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const [startRef, endRef] = a1.split(":");
        const startCell = ws.getCell(startRef);
        const endCell = ws.getCell(endRef);
        // ExcelJS typings can be loose across versions; normalize to numbers.
        const startRow = Math.min(
          Number((startCell as any).row),
          Number((endCell as any).row),
        );
        const endRow = Math.max(
          Number((startCell as any).row),
          Number((endCell as any).row),
        );
        const startCol = Math.min(
          Number((startCell as any).col),
          Number((endCell as any).col),
        );
        const endCol = Math.max(
          Number((startCell as any).col),
          Number((endCell as any).col),
        );

        const headerValues: string[] = [];
        for (let c = startCol; c <= endCol; c++) {
          const v: any = ws.getCell(startRow, c).value as any;
          const label =
            v == null
              ? ""
              : typeof v === "object" && v.text
                ? String(v.text)
                : String(v);
          headerValues.push(label || `Column${c - startCol + 1}`);
        }

        const rows: any[][] = [];
        const dataStartRow = hasHeader ? startRow + 1 : startRow;
        for (let r = dataStartRow; r <= endRow; r++) {
          const row: any[] = [];
          for (let c = startCol; c <= endCol; c++) {
            const v: any = ws.getCell(r, c).value as any;
            row.push(v == null ? null : v);
          }
          rows.push(row);
        }

        const tableName =
          String((op as any).name || "").trim() ||
          `Table${Math.floor(Math.random() * 1e6)}`;
        try {
          ws.addTable({
            name: tableName,
            ref: ws.getCell(startRow, startCol).address,
            headerRow: hasHeader,
            totalsRow: false,
            style: {
              theme: tableTheme,
              showRowStripes: true,
            },
            columns: headerValues.map((name) => ({ name })),
            rows,
          } as any);
        } catch {
          // If addTable fails (e.g. overlapping table), fall back to applying minimal header styling.
          for (let c = startCol; c <= endCol; c++) {
            const cell = ws.getCell(startRow, c);
            cell.font = { ...(cell.font || {}), bold: true } as any;
          }
        }

        // Optional explicit color accents for table creation commands.
        // Supported keys: header, stripe, totals, border (hex like #0F172A).
        if (colorSpec) {
          const headerArgb = toArgb((colorSpec as any).header);
          const stripeArgb = toArgb((colorSpec as any).stripe);
          const totalsArgb = toArgb((colorSpec as any).totals);
          const borderArgb = toArgb((colorSpec as any).border);

          if (hasHeader && headerArgb) {
            for (let c = startCol; c <= endCol; c += 1) {
              const cell = ws.getCell(startRow, c);
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: headerArgb },
              } as any;
              cell.font = {
                ...(cell.font || {}),
                bold: true,
                color: { argb: "FFFFFFFF" },
              } as any;
            }
          }

          if (stripeArgb) {
            const dataStart = hasHeader ? startRow + 1 : startRow;
            for (let r = dataStart; r <= endRow; r += 1) {
              if ((r - dataStart) % 2 !== 0) continue;
              for (let c = startCol; c <= endCol; c += 1) {
                const cell = ws.getCell(r, c);
                cell.fill = {
                  type: "pattern",
                  pattern: "solid",
                  fgColor: { argb: stripeArgb },
                } as any;
              }
            }
          }

          if (totalsArgb) {
            for (let c = startCol; c <= endCol; c += 1) {
              const cell = ws.getCell(endRow, c);
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: totalsArgb },
              } as any;
              cell.font = { ...(cell.font || {}), bold: true } as any;
            }
          }

          if (borderArgb) {
            for (let r = startRow; r <= endRow; r += 1) {
              for (let c = startCol; c <= endCol; c += 1) {
                const cell = ws.getCell(r, c);
                cell.border = {
                  top: { style: "thin", color: { argb: borderArgb } },
                  left: { style: "thin", color: { argb: borderArgb } },
                  bottom: { style: "thin", color: { argb: borderArgb } },
                  right: { style: "thin", color: { argb: borderArgb } },
                } as any;
              }
            }
          }
        }
      } else if (kind === "sort_range") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        if (!rangeA1) throw new Error("sort_range requires rangeA1");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const { startRow, endRow, startCol, endCol } = parseA1RectOnWorksheet(
          ws,
          a1,
        );
        const width = Math.max(1, endCol - startCol + 1);
        const a1Part = String(a1 || "");
        const a1Start = String(a1Part.split(":")[0] || "")
          .replace(/\$/g, "")
          .trim();
        const rangeStartCol0 = parseColumnFromCellRef(a1Start);
        const toDimension = (raw: any): number | null => {
          if (raw == null) return null;
          if (typeof raw === "string" && /^[A-Za-z]+$/.test(raw.trim()))
            return parseColumnFromCellRef(raw.trim());
          const n = Number(raw);
          if (!Number.isFinite(n)) return null;
          const ni = Math.trunc(n);
          if (ni >= 1 && ni <= width) return rangeStartCol0 + (ni - 1);
          if (ni >= 0 && ni < width) return rangeStartCol0 + ni;
          return ni;
        };
        const rawSpecs = Array.isArray((op as any).sortSpecs)
          ? (op as any).sortSpecs
          : [op];
        const sortSpecs = rawSpecs
          .map((s: any) => {
            const dim = toDimension(
              s?.dimensionIndex ??
                s?.columnIndex ??
                s?.column ??
                (op as any).column,
            );
            if (dim == null) return null;
            const orderRaw = String(
              s?.sortOrder || s?.order || (op as any).order || "ASC",
            ).toUpperCase();
            return { dimensionIndex: dim, desc: orderRaw.startsWith("DESC") };
          })
          .filter(Boolean) as Array<{ dimensionIndex: number; desc: boolean }>;
        if (!sortSpecs.length)
          throw new Error("sort_range requires at least one sort spec");
        const hasHeader = (op as any).hasHeader !== false;
        const dataStartRow = hasHeader ? startRow + 1 : startRow;
        if (dataStartRow > endRow) continue;

        const rows: any[][] = [];
        for (let r = dataStartRow; r <= endRow; r += 1) {
          const vals: any[] = [];
          for (let c = startCol; c <= endCol; c += 1) {
            vals.push(ws.getCell(r, c).value);
          }
          rows.push(vals);
        }

        rows.sort((a, b) => {
          for (const spec of sortSpecs) {
            const localIdx = spec.dimensionIndex - rangeStartCol0;
            if (localIdx < 0 || localIdx >= width) continue;
            const av = normalizeSortValue(a[localIdx]);
            const bv = normalizeSortValue(b[localIdx]);
            if (av === bv) continue;
            const cmp = av > bv ? 1 : -1;
            return spec.desc ? -cmp : cmp;
          }
          return 0;
        });

        for (let i = 0; i < rows.length; i += 1) {
          const targetRow = dataStartRow + i;
          const vals = rows[i];
          for (let j = 0; j < vals.length; j += 1) {
            ws.getCell(targetRow, startCol + j).value = vals[j] as any;
          }
        }
      } else if (kind === "filter_range") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        if (!rangeA1) throw new Error("filter_range requires rangeA1");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        (ws as any).autoFilter = a1;
      } else if (kind === "clear_filter") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        (ws as any).autoFilter = null;
      } else if (kind === "set_number_format") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        const pattern = String(
          (op as any).pattern || (op as any).format || "",
        ).trim();
        if (!rangeA1 || !pattern)
          throw new Error("set_number_format requires rangeA1 and pattern");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const { startRow, endRow, startCol, endCol } = parseA1RectOnWorksheet(
          ws,
          a1,
        );
        for (let r = startRow; r <= endRow; r += 1) {
          for (let c = startCol; c <= endCol; c += 1)
            ws.getCell(r, c).numFmt = pattern;
        }
      } else if (kind === "format_range") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        const fmt =
          (op as any).format && typeof (op as any).format === "object"
            ? (op as any).format
            : {};
        if (!rangeA1) throw new Error("format_range requires rangeA1");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const { startRow, endRow, startCol, endCol } = parseA1RectOnWorksheet(
          ws,
          a1,
        );

        const bold = typeof fmt.bold === "boolean" ? fmt.bold : undefined;
        const italic = typeof fmt.italic === "boolean" ? fmt.italic : undefined;
        const underline =
          typeof fmt.underline === "boolean" ? fmt.underline : undefined;
        const fontSizePt = Number(fmt.fontSizePt);
        const hasFontSize =
          Number.isFinite(fontSizePt) && fontSizePt >= 6 && fontSizePt <= 144;
        const fontFamily = String(fmt.fontFamily || "").trim();
        const hasFontFamily =
          Boolean(fontFamily) && /^[A-Za-z0-9 ,\-]{2,60}$/.test(fontFamily);
        const colorArgb = toArgb(String(fmt.color || "").trim());

        for (let r = startRow; r <= endRow; r += 1) {
          for (let c = startCol; c <= endCol; c += 1) {
            const cell = ws.getCell(r, c) as any;
            const nextFont = { ...(cell.font || {}) } as any;
            if (bold !== undefined) nextFont.bold = bold;
            if (italic !== undefined) nextFont.italic = italic;
            if (underline !== undefined) nextFont.underline = underline;
            if (hasFontSize) nextFont.size = fontSizePt;
            if (hasFontFamily) nextFont.name = fontFamily;
            if (colorArgb) nextFont.color = { argb: colorArgb };
            cell.font = nextFont;
          }
        }
      } else if (kind === "set_freeze_panes") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const rows = Number(
          (op as any).frozenRowCount ?? (op as any).rows ?? 0,
        );
        const cols = Number(
          (op as any).frozenColumnCount ?? (op as any).columns ?? 0,
        );
        ws.views = [
          {
            state: "frozen",
            xSplit: Number.isFinite(cols) ? Math.max(0, Math.trunc(cols)) : 0,
            ySplit: Number.isFinite(rows) ? Math.max(0, Math.trunc(rows)) : 0,
          },
        ] as any;
      } else if (kind === "set_data_validation") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        if (!rangeA1) throw new Error("set_data_validation requires rangeA1");
        const rule =
          (op as any).rule && typeof (op as any).rule === "object"
            ? (op as any).rule
            : (op as any);
        const type = String(rule.type || "ONE_OF_LIST").toUpperCase();
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const { startRow, endRow, startCol, endCol } = parseA1RectOnWorksheet(
          ws,
          a1,
        );
        for (let r = startRow; r <= endRow; r += 1) {
          for (let c = startCol; c <= endCol; c += 1) {
            const cell = ws.getCell(r, c) as any;
            if (type === "ONE_OF_LIST") {
              const vals = Array.isArray(rule.values)
                ? rule.values
                    .map((v: any) => String(v).replace(/"/g, '""'))
                    .filter(Boolean)
                : [];
              if (!vals.length)
                throw new Error("ONE_OF_LIST validation requires values");
              cell.dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [`"${vals.join(",")}"`],
                showErrorMessage: rule.strict !== false,
              };
            } else if (type === "NUMBER_BETWEEN") {
              const min = Number(rule.min);
              const max = Number(rule.max);
              if (!Number.isFinite(min) || !Number.isFinite(max))
                throw new Error(
                  "NUMBER_BETWEEN validation requires min and max",
                );
              cell.dataValidation = {
                type: "decimal",
                operator: "between",
                allowBlank: true,
                formulae: [min, max],
                showErrorMessage: rule.strict !== false,
              };
            } else if (type === "NUMBER_GREATER") {
              const min = Number(rule.min);
              if (!Number.isFinite(min))
                throw new Error("NUMBER_GREATER validation requires min");
              cell.dataValidation = {
                type: "decimal",
                operator: "greaterThan",
                allowBlank: true,
                formulae: [min],
                showErrorMessage: rule.strict !== false,
              };
            } else {
              throw new Error(
                `Unsupported local data validation type: ${type}`,
              );
            }
          }
        }
      } else if (kind === "clear_data_validation") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        if (!rangeA1) throw new Error("clear_data_validation requires rangeA1");
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const { startRow, endRow, startCol, endCol } = parseA1RectOnWorksheet(
          ws,
          a1,
        );
        for (let r = startRow; r <= endRow; r += 1) {
          for (let c = startCol; c <= endCol; c += 1) {
            (ws.getCell(r, c) as any).dataValidation = undefined;
          }
        }
      } else if (kind === "apply_conditional_format") {
        const rangeA1 = String(
          (op as any).rangeA1 || (op as any).range || "",
        ).trim();
        if (!rangeA1)
          throw new Error("apply_conditional_format requires rangeA1");
        const rule =
          (op as any).rule && typeof (op as any).rule === "object"
            ? (op as any).rule
            : (op as any);
        const type = String(rule.type || "NUMBER_GREATER").toUpperCase();
        const value = String(rule.value ?? rule.threshold ?? "").trim();
        if (!value)
          throw new Error(
            "apply_conditional_format requires a condition value",
          );
        const { sheetName, a1 } = parseRangeA1(rangeA1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const fg = toArgb(String(rule.backgroundHex || "#FEF3C7"));
        const style: any = fg
          ? {
              fill: {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: fg },
              },
            }
          : {};
        const operator =
          type === "NUMBER_LESS"
            ? "lessThan"
            : type === "NUMBER_GREATER"
              ? "greaterThan"
              : null;
        if (!operator)
          throw new Error(`Unsupported local conditional format type: ${type}`);
        if (typeof (ws as any).addConditionalFormatting === "function") {
          (ws as any).addConditionalFormatting({
            ref: a1,
            rules: [
              {
                type: "cellIs",
                operator,
                formulae: [value],
                style,
              },
            ],
          });
        } else {
          // Fallback for environments where ExcelJS cannot persist conditional formatting rules.
          // We still apply a deterministic visual highlight to matching cells to avoid hard failures.
          const threshold = Number(value);
          if (!Number.isFinite(threshold)) {
            throw new Error(
              "apply_conditional_format requires a numeric threshold for local fallback.",
            );
          }
          const { startRow, endRow, startCol, endCol } = parseA1RectOnWorksheet(
            ws,
            a1,
          );
          const passes = (n: number): boolean =>
            operator === "greaterThan" ? n > threshold : n < threshold;
          for (let r = startRow; r <= endRow; r += 1) {
            for (let c = startCol; c <= endCol; c += 1) {
              const cell = ws.getCell(r, c) as any;
              const raw = cell?.value;
              const numeric =
                typeof raw === "number"
                  ? raw
                  : typeof raw === "string"
                    ? Number(String(raw).replace(/[,$()%\s]/g, ""))
                    : raw &&
                        typeof raw === "object" &&
                        Number.isFinite(Number(raw?.result))
                      ? Number(raw.result)
                      : NaN;
              if (!Number.isFinite(numeric)) continue;
              if (!passes(numeric)) continue;
              if (style?.fill) cell.fill = style.fill;
            }
          }
        }
      } else if (kind === "set_print_layout") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        const hideGridlines =
          typeof (op as any).hideGridlines === "boolean"
            ? Boolean((op as any).hideGridlines)
            : false;
        (ws as any).pageSetup = {
          ...((ws as any).pageSetup || {}),
          showGridLines: !hideGridlines,
        };
      } else if (kind === "update_chart") {
        throw new Error(
          "CHART_ENGINE_UNAVAILABLE: local XLSX fallback cannot update chart objects.",
        );
      } else if (kind === "insert_rows") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const startIndex = Number((op as any).startIndex);
        const count = Number((op as any).count ?? 1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        ws.insertRows(startIndex + 1, new Array(count).fill([]), "o");
      } else if (kind === "delete_rows") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const startIndex = Number((op as any).startIndex);
        const count = Number((op as any).count ?? 1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        ws.spliceRows(startIndex + 1, count);
      } else if (kind === "insert_columns") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const startIndex = Number((op as any).startIndex);
        const count = Number((op as any).count ?? 1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        ws.spliceColumns(startIndex + 1, 0, ...new Array(count).fill([]));
      } else if (kind === "delete_columns") {
        const sheetName = String(
          (op as any).sheetName || (op as any).sheetId || "Sheet1",
        ).trim();
        const startIndex = Number((op as any).startIndex);
        const count = Number((op as any).count ?? 1);
        const ws = wb.getWorksheet(sheetName);
        if (!ws) throw new Error(`Sheet not found: ${sheetName}`);
        ws.spliceColumns(startIndex + 1, count);
      } else if (kind === "create_chart") {
        throw new Error(
          "CHART_ENGINE_UNAVAILABLE: local XLSX fallback cannot create chart objects.",
        );
      } else {
        throw new Error(`Unsupported compute op: ${kind}`);
      }
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

export default XlsxFileEditorService;
