import { Router, type Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { EditHandlerService } from '../services/core/handlers/editHandler.service';
import DocumentRevisionStoreService from '../services/editing/documentRevisionStore.service';

const router = Router({ mergeParams: true });

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeHexColor(value: unknown): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return undefined;
  return `#${m[1].toUpperCase()}`;
}

function normalizeTableStyle(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'light_gray';
  if (raw.includes('blue') || raw.includes('azul')) return 'blue';
  if (raw.includes('green') || raw.includes('verde')) return 'green';
  if (raw.includes('orange') || raw.includes('laranja')) return 'orange';
  if (raw.includes('teal') || raw.includes('ciano')) return 'teal';
  if (raw.includes('gray') || raw.includes('grey') || raw.includes('cinza')) return 'gray';
  return 'light_gray';
}

function quoteSheetNameForA1(name: string): string {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/^[A-Za-z0-9_]+$/.test(n)) return n;
  return `'${n.replace(/'/g, "''")}'`;
}

function qualifyA1WithSheet(rangeLike: unknown, sheetLike?: unknown): string | undefined {
  const rangeRaw = String(rangeLike || '').trim();
  if (!rangeRaw) return undefined;
  if (rangeRaw.includes('!')) return rangeRaw;
  const sheetRaw = String(sheetLike || '').trim();
  if (!sheetRaw) return rangeRaw;
  const quoted = quoteSheetNameForA1(sheetRaw);
  return quoted ? `${quoted}!${rangeRaw}` : rangeRaw;
}

function extractSheetNameFromA1(rangeLike: unknown): string | undefined {
  const raw = String(rangeLike || '').trim();
  if (!raw) return undefined;
  const bang = raw.indexOf('!');
  if (bang <= 0) return undefined;
  const left = raw.slice(0, bang).trim();
  if (!left) return undefined;
  if (left.startsWith("'") && left.endsWith("'") && left.length >= 2) {
    return left.slice(1, -1).replace(/''/g, "'");
  }
  return left;
}

function normalizeComputeKind(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const compact = raw.replace(/[\s-]+/g, '_');
  const alias: Record<string, string> = {
    set_values: 'set_values',
    set_cell: 'set_values',
    set_cells: 'set_values',
    set_value: 'set_values',
    write_value: 'set_values',
    write_cell: 'set_values',
    values_set: 'set_values',
    write_values: 'set_values',
    edit_cell: 'set_values',
    update_cell: 'set_values',
    edit_range: 'set_values',
    update_range: 'set_values',
    set_formula: 'set_formula',
    formula_set: 'set_formula',
    write_formula: 'set_formula',
    insert_rows: 'insert_rows',
    add_rows: 'insert_rows',
    delete_rows: 'delete_rows',
    remove_rows: 'delete_rows',
    insert_columns: 'insert_columns',
    add_columns: 'insert_columns',
    delete_columns: 'delete_columns',
    remove_columns: 'delete_columns',
    create_chart: 'create_chart',
    chart_create: 'create_chart',
    update_chart: 'update_chart',
    chart_update: 'update_chart',
    create_table: 'create_table',
    table_create: 'create_table',
    format_table: 'create_table',
    format_as_table: 'create_table',
    table_format: 'create_table',
    sort_range: 'sort_range',
    sort: 'sort_range',
    filter_range: 'filter_range',
    filter: 'filter_range',
    clear_filter: 'clear_filter',
    filter_clear: 'clear_filter',
    set_number_format: 'set_number_format',
    number_format: 'set_number_format',
    format_number: 'set_number_format',
    set_freeze_panes: 'set_freeze_panes',
    freeze_panes: 'set_freeze_panes',
    freeze: 'set_freeze_panes',
    set_data_validation: 'set_data_validation',
    data_validation: 'set_data_validation',
    clear_data_validation: 'clear_data_validation',
    data_validation_clear: 'clear_data_validation',
    apply_conditional_format: 'apply_conditional_format',
    conditional_format: 'apply_conditional_format',
    conditional_formatting: 'apply_conditional_format',
    set_print_layout: 'set_print_layout',
    print_layout: 'set_print_layout',
    xlsx_set_cell_value: 'set_values',
    xlsx_set_range_values: 'set_values',
    xlsx_set_cell_formula: 'set_formula',
    xlsx_set_range_formulas: 'set_formula',
    xlsx_fill_down: 'set_formula',
    xlsx_fill_right: 'set_formula',
    xlsx_format_range: 'format_range',
    xlsx_set_number_format: 'set_number_format',
    xlsx_sort_range: 'sort_range',
    xlsx_filter_apply: 'filter_range',
    xlsx_filter_clear: 'clear_filter',
    xlsx_table_create: 'create_table',
    xlsx_data_validation_set: 'set_data_validation',
    xlsx_freeze_panes: 'set_freeze_panes',
    xlsx_chart_create: 'create_chart',
    xlsx_chart_set_series: 'update_chart',
    xlsx_chart_set_titles: 'update_chart',
    xlsx_chart_set_axes: 'update_chart',
    xlsx_chart_move_resize: 'update_chart',
    format_range: 'format_range',
  };
  return alias[compact] || '';
}

function normalizeComputeOp(raw: unknown, fallbackSheetName?: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const kind = normalizeComputeKind(src.kind ?? src.type ?? src.op ?? src.operator);
  if (!kind) return null;

  const op: Record<string, unknown> = { ...src, kind };
  const explicitSheetName = asString(src.sheetName ?? src.sheet ?? src.tab ?? src.worksheet ?? src.sheetId);
  const sheetName = explicitSheetName || asString(fallbackSheetName);
  const rangeA1 = qualifyA1WithSheet(
    asString(src.rangeA1 ?? src.range ?? src.targetRange ?? src.a1Range ?? src.target),
    sheetName,
  );

  if (kind === 'set_values') {
    const setValuesRange = rangeA1 || qualifyA1WithSheet(
      asString(src.a1 ?? src.cell ?? src.targetCell ?? src.target),
      sheetName,
    );
    if (setValuesRange) op.rangeA1 = setValuesRange;
    if (!Array.isArray(src.values)) {
      const scalarValue =
        src.value ??
        src.newValue ??
        src.after ??
        src.text ??
        src.input;
      if (scalarValue !== undefined) op.values = [[scalarValue]];
    }
  }

  if (kind === 'set_formula') {
    const rawA1 = qualifyA1WithSheet(
      asString(src.a1 ?? src.cell ?? src.targetCell ?? src.target ?? src.rangeA1 ?? src.range ?? src.targetRange),
      sheetName,
    );
    if (rawA1) {
      const bang = rawA1.indexOf('!');
      const sheetPart = bang > 0 ? rawA1.slice(0, bang + 1) : '';
      const a1Part = bang > 0 ? rawA1.slice(bang + 1) : rawA1;
      const firstCell = String(a1Part || '').split(':')[0] || '';
      op.a1 = `${sheetPart}${firstCell}`;
    }
    const rawFormula = asString(src.formula) || asString(src.expression) || asString(src.value);
    if (rawFormula) op.formula = rawFormula.startsWith('=') ? rawFormula.slice(1).trim() : rawFormula;
  }

  if (kind === 'create_table') {
    if (rangeA1) op.rangeA1 = rangeA1;
    op.hasHeader = src.hasHeader !== false && src.hasHeaders !== false && src.headerRow !== false;
    op.style = normalizeTableStyle(src.style ?? src.tableStyle ?? src.theme);
    const colorsSource = (src.colors && typeof src.colors === 'object') ? (src.colors as Record<string, unknown>) : {};
    const colors = {
      header: normalizeHexColor(colorsSource.header ?? src.headerColor),
      stripe: normalizeHexColor(colorsSource.stripe ?? src.stripeColor ?? src.zebraColor),
      totals: normalizeHexColor(colorsSource.totals ?? src.totalsColor),
      border: normalizeHexColor(colorsSource.border ?? src.borderColor),
    };
    const cleanColors = Object.fromEntries(Object.entries(colors).filter(([, v]) => typeof v === 'string'));
    if (Object.keys(cleanColors).length) op.colors = cleanColors;
  }

  if (kind === 'sort_range') {
    if (rangeA1) op.rangeA1 = rangeA1;
    if (!Array.isArray(src.sortSpecs)) {
      const column = src.column ?? src.columnIndex ?? src.sortBy;
      const order = src.order ?? src.sortOrder ?? src.direction;
      if (column != null) op.sortSpecs = [{ column, ...(order != null ? { order } : {}) }];
    }
  }

  if (kind === 'filter_range' || kind === 'set_number_format' || kind === 'set_data_validation' || kind === 'clear_data_validation' || kind === 'apply_conditional_format') {
    if (rangeA1) op.rangeA1 = rangeA1;
  }

  if (kind === 'clear_filter') {
    if (sheetName) {
      op.sheetName = sheetName;
    } else {
      const fromRange = extractSheetNameFromA1(rangeA1);
      if (fromRange) op.sheetName = fromRange;
    }
  }

  if (kind === 'set_number_format') {
    const pattern = asString(src.pattern ?? src.format ?? src.numberFormat ?? src.formatString);
    if (pattern) op.pattern = pattern;
  }

  if (kind === 'format_range') {
    if (rangeA1) op.rangeA1 = rangeA1;
    const fmt = (src.format && typeof src.format === 'object') ? src.format : {};
    op.format = fmt;
  }

  if (kind === 'set_freeze_panes') {
    const atCell = asString(src.atCell ?? src.anchor);
    if (atCell) {
      const split = String(atCell).includes('!')
        ? String(atCell).split('!')
        : [null, String(atCell)];
      const atSheetRaw = split[0] ? String(split[0]).trim() : '';
      const atSheet = atSheetRaw
        ? (atSheetRaw.startsWith("'") && atSheetRaw.endsWith("'")
          ? atSheetRaw.slice(1, -1).replace(/''/g, "'")
          : atSheetRaw)
        : '';
      const atCellOnly = String(split[1] || atCell).trim();
      if (atSheet && !sheetName) op.sheetName = atSheet;
      const m = atCellOnly.match(/^([A-Za-z]{1,3})(\d{1,7})$/);
      if (m) {
        const row = Number(m[2]);
        let col = 0;
        for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
        op.frozenRowCount = Math.max(0, row - 1);
        op.frozenColumnCount = Math.max(0, col - 1);
      }
    }
    const rawRow = Number(src.row ?? src.rows ?? src.frozenRowCount);
    const rawCol = Number(src.column ?? src.col ?? src.columns ?? src.frozenColumnCount);
    if (Number.isFinite(rawRow) && rawRow >= 0) {
      op.frozenRowCount = Math.max(0, Math.trunc(rawRow));
    }
    if (Number.isFinite(rawCol) && rawCol >= 0) {
      op.frozenColumnCount = Math.max(0, Math.trunc(rawCol));
    }
    if (sheetName) op.sheetName = sheetName;
  }

  if (kind === 'set_print_layout' && src.hideGridLines != null && src.hideGridlines == null) {
    op.hideGridlines = Boolean(src.hideGridLines);
  }
  if (kind === 'set_print_layout' && sheetName) {
    op.sheetName = sheetName;
  }

  if (kind === 'create_chart' || kind === 'update_chart') {
    const spec = (src.spec && typeof src.spec === 'object') ? { ...(src.spec as Record<string, unknown>) } : {};
    const specRange = qualifyA1WithSheet(spec.range ?? src.rangeA1 ?? src.range, sheetName);
    if (specRange) spec.range = specRange;
    const type = asString(spec.type ?? src.chartType ?? src.type);
    if (type) spec.type = type.toUpperCase();
    const title = asString(spec.title ?? src.title);
    if (title) spec.title = title;
    if (Object.keys(spec).length) op.spec = spec;
  }

  return op;
}

function normalizeComputeOps(
  rawOps: unknown[],
  fallbackSheetName?: string,
): {
  acceptedOps: Array<Record<string, unknown>>;
  rejectedOps: Array<Record<string, unknown>>;
} {
  const flattenRawOps = (input: unknown[]): unknown[] => {
    const queue = Array.isArray(input) ? [...input] : [];
    const out: unknown[] = [];
    while (queue.length) {
      const item = queue.shift();
      if (!item || typeof item !== 'object') {
        out.push(item);
        continue;
      }
      const src = item as Record<string, unknown>;
      const nestedOps = Array.isArray(src.ops) ? src.ops : null;
      const nestedOperations = Array.isArray(src.operations) ? src.operations : null;
      if (nestedOps && nestedOps.length) {
        queue.unshift(...nestedOps);
        continue;
      }
      if (nestedOperations && nestedOperations.length) {
        queue.unshift(...nestedOperations);
        continue;
      }
      out.push(item);
    }
    return out;
  };
  const list = flattenRawOps(rawOps);
  const out: Array<Record<string, unknown>> = [];
  const rejectedOps: Array<Record<string, unknown>> = [];
  const hasA1 = (v: unknown) => typeof v === 'string' && String(v).trim().length > 0;
  const hasSheet = (v: unknown) => typeof v === 'string' && String(v).trim().length > 0;
  const hasSpecRange = (v: unknown) => v && typeof v === 'object' && hasA1((v as Record<string, unknown>).range);
  const isUsable = (op: Record<string, unknown>) => {
    const kind = String(op.kind || '').trim();
    if (!kind) return false;
    if (kind === 'set_values') return hasA1(op.rangeA1) && Array.isArray(op.values);
    if (kind === 'set_formula') return hasA1(op.a1) && hasA1(op.formula);
    if (kind === 'create_table') return hasA1(op.rangeA1);
    if (kind === 'sort_range') return hasA1(op.rangeA1) && Array.isArray(op.sortSpecs) && (op.sortSpecs as unknown[]).length > 0;
    if (kind === 'filter_range' || kind === 'set_number_format' || kind === 'set_data_validation' || kind === 'clear_data_validation' || kind === 'apply_conditional_format') {
      return hasA1(op.rangeA1);
    }
    if (kind === 'format_range') {
      return hasA1(op.rangeA1) && op.format && typeof op.format === 'object' && Object.keys(op.format as object).length > 0;
    }
    if (kind === 'clear_filter') return hasSheet(op.sheetName);
    if (kind === 'set_freeze_panes') {
      const hasRows = Number.isFinite(Number(op.frozenRowCount ?? (op as any).rows ?? (op as any).row));
      const hasCols = Number.isFinite(Number(op.frozenColumnCount ?? (op as any).columns ?? (op as any).col ?? (op as any).column));
      return hasSheet(op.sheetName) || hasA1(op.rangeA1) || hasRows || hasCols;
    }
    if (kind === 'set_print_layout') return hasSheet(op.sheetName) || hasA1(op.rangeA1);
    if (kind === 'create_chart') return hasSpecRange(op.spec);
    if (kind === 'update_chart') return Number.isInteger(Number(op.chartId)) && Number(op.chartId) > 0 && (hasSpecRange(op.spec) || (op.spec && typeof op.spec === 'object'));
    return true;
  };
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item || typeof item !== 'object') {
      rejectedOps.push({ index: i, reason: 'op_must_be_object' });
      continue;
    }
    const op = normalizeComputeOp(item, fallbackSheetName);
    if (!op) {
      const src = item as Record<string, unknown>;
      const rawKind = String(src.kind ?? src.type ?? src.op ?? src.operator ?? '').trim();
      rejectedOps.push({ index: i, kind: rawKind || null, reason: 'unsupported_or_missing_kind' });
      continue;
    }
    if (!isUsable(op)) {
      rejectedOps.push({ index: i, kind: String(op.kind || ''), reason: 'missing_required_fields' });
      continue;
    }
    out.push(op);
  }
  return { acceptedOps: out, rejectedOps };
}

function extractAffectedRanges(ops: Array<Record<string, unknown>>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const pushRange = (raw: unknown) => {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== 'object') continue;
    const kind = String(op.kind || '').trim();
    if (kind === 'set_formula') pushRange(op.a1);
    if (kind === 'create_chart' || kind === 'update_chart') {
      const spec = (op.spec && typeof op.spec === 'object') ? (op.spec as Record<string, unknown>) : null;
      if (spec) pushRange(spec.range);
    }
    pushRange(op.rangeA1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Change metrics
// ---------------------------------------------------------------------------

const A1_CELL_RE = /^([A-Za-z]{1,3})(\d{1,7})$/;

function parseA1Range(rangeStr: string): { r1: number; c1: number; r2: number; c2: number } | null {
  // Strip sheet prefix
  const bangIdx = rangeStr.indexOf('!');
  const a1Part = bangIdx >= 0 ? rangeStr.slice(bangIdx + 1) : rangeStr;
  const parts = a1Part.split(':');
  const parseCell = (cell: string) => {
    const m = cell.trim().match(A1_CELL_RE);
    if (!m) return null;
    let col = 0;
    for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { r: Number(m[2]), c: col };
  };
  const start = parseCell(parts[0]);
  if (!start) return null;
  if (parts.length === 1) return { r1: start.r, c1: start.c, r2: start.r, c2: start.c };
  const end = parseCell(parts[1]);
  if (!end) return null;
  return { r1: Math.min(start.r, end.r), c1: Math.min(start.c, end.c), r2: Math.max(start.r, end.r), c2: Math.max(start.c, end.c) };
}

interface ChangeMetrics {
  changedCellsCount: number;
  valueOpsCount: number;
  formatOpsCount: number;
  formulaOpsCount: number;
  objectOpsCount: number;
  structureOpsCount: number;
}

const VALUE_KINDS = new Set(['set_values', 'paste_grid', 'fill_down', 'fill_right']);
const FORMAT_KINDS = new Set(['set_number_format', 'format_range', 'apply_conditional_format', 'set_column_width', 'set_row_height', 'autofit']);
const FORMULA_KINDS = new Set(['set_formula']);
const OBJECT_KINDS = new Set(['create_chart', 'update_chart', 'create_table']);
const STRUCTURE_KINDS = new Set(['insert_rows', 'insert_columns', 'delete_rows', 'delete_columns', 'sort_range', 'filter_range', 'clear_filter', 'merge_cells', 'unmerge_cells']);

function computeChangeMetrics(ops: Array<Record<string, unknown>>, affectedRanges: string[]): ChangeMetrics {
  let changedCellsCount = 0;
  const counted = new Set<string>();
  for (const range of affectedRanges) {
    const key = range.toLowerCase();
    if (counted.has(key)) continue;
    counted.add(key);
    const parsed = parseA1Range(range);
    if (parsed) {
      changedCellsCount += (parsed.r2 - parsed.r1 + 1) * (parsed.c2 - parsed.c1 + 1);
    }
  }

  let valueOpsCount = 0;
  let formatOpsCount = 0;
  let formulaOpsCount = 0;
  let objectOpsCount = 0;
  let structureOpsCount = 0;
  for (const op of ops) {
    const kind = String(op.kind || '').trim();
    if (VALUE_KINDS.has(kind)) valueOpsCount++;
    else if (FORMAT_KINDS.has(kind)) formatOpsCount++;
    else if (FORMULA_KINDS.has(kind)) formulaOpsCount++;
    else if (OBJECT_KINDS.has(kind)) objectOpsCount++;
    else if (STRUCTURE_KINDS.has(kind)) structureOpsCount++;
  }

  return { changedCellsCount, valueOpsCount, formatOpsCount, formulaOpsCount, objectOpsCount, structureOpsCount };
}

function userIdFromReq(req: any): string | null {
  return asString(req?.user?.id);
}

function buildContext(req: any): { correlationId: string; clientMessageId: string; conversationId: string } {
  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const correlationId = asString(req.headers['x-correlation-id']) || asString(body.correlationId) || randomUUID();
  const clientMessageId = asString(req.headers['x-client-message-id']) || asString(body.clientMessageId) || randomUUID();
  const conversationId =
    asString(req.headers['x-conversation-id']) || asString(body.conversationId) || `editing:${userIdFromReq(req) || 'user'}`;
  return { correlationId, clientMessageId, conversationId };
}

/**
 * POST /api/documents/:id/studio/sheets/compute
 *
 * Applies a structured compute ops list to an XLSX document (Sheets-backed when available).
 * Body: { instruction?: string, ops: Array<...> }
 */
router.post('/compute', async (req: any, res: Response): Promise<void> => {
  const userId = userIdFromReq(req);
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Not authenticated.' });
    return;
  }

  const documentId = asString(req.params?.id);
  if (!documentId) {
    res.status(400).json({ ok: false, error: 'Missing document id.' });
    return;
  }

  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId },
    select: { id: true, filename: true, mimeType: true },
  });
  if (!doc) {
    res.status(404).json({ ok: false, error: 'Document not found.' });
    return;
  }

  if (doc.mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    res.status(400).json({ ok: false, error: 'compute is only available for XLSX files.' });
    return;
  }

  const body = (req.body as Record<string, unknown> | undefined) ?? {};
  const instruction = asString(body.instruction) || 'Compute (structured)';
  const activeSheetName = asString(body.activeSheetName) || undefined;
  const ops = Array.isArray(body.ops) ? body.ops : null;
  if (!ops) {
    res.status(400).json({ ok: false, error: 'Body must include ops: [...]' });
    return;
  }
  const { acceptedOps, rejectedOps } = normalizeComputeOps(ops, activeSheetName);
  if (!acceptedOps.length) {
    res.json({
      ok: true,
      data: {
        acceptedOps: [],
        rejectedOps,
        affectedRanges: [],
        warning: 'No usable spreadsheet operations were found. Include an explicit range/cell like SUMMARY1!D2 or select cells first.',
      },
    });
    return;
  }

  const ctx = buildContext(req);
  const handler = new EditHandlerService({
    revisionStore: new DocumentRevisionStoreService(),
  });

  const applyComputeRevision = async (opsToApply: Array<Record<string, unknown>>) => {
    const content = JSON.stringify({ ops: opsToApply });
    const result = await handler.execute({
      mode: 'apply',
      context: {
        userId,
        conversationId: ctx.conversationId,
        correlationId: ctx.correlationId,
        clientMessageId: ctx.clientMessageId,
      },
      planRequest: {
        instruction,
        operator: 'COMPUTE_BUNDLE',
        domain: 'sheets',
        documentId,
      },
      target: {
        id: `synthetic:compute:${documentId}`,
        label: 'Compute',
        confidence: 1,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: 'compute_route',
      },
      beforeText: '(structured compute)',
      proposedText: content,
      userConfirmed: true,
    });
    if (!result.ok) throw new Error(result.error || 'Compute apply failed.');
    const applyResult = result.result as any;
    return { revisionId: applyResult?.newRevisionId || applyResult?.revisionId || null };
  };

  try {
    const created = await applyComputeRevision(acceptedOps);

    const affectedRanges = extractAffectedRanges(acceptedOps);
    res.json({
      ok: true,
      data: {
        applyPath: 'sheets_studio_compute',
        revisionId: created.revisionId,
        acceptedOps,
        rejectedOps,
        affectedRanges,
        metrics: computeChangeMetrics(acceptedOps, affectedRanges),
      },
    });
  } catch (e: any) {
    const message = String(e?.message || '');
    const chartKinds = new Set(['create_chart', 'update_chart']);
    const chartOps = acceptedOps.filter((op) => chartKinds.has(String(op?.kind || '').trim()));
    const nonChartOps = acceptedOps.filter((op) => !chartKinds.has(String(op?.kind || '').trim()));
    const isChartEngineUnavailable =
      /CHART_ENGINE_UNAVAILABLE|chart creation requires|cannot create chart objects|unsupported compute op:\s*create_chart/i.test(message);

    if (isChartEngineUnavailable && chartOps.length > 0 && nonChartOps.length > 0) {
      try {
        const created = await applyComputeRevision(nonChartOps);
        const chartRejected = chartOps.map((op) => ({
          kind: String(op?.kind || ''),
          reason: 'chart_engine_unavailable',
        }));
        const partialRanges = extractAffectedRanges(nonChartOps);
        res.json({
          ok: true,
          data: {
            applyPath: 'sheets_studio_compute',
            revisionId: created.revisionId,
            acceptedOps: nonChartOps,
            rejectedOps: [...rejectedOps, ...chartRejected],
            affectedRanges: partialRanges,
            metrics: computeChangeMetrics(nonChartOps, partialRanges),
            warning: 'Chart operations were skipped because chart editing is unavailable for this workbook engine.',
          },
        });
        return;
      } catch {
        // Fall through to the original error response.
      }
    } else if (isChartEngineUnavailable && chartOps.length > 0 && nonChartOps.length === 0) {
      // All ops were charts and the chart engine is unavailable — return 200 with structured skip.
      res.json({
        ok: true,
        data: {
          applyPath: 'sheets_studio_compute',
          revisionId: null,
          acceptedOps: [],
          rejectedOps: chartOps.map((op) => ({ kind: String(op?.kind || ''), reason: 'chart_engine_unavailable' })),
          affectedRanges: [],
          warning: 'Chart operations were skipped because chart editing is unavailable for this workbook engine.',
        },
      });
      return;
    }

    res.status(400).json({
      ok: false,
      error: message || 'Compute failed.',
      errorCode: 'COMPUTE_FAILED',
      data: {
        acceptedOps,
        rejectedOps,
        affectedRanges: extractAffectedRanges(acceptedOps),
      },
    });
  }
});

export default router;
