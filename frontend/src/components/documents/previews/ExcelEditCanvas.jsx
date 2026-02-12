import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../services/api';
import { applyEdit } from '../../../services/editingService';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import { getPreviewCountForFile, getFileExtension } from '../../../utils/files/previewCount';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ComposedChart,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ZAxis,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import EditorToolbar from '../editor/EditorToolbar';
import '../../../styles/ExcelPreview.css';

function asSheetName(sheet) {
  if (!sheet) return 'Sheet1';
  if (typeof sheet === 'string') return sheet;
  return sheet.name || sheet.label || 'Sheet1';
}

function parseHtmlToSheetData(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');
  const sheetContainers = doc.querySelectorAll('.sheet-container');

  const parsed = {};
  sheetContainers.forEach((container, index) => {
    const table = container.querySelector('.excel-table');
    if (!table) return;

    const rows = [];
    const tableRows = table.querySelectorAll('tr');
    let maxCols = 0;

    tableRows.forEach((tr) => {
      const cells = [];
      const tds = tr.querySelectorAll('th, td');
      tds.forEach((cell) => {
        cells.push({
          value: cell.textContent || '',
          className: cell.className || '',
          isHeader: cell.tagName.toLowerCase() === 'th',
        });
      });
      if (cells.length > maxCols) maxCols = cells.length;
      rows.push(cells);
    });

    parsed[index] = { rows, colCount: maxCols, rowCount: rows.length };
  });

  return parsed;
}

function isGridPayload(text) {
  const t = String(text || '');
  return t.includes('\n') || t.includes('\t');
}

function gridSizeFromPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) return { r: 1, c: 1 };
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const delimiter = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  const rows = lines.map((l) => l.split(delimiter));
  const r = rows.length || 1;
  const c = Math.max(1, ...rows.map((row) => row.length || 1));
  return { r, c };
}

function parseGridPayload(text) {
  const raw = String(text || '').trimEnd();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const delimiter = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  // Keep empty cells (e.g. consecutive tabs), but drop totally-empty trailing lines.
  let end = lines.length;
  while (end > 0 && lines[end - 1] === '') end -= 1;
  return lines.slice(0, end).map((l) => l.split(delimiter));
}

function colLetterToIndex(letter) {
  const s = String(letter || '').trim().toUpperCase();
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 65 || code > 90) return null;
    n = n * 26 + (code - 64);
  }
  return n ? n - 1 : null; // zero-based
}

function indexToColLetter(index) {
  let n = Number(index);
  if (!Number.isFinite(n) || n < 0) return 'A';
  n += 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

function parseCellRefA1(ref) {
  const m = String(ref || '').trim().match(/^([A-Z]{1,3})(\d{1,7})$/i);
  if (!m) return null;
  const col = colLetterToIndex(String(m[1] || '').toUpperCase());
  const row = Number(m[2]);
  if (col == null || !Number.isFinite(row) || row < 1) return null;
  return { col, row };
}

function parseA1RangeOnly(a1) {
  const raw = String(a1 || '').trim();
  if (!raw) return null;
  const parts = raw.includes(':') ? raw.split(':') : [raw, raw];
  const s = parseCellRefA1(parts[0]);
  const e = parseCellRefA1(parts[1]);
  if (!s || !e) return null;
  return {
    c1: Math.min(s.col, e.col),
    c2: Math.max(s.col, e.col),
    r1: Math.min(s.row, e.row),
    r2: Math.max(s.row, e.row),
  };
}

function splitSheetAndA1(rangeA1) {
  const raw = String(rangeA1 || '').trim();
  if (!raw) return { sheetName: '', a1: '' };
  const bang = raw.indexOf('!');
  if (bang <= 0) return { sheetName: '', a1: raw };
  const left = raw.slice(0, bang).trim();
  const unquoted = (left.startsWith("'") && left.endsWith("'") && left.length >= 2)
    ? left.slice(1, -1).replace(/''/g, "'")
    : left;
  return { sheetName: unquoted, a1: raw.slice(bang + 1).trim() };
}

function worksheetRowToPreviewRowIdx(rowNumber) {
  const n = Number(rowNumber);
  if (!Number.isFinite(n)) return 1;
  // Preview grid index 0 is header; worksheet row 2 maps to preview rowIdx 1.
  return Math.max(1, Math.trunc(n) - 1);
}

function worksheetColToPreviewColIdx(columnIndexZeroBased) {
  const n = Number(columnIndexZeroBased);
  if (!Number.isFinite(n)) return 1;
  // Preview grid colIdx 0 is row header; worksheet col A(0) maps to colIdx 1.
  return Math.max(1, Math.trunc(n) + 1);
}

const ExcelEditCanvas = forwardRef(function ExcelEditCanvas(
  {
    document,
    zoom = 100,
    onApplied,
    onCountUpdate,
    hideToolbar = false,
    hideSheetTabs = false,
    onSelectedInfoChange,
    onLiveSelectionChange,
    draftValue: controlledDraftValue,
    onDraftValueChange,
    onStatusMsg,
    onSheetMetaChange,
    onAskAllybi,
    selectionHint = null,
  },
  ref
) {
  const { t } = useTranslation();
  const docId = document?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetData, setSheetData] = useState({});
  const [activeSheet, setActiveSheet] = useState(0);
  const [charts, setCharts] = useState([]); // [{type,title,range,sheetName,labelKey,seriesKeys,data}]
  const [tables, setTables] = useState([]); // [{range,sheetName,hasHeader}]
  const [activeChart, setActiveChart] = useState(0);

  const [selected, setSelected] = useState(null); // { rowIdx (>=1), colIdx (>=1) in parsed grid }
  const [selectedRange, setSelectedRange] = useState(null); // { start:{rowIdx,colIdx}, end:{rowIdx,colIdx} }
  const [draftValue, setDraftValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [flashRect, setFlashRect] = useState(null); // { r1,r2,c1,c2 } for post-apply highlight
  const [appliedHighlightRects, setAppliedHighlightRects] = useState([]); // persistent edit highlights
  const [askBubble, setAskBubble] = useState(null); // { rect:{top,left,width,height}, range:{r1,r2,c1,c2}, label }
  const [userHasSelected, setUserHasSelected] = useState(false);
  const [lockedCells, setLockedCells] = useState(new Set()); // Set of "rowIdx:colIdx" keys for locked cells
  const [draftOpsById, setDraftOpsById] = useState({}); // { [draftId]: ops[] }
  const [chartOverlayPos, setChartOverlayPos] = useState({ top: 12, left: 12 });
  const [chartOverlayPosByKey, setChartOverlayPosByKey] = useState({}); // { [chartKey]: {top,left} }
  const [hiddenChartKeys, setHiddenChartKeys] = useState({}); // { [chartKey]: true }
  const [dragAnchor, setDragAnchor] = useState(null);   // { rowIdx, colIdx } — where drag started
  const [dragEnd, setDragEnd] = useState(null);          // { rowIdx, colIdx } — current drag position
  const isDraggingRef = React.useRef(false);
  const chartDragRef = React.useRef(null);
  const chartOverlayRef = React.useRef(null);
  const selectionHistoryRef = useRef({ items: [], index: -1 });
  const [selectionHistoryVersion, setSelectionHistoryVersion] = useState(0);

  const rootRef = React.useRef(null);
  const tableContainerRef = React.useRef(null);
  const lastAppliedSelectionHintRef = React.useRef('');

  const scale = zoom / 100;

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setStatusMsg('');
    try {
      const res = await api.get(`/api/documents/${docId}/preview`);
      if (res.data?.previewType !== 'excel') {
        throw new Error(res.data?.error || 'Excel preview not available.');
      }
      const htmlContent = res.data?.htmlContent || '';
      const sheetList = Array.isArray(res.data?.sheets) ? res.data.sheets : [];
      const chartsList = Array.isArray(res.data?.charts) ? res.data.charts : [];
      const tablesList = Array.isArray(res.data?.tables) ? res.data.tables : [];
      setSheets(sheetList);
      const parsed = parseHtmlToSheetData(htmlContent);
      setSheetData(parsed);
      setCharts(chartsList);
      setTables(tablesList);
      setActiveChart(0);
      setHiddenChartKeys({});
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load Excel editor.');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    load();
  }, [load]);

  const currentSheetName = useMemo(() => asSheetName(sheets[activeSheet]), [sheets, activeSheet]);
  const current = sheetData[activeSheet] || null;
  const previewRowIdxForWorksheetRow = useCallback((rowNumber) => {
    const n = Math.trunc(Number(rowNumber));
    if (!Number.isFinite(n)) return 1;
    const rows = Array.isArray(current?.rows) ? current.rows : [];
    if (!rows.length) return worksheetRowToPreviewRowIdx(n);
    let firstNumericIdx = -1;
    let firstNumericValue = null;
    for (let idx = 1; idx < rows.length; idx += 1) {
      const rv = Number(String(rows[idx]?.[0]?.value || '').trim());
      if (!Number.isFinite(rv)) continue;
      if (rv === n) return idx;
      if (firstNumericIdx < 0) {
        firstNumericIdx = idx;
        firstNumericValue = rv;
      }
    }
    if (firstNumericIdx >= 0 && Number.isFinite(firstNumericValue)) {
      const guessed = firstNumericIdx + (n - firstNumericValue);
      return Math.max(1, Math.min(rows.length - 1, guessed));
    }
    return worksheetRowToPreviewRowIdx(n);
  }, [current]);
  const previewColIdxForWorksheetCol = useCallback((columnIndexZeroBased) => {
    const n = Math.trunc(Number(columnIndexZeroBased));
    if (!Number.isFinite(n)) return 1;
    const rows = Array.isArray(current?.rows) ? current.rows : [];
    const header = Array.isArray(rows?.[0]) ? rows[0] : [];
    const wanted = indexToColLetter(n);
    for (let colIdx = 1; colIdx < header.length; colIdx += 1) {
      const token = String(header[colIdx]?.value || '').trim().toUpperCase();
      if (token && token === wanted) return colIdx;
    }
    return worksheetColToPreviewColIdx(n);
  }, [current]);
  const normalizeSelectionSnapshot = useCallback((snapshot) => {
    const s = snapshot || {};
    const selectedCell =
      s?.selected && Number.isFinite(Number(s.selected.rowIdx)) && Number.isFinite(Number(s.selected.colIdx))
        ? { rowIdx: Number(s.selected.rowIdx), colIdx: Number(s.selected.colIdx) }
        : null;
    const rangeStart =
      s?.selectedRange?.start && Number.isFinite(Number(s.selectedRange.start.rowIdx)) && Number.isFinite(Number(s.selectedRange.start.colIdx))
        ? { rowIdx: Number(s.selectedRange.start.rowIdx), colIdx: Number(s.selectedRange.start.colIdx) }
        : null;
    const rangeEnd =
      s?.selectedRange?.end && Number.isFinite(Number(s.selectedRange.end.rowIdx)) && Number.isFinite(Number(s.selectedRange.end.colIdx))
        ? { rowIdx: Number(s.selectedRange.end.rowIdx), colIdx: Number(s.selectedRange.end.colIdx) }
        : null;
    const selectedRangeRect = (rangeStart && rangeEnd) ? { start: rangeStart, end: rangeEnd } : null;
    const lockedKeys = Array.isArray(s?.lockedKeys)
      ? s.lockedKeys.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    return {
      selected: selectedCell,
      selectedRange: selectedRangeRect,
      lockedKeys,
      userHasSelected: Boolean(selectedCell || selectedRangeRect || lockedKeys.length),
    };
  }, []);
  const applySelectionSnapshot = useCallback((snapshot) => {
    const next = normalizeSelectionSnapshot(snapshot);
    setSelected(next.selected);
    setSelectedRange(next.selectedRange);
    setLockedCells(new Set(next.lockedKeys));
    setDragAnchor(null);
    setDragEnd(null);
    setUserHasSelected(next.userHasSelected);
  }, [normalizeSelectionSnapshot]);
  const pushSelectionSnapshot = useCallback((snapshot) => {
    const next = normalizeSelectionSnapshot(snapshot);
    const timeline = selectionHistoryRef.current || { items: [], index: -1 };
    const base = timeline.items.slice(0, timeline.index + 1);
    const last = base.length ? base[base.length - 1] : null;
    if (last && JSON.stringify(last) === JSON.stringify(next)) return;
    const items = [...base, next].slice(-80);
    selectionHistoryRef.current = { items, index: items.length - 1 };
    setSelectionHistoryVersion((v) => v + 1);
  }, [normalizeSelectionSnapshot]);
  const selectionHistoryState = selectionHistoryRef.current || { items: [], index: -1 };
  const selectionHistoryTick = selectionHistoryVersion;
  const canUndoSelection = selectionHistoryTick >= 0 && Number(selectionHistoryState.index || -1) > 0;
  const canRedoSelection =
    Number(selectionHistoryState.index || -1) < ((selectionHistoryState.items?.length || 0) - 1);
  const undoSelection = useCallback(() => {
    const timeline = selectionHistoryRef.current;
    if (!timeline || timeline.index <= 0) return;
    const nextIndex = timeline.index - 1;
    const snap = timeline.items[nextIndex];
    selectionHistoryRef.current = { ...timeline, index: nextIndex };
    setSelectionHistoryVersion((v) => v + 1);
    applySelectionSnapshot(snap);
  }, [applySelectionSnapshot]);
  const redoSelection = useCallback(() => {
    const timeline = selectionHistoryRef.current;
    const maxIndex = (timeline?.items?.length || 0) - 1;
    if (!timeline || timeline.index >= maxIndex) return;
    const nextIndex = timeline.index + 1;
    const snap = timeline.items[nextIndex];
    selectionHistoryRef.current = { ...timeline, index: nextIndex };
    setSelectionHistoryVersion((v) => v + 1);
    applySelectionSnapshot(snap);
  }, [applySelectionSnapshot]);

  const columnNumberHints = useMemo(() => {
    // Heuristic display formatting: match the "look" of the column.
    // If the column mostly contains comma-grouped integers, format new numeric values the same way.
    const hints = {}; // colIdx -> { preferInteger: boolean }
    const rows = Array.isArray(current?.rows) ? current.rows : [];
    if (!rows.length) return hints;
    const body = rows.slice(1);
    const maxCols = Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
    for (let c = 0; c < maxCols; c += 1) {
      let commaInts = 0;
      let decimals = 0;
      let numeric = 0;
      for (const row of body.slice(0, 60)) {
        const v = row?.[c]?.value;
        const s = String(v ?? '').trim();
        if (!s) continue;
        // Skip percents / non-numeric.
        if (/%$/.test(s)) continue;
        if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) {
          numeric += 1;
          if (s.includes('.')) decimals += 1;
          else commaInts += 1;
          continue;
        }
        if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) {
          numeric += 1;
          if (s.includes('.')) decimals += 1;
        }
      }
      hints[c] = { preferInteger: numeric >= 4 && commaInts >= Math.max(3, decimals * 2) };
    }
    return hints;
  }, [current]);

  const formatNumericLike = useCallback((raw, colIdx) => {
    const s0 = String(raw ?? '').trim();
    if (!s0) return s0;
    if (/%$/.test(s0)) return s0;
    if (!/^[+-]?\d[\d,]*(?:\.\d+)?$/.test(s0)) return s0;
    // Don't touch small integers like 1,2,3 (often IDs).
    const digitsOnly = s0.replace(/[^\d]/g, '');
    if (digitsOnly.length <= 3) return s0;
    const n = Number(s0.replace(/,/g, ''));
    if (!Number.isFinite(n)) return s0;
    const preferInteger = Boolean(columnNumberHints?.[colIdx]?.preferInteger);
    const fmt = new Intl.NumberFormat('en-US', {
      useGrouping: true,
      maximumFractionDigits: preferInteger ? 0 : 2,
    });
    return fmt.format(n);
  }, [columnNumberHints]);

  // Draft overlays: lightweight, non-committing preview of COMPUTE_BUNDLE ops.
  // For now we support rendering values/formulas into the visible grid.
  const draftCellOverrides = useMemo(() => {
    const overrides = {}; // key: `${sheetName}!A1` -> { value, kind }
    const drafts = draftOpsById && typeof draftOpsById === 'object' ? draftOpsById : {};
    for (const k of Object.keys(drafts)) {
      const ops = Array.isArray(drafts[k]) ? drafts[k] : [];
      for (const op of ops) {
        const kind = String(op?.kind || '').trim();
        if (kind === 'set_formula') {
          const a1 = String(op?.a1 || '').trim();
          if (!a1) continue;
          overrides[a1] = { value: String(op?.formula || '').trim(), kind: 'formula' };
        } else if (kind === 'set_values') {
          const rangeA1 = String(op?.rangeA1 || '').trim();
          const values = Array.isArray(op?.values) ? op.values : null;
          if (!rangeA1 || !values) continue;
          const { sheetName: parsedSheet, a1 } = splitSheetAndA1(rangeA1);
          const activeSheetName = String(parsedSheet || currentSheetName || '').trim();
          const parsed = parseA1RangeOnly(a1);
          if (!parsed) continue;
          for (let rr = parsed.r1; rr <= parsed.r2; rr += 1) {
            for (let cc = parsed.c1; cc <= parsed.c2; cc += 1) {
              const vr = rr - parsed.r1;
              const vc = cc - parsed.c1;
              const row = Array.isArray(values?.[vr]) ? values[vr] : [];
              const v = Array.isArray(row) ? row[vc] : undefined;
              const a1Cell = `${indexToColLetter(cc)}${rr}`;
              overrides[`${activeSheetName}!${a1Cell}`] = { value: String(v ?? ''), kind: 'value' };
            }
          }
        }
      }
    }
    return overrides;
  }, [draftOpsById, currentSheetName]);

  const tableRangesForActiveSheet = useMemo(() => {
    const out = [];
    const sameSheet = (name) => String(name || '').trim().toLowerCase() === String(currentSheetName || '').trim().toLowerCase();

    const persisted = Array.isArray(tables) ? tables : [];
    for (const t of persisted) {
      const rawRange = String(t?.range || '').trim();
      if (!rawRange) continue;
      const split = splitSheetAndA1(rawRange);
      const sheetName = String(split.sheetName || t?.sheetName || '').trim();
      if (sheetName && !sameSheet(sheetName)) continue;
      const parsed = parseA1RangeOnly(split.a1 || rawRange);
      if (!parsed) continue;
      out.push({ ...parsed, hasHeader: t?.hasHeader !== false, source: 'persisted' });
    }

    const drafts = draftOpsById && typeof draftOpsById === 'object' ? draftOpsById : {};
    for (const id of Object.keys(drafts)) {
      const ops = Array.isArray(drafts[id]) ? drafts[id] : [];
      for (const op of ops) {
        if (String(op?.kind || '').trim() !== 'create_table') continue;
        const rawRange = String(op?.rangeA1 || op?.range || '').trim();
        if (!rawRange) continue;
        const split = splitSheetAndA1(rawRange);
        if (split.sheetName && !sameSheet(split.sheetName)) continue;
        const parsed = parseA1RangeOnly(split.a1 || rawRange);
        if (!parsed) continue;
        out.push({ ...parsed, hasHeader: op?.hasHeader !== false, source: 'draft' });
      }
    }
    return out;
  }, [currentSheetName, draftOpsById, tables]);

  const buildChartPayloadForRange = useCallback((rangeFull, specInput = null) => {
    const split = splitSheetAndA1(rangeFull);
    const parsed = parseA1RangeOnly(split.a1 || rangeFull);
    if (!parsed || !current || !Array.isArray(current.rows)) return null;
    const specType = typeof specInput === 'string'
      ? String(specInput || 'LINE').trim().toUpperCase()
      : String(specInput?.type || 'LINE').trim().toUpperCase();
    const specTitle = typeof specInput === 'string'
      ? ''
      : String(specInput?.title || '').trim();
    const settings = (specInput && typeof specInput === 'object')
      ? {
          ...(Number.isInteger(specInput?.headerCount) ? { headerCount: Number(specInput.headerCount) } : {}),
          ...(typeof specInput?.stacked === 'boolean' ? { stacked: Boolean(specInput.stacked) } : {}),
          ...(specInput?.comboSeries && typeof specInput.comboSeries === 'object' ? { comboSeries: specInput.comboSeries } : {}),
          ...(specInput?.bubble && typeof specInput.bubble === 'object' ? { bubble: specInput.bubble } : {}),
          ...(specInput?.histogram && typeof specInput.histogram === 'object' ? { histogram: specInput.histogram } : {}),
        }
      : {};

    // Parsed A1 coordinates are worksheet coordinates (A1 => col 0,row 1).
    // Preview grid adds row/column headers at index 0, so shift by +1.
    const startRowIdx = previewRowIdxForWorksheetRow(parsed.r1);
    const endRowIdx = Math.max(startRowIdx, previewRowIdxForWorksheetRow(parsed.r2));
    const startColIdx = previewColIdxForWorksheetCol(parsed.c1);
    const endColIdx = Math.max(startColIdx, previewColIdxForWorksheetCol(parsed.c2));

    const rows = current.rows;
    const parseNumeric = (v) => {
      const s = String(v ?? '').trim();
      if (!s) return null;
      let t = s.replace(/\s+/g, '');
      const isPct = /%$/.test(t);
      t = t.replace(/%$/, '');
      const isNegParen = /^\(.*\)$/.test(t);
      t = t.replace(/[()]/g, '');
      t = t.replace(/[^\d,.\-]/g, '');
      if (!t) return null;
      const n = Number(t.replace(/,/g, ''));
      if (!Number.isFinite(n)) return null;
      const signed = isNegParen ? -Math.abs(n) : n;
      return isPct ? signed / 100 : signed;
    };

    const firstDataColIdx = startColIdx;
    const isSingleColumn = startColIdx === endColIdx;
    const firstRow = rows[startRowIdx] || [];
    const nextRow = rows[startRowIdx + 1] || [];
    const firstRowCells = [];
    const nextRowNums = [];
    for (let c = startColIdx; c <= endColIdx; c += 1) {
      firstRowCells.push(String(firstRow?.[c]?.value ?? '').trim());
      nextRowNums.push(parseNumeric(nextRow?.[c]?.value));
    }

    const firstRowSeriesTexts = firstRowCells.slice(isSingleColumn ? 0 : 1);
    const nextRowSeriesNums = nextRowNums.slice(isSingleColumn ? 0 : 1);
    const hasFirstRowText = firstRowSeriesTexts.some((x) => x && parseNumeric(x) == null);
    const hasNextRowNumeric = nextRowSeriesNums.some((x) => typeof x === 'number');
    const hasHeaderRow = hasFirstRowText && hasNextRowNumeric;

    const labelKey = 'Label';
    const dataStartRowIdx = hasHeaderRow ? (startRowIdx + 1) : startRowIdx;
    const firstColumnStats = (() => {
      if (isSingleColumn) return { text: 0, numeric: 0 };
      let text = 0;
      let numeric = 0;
      for (let r = dataStartRowIdx; r <= endRowIdx; r += 1) {
        const raw = rows?.[r]?.[firstDataColIdx]?.value;
        const s = String(raw ?? '').trim();
        if (!s) continue;
        const n = parseNumeric(raw);
        if (Number.isFinite(n)) numeric += 1;
        else text += 1;
      }
      return { text, numeric };
    })();
    const treatFirstColumnAsLabel = !isSingleColumn && firstColumnStats.text > 0;
    const seriesKeys = [];
    if (isSingleColumn) {
      seriesKeys.push('Value');
    } else if (!treatFirstColumnAsLabel) {
      for (let c = startColIdx; c <= endColIdx; c += 1) {
        const headerText = String(firstRow?.[c]?.value ?? '').trim();
        const idx = c - startColIdx;
        seriesKeys.push(hasHeaderRow ? (headerText || `Series ${idx + 1}`) : `Series ${idx + 1}`);
      }
    } else {
      for (let c = startColIdx + 1; c <= endColIdx; c += 1) {
        const headerText = String(firstRow?.[c]?.value ?? '').trim();
        const idx = c - (startColIdx + 1);
        seriesKeys.push(hasHeaderRow ? (headerText || `Series ${idx + 1}`) : `Series ${idx + 1}`);
      }
    }

    const data = [];
    for (let r = dataStartRowIdx; r <= endRowIdx; r += 1) {
      const row = rows[r] || [];
      const item = {};
      if (isSingleColumn) {
        item[labelKey] = String(row?.[0]?.value ?? '').trim() || `Row ${r}`;
        item[seriesKeys[0]] = parseNumeric(row?.[firstDataColIdx]?.value);
      } else if (!treatFirstColumnAsLabel) {
        item[labelKey] = String(row?.[0]?.value ?? '').trim() || `Row ${r}`;
        for (let c = startColIdx; c <= endColIdx; c += 1) {
          const key = seriesKeys[c - startColIdx];
          item[key] = parseNumeric(row?.[c]?.value);
        }
      } else {
        for (let c = startColIdx; c <= endColIdx; c += 1) {
          const raw = row?.[c]?.value;
          if (c === startColIdx) {
            const rawLabel = String(raw ?? '').trim();
            item[labelKey] = rawLabel || `Row ${r}`;
          } else {
            const key = seriesKeys[c - (startColIdx + 1)];
            item[key] = parseNumeric(raw);
          }
        }
      }
      const hasSeriesNum = seriesKeys.some((k) => typeof item[k] === 'number');
      if (hasSeriesNum || String(item[labelKey] || '').trim()) data.push(item);
    }

    return {
      type: specType || 'LINE',
      title: specTitle || null,
      range: rangeFull,
      sheetName: split.sheetName || currentSheetName || 'Sheet1',
      labelKey,
      seriesKeys,
      data,
      settings,
    };
  }, [current, currentSheetName, previewRowIdxForWorksheetRow, previewColIdxForWorksheetCol]);

  const chartsForActiveSheet = useMemo(() => {
    const sameSheet = (name) => String(name || '').trim().toLowerCase() === String(currentSheetName || '').trim().toLowerCase();
    const persisted = (Array.isArray(charts) ? charts : []).filter((c) => {
      const sheet = String(c?.sheetName || '').trim();
      return !sheet || sameSheet(sheet);
    });

    const draftList = [];
    const drafts = draftOpsById && typeof draftOpsById === 'object' ? draftOpsById : {};
    for (const id of Object.keys(drafts)) {
      const ops = Array.isArray(drafts[id]) ? drafts[id] : [];
      for (const op of ops) {
        if (String(op?.kind || '').trim() !== 'create_chart') continue;
        const spec = op?.spec && typeof op.spec === 'object' ? op.spec : null;
        const range = String(spec?.range || '').trim();
        if (!range) continue;
        const split = splitSheetAndA1(range);
        if (split.sheetName && !sameSheet(split.sheetName)) continue;
        const built = buildChartPayloadForRange(range, spec || { type: 'LINE' });
        if (!built) continue;
        draftList.push({ ...built, __source: 'draft', __draftId: id });
      }
    }

    // De-duplicate exact range+type entries (persisted wins over draft).
    const seen = new Set();
    const out = [];
    for (const c of [...persisted, ...draftList]) {
      const key = `${String(c?.range || '').trim().toUpperCase()}|${String(c?.type || '').trim().toUpperCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out.filter((c) => {
      const chartKey = `${String(c?.sheetName || currentSheetName || 'Sheet1')}|${String(c?.range || '')}|${String(c?.type || 'LINE')}`;
      return !hiddenChartKeys[chartKey];
    });
  }, [charts, currentSheetName, draftOpsById, buildChartPayloadForRange, hiddenChartKeys]);

  const activeChartEntry = useMemo(() => {
    const list = chartsForActiveSheet;
    if (!list.length) return null;
    const idx = Math.max(0, Math.min(activeChart, list.length - 1));
    return list[idx] || null;
  }, [chartsForActiveSheet, activeChart]);
  const activeChartKey = useMemo(() => {
    if (!activeChartEntry) return '';
    return `${String(activeChartEntry?.sheetName || currentSheetName || 'Sheet1')}|${String(activeChartEntry?.range || '')}|${String(activeChartEntry?.type || 'LINE')}`;
  }, [activeChartEntry, currentSheetName]);

  const renderChart = (chart) => {
    if (!chart) return null;
    const type = String(chart.type || 'LINE').toUpperCase();
    const title = String(chart.title || '').trim();
    const labelKey = String(chart.labelKey || 'Label');
    const seriesKeys = Array.isArray(chart.seriesKeys) ? chart.seriesKeys.filter(Boolean) : [];
    const data = Array.isArray(chart.data) ? chart.data : [];
    const settings = chart?.settings && typeof chart.settings === 'object' ? chart.settings : {};

    const palette = ['#2563EB', '#16A34A', '#F59E0B', '#DC2626', '#7C3AED', '#0891B2', '#EA580C'];
    const parseNumeric = (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const s = String(value ?? '').trim();
      if (!s) return null;
      let t = s.replace(/\s+/g, '');
      const pct = t.endsWith('%');
      t = t.replace(/%$/, '');
      const parenNeg = /^\(.*\)$/.test(t);
      t = t.replace(/[()]/g, '');
      t = t.replace(/[^\d,.\-]/g, '');
      if (!t) return null;
      const n = Number(t.replace(/,/g, ''));
      if (!Number.isFinite(n)) return null;
      const signed = parenNeg ? -Math.abs(n) : n;
      return pct ? signed / 100 : signed;
    };

    const frameStyle = {
      border: '1px solid #E6E6EC',
      borderRadius: 14,
      background: 'white',
      padding: 12,
      boxShadow: '0 10px 30px rgba(17,24,39,0.06)',
    };

    const header = (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 900, fontSize: 14, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title || 'Chart'}
          </div>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 600, fontSize: 12, color: '#6B7280' }}>
            {type} • {String(chart.range || '')}
          </div>
        </div>
        {chartsForActiveSheet.length > 1 ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {chartsForActiveSheet.slice(0, 6).map((c, idx) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                type="button"
                onClick={() => setActiveChart(idx)}
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: '1px solid #E6E6EC',
                  background: idx === activeChart ? '#111827' : 'white',
                  color: idx === activeChart ? 'white' : '#111827',
                  cursor: 'pointer',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {String(c?.title || `Chart ${idx + 1}`).slice(0, 14)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );

    const invalid = (message) => (
      <div style={frameStyle}>
        {header}
        <div style={{
          border: '1px dashed #D1D5DB',
          borderRadius: 12,
          padding: '16px 14px',
          minHeight: 140,
          display: 'flex',
          alignItems: 'center',
          background: '#FAFAFB',
        }}>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontSize: 13, fontWeight: 700, color: '#374151' }}>
            {String(message || 'Selected range is incompatible with this chart type.')}
          </div>
        </div>
      </div>
    );

    const numericData = data.map((row) => {
      const next = { ...row };
      seriesKeys.forEach((k) => {
        const n = parseNumeric(row?.[k]);
        if (Number.isFinite(n)) next[k] = n;
      });
      return next;
    });

    const hasNumericSeries = seriesKeys.some((k) => numericData.some((row) => Number.isFinite(parseNumeric(row?.[k]))));
    if (!data.length) return invalid('No chart data found in the selected range.');

    if (type === 'PIE') {
      const series = seriesKeys[0] || 'Value';
      const pieData = numericData
        .map((row) => ({
          name: String(row?.[labelKey] ?? '').trim() || '(blank)',
          value: parseNumeric(row?.[series]),
        }))
        .filter((x) => Number.isFinite(x.value) && x.value > 0);
      if (!pieData.length) return invalid('Pie chart needs one numeric values column.');

      return (
        <div style={frameStyle}>
          {header}
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Legend />
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90}>
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={palette[idx % palette.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (type === 'SCATTER') {
      const xKey = seriesKeys[0];
      const yKey = seriesKeys[1] || seriesKeys[0];
      if (!xKey || !yKey) return invalid('Scatter chart needs two numeric columns (X and Y).');
      const scatterData = data
        .map((row, idx) => {
          const xRaw = row?.[xKey];
          const yRaw = row?.[yKey];
          const x = parseNumeric(xRaw);
          const y = parseNumeric(yRaw);
          return {
            x,
            y,
            label: String(row?.[labelKey] ?? '').trim() || `Row ${idx + 1}`,
          };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!scatterData.length) return invalid('Scatter chart has no valid numeric X/Y pairs in this range.');

      return (
        <div style={frameStyle}>
          {header}
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#EEF2F7" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis type="number" dataKey="y" tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip
                  formatter={(value) => (Number.isFinite(value) ? String(value) : '-')}
                  labelFormatter={(_, payload) => String(payload?.[0]?.payload?.label || '')}
                />
                <Legend />
                <Scatter data={scatterData} fill={palette[0]} name={title || 'Series'} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (type === 'BUBBLE') {
      const bubbleCfg = settings?.bubble && typeof settings.bubble === 'object' ? settings.bubble : {};
      const fallbackNumericKeys = seriesKeys.filter((k) => data.some((row) => Number.isFinite(parseNumeric(row?.[k]))));
      const xKey = (typeof bubbleCfg?.xColumn === 'string' && seriesKeys.includes(bubbleCfg.xColumn)) ? bubbleCfg.xColumn : (fallbackNumericKeys[0] || null);
      const yKey = (typeof bubbleCfg?.yColumn === 'string' && seriesKeys.includes(bubbleCfg.yColumn)) ? bubbleCfg.yColumn : (fallbackNumericKeys[1] || fallbackNumericKeys[0] || null);
      const zKey = (typeof bubbleCfg?.sizeColumn === 'string' && seriesKeys.includes(bubbleCfg.sizeColumn)) ? bubbleCfg.sizeColumn : (fallbackNumericKeys[2] || null);
      if (!xKey || !yKey) return invalid('Bubble chart needs numeric X and Y columns (size is optional).');
      const bubbleData = data
        .map((row, idx) => ({
          x: parseNumeric(row?.[xKey]),
          y: parseNumeric(row?.[yKey]),
          z: zKey ? parseNumeric(row?.[zKey]) : null,
          label: String(row?.[labelKey] ?? '').trim() || `Row ${idx + 1}`,
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({ ...p, z: Number.isFinite(p.z) ? Math.max(20, Math.min(260, Number(p.z))) : 80 }));
      if (!bubbleData.length) return invalid('Bubble chart has no valid numeric X/Y rows in this selection.');
      return (
        <div style={frameStyle}>
          {header}
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#EEF2F7" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 12, fill: '#6B7280' }} name={xKey} />
                <YAxis type="number" dataKey="y" tick={{ fontSize: 12, fill: '#6B7280' }} name={yKey} />
                <ZAxis type="number" dataKey="z" range={[60, 420]} />
                <Tooltip />
                <Scatter data={bubbleData} fill={palette[0]} name={title || 'Bubble'} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (type === 'HISTOGRAM') {
      const histCfg = settings?.histogram && typeof settings.histogram === 'object' ? settings.histogram : {};
      const pickedKey = (typeof histCfg?.valueColumn === 'string' && seriesKeys.includes(histCfg.valueColumn)) ? histCfg.valueColumn : (seriesKeys[0] || null);
      if (!pickedKey) return invalid('Histogram needs one numeric values column.');
      const values = data
        .map((row) => parseNumeric(row?.[pickedKey]))
        .filter((v) => Number.isFinite(v));
      if (!values.length) return invalid('Histogram has no numeric values in the selected range.');
      const min = Math.min(...values);
      const max = Math.max(...values);
      const requestedBucket = Number(histCfg?.bucketSize);
      const bucketSize = Number.isFinite(requestedBucket) && requestedBucket > 0
        ? requestedBucket
        : Math.max(1, (max - min) / Math.min(12, Math.max(4, Math.round(Math.sqrt(values.length)))));
      const bucketCount = Math.max(1, Math.min(24, Math.ceil((max - min) / bucketSize) || 1));
      const buckets = new Array(bucketCount).fill(null).map((_, idx) => ({
        bucket: `${(min + idx * bucketSize).toFixed(1)}-${(min + (idx + 1) * bucketSize).toFixed(1)}`,
        count: 0,
      }));
      for (const v of values) {
        const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((v - min) / bucketSize)));
        buckets[idx].count += 1;
      }
      return (
        <div style={frameStyle}>
          {header}
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip />
                <Bar dataKey="count" fill={palette[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (type === 'RADAR') {
      if (!hasNumericSeries) return invalid('Radar chart needs one label column and at least one numeric series.');
      return (
        <div style={frameStyle}>
          {header}
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart outerRadius="72%" data={numericData}>
                <PolarGrid />
                <PolarAngleAxis dataKey={labelKey} />
                <PolarRadiusAxis />
                <Tooltip />
                {seriesKeys.slice(0, 4).map((k, idx) => (
                  <Radar
                    key={k}
                    name={k}
                    dataKey={k}
                    stroke={palette[idx % palette.length]}
                    fill={palette[idx % palette.length]}
                    fillOpacity={0.25}
                  />
                ))}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (type === 'COMBO') {
      if (!hasNumericSeries) return invalid('Combo chart needs at least two numeric series columns.');
      const comboCfg = settings?.comboSeries && typeof settings.comboSeries === 'object' ? settings.comboSeries : {};
      const requestedLine = Array.isArray(comboCfg?.lineSeries) ? comboCfg.lineSeries.map((s) => String(s)) : [];
      const lineSeriesSet = new Set(requestedLine.filter((k) => seriesKeys.includes(k)));
      if (!lineSeriesSet.size && seriesKeys.length) lineSeriesSet.add(seriesKeys[seriesKeys.length - 1]);
      return (
        <div style={frameStyle}>
          {header}
          <div style={{ height: 290 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={numericData} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey={labelKey} tick={{ fontSize: 12, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
                <Tooltip />
                <Legend />
                {seriesKeys.slice(0, 6).map((k, idx) => (
                  lineSeriesSet.has(k)
                    ? <Line key={k} type="monotone" dataKey={k} stroke={palette[idx % palette.length]} strokeWidth={2} dot={false} />
                    : <Bar key={k} dataKey={k} fill={palette[idx % palette.length]} radius={[6, 6, 0, 0]} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    const common = (
      <>
        <CartesianGrid stroke="#EEF2F7" vertical={false} />
        <XAxis dataKey={labelKey} tick={{ fontSize: 12, fill: '#6B7280' }} />
        <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
        <Tooltip />
        <Legend />
      </>
    );

    const seriesLines = seriesKeys.slice(0, 6).map((k, idx) => {
      const color = palette[idx % palette.length];
      if (type === 'AREA') {
        return <Area key={k} type="monotone" dataKey={k} stroke={color} fill={color} fillOpacity={0.18} strokeWidth={2} dot={false} />;
      }
      if (type === 'BAR' || type === 'COLUMN' || type === 'STACKED_BAR' || type === 'STACKED_COLUMN') {
        return <Bar key={k} dataKey={k} fill={color} radius={[6, 6, 0, 0]} stackId={(type === 'STACKED_BAR' || type === 'STACKED_COLUMN') ? 'stack_1' : undefined} />;
      }
      return <Line key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={2} dot={false} />;
    });

    const ChartCmp =
      type === 'AREA' ? AreaChart : (type === 'BAR' || type === 'COLUMN' || type === 'STACKED_BAR' || type === 'STACKED_COLUMN') ? BarChart : LineChart;

    if (!hasNumericSeries) return invalid('No numeric series values were found in the selected range.');

    return (
      <div style={frameStyle}>
        {header}
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ChartCmp data={numericData} margin={{ top: 10, right: 16, bottom: 8, left: 8 }}>
              {common}
              {seriesLines}
            </ChartCmp>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const sheetMeta = useMemo(() => {
    const names = (Array.isArray(sheets) ? sheets : []).map((s) => asSheetName(s));
    const count = names.length || Object.keys(sheetData || {}).length || 0;
    const idx = Math.max(0, Math.min(activeSheet, Math.max(0, count - 1)));
    return {
      activeIndex: idx,
      sheetCount: count,
      sheetNames: names.length ? names : Array.from({ length: count }, (_, i) => `Sheet ${i + 1}`),
      activeName: names[idx] || `Sheet ${idx + 1}`,
    };
  }, [sheets, sheetData, activeSheet]);

  useEffect(() => {
    onSheetMetaChange?.(sheetMeta);
  }, [onSheetMetaChange, sheetMeta]);

  const previewCount = useMemo(() => {
    if (!document) return null;
    const fileExt = getFileExtension(document.filename || '');
    const sheetCount = sheets.length;
    if (sheetCount <= 0) return null;
    return getPreviewCountForFile({
      mimeType: document.mimeType,
      fileExt,
      totalSheets: sheetCount,
      currentSheet: activeSheet + 1,
      isLoading: loading,
      previewType: 'sheets',
    }, t);
  }, [document, sheets.length, activeSheet, loading, t]);

  useEffect(() => {
    if (onCountUpdate && previewCount) onCountUpdate(previewCount);
  }, [onCountUpdate, previewCount]);

  const selectedInfo = useMemo(() => {
    if (!current || !selected) return null;
    const headerRow = current.rows?.[0] || [];
    const row = current.rows?.[selected.rowIdx] || [];
    const colHeader = headerRow?.[selected.colIdx]?.value || '';
    const rowHeader = row?.[0]?.value || '';
    const colLetter = String(colHeader || '').trim().toUpperCase();
    const rowNumber = Number(String(rowHeader || '').trim());
    if (!colLetter || !Number.isFinite(rowNumber) || rowNumber < 1) return null;
    const a1 = `${colLetter}${rowNumber}`;
    const cellValue = row?.[selected.colIdx]?.value ?? '';
    return {
      a1,
      targetId: `${currentSheetName}!${a1}`,
      beforeText: String(cellValue ?? ''),
    };
  }, [current, selected, currentSheetName]);

  const cellA1At = useCallback((rowIdx, colIdx) => {
    if (!current) return null;
    const headerRow = current.rows?.[0] || [];
    const row = current.rows?.[rowIdx] || [];
    const colHeader = headerRow?.[colIdx]?.value || '';
    const rowHeader = row?.[0]?.value || '';
    const colLetter = String(colHeader || '').trim().toUpperCase();
    const rowNumber = Number(String(rowHeader || '').trim());
    if (!colLetter || !Number.isFinite(rowNumber) || rowNumber < 1) return null;
    return `${colLetter}${rowNumber}`;
  }, [current]);

  const selectedRangeInfo = useMemo(() => {
    if (!selectedRange) return null;
    const s = selectedRange.start;
    const e = selectedRange.end;
    if (!s || !e) return null;
    const r1 = Math.min(s.rowIdx, e.rowIdx);
    const r2 = Math.max(s.rowIdx, e.rowIdx);
    const c1 = Math.min(s.colIdx, e.colIdx);
    const c2 = Math.max(s.colIdx, e.colIdx);
    const a1Start = cellA1At(r1, c1);
    const a1End = cellA1At(r2, c2);
    if (!a1Start || !a1End) return null;
    const rangeA1 = `${a1Start}:${a1End}`;
    return {
      rangeA1,
      targetId: `${currentSheetName}!${rangeA1}`,
    };
  }, [cellA1At, currentSheetName, selectedRange]);

  const lockedBounds = useMemo(() => {
    if (!lockedCells || lockedCells.size === 0) return null;
    let r1 = Infinity, r2 = -Infinity, c1 = Infinity, c2 = -Infinity;
    for (const key of lockedCells) {
      const parts = String(key || '').split(':');
      const ri = Number(parts[0]);
      const ci = Number(parts[1]);
      if (!Number.isFinite(ri) || !Number.isFinite(ci)) continue;
      r1 = Math.min(r1, ri);
      r2 = Math.max(r2, ri);
      c1 = Math.min(c1, ci);
      c2 = Math.max(c2, ci);
    }
    if (!Number.isFinite(r1) || !Number.isFinite(r2) || !Number.isFinite(c1) || !Number.isFinite(c2)) return null;
    if (r2 < r1 || c2 < c1) return null;
    return { r1, r2, c1, c2 };
  }, [lockedCells]);

  const viewerSelectionForRange = useCallback(({ r1, r2, c1, c2 }) => {
    const a1Start = cellA1At(r1, c1);
    const a1End = cellA1At(r2, c2);
    if (!a1Start || !a1End) return null;
    const rangeA1 = a1Start === a1End ? a1Start : `${a1Start}:${a1End}`;
    const quoteSheetName = (name) => {
      const n = String(name || '').trim();
      if (!n) return 'Sheet1';
      // If name contains spaces or punctuation, quote it like Excel does.
      if (/[^A-Za-z0-9_]/.test(n)) return `'${n.replace(/'/g, "''")}'`;
      return n;
    };
    const text = `${quoteSheetName(currentSheetName)}!${rangeA1}`;
    const selectionKind = rangeA1.includes(":") ? "range" : "cell";
    return {
      domain: 'sheets',
      text,
      preview: text,
      sheetName: currentSheetName,
      rangeA1,
      selectionKind,
      ranges: [
        {
          sheetName: currentSheetName,
          rangeA1,
        },
      ],
      frozenAtIso: new Date().toISOString(),
    };
  }, [cellA1At, currentSheetName]);

  const clearSelection = useCallback((opts = {}) => {
    const recordHistory = opts?.recordHistory !== false;
    const hadSelection = Boolean(
      selected ||
      selectedRange?.start ||
      selectedRange?.end ||
      (lockedCells && lockedCells.size > 0)
    );
    setLockedCells(new Set());
    setSelectedRange(null);
    setSelected(null);
    setDragAnchor(null);
    setDragEnd(null);
    setFlashRect(null);
    setAskBubble(null);
    setUserHasSelected(false);
    if (recordHistory && hadSelection) {
      pushSelectionSnapshot({ selected: null, selectedRange: null, lockedKeys: [] });
    }
  }, [lockedCells, pushSelectionSnapshot, selected, selectedRange]);

  useEffect(() => {
    const hint = selectionHint && selectionHint.domain === 'sheets' ? selectionHint : null;
    const hintedRangeRaw = String(
      hint?.rangeA1 ||
      hint?.ranges?.[0]?.rangeA1 ||
      ''
    ).trim();
    const splitHintRange = splitSheetAndA1(hintedRangeRaw);
    const hintedRange = String(splitHintRange?.a1 || hintedRangeRaw || '').trim();
    if (!hintedRange) return;
    const parsed = parseA1RangeOnly(hintedRange);
    if (!parsed) return;

    const hintedSheetName = String(
      hint?.sheetName ||
      hint?.ranges?.[0]?.sheetName ||
      splitHintRange?.sheetName ||
      ''
    ).trim();
    const hintStamp = String(hint?.frozenAtIso || '').trim();
    const key = `${hintedSheetName || ''}!${hintedRange}|${hintStamp}`;
    if (key === lastAppliedSelectionHintRef.current) return;
    lastAppliedSelectionHintRef.current = key;

    if (hintedSheetName) {
      const idx = sheets.findIndex((s) => asSheetName(s) === hintedSheetName);
      if (idx >= 0 && idx !== activeSheet) setActiveSheet(idx);
    }

    const start = {
      rowIdx: previewRowIdxForWorksheetRow(parsed.r1),
      colIdx: previewColIdxForWorksheetCol(parsed.c1),
    };
    const end = {
      rowIdx: previewRowIdxForWorksheetRow(parsed.r2),
      colIdx: previewColIdxForWorksheetCol(parsed.c2),
    };
    setSelected(start);
    setSelectedRange(parsed.r1 === parsed.r2 && parsed.c1 === parsed.c2 ? null : { start, end });
    setUserHasSelected(true);
    setDragAnchor(null);
    setDragEnd(null);
    setLockedCells(() => {
      const next = new Set();
      for (let r = parsed.r1; r <= parsed.r2; r += 1) {
        for (let c = parsed.c1; c <= parsed.c2; c += 1) {
          next.add(`${previewRowIdxForWorksheetRow(r)}:${previewColIdxForWorksheetCol(c)}`);
        }
      }
      return next;
    });
    setAppliedHighlightRects([{ r1: start.rowIdx, r2: end.rowIdx, c1: start.colIdx, c2: end.colIdx }]);
    window.requestAnimationFrame(() => {
      try {
        const root = rootRef.current;
        const target = root?.querySelector?.(`td[data-row-idx="${start.rowIdx}"][data-col-idx="${start.colIdx}"]`) || null;
        target?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
      } catch {}
    });
    const lockedKeys = [];
    for (let r = start.rowIdx; r <= end.rowIdx; r += 1) {
      for (let c = start.colIdx; c <= end.colIdx; c += 1) lockedKeys.push(`${r}:${c}`);
    }
    pushSelectionSnapshot({
      selected: start,
      selectedRange: (start.rowIdx === end.rowIdx && start.colIdx === end.colIdx) ? null : { start, end },
      lockedKeys,
    });
  }, [selectionHint, sheets, activeSheet, previewRowIdxForWorksheetRow, previewColIdxForWorksheetCol, pushSelectionSnapshot]);

  // Esc clears the current selection lock/highlight.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      // If the user is typing in an input, do not hijack.
      const tag = String(e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      clearSelection();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [clearSelection]);

  useEffect(() => {
    onSelectedInfoChange?.(selectedInfo);
  }, [onSelectedInfoChange, selectedInfo]);

  // When switching sheets, reset selection so we don't point at an invalid cell.
  useEffect(() => {
    setSelected(null);
    setSelectedRange(null);
    setAskBubble(null);
    setUserHasSelected(false);
    setLockedCells(new Set());
    setDragAnchor(null);
    setDragEnd(null);
    setFlashRect(null);
    setAppliedHighlightRects([]);
    selectionHistoryRef.current = {
      items: [{ selected: null, selectedRange: null, lockedKeys: [], userHasSelected: false }],
      index: 0,
    };
    setSelectionHistoryVersion((v) => v + 1);
  }, [activeSheet]);

  // Compute the rectangle from drag anchor → drag end
  const dragRect = useMemo(() => {
    if (!dragAnchor || !dragEnd) return null;
    return {
      r1: Math.min(dragAnchor.rowIdx, dragEnd.rowIdx),
      r2: Math.max(dragAnchor.rowIdx, dragEnd.rowIdx),
      c1: Math.min(dragAnchor.colIdx, dragEnd.colIdx),
      c2: Math.max(dragAnchor.colIdx, dragEnd.colIdx),
    };
  }, [dragAnchor, dragEnd]);

  // Commit drag rectangle into locked cells on mouseup
  const commitDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const anchor = dragAnchor;
    const end = dragEnd;
    if (!anchor || !end) {
      setDragAnchor(null);
      setDragEnd(null);
      return;
    }
    const r1 = Math.min(anchor.rowIdx, end.rowIdx);
    const r2 = Math.max(anchor.rowIdx, end.rowIdx);
    const c1 = Math.min(anchor.colIdx, end.colIdx);
    const c2 = Math.max(anchor.colIdx, end.colIdx);
    const nextLocked = new Set();
    const lockedKeys = [];
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        const key = `${r}:${c}`;
        nextLocked.add(key);
        lockedKeys.push(key);
      }
    }
    setLockedCells(nextLocked);
    setSelected({ rowIdx: r1, colIdx: c1 });
    setSelectedRange(
      r1 === r2 && c1 === c2
        ? null
        : { start: { rowIdx: r1, colIdx: c1 }, end: { rowIdx: r2, colIdx: c2 } }
    );
    setDragAnchor(null);
    setDragEnd(null);
    setUserHasSelected(true);
    pushSelectionSnapshot({
      selected: { rowIdx: r1, colIdx: c1 },
      selectedRange: (r1 === r2 && c1 === c2)
        ? null
        : { start: { rowIdx: r1, colIdx: c1 }, end: { rowIdx: r2, colIdx: c2 } },
      lockedKeys,
    });
  }, [dragAnchor, dragEnd, pushSelectionSnapshot]);

  // Global mouseup listener to finish drag even if released outside cells
  useEffect(() => {
    const onUp = () => commitDrag();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [commitDrag]);

  const findCellEl = useCallback((rowIdx, colIdx) => {
    const root = rootRef.current;
    if (!root) return null;
    return root.querySelector?.(`td[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`) || null;
  }, []);

  const computeAskBubbleForSelection = useCallback((sel, range, lockedBox) => {
    // Prefer the user's locked multi-cell selection (drag selection) over single-cell focus.
    // This makes "Format selected range as table" / "Sum selected range" work without requiring
    // a separate shift+click range model.
    const hasLocked = Boolean(lockedBox?.r1 && lockedBox?.r2 && lockedBox?.c1 && lockedBox?.c2) &&
      Number(lockedBox.r2) >= Number(lockedBox.r1) &&
      Number(lockedBox.c2) >= Number(lockedBox.c1);

    const hasRange = !!range?.start && !!range?.end;
    const r1 = hasLocked ? lockedBox.r1 : hasRange ? Math.min(range.start.rowIdx, range.end.rowIdx) : sel?.rowIdx;
    const r2 = hasLocked ? lockedBox.r2 : hasRange ? Math.max(range.start.rowIdx, range.end.rowIdx) : sel?.rowIdx;
    const c1 = hasLocked ? lockedBox.c1 : hasRange ? Math.min(range.start.colIdx, range.end.colIdx) : sel?.colIdx;
    const c2 = hasLocked ? lockedBox.c2 : hasRange ? Math.max(range.start.colIdx, range.end.colIdx) : sel?.colIdx;
    if (!r1 || !r2 || !c1 || !c2) return null;

    const a = findCellEl(r1, c1);
    const b = findCellEl(r2, c2);
    const ra = a?.getBoundingClientRect?.();
    const rb = b?.getBoundingClientRect?.();
    if (!ra || !rb) return null;

    const rect = {
      top: Math.min(ra.top, rb.top),
      left: Math.min(ra.left, rb.left),
      width: Math.max(ra.right, rb.right) - Math.min(ra.left, rb.left),
      height: Math.max(ra.bottom, rb.bottom) - Math.min(ra.top, rb.top),
    };

    const selection = viewerSelectionForRange({ r1, r2, c1, c2 });
    const label = selection?.preview || 'Selection';
    return { rect, range: { r1, r2, c1, c2 }, label, selection };
  }, [findCellEl, viewerSelectionForRange]);

  useEffect(() => {
    const next = computeAskBubbleForSelection(selected, selectedRange, lockedBounds);
    setAskBubble(next);
  }, [selected, selectedRange, lockedBounds, computeAskBubbleForSelection]);

  // Position chart as an in-grid floating object (Excel-like), anchored near chart range start.
  useEffect(() => {
    if (!activeChartEntry) return;
    if (activeChartKey && chartOverlayPosByKey[activeChartKey]) {
      setChartOverlayPos(chartOverlayPosByKey[activeChartKey]);
      return;
    }
    const split = splitSheetAndA1(String(activeChartEntry?.range || '').trim());
    const parsed = parseA1RangeOnly(split.a1 || String(activeChartEntry?.range || '').trim());
    const container = tableContainerRef.current;
    if (!container || !parsed) {
      const fallback = { top: 12, left: 12 };
      setChartOverlayPos(fallback);
      if (activeChartKey) setChartOverlayPosByKey((prev) => ({ ...prev, [activeChartKey]: fallback }));
      return;
    }

    const startRow = previewRowIdxForWorksheetRow(parsed.r1);
    const startCol = previewColIdxForWorksheetCol(parsed.c1);
    const anchor = findCellEl(startRow, startCol);
    if (!anchor) {
      const fallback = { top: 12, left: 12 };
      setChartOverlayPos(fallback);
      if (activeChartKey) setChartOverlayPosByKey((prev) => ({ ...prev, [activeChartKey]: fallback }));
      return;
    }

    const containerRect = container.getBoundingClientRect?.();
    const anchorRect = anchor.getBoundingClientRect?.();
    if (!containerRect || !anchorRect) {
      const fallback = { top: 12, left: 12 };
      setChartOverlayPos(fallback);
      if (activeChartKey) setChartOverlayPosByKey((prev) => ({ ...prev, [activeChartKey]: fallback }));
      return;
    }

    const nextTop = Math.max(8, anchorRect.top - containerRect.top + container.scrollTop + 8);
    const nextLeft = Math.max(8, anchorRect.left - containerRect.left + container.scrollLeft + 8);
    const anchored = { top: nextTop, left: nextLeft };
    setChartOverlayPos(anchored);
    if (activeChartKey) setChartOverlayPosByKey((prev) => ({ ...prev, [activeChartKey]: anchored }));
  }, [activeChartEntry, activeChartKey, chartOverlayPosByKey, findCellEl, currentSheetName, current, previewRowIdxForWorksheetRow, previewColIdxForWorksheetCol]);

  const clampChartOverlayPos = useCallback((top, left) => {
    const container = tableContainerRef.current;
    const overlay = chartOverlayRef.current;
    if (!container || !overlay) {
      return { top: Math.max(8, top), left: Math.max(8, left) };
    }
    const maxTop = Math.max(8, container.scrollHeight - overlay.offsetHeight - 8);
    const maxLeft = Math.max(8, container.scrollWidth - overlay.offsetWidth - 8);
    return {
      top: Math.min(Math.max(8, top), maxTop),
      left: Math.min(Math.max(8, left), maxLeft),
    };
  }, []);

  const handleChartPointerDown = useCallback((event) => {
    if (typeof event.button === 'number' && event.button !== 0) return;
    if (!event.target?.closest?.('[data-chart-drag-handle="true"]')) return;
    event.preventDefault();
    event.stopPropagation?.();
    const origin = chartOverlayPos || { top: 12, left: 12 };
    chartDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originTop: origin.top,
      originLeft: origin.left,
    };

    const onMove = (moveEvent) => {
      const drag = chartDragRef.current;
      if (!drag) return;
      moveEvent.preventDefault?.();
      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      const next = clampChartOverlayPos(drag.originTop + deltaY, drag.originLeft + deltaX);
      setChartOverlayPos(next);
      if (activeChartKey) setChartOverlayPosByKey((prev) => ({ ...prev, [activeChartKey]: next }));
    };

    const onUp = () => {
      chartDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [activeChartKey, chartOverlayPos, clampChartOverlayPos]);

  // Editor chat needs to be "document-aware" even if the user didn't click Ask Allybi.
  // Continuously emit the current selection payload (cell or range) so the backend can
  // infer ranges/values (e.g. create chart) without asking the user to paste data.
  useEffect(() => {
    const sel = userHasSelected ? (askBubble?.selection || null) : null;
    onLiveSelectionChange?.(sel);
  }, [askBubble, onLiveSelectionChange, userHasSelected]);

  useEffect(() => {
    // Keep bubble position stable on scroll/resize by recomputing the rect from stored range.
    const root = rootRef.current;
    if (!root) return undefined;
    const bubble = askBubble;
    if (!bubble?.range) return undefined;

    const scrollParent = (() => {
      let el = root.parentElement;
      while (el) {
        try {
          const st = window.getComputedStyle(el);
          const oy = st?.overflowY || st?.overflow || '';
          if (/(auto|scroll)/.test(oy)) return el;
        } catch {}
        el = el.parentElement;
      }
      return window;
    })();

    const onMove = () => {
      const cur = askBubble;
      if (!cur?.range) return;
      const next = computeAskBubbleForSelection(
        { rowIdx: cur.range.r1, colIdx: cur.range.c1 },
        { start: { rowIdx: cur.range.r1, colIdx: cur.range.c1 }, end: { rowIdx: cur.range.r2, colIdx: cur.range.c2 } }
      );
      if (next?.rect) setAskBubble((prev) => (prev ? { ...prev, rect: next.rect } : prev));
    };

    try {
      scrollParent.addEventListener?.('scroll', onMove, { passive: true });
    } catch {}
    window.addEventListener('resize', onMove, { passive: true });
    return () => {
      try { scrollParent.removeEventListener?.('scroll', onMove); } catch {}
      window.removeEventListener('resize', onMove);
    };
  }, [askBubble, computeAskBubbleForSelection]);

  const effectiveDraftValue = controlledDraftValue != null ? controlledDraftValue : draftValue;

  const pendingState = useMemo(() => {
    if (!selectedInfo?.a1 || !selected) return { isGrid: false, isDirty: false, overrides: {}, rect: null };
    const draft = String(effectiveDraftValue ?? '');
    const before = String(selectedInfo.beforeText ?? '');
    const isGrid = isGridPayload(draft);

    if (isGrid) {
      const grid = parseGridPayload(draft);
      const r = grid.length || 0;
      const c = Math.max(0, ...grid.map((row) => (Array.isArray(row) ? row.length : 0)));
      if (!r || !c) return { isGrid: true, isDirty: false, overrides: {}, rect: null };

      const rect = {
        r1: selected.rowIdx,
        c1: selected.colIdx,
        r2: selected.rowIdx + (r - 1),
        c2: selected.colIdx + (c - 1),
      };
      const overrides = {};
      for (let rr = 0; rr < r; rr += 1) {
        for (let cc = 0; cc < c; cc += 1) {
          const rowIdx = selected.rowIdx + rr;
          const colIdx = selected.colIdx + cc;
          const a1 = cellA1At(rowIdx, colIdx);
          if (!a1) continue;
          overrides[`${currentSheetName}!${a1}`] = { value: String(grid?.[rr]?.[cc] ?? '') };
        }
      }
      return { isGrid: true, isDirty: true, overrides, rect };
    }

    const dirty = draft.trim() !== before.trim();
    if (!dirty) return { isGrid: false, isDirty: false, overrides: {}, rect: null };
    return {
      isGrid: false,
      isDirty: true,
      overrides: { [`${currentSheetName}!${selectedInfo.a1}`]: { value: draft } },
      rect: null,
    };
  }, [selectedInfo?.a1, selectedInfo?.beforeText, selected, effectiveDraftValue, currentSheetName, cellA1At]);

  // Track previous targetId so we know when the user clicked a different cell.
  const prevTargetIdRef = React.useRef(null);

  const computeHighlightRectsFromOps = useCallback((ops) => {
    const list = Array.isArray(ops) ? ops : [];
    const normalizeRect = (range) => {
      const split = splitSheetAndA1(String(range || '').trim());
      if (!split.a1) return null;
      if (split.sheetName && String(split.sheetName).trim().toLowerCase() !== String(currentSheetName || '').trim().toLowerCase()) {
        return null;
      }
      const parsed = parseA1RangeOnly(split.a1);
      if (!parsed) return null;
      return {
        r1: previewRowIdxForWorksheetRow(parsed.r1),
        r2: previewRowIdxForWorksheetRow(parsed.r2),
        c1: previewColIdxForWorksheetCol(parsed.c1),
        c2: previewColIdxForWorksheetCol(parsed.c2),
      };
    };

    const out = [];
    const seen = new Set();
    for (const op of list) {
      const kind = String(op?.kind || '').trim();
      if (kind === 'set_formula') {
        const rect = normalizeRect(String(op?.a1 || '').trim());
        if (rect) {
          const k = `${rect.r1}:${rect.c1}:${rect.r2}:${rect.c2}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push(rect);
          }
        }
      }
      if (kind === 'create_chart' || kind === 'update_chart') {
        const rect = normalizeRect(String(op?.spec?.range || '').trim());
        if (rect) {
          const k = `${rect.r1}:${rect.c1}:${rect.r2}:${rect.c2}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push(rect);
          }
        }
      }
      const range = String(op?.rangeA1 || op?.range || '').trim();
      if (!range) continue;
      const rect = normalizeRect(range);
      if (rect) {
        const k = `${rect.r1}:${rect.c1}:${rect.r2}:${rect.c2}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push(rect);
        }
      }
    }
    return out.slice(0, 12);
  }, [currentSheetName, previewRowIdxForWorksheetRow, previewColIdxForWorksheetCol]);
  const computeFlashRectFromOps = useCallback((ops) => {
    const list = computeHighlightRectsFromOps(ops);
    return list.length ? list[0] : null;
  }, [computeHighlightRectsFromOps]);

  // Keep draftValue in sync with selection changes.
  // When the user clicks a new cell, always update the draft to that cell's value.
  useEffect(() => {
    if (!selectedInfo) return;
    const targetChanged = prevTargetIdRef.current !== selectedInfo.targetId;
    prevTargetIdRef.current = selectedInfo.targetId;

    if (controlledDraftValue != null) {
      // New cell selected → always show that cell's value.
      if (targetChanged) onDraftValueChange?.(selectedInfo.beforeText);
      return;
    }
    // Do not auto-repopulate when user intentionally clears current input.
    if (targetChanged) setDraftValue(selectedInfo.beforeText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInfo?.targetId, controlledDraftValue, onDraftValueChange, selectedInfo?.beforeText]);

  const apply = useCallback(async () => {
    if (!docId || !selectedInfo) return;
    const proposedTextRaw = String(effectiveDraftValue ?? '');
    const proposedText = proposedTextRaw.trim();
    if (!proposedText && proposedText !== '') {
      setStatusMsg('Nothing to apply.');
      onStatusMsg?.('Nothing to apply.');
      return;
    }

    const beforeText = String(selectedInfo.beforeText ?? '');
    const targetId = selectedInfo.targetId;

    const nextFlashRect = (() => {
      if (!selected) return null;
      if (isGridPayload(proposedTextRaw)) {
        const { r, c } = gridSizeFromPayload(proposedTextRaw);
        if (!r || !c) return null;
        return { r1: selected.rowIdx, c1: selected.colIdx, r2: selected.rowIdx + (r - 1), c2: selected.colIdx + (c - 1) };
      }
      return { r1: selected.rowIdx, c1: selected.colIdx, r2: selected.rowIdx, c2: selected.colIdx };
    })();

    setIsApplying(true);
    setStatusMsg('');
    onStatusMsg?.('');
    try {
      if (isGridPayload(proposedText)) {
        // Range paste: treat the selected cell as the top-left corner.
        const { r, c } = gridSizeFromPayload(proposedText);
        const colLetter = selectedInfo.a1.replace(/[0-9]/g, '');
        const rowNumber = Number(selectedInfo.a1.replace(/[^0-9]/g, ''));
        const startColIdx = colLetterToIndex(colLetter);
        if (startColIdx == null) throw new Error('Invalid selection.');

        const endCol = indexToColLetter(startColIdx + (c - 1));
        const endRow = rowNumber + (r - 1);
        const rangeA1 = `${colLetter}${rowNumber}:${endCol}${endRow}`;
        const rangeTargetId = `${currentSheetName}!${rangeA1}`;

        await applyEdit({
          instruction: `Manual edit (range) in viewer: ${cleanDocumentName(document?.filename)}`,
          operator: 'EDIT_RANGE',
          domain: 'sheets',
          documentId: docId,
          targetHint: rangeTargetId,
          target: {
            id: rangeTargetId,
            label: `Range ${rangeA1}`,
            confidence: 1,
            candidates: [],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: 'viewer_selection',
          },
          beforeText: beforeText || '(range)',
          proposedText,
          userConfirmed: true,
        });
      } else {
        await applyEdit({
          instruction: `Manual edit in viewer: ${cleanDocumentName(document?.filename)}`,
          operator: 'EDIT_CELL',
          domain: 'sheets',
          documentId: docId,
          targetHint: targetId,
          target: {
            id: targetId,
            label: `Cell ${selectedInfo.a1}`,
            confidence: 1,
            candidates: [],
            decisionMargin: 1,
            isAmbiguous: false,
            resolutionReason: 'viewer_selection',
          },
          beforeText: beforeText || '(empty)',
          proposedText,
          userConfirmed: true,
        });
      }

      setStatusMsg('Applied. Refreshing…');
      onStatusMsg?.('Applied. Refreshing…');
      await load();
      if (nextFlashRect) {
        setFlashRect(nextFlashRect);
        setAppliedHighlightRects([nextFlashRect]);
        window.setTimeout(() => setFlashRect(null), 950);
      }
      onApplied?.();
      setStatusMsg('Applied.');
      onStatusMsg?.('Applied.');
      setTimeout(() => setStatusMsg(''), 1500);
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Apply failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
    } finally {
      setIsApplying(false);
    }
  }, [docId, selectedInfo, selected, effectiveDraftValue, currentSheetName, document?.filename, load, onApplied, onStatusMsg]);

  const compute = useCallback(async (ops) => {
    if (!docId) return;
    if (!Array.isArray(ops) || ops.length === 0) return;
    setIsApplying(true);
    setStatusMsg('');
    onStatusMsg?.('');
    try {
      const nextFlashRect = computeFlashRectFromOps(ops);
      const highlightRects = computeHighlightRectsFromOps(ops);
      await api.post(`/api/documents/${docId}/studio/sheets/compute`, {
        instruction: `Manual compute in viewer: ${cleanDocumentName(document?.filename)}`,
        ops,
      });

      setStatusMsg('Applied. Refreshing…');
      onStatusMsg?.('Applied. Refreshing…');
      await load();
      if (nextFlashRect) {
        setFlashRect(nextFlashRect);
        window.setTimeout(() => setFlashRect(null), 950);
      }
      setAppliedHighlightRects(highlightRects);
      onApplied?.();
      setStatusMsg('Applied.');
      onStatusMsg?.('Applied.');
      setTimeout(() => setStatusMsg(''), 1500);
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Compute failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
    } finally {
      setIsApplying(false);
    }
  }, [docId, document?.filename, load, onApplied, onStatusMsg, computeFlashRectFromOps, computeHighlightRectsFromOps]);

  const revert = useCallback(() => {
    if (!selectedInfo) return;
    const v = selectedInfo.beforeText || '';
    if (controlledDraftValue != null) onDraftValueChange?.(v);
    else setDraftValue(v);
    const msg = 'Reverted.';
    setStatusMsg(msg);
    onStatusMsg?.(msg);
    setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1000);
  }, [controlledDraftValue, onDraftValueChange, onStatusMsg, selectedInfo]);

  useImperativeHandle(ref, () => ({
    apply,
    revert,
    reload: () => load(),
    applyDraftOps: ({ draftId, ops }) => {
      const id = String(draftId || '').trim();
      if (!id) return false;
      const list = Array.isArray(ops) ? ops : [];
      setDraftOpsById((prev) => ({ ...(prev || {}), [id]: list }));
      return true;
    },
    discardDraftOps: ({ draftId }) => {
      const id = String(draftId || '').trim();
      if (!id) return false;
      setDraftOpsById((prev) => {
        const next = { ...(prev || {}) };
        delete next[id];
        return next;
      });
      return true;
    },
    clearAllDraftOps: () => setDraftOpsById({}),
    getSelectedInfo: () => selectedInfo,
    getDraftValue: () => effectiveDraftValue,
    setDraftValue: (v) => {
      if (controlledDraftValue != null) onDraftValueChange?.(v);
      else setDraftValue(v);
    },
    getIsApplying: () => isApplying,
    getSheetMeta: () => sheetMeta,
    setActiveSheet: (index) => {
      const i = Number(index);
      if (!Number.isFinite(i)) return;
      const count = sheetMeta.sheetCount || 0;
      if (count <= 0) return;
      setActiveSheet(Math.max(0, Math.min(count - 1, i)));
    },
    nextSheet: () => {
      const count = sheetMeta.sheetCount || 0;
      if (count <= 1) return;
      setActiveSheet((p) => Math.max(0, Math.min(count - 1, (p ?? 0) + 1)));
    },
    prevSheet: () => {
      const count = sheetMeta.sheetCount || 0;
      if (count <= 1) return;
      setActiveSheet((p) => Math.max(0, Math.min(count - 1, (p ?? 0) - 1)));
    },
    getLockedCells: () => {
      if (!current || lockedCells.size === 0) return [];
      return Array.from(lockedCells).map((key) => {
        const [rStr, cStr] = key.split(':');
        const ri = Number(rStr);
        const ci = Number(cStr);
        const a1 = cellA1At(ri, ci);
        const row = current.rows?.[ri] || [];
        const cellValue = row?.[ci]?.value ?? '';
        return { rowIdx: ri, colIdx: ci, a1, value: String(cellValue), targetId: a1 ? `${currentSheetName}!${a1}` : null };
      }).filter((c) => c.a1);
    },
    clearLockedCells: () => setLockedCells(new Set()),
    undoSelection,
    redoSelection,
    getViewerSelection: () => {
      if (askBubble?.selection) return askBubble.selection;
      if (selectedRange) {
        const s = selectedRange.start;
        const e = selectedRange.end;
        if (s && e) {
          const r1 = Math.min(s.rowIdx, e.rowIdx);
          const r2 = Math.max(s.rowIdx, e.rowIdx);
          const c1 = Math.min(s.colIdx, e.colIdx);
          const c2 = Math.max(s.colIdx, e.colIdx);
          return viewerSelectionForRange({ r1, r2, c1, c2 });
        }
      }
      if (selected?.rowIdx && selected?.colIdx) {
        return viewerSelectionForRange({
          r1: selected.rowIdx,
          r2: selected.rowIdx,
          c1: selected.colIdx,
          c2: selected.colIdx,
        });
      }
      return null;
    },
    clearSelection,
  }), [apply, revert, selectedInfo, effectiveDraftValue, controlledDraftValue, onDraftValueChange, isApplying, load, sheetMeta, lockedCells, current, cellA1At, currentSheetName, askBubble, selectedRange, selected, viewerSelectionForRange, clearSelection, undoSelection, redoSelection]);

  if (loading) {
    return (
      <div className="excel-preview-loading">
        <div className="excel-preview-loading-spinner" />
        <div className="excel-preview-loading-text">{t('excelPreview.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="excel-preview-error">
        <div className="excel-preview-error-icon">📊</div>
        <div className="excel-preview-error-title">{t('excelPreview.previewNotAvailable')}</div>
        <div className="excel-preview-error-filename">{document?.filename}</div>
        <div className="excel-preview-error-message">{error}</div>
      </div>
    );
  }

  const sheetCount = sheets.length || Object.keys(sheetData).length;

  return (
    <div ref={rootRef} className="excel-preview-container" style={{ position: 'relative' }}>
      {userHasSelected && askBubble?.rect && askBubble?.selection ? (
        <div
          style={{
            position: 'fixed',
            left: askBubble.rect.left + (askBubble.rect.width / 2),
            top: Math.max(12, askBubble.rect.top - 10),
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid rgba(17,24,39,0.14)',
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 10px 22px rgba(17,24,39,0.12)',
            backdropFilter: 'blur(6px)',
          }}
          onMouseDown={(e) => {
            // Prevent stealing focus from the grid selection.
            e.preventDefault();
          }}
          title={askBubble.label}
        >
          <button
            type="button"
            onClick={() => onAskAllybi?.(askBubble.selection)}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#111827',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 950,
              fontSize: 12,
              cursor: 'pointer',
              padding: '6px 8px',
            }}
          >
            Ask Allybi
          </button>
          <button
            type="button"
            disabled={!canUndoSelection}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => {
              if (!canUndoSelection) return;
              undoSelection();
            }}
            style={{
              border: '1px solid rgba(17,24,39,0.12)',
              background: 'white',
              color: '#111827',
              borderRadius: 999,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 900,
              fontSize: 12,
              cursor: canUndoSelection ? 'pointer' : 'not-allowed',
              opacity: canUndoSelection ? 1 : 0.55,
              padding: '6px 10px',
            }}
            title="Undo selection"
          >
            Undo
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={() => {
              if (!canRedoSelection) return;
              redoSelection();
            }}
            disabled={!canRedoSelection}
            style={{
              border: '1px solid rgba(17,24,39,0.12)',
              background: 'white',
              color: '#111827',
              borderRadius: 999,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 900,
              fontSize: 12,
              cursor: canRedoSelection ? 'pointer' : 'not-allowed',
              opacity: canRedoSelection ? 1 : 0.55,
              padding: '6px 10px',
            }}
            title="Redo selection"
          >
            Redo
          </button>
        </div>
      ) : null}
      {!hideToolbar ? (
        <EditorToolbar
          title={`Editing ${cleanDocumentName(document?.filename)}`}
          subtitle="Drag to select cells. Shift+click to select a range. Paste a TSV/CSV grid to edit a range."
          scopeLabel={selectedRangeInfo?.targetId || selectedInfo?.targetId || `${currentSheetName}!A1`}
          format="sheets"
          canFormatText={false}
          isApplying={isApplying}
          extraActions={[
            {
              label: 'Row +',
              title: 'Insert row below',
              disabled: !selectedInfo,
              onClick: async () => {
                const rowNumber = Number(selectedInfo?.a1?.replace(/[^0-9]/g, ''));
                if (!Number.isFinite(rowNumber) || rowNumber < 1) return;
                await compute([{ kind: 'insert_rows', sheetName: currentSheetName, startIndex: rowNumber, count: 1 }]);
              },
            },
            {
              label: 'Col +',
              title: 'Insert column right',
              disabled: !selectedInfo,
              onClick: async () => {
                const colLetter = String(selectedInfo?.a1 || '').replace(/[0-9]/g, '');
                const colIdx0 = colLetterToIndex(colLetter);
                if (colIdx0 == null) return;
                await compute([{ kind: 'insert_columns', sheetName: currentSheetName, startIndex: colIdx0 + 1, count: 1 }]);
              },
            },
            {
              label: 'Chart',
              title: 'Create chart from selected range (or prompt for range)',
              disabled: false,
              onClick: async () => {
                const range =
                  selectedRangeInfo?.targetId ||
                  window.prompt('Range (A1), e.g. Sheet1!A1:B10', `${currentSheetName}!A1:B10`);
                if (!range) return;
                const typeRaw = window.prompt(
                  'Chart type: PIE, BAR, COLUMN, LINE, AREA, SCATTER, STACKED_BAR, STACKED_COLUMN, COMBO, BUBBLE, HISTOGRAM, RADAR',
                  'PIE',
                );
                const type = String(typeRaw || '').trim().toUpperCase();
                if (!type) return;
                const title = window.prompt('Chart title (optional)', '') || '';
                await compute([{ kind: 'create_chart', spec: { type, range, ...(title.trim() ? { title: title.trim() } : {}) } }]);
              },
            },
          ]}
          centerSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <input
                value={effectiveDraftValue}
                onChange={(e) => {
                  if (controlledDraftValue != null) onDraftValueChange?.(e.target.value);
                  else setDraftValue(e.target.value);
                }}
                placeholder="Value (or paste a grid)"
                style={{
                  flex: 1,
                  minWidth: 120,
                  height: 36,
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  padding: '0 12px',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 700,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              {statusMsg ? (
                <div style={{
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 850,
                  fontSize: 12,
                  color: '#111827',
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  background: 'rgba(249, 250, 251, 0.9)',
                  whiteSpace: 'nowrap',
                }}>
                  {statusMsg}
                </div>
              ) : null}
              {/* Selection history controls */}
              <button
                type="button"
                onClick={() => undoSelection()}
                disabled={!canUndoSelection}
                title="Undo selection"
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  background: canUndoSelection ? 'white' : '#F9FAFB',
                  color: canUndoSelection ? '#111827' : '#9CA3AF',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: canUndoSelection ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => redoSelection()}
                disabled={!canRedoSelection}
                title="Redo selection"
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  background: canRedoSelection ? 'white' : '#F9FAFB',
                  color: canRedoSelection ? '#111827' : '#9CA3AF',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: canRedoSelection ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Redo
              </button>
              {/* Revert — restore draft value to original cell value */}
              <button
                type="button"
                onClick={revert}
                disabled={!selectedInfo || isApplying}
                title="Revert"
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #E5E7EB',
                  background: (!selectedInfo || isApplying) ? '#F9FAFB' : 'white',
                  color: (!selectedInfo || isApplying) ? '#9CA3AF' : '#111827',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: (!selectedInfo || isApplying) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Revert
              </button>
              {/* Apply — commit draft value to the selected cell */}
              <button
                type="button"
                onClick={apply}
                disabled={!selectedInfo || isApplying}
                title="Apply"
                style={{
                  height: 36,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid #111827',
                  background: (!selectedInfo || isApplying) ? '#9CA3AF' : '#111827',
                  color: 'white',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 950,
                  fontSize: 13,
                  cursor: (!selectedInfo || isApplying) ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  opacity: (!selectedInfo || isApplying) ? 0.6 : 1,
                }}
              >
                {isApplying ? 'Applying…' : 'Apply'}
              </button>
            </div>
          }
        />
      ) : null}

      {/* Spreadsheet Grid */}
      <div className="excel-preview-grid-wrapper">
        <div
          className="excel-preview-grid-scaler"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: scale !== 1 ? `${100 / scale}%` : '100%',
          }}
        >
          {current && current.rows?.length > 0 ? (
            <div
              className="excel-preview-table-container"
              ref={tableContainerRef}
              style={{ position: 'relative' }}
            >
              {/* Charts are rendered in chat cards (expandable), not over the sheet grid. */}
              <table className="excel-preview-table">
                <thead>
                  <tr>
                    {current.rows[0].map((cell, colIdx) => (
                      <th
                        key={colIdx}
                        className={`excel-cell excel-header-cell ${colIdx === 0 ? 'excel-corner-cell' : ''}`}
                      >
                        {cell.value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.rows.slice(1).map((row, rowIdx0) => {
                    const rowIdx = rowIdx0 + 1; // align with parsed grid indices
                    return (
                      <tr key={rowIdx0}>
                        {row.map((cell, colIdx) => {
                          if (colIdx === 0) {
                            return (
                              <th key={colIdx} className="excel-cell excel-row-header">
                                {cell.value}
                              </th>
                            );
                          }
                          const isSelected = selected?.rowIdx === rowIdx && selected?.colIdx === colIdx;
                          const cellLockKey = `${rowIdx}:${colIdx}`;
                          const isLocked = lockedCells.has(cellLockKey);
                          const inDrag = Boolean(dragRect) && rowIdx >= dragRect.r1 && rowIdx <= dragRect.r2 && colIdx >= dragRect.c1 && colIdx <= dragRect.c2;
                          const inPendingRange = Boolean(pendingState?.rect) &&
                            rowIdx >= pendingState.rect.r1 && rowIdx <= pendingState.rect.r2 &&
                            colIdx >= pendingState.rect.c1 && colIdx <= pendingState.rect.c2;
                          const pendingEdges = pendingState?.rect ? {
                            top: inPendingRange && rowIdx === pendingState.rect.r1,
                            bottom: inPendingRange && rowIdx === pendingState.rect.r2,
                            left: inPendingRange && colIdx === pendingState.rect.c1,
                            right: inPendingRange && colIdx === pendingState.rect.c2,
                          } : { top: false, bottom: false, left: false, right: false };
                          const isFlashing = Boolean(flashRect) &&
                            rowIdx >= flashRect.r1 && rowIdx <= flashRect.r2 &&
                            colIdx >= flashRect.c1 && colIdx <= flashRect.c2;
                          const isAppliedHighlighted = Array.isArray(appliedHighlightRects) && appliedHighlightRects.some((rect) =>
                            rect &&
                            rowIdx >= Number(rect.r1) &&
                            rowIdx <= Number(rect.r2) &&
                            colIdx >= Number(rect.c1) &&
                            colIdx <= Number(rect.c2)
                          );

                          const a1Here = cellA1At(rowIdx, colIdx);
                          const keyHere = a1Here ? `${currentSheetName}!${a1Here}` : '';
                          const hasPendingOverride = Boolean(keyHere && pendingState?.overrides?.[keyHere]);
                          const showPendingCorner = pendingState?.rect
                            ? (inPendingRange && rowIdx === pendingState.rect.r1 && colIdx === pendingState.rect.c1)
                            : hasPendingOverride;
                          const inAnyTableRange = tableRangesForActiveSheet.some((t) => {
                            const c = colLetterToIndex(String(a1Here || '').replace(/[0-9]/g, ''));
                            const r = Number(String(a1Here || '').replace(/[^0-9]/g, ''));
                            if (c == null || !Number.isFinite(r)) return false;
                            return c >= t.c1 && c <= t.c2 && r >= t.r1 && r <= t.r2;
                          });
                          const isTableHeaderCell = tableRangesForActiveSheet.some((t) => {
                            if (!t?.hasHeader) return false;
                            const c = colLetterToIndex(String(a1Here || '').replace(/[0-9]/g, ''));
                            const r = Number(String(a1Here || '').replace(/[^0-9]/g, ''));
                            if (c == null || !Number.isFinite(r)) return false;
                            return c >= t.c1 && c <= t.c2 && r === t.r1;
                          });

                          const cellBoxShadow = (() => {
                            const shadows = [];
                            if (isSelected) shadows.push('inset 0 0 0 2px rgba(17, 24, 39, 0.6)');
                            if (pendingEdges.top) shadows.push('inset 0 2px 0 0 #16A34A');
                            if (pendingEdges.bottom) shadows.push('inset 0 -2px 0 0 #16A34A');
                            if (pendingEdges.left) shadows.push('inset 2px 0 0 0 #16A34A');
                            if (pendingEdges.right) shadows.push('inset -2px 0 0 0 #16A34A');
                            if (isTableHeaderCell) shadows.push('inset 0 -1px 0 0 rgba(17,24,39,0.25)');
                            return shadows.length ? shadows.join(',') : undefined;
                          })();
                          const inRange = Boolean(selectedRange) && (() => {
                            const s = selectedRange?.start;
                            const e = selectedRange?.end;
                            if (!s || !e) return false;
                            const r1 = Math.min(s.rowIdx, e.rowIdx);
                            const r2 = Math.max(s.rowIdx, e.rowIdx);
                            const c1 = Math.min(s.colIdx, e.colIdx);
                            const c2 = Math.max(s.colIdx, e.colIdx);
                            return rowIdx >= r1 && rowIdx <= r2 && colIdx >= c1 && colIdx <= c2;
                          })();
                          return (
                            <td
                              key={colIdx}
                              className={`excel-cell ${cell.className || ''}${isLocked ? ' excel-cell-locked' : ''}${inDrag ? ' excel-cell-drag-preview' : ''}${showPendingCorner ? ' excel-cell-pending' : ''}${isAppliedHighlighted ? ' excel-cell-applied-range' : ''}${isFlashing ? ' excel-cell-applied-flash' : ''}${inAnyTableRange ? ' excel-cell-table' : ''}${isTableHeaderCell ? ' excel-cell-table-header' : ''}`}
                              data-row-idx={rowIdx}
                              data-col-idx={colIdx}
                              onMouseDown={(e) => {
                                if (e.button !== 0) return; // left-click only
                                e.preventDefault(); // prevent text selection during drag
                                setUserHasSelected(true);
                                setLockedCells(new Set());
                                setSelected({ rowIdx, colIdx });
                                setSelectedRange(null);
                                isDraggingRef.current = true;
                                setDragAnchor({ rowIdx, colIdx });
                                setDragEnd({ rowIdx, colIdx });
                              }}
                              onMouseEnter={() => {
                                if (isDraggingRef.current) {
                                  setDragEnd({ rowIdx, colIdx });
                                }
                              }}
                              style={{
                                cursor: 'pointer',
                                userSelect: 'none',
                                boxShadow: cellBoxShadow,
                                background: isLocked
                                  ? '#E5E7EB'
                                  : inDrag
                                    ? 'rgba(17, 24, 39, 0.10)'
                                    : isTableHeaderCell
                                      ? 'rgba(17, 24, 39, 0.09)'
                                      : inAnyTableRange
                                        ? 'rgba(17, 24, 39, 0.04)'
                                    : (inPendingRange || hasPendingOverride)
                                      ? 'rgba(253, 230, 138, 0.35)'
                                      : isSelected
                                        ? 'rgba(17, 24, 39, 0.06)'
                                        : inRange
                                          ? 'rgba(17, 24, 39, 0.035)'
                                          : undefined,
                              }}
                              title={isLocked ? 'Locked' : 'Drag to select'}
                            >
                              {(() => {
                                const pending = keyHere ? pendingState?.overrides?.[keyHere] : null;
                                const ovr = keyHere ? draftCellOverrides?.[keyHere] : null;
                                if (pending) return formatNumericLike(String(pending.value ?? ''), colIdx);
                                if (!ovr) return formatNumericLike(cell.value, colIdx);
                                const isFormula = String(ovr.kind || '') === 'formula';
                                const display = isFormula ? String(ovr.value || '') : formatNumericLike(String(ovr.value || ''), colIdx);
                                return (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      maxWidth: '100%',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      fontWeight: 800,
                                      color: isFormula ? '#1D4ED8' : '#111827',
                                    }}
                                    title={display}
                                  >
                                    {display}
                                  </span>
                                );
                              })()}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="excel-preview-empty-sheet">
              {t('excelPreview.emptySheet')}
            </div>
          )}
        </div>
      </div>

      {/* Sheet Tabs */}
      {sheetCount > 1 && !hideSheetTabs && (
        <div className="excel-preview-sheet-tabs">
          <div className="excel-preview-sheet-tabs-scroll">
            {sheets.map((sheet, index) => {
              const name = asSheetName(sheet);
              return (
                <button
                  key={index}
                  className={`excel-preview-sheet-tab ${activeSheet === index ? 'active' : ''}`}
                  onClick={() => setActiveSheet(index)}
                  title={name}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default ExcelEditCanvas;
