import { parseA1Range } from "./spreadsheetModel.range";
import type {
  PatchOp,
  PatchPlanTranslationResult,
} from "./spreadsheetModel.patch.types";
import type { SemanticIndex } from "./spreadsheetModel.types";

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function sanitizeSheetName(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^'+|'+$/g, "")
    .replace(
      /^(?:in|on|at|from|using|use|em|na|no|make|set|create|insert|delete|format|sort|filter)\s+/i,
      "",
    )
    .trim();
}

function resolveKnownSheetName(
  input: string,
  semantic?: Record<string, SemanticIndex>,
  fallbackSheetName?: string,
): string {
  const candidate = sanitizeSheetName(input);
  if (!candidate) return sanitizeSheetName(fallbackSheetName || "");

  const known = Object.keys(semantic || {});
  if (!known.length) return candidate;
  const exact = known.find(
    (name) => name.toLowerCase() === candidate.toLowerCase(),
  );
  if (exact) return exact;
  const contained = known.find((name) =>
    candidate.toLowerCase().includes(name.toLowerCase()),
  );
  if (contained) return contained;
  const tail = candidate.split(/\s+/).pop() || candidate;
  const byTail = known.find(
    (name) => name.toLowerCase() === tail.toLowerCase(),
  );
  if (byTail) return byTail;
  return candidate;
}

function numberToCol(nInput: number): string {
  let n = Math.max(1, Math.trunc(nInput));
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function normalizeRange(
  rangeLike: unknown,
  fallbackSheetName?: string,
  semantic?: Record<string, SemanticIndex>,
): string | null {
  const raw = normalizeString(rangeLike);
  if (!raw) return null;
  try {
    const parsed = parseA1Range(raw, fallbackSheetName);
    const sheetName = resolveKnownSheetName(
      parsed.sheetName,
      semantic,
      fallbackSheetName,
    );
    const leftCol = numberToCol(parsed.start.col);
    const rightCol = numberToCol(parsed.end.col);
    const left = `${leftCol}${parsed.start.row}`;
    const right = `${rightCol}${parsed.end.row}`;
    const a1 = left === right ? left : `${left}:${right}`;
    return `${sheetName}!${a1}`;
  } catch {
    return null;
  }
}

function toColumnIndex(raw: unknown): number | string {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const text = normalizeString(raw);
  if (/^[A-Za-z]+$/.test(text)) return text.toUpperCase();
  const n = Number(text);
  if (Number.isFinite(n)) return Math.trunc(n);
  return 1;
}

function detectHeaderRangeFromSemantic(
  semantic: Record<string, SemanticIndex> | undefined,
  sheetName: string,
): string | null {
  const index = semantic?.[sheetName];
  if (!index?.headerRow) return null;
  const cols = Object.keys(index.columns)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  if (!cols.length) return null;
  const min = Math.min(...cols);
  const max = Math.max(...cols);
  return `${sheetName}!${numberToCol(min)}${index.headerRow}:${numberToCol(max)}${index.headerRow}`;
}

export function computeOpsToPatchPlan(input: {
  ops: Array<Record<string, unknown>>;
  activeSheetName?: string | null;
  semanticIndex?: Record<string, SemanticIndex>;
}): PatchPlanTranslationResult {
  const patchOps: PatchOp[] = [];
  const rejectedOps: string[] = [];
  const canonicalOps: string[] = [];

  const activeSheetName = normalizeString(input.activeSheetName);

  input.ops.forEach((op, index) => {
    const kind = normalizeString(op.kind).toLowerCase();
    if (!kind) return;
    canonicalOps.push(kind);

    const rangeA1 = normalizeRange(
      op.rangeA1 ?? op.range ?? op.a1,
      activeSheetName || undefined,
      input.semanticIndex,
    );
    const sheetNameRaw =
      normalizeString(op.sheetName ?? op.sheet ?? op.sheetId) ||
      (rangeA1 && rangeA1.includes("!")
        ? rangeA1.split("!")[0].replace(/^'/, "").replace(/'$/, "")
        : activeSheetName);
    const sheetName = resolveKnownSheetName(
      sheetNameRaw,
      input.semanticIndex,
      activeSheetName || undefined,
    );

    try {
      if (kind === "set_values") {
        if (!rangeA1) throw new Error("set_values requires rangeA1");
        const values = Array.isArray(op.values)
          ? (op.values as any[])
          : [[op.value ?? op.newValue ?? op.input ?? ""]];
        const matrix = Array.isArray(values[0]);
        patchOps.push({
          op: "SET_VALUE",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          ...(matrix
            ? { values: values as any[][], mode: "matrix" }
            : { value: values[0], mode: "broadcast" }),
        });
        return;
      }

      if (kind === "set_formula") {
        const range = normalizeRange(
          op.a1 ?? op.rangeA1 ?? op.range,
          activeSheetName || undefined,
          input.semanticIndex,
        );
        const formula = normalizeString(
          op.formula ?? op.expression ?? op.value,
        );
        if (!range || !formula)
          throw new Error("set_formula requires a1/range and formula");
        patchOps.push({
          op: "SET_FORMULA",
          range,
          ...(sheetName ? { sheet: sheetName } : {}),
          formula,
        });
        return;
      }

      if (kind === "insert_rows") {
        patchOps.push({
          op: "INSERT_ROWS",
          sheet: sheetName || "Sheet1",
          atRow: Math.max(
            1,
            Math.trunc(Number(op.startIndex ?? op.atRow ?? 0)) + 1,
          ),
          count: Math.max(1, Math.trunc(Number(op.count ?? 1))),
        });
        return;
      }

      if (kind === "delete_rows") {
        patchOps.push({
          op: "DELETE_ROWS",
          sheet: sheetName || "Sheet1",
          atRow: Math.max(
            1,
            Math.trunc(Number(op.startIndex ?? op.atRow ?? 0)) + 1,
          ),
          count: Math.max(1, Math.trunc(Number(op.count ?? 1))),
        });
        return;
      }

      if (kind === "insert_columns") {
        patchOps.push({
          op: "INSERT_COLUMNS",
          sheet: sheetName || "Sheet1",
          atCol: Math.max(
            1,
            Math.trunc(Number(op.startIndex ?? op.atCol ?? 0)) + 1,
          ),
          count: Math.max(1, Math.trunc(Number(op.count ?? 1))),
        });
        return;
      }

      if (kind === "delete_columns") {
        patchOps.push({
          op: "DELETE_COLUMNS",
          sheet: sheetName || "Sheet1",
          atCol: Math.max(
            1,
            Math.trunc(Number(op.startIndex ?? op.atCol ?? 0)) + 1,
          ),
          count: Math.max(1, Math.trunc(Number(op.count ?? 1))),
        });
        return;
      }

      if (kind === "add_sheet") {
        const title = normalizeString(op.title ?? op.name ?? op.sheetName);
        if (!title) throw new Error("add_sheet requires title/name");
        patchOps.push({ op: "ADD_SHEET", name: title });
        return;
      }

      if (kind === "rename_sheet") {
        const from = normalizeString(op.fromName ?? op.from ?? op.sheetName);
        const to = normalizeString(op.toName ?? op.to ?? op.name);
        if (!from || !to) throw new Error("rename_sheet requires from and to");
        patchOps.push({ op: "RENAME_SHEET", from, to });
        return;
      }

      if (kind === "delete_sheet") {
        const name = normalizeString(op.sheetName ?? op.name ?? op.sheet);
        if (!name) throw new Error("delete_sheet requires sheetName");
        patchOps.push({ op: "DELETE_SHEET", name });
        return;
      }

      if (kind === "sort_range") {
        if (!rangeA1) throw new Error("sort_range requires rangeA1");
        const specs = Array.isArray(op.sortSpecs)
          ? (op.sortSpecs as Array<Record<string, unknown>>)
          : [op as any];
        const keys = specs.map((item) => ({
          column: toColumnIndex(
            item.dimensionIndex ??
              item.columnIndex ??
              item.column ??
              item.sortBy ??
              1,
          ),
          order: (String(item.sortOrder ?? item.order ?? "ASC")
            .toUpperCase()
            .startsWith("DESC")
            ? "DESC"
            : "ASC") as "ASC" | "DESC",
        }));
        patchOps.push({
          op: "SORT_RANGE",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          keys,
          hasHeader: op.hasHeader !== false,
        });
        return;
      }

      if (kind === "filter_range") {
        const range =
          rangeA1 ||
          detectHeaderRangeFromSemantic(input.semanticIndex, sheetName || "") ||
          null;
        if (!range) throw new Error("filter_range requires rangeA1");
        patchOps.push({
          op: "FILTER_RANGE",
          range,
          ...(sheetName ? { sheet: sheetName } : {}),
        });
        return;
      }

      if (kind === "clear_filter") {
        const sheet = sheetName || normalizeString(op.sheet);
        if (!sheet) throw new Error("clear_filter requires sheetName");
        patchOps.push({ op: "CLEAR_FILTER", sheet });
        return;
      }

      if (kind === "set_number_format") {
        if (!rangeA1) throw new Error("set_number_format requires rangeA1");
        const format = normalizeString(
          op.pattern ?? op.format ?? op.numberFormat,
        );
        if (!format)
          throw new Error("set_number_format requires format pattern");
        patchOps.push({
          op: "SET_NUMBER_FORMAT",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          format,
        });
        return;
      }

      if (kind === "format_range") {
        if (!rangeA1) throw new Error("format_range requires rangeA1");
        const format =
          op.format && typeof op.format === "object"
            ? (op.format as Record<string, unknown>)
            : {};
        const stylePatch = {
          font: {
            ...(typeof format.bold === "boolean"
              ? { bold: Boolean(format.bold) }
              : {}),
            ...(typeof format.italic === "boolean"
              ? { italic: Boolean(format.italic) }
              : {}),
            ...(typeof format.underline === "boolean"
              ? { underline: Boolean(format.underline) }
              : {}),
            ...(typeof format.fontSizePt === "number"
              ? { size: Number(format.fontSizePt) }
              : {}),
            ...(normalizeString(format.fontFamily)
              ? { name: normalizeString(format.fontFamily) }
              : {}),
            ...(normalizeString(format.color)
              ? { color: normalizeString(format.color) }
              : {}),
          },
        };
        patchOps.push({
          op: "SET_STYLE",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          stylePatch,
          merge: "preserve",
        });
        return;
      }

      if (kind === "set_freeze_panes") {
        patchOps.push({
          op: "FREEZE_PANES",
          sheet: sheetName || "Sheet1",
          rowSplit: Math.max(
            0,
            Math.trunc(Number(op.frozenRowCount ?? op.rows ?? 0)),
          ),
          colSplit: Math.max(
            0,
            Math.trunc(Number(op.frozenColumnCount ?? op.columns ?? 0)),
          ),
        });
        return;
      }

      if (kind === "set_data_validation") {
        if (!rangeA1) throw new Error("set_data_validation requires rangeA1");
        const rule =
          op.rule && typeof op.rule === "object"
            ? (op.rule as any)
            : (op as any);
        patchOps.push({
          op: "SET_VALIDATION",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          rule: {
            type: String(rule.type || "ONE_OF_LIST").toUpperCase(),
            ...(Array.isArray(rule.values)
              ? { values: rule.values.map((v: any) => String(v)) }
              : {}),
            ...(Number.isFinite(Number(rule.min))
              ? { min: Number(rule.min) }
              : {}),
            ...(Number.isFinite(Number(rule.max))
              ? { max: Number(rule.max) }
              : {}),
            ...(typeof rule.strict === "boolean"
              ? { strict: rule.strict }
              : {}),
            ...(typeof rule.showCustomUi === "boolean"
              ? { showCustomUi: rule.showCustomUi }
              : {}),
            ...(normalizeString(rule.inputMessage)
              ? { inputMessage: normalizeString(rule.inputMessage) }
              : {}),
          },
        });
        return;
      }

      if (kind === "clear_data_validation") {
        if (!rangeA1) throw new Error("clear_data_validation requires rangeA1");
        patchOps.push({
          op: "CLEAR_VALIDATION",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
        });
        return;
      }

      if (kind === "apply_conditional_format") {
        if (!rangeA1)
          throw new Error("apply_conditional_format requires rangeA1");
        const rule =
          op.rule && typeof op.rule === "object"
            ? (op.rule as any)
            : (op as any);
        patchOps.push({
          op: "SET_CONDITIONAL_FORMAT",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          rule: {
            type: String(rule.type || "NUMBER_GREATER").toUpperCase(),
            value: rule.value ?? rule.threshold ?? 0,
            ...(normalizeString(rule.backgroundHex)
              ? { backgroundHex: normalizeString(rule.backgroundHex) }
              : {}),
            ...(normalizeString(rule.textHex)
              ? { textHex: normalizeString(rule.textHex) }
              : {}),
          },
        });
        return;
      }

      if (kind === "create_table") {
        if (!rangeA1) throw new Error("create_table requires rangeA1");
        const style = normalizeString(op.style || "light_gray").toLowerCase();
        patchOps.push({
          op: "CREATE_TABLE",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          hasHeader: op.hasHeader !== false,
          style: {
            style,
            ...(op.colors && typeof op.colors === "object"
              ? { colors: op.colors as any }
              : {}),
          },
        });
        return;
      }

      if (kind === "create_chart" || kind === "update_chart") {
        const spec =
          op.spec && typeof op.spec === "object"
            ? (op.spec as Record<string, unknown>)
            : (op as Record<string, unknown>);
        const chartRange = normalizeRange(
          spec.range ?? op.rangeA1 ?? op.range,
          activeSheetName || undefined,
          input.semanticIndex,
        );
        if (!chartRange) throw new Error(`${kind} requires chart range`);
        patchOps.push({
          op: "CREATE_CHART_CARD",
          range: chartRange,
          ...(sheetName ? { sheet: sheetName } : {}),
          chart: {
            type: String(spec.type || "BAR").toUpperCase(),
            ...(normalizeString(spec.title)
              ? { title: normalizeString(spec.title) }
              : {}),
            range: chartRange,
            settings: spec,
          },
        });
        return;
      }

      if (kind === "fill_down") {
        if (!rangeA1) throw new Error("fill_down requires rangeA1");
        const parsed = parseA1Range(
          rangeA1,
          activeSheetName || undefined,
        );
        const sourceRow =
          typeof op.sourceRow === "number"
            ? op.sourceRow
            : parsed.start.row;
        const formula = normalizeString(op.sourceFormula ?? op.formula);
        for (
          let c = parsed.start.col;
          c <= parsed.end.col;
          c += 1
        ) {
          for (
            let r = parsed.start.row;
            r <= parsed.end.row;
            r += 1
          ) {
            if (r === sourceRow) continue;
            const cellRange = `${parsed.sheetName}!${numberToCol(c)}${r}`;
            if (formula) {
              const rowDelta = r - sourceRow;
              const adjusted = formula.replace(
                /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
                (_m, dollarCol, col, dollarRow, row) => {
                  if (dollarRow === "$") return `${dollarCol}${col}${dollarRow}${row}`;
                  return `${dollarCol}${col}${dollarRow}${Number(row) + rowDelta}`;
                },
              );
              patchOps.push({
                op: "SET_FORMULA",
                range: cellRange,
                ...(sheetName ? { sheet: sheetName } : {}),
                formula: adjusted,
              });
            } else {
              patchOps.push({
                op: "SET_VALUE",
                range: cellRange,
                ...(sheetName ? { sheet: sheetName } : {}),
                value: (op.value as string | number | boolean | null) ?? null,
                mode: "broadcast",
              });
            }
          }
        }
        return;
      }

      if (kind === "fill_right") {
        if (!rangeA1) throw new Error("fill_right requires rangeA1");
        const parsed = parseA1Range(
          rangeA1,
          activeSheetName || undefined,
        );
        const sourceCol =
          typeof op.sourceCol === "number"
            ? op.sourceCol
            : parsed.start.col;
        const formula = normalizeString(op.sourceFormula ?? op.formula);
        for (
          let r = parsed.start.row;
          r <= parsed.end.row;
          r += 1
        ) {
          for (
            let c = parsed.start.col;
            c <= parsed.end.col;
            c += 1
          ) {
            if (c === sourceCol) continue;
            const cellRange = `${parsed.sheetName}!${numberToCol(c)}${r}`;
            if (formula) {
              const colDelta = c - sourceCol;
              const adjusted = formula.replace(
                /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
                (_m, dollarCol, col, dollarRow, row) => {
                  if (dollarCol === "$") return `${dollarCol}${col}${dollarRow}${row}`;
                  let colNum = 0;
                  for (const ch of col) colNum = colNum * 26 + (ch.charCodeAt(0) - 64);
                  const newCol = numberToCol(colNum + colDelta);
                  return `${dollarCol}${newCol}${dollarRow}${row}`;
                },
              );
              patchOps.push({
                op: "SET_FORMULA",
                range: cellRange,
                ...(sheetName ? { sheet: sheetName } : {}),
                formula: adjusted,
              });
            } else {
              patchOps.push({
                op: "SET_VALUE",
                range: cellRange,
                ...(sheetName ? { sheet: sheetName } : {}),
                value: (op.value as string | number | boolean | null) ?? null,
                mode: "broadcast",
              });
            }
          }
        }
        return;
      }

      if (kind === "fill_series") {
        if (!rangeA1) throw new Error("fill_series requires rangeA1");
        const parsed = parseA1Range(
          rangeA1,
          activeSheetName || undefined,
        );
        const step = typeof op.step === "number" ? op.step : 1;
        const seriesType = normalizeString(op.type).toLowerCase() || "linear";
        const startValue =
          typeof op.startValue === "number" ? op.startValue : 1;
        const height = parsed.end.row - parsed.start.row + 1;
        const width = parsed.end.col - parsed.start.col + 1;
        const vertical = height >= width;
        let idx = 0;
        if (vertical) {
          for (
            let r = parsed.start.row;
            r <= parsed.end.row;
            r += 1
          ) {
            for (
              let c = parsed.start.col;
              c <= parsed.end.col;
              c += 1
            ) {
              const cellRange = `${parsed.sheetName}!${numberToCol(c)}${r}`;
              let value: string | number;
              if (seriesType === "date") {
                const base = new Date(
                  typeof op.startValue === "string"
                    ? op.startValue
                    : "1970-01-01",
                );
                base.setDate(base.getDate() + idx * step);
                value = base.toISOString().slice(0, 10);
              } else {
                value = startValue + idx * step;
              }
              patchOps.push({
                op: "SET_VALUE",
                range: cellRange,
                ...(sheetName ? { sheet: sheetName } : {}),
                value,
                mode: "broadcast",
              });
              idx += 1;
            }
          }
        } else {
          for (
            let c = parsed.start.col;
            c <= parsed.end.col;
            c += 1
          ) {
            for (
              let r = parsed.start.row;
              r <= parsed.end.row;
              r += 1
            ) {
              const cellRange = `${parsed.sheetName}!${numberToCol(c)}${r}`;
              let value: string | number;
              if (seriesType === "date") {
                const base = new Date(
                  typeof op.startValue === "string"
                    ? op.startValue
                    : "1970-01-01",
                );
                base.setDate(base.getDate() + idx * step);
                value = base.toISOString().slice(0, 10);
              } else {
                value = startValue + idx * step;
              }
              patchOps.push({
                op: "SET_VALUE",
                range: cellRange,
                ...(sheetName ? { sheet: sheetName } : {}),
                value,
                mode: "broadcast",
              });
              idx += 1;
            }
          }
        }
        return;
      }

      if (kind === "merge_cells") {
        if (!rangeA1) throw new Error("merge_cells requires rangeA1");
        patchOps.push({
          op: "MERGE_CELLS",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
        });
        return;
      }

      if (kind === "wrap_text") {
        if (!rangeA1) throw new Error("wrap_text requires rangeA1");
        patchOps.push({
          op: "SET_STYLE",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          stylePatch: { align: { wrap: true } },
          merge: "preserve",
        });
        return;
      }

      if (kind === "auto_fit") {
        const cols: number[] = [];
        if (Array.isArray(op.columns)) {
          for (const c of op.columns as unknown[]) {
            const n = Number(c);
            if (Number.isFinite(n)) cols.push(Math.max(1, Math.trunc(n)));
          }
        } else if (rangeA1) {
          const parsed = parseA1Range(
            rangeA1,
            activeSheetName || undefined,
          );
          for (let c = parsed.start.col; c <= parsed.end.col; c += 1) {
            cols.push(c);
          }
        }
        if (!cols.length) throw new Error("auto_fit requires columns or rangeA1");
        patchOps.push({
          op: "SET_COL_WIDTH",
          sheet: sheetName || "Sheet1",
          cols,
          width: "auto",
        });
        return;
      }

      if (kind === "cond_format_data_bars") {
        if (!rangeA1)
          throw new Error("cond_format_data_bars requires rangeA1");
        patchOps.push({
          op: "SET_CONDITIONAL_FORMAT",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          rule: {
            type: "DATA_BARS",
            color: normalizeString(op.color) || "#4472C4",
          },
        });
        return;
      }

      if (kind === "cond_format_color_scale") {
        if (!rangeA1)
          throw new Error("cond_format_color_scale requires rangeA1");
        patchOps.push({
          op: "SET_CONDITIONAL_FORMAT",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          rule: {
            type: "COLOR_SCALE",
            minColor: normalizeString(op.minColor) || "#F8696B",
            maxColor: normalizeString(op.maxColor) || "#63BE7B",
            ...(normalizeString(op.midColor)
              ? { midColor: normalizeString(op.midColor) }
              : {}),
          },
        });
        return;
      }

      if (kind === "cond_format_top_n") {
        if (!rangeA1)
          throw new Error("cond_format_top_n requires rangeA1");
        const styleObj =
          op.style && typeof op.style === "object"
            ? (op.style as Record<string, unknown>)
            : {};
        const bgHex =
          normalizeString(styleObj.fill ?? op.backgroundHex) || "#FFC000";
        patchOps.push({
          op: "SET_CONDITIONAL_FORMAT",
          range: rangeA1,
          ...(sheetName ? { sheet: sheetName } : {}),
          rule: {
            type: "TOP_N",
            n: typeof op.n === "number" ? op.n : 10,
            ...(typeof op.percent === "boolean"
              ? { percent: op.percent }
              : {}),
            backgroundHex: bgHex,
          },
        });
        return;
      }

      if (kind === "hide_rows") {
        const rows: number[] = [];
        if (Array.isArray(op.rows)) {
          for (const r of op.rows as unknown[]) {
            const n = Number(r);
            if (Number.isFinite(n)) rows.push(Math.max(1, Math.trunc(n)));
          }
        }
        if (!rows.length) throw new Error("hide_rows requires rows");
        patchOps.push({
          op: "SET_ROW_VISIBILITY",
          sheet: sheetName || "Sheet1",
          rows,
          hidden: true,
        });
        return;
      }

      if (kind === "show_rows") {
        const rows: number[] = [];
        if (Array.isArray(op.rows)) {
          for (const r of op.rows as unknown[]) {
            const n = Number(r);
            if (Number.isFinite(n)) rows.push(Math.max(1, Math.trunc(n)));
          }
        }
        if (!rows.length) throw new Error("show_rows requires rows");
        patchOps.push({
          op: "SET_ROW_VISIBILITY",
          sheet: sheetName || "Sheet1",
          rows,
          hidden: false,
        });
        return;
      }

      if (kind === "hide_columns") {
        const cols: number[] = [];
        if (Array.isArray(op.columns)) {
          for (const c of op.columns as unknown[]) {
            const n = Number(c);
            if (Number.isFinite(n)) cols.push(Math.max(1, Math.trunc(n)));
          }
        }
        if (!cols.length) throw new Error("hide_columns requires columns");
        patchOps.push({
          op: "SET_COL_VISIBILITY",
          sheet: sheetName || "Sheet1",
          cols,
          hidden: true,
        });
        return;
      }

      if (kind === "show_columns") {
        const cols: number[] = [];
        if (Array.isArray(op.columns)) {
          for (const c of op.columns as unknown[]) {
            const n = Number(c);
            if (Number.isFinite(n)) cols.push(Math.max(1, Math.trunc(n)));
          }
        }
        if (!cols.length) throw new Error("show_columns requires columns");
        patchOps.push({
          op: "SET_COL_VISIBILITY",
          sheet: sheetName || "Sheet1",
          cols,
          hidden: false,
        });
        return;
      }

      if (kind === "aggregation") {
        const fn = normalizeString(op.function).toUpperCase() || "SUM";
        const sourceRange = normalizeRange(
          op.sourceRange ?? op.source ?? op.dataRange,
          activeSheetName || undefined,
          input.semanticIndex,
        );
        const targetCell = normalizeRange(
          op.targetCell ?? op.target ?? op.destination,
          activeSheetName || undefined,
          input.semanticIndex,
        );
        if (!sourceRange || !targetCell)
          throw new Error("aggregation requires sourceRange and targetCell");

        let formulaRef = sourceRange;
        if (sourceRange.includes("!")) {
          const srcSheet = sourceRange.split("!")[0].replace(/^'/, "").replace(/'$/, "");
          const tgtSheet = targetCell.includes("!")
            ? targetCell.split("!")[0].replace(/^'/, "").replace(/'$/, "")
            : sheetName;
          if (srcSheet === tgtSheet) {
            formulaRef = sourceRange.split("!")[1];
          }
        }
        patchOps.push({
          op: "SET_FORMULA",
          range: targetCell,
          ...(sheetName ? { sheet: sheetName } : {}),
          formula: `=${fn}(${formulaRef})`,
        });
        return;
      }

      if (
        kind === "chart_set_series" ||
        kind === "chart_set_titles" ||
        kind === "chart_set_axes"
      ) {
        const spec =
          op.spec && typeof op.spec === "object"
            ? (op.spec as Record<string, unknown>)
            : (op as Record<string, unknown>);
        const chartRange = normalizeRange(
          spec.range ?? op.rangeA1 ?? op.range,
          activeSheetName || undefined,
          input.semanticIndex,
        );
        if (!chartRange) throw new Error(`${kind} requires chart range`);
        patchOps.push({
          op: "CREATE_CHART_CARD",
          range: chartRange,
          ...(sheetName ? { sheet: sheetName } : {}),
          chart: {
            type: String(spec.type || "BAR").toUpperCase(),
            ...(normalizeString(spec.title)
              ? { title: normalizeString(spec.title) }
              : {}),
            range: chartRange,
            settings: spec,
          },
        });
        return;
      }

      if (kind === "chart_delete") {
        rejectedOps.push(
          `op#${index}:${kind}:agent_level_only — chart deletion requires model access`,
        );
        return;
      }

      rejectedOps.push(`op#${index}:${kind}:unsupported`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rejectedOps.push(`op#${index}:${kind}:${message}`);
    }
  });

  return { patchOps, rejectedOps, canonicalOps };
}
