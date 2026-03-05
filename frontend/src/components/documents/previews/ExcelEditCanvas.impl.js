import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import api from '../../../services/api';
import { applyEdit, extractVerifiedApply, isNoopResult, undoEdit } from '../../../services/editingService';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import { getPreviewCountForFile, getFileExtension } from '../../../utils/files/previewCount';
import EditorToolbar from '../editor/EditorToolbar';
import sphereIcon from '../../../assets/koda-knot-black.svg';
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
        const cellData = {
          value: cell.textContent || '',
          className: cell.className || '',
          isHeader: cell.tagName.toLowerCase() === 'th',
        };
        const dFont = cell.getAttribute('data-font');
        const dSize = cell.getAttribute('data-size');
        const dColor = cell.getAttribute('data-color');
        const dBold = cell.getAttribute('data-bold');
        const dItalic = cell.getAttribute('data-italic');
        const dUnderline = cell.getAttribute('data-underline');
        if (dFont) cellData.font = dFont;
        if (dSize) cellData.sizePt = Number(dSize);
        if (dColor) cellData.color = dColor;
        if (dBold === '1') cellData.bold = true;
        if (dItalic === '1') cellData.italic = true;
        if (dUnderline === '1') cellData.underline = true;
        cells.push(cellData);
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

const COL_WIDTH = 100;
const ROW_HEIGHT = 24;
const ROW_HEADER_WIDTH = 48;
const HEADER_HEIGHT = 24;

function VirtualizedGrid({
  current,
  scale,
  tableContainerRef,
  selected,
  selectedRange,
  lockedCells,
  dragRect,
  pendingState,
  flashRect,
  appliedHighlightRects,
  cellA1At,
  currentSheetName,
  draftFormatOverrides,
  draftCellOverrides,
  tableRangesForActiveSheet,
  tablePaletteByStyle,
  normalizeHex,
  formatNumericLike,
  setUserHasSelected,
  setLockedCells,
  setSelected,
  setSelectedRange,
  isDraggingRef,
  setDragAnchor,
  setDragEnd,
  t,
  // Inline editing props
  isInlineEditing,
  setIsInlineEditing,
  isApplying,
  effectiveDraftValue,
  controlledDraftValue,
  onDraftValueChange,
  setDraftValue,
  inlineEditorRef,
  revert,
  commitDraftIfDirty,
  moveSelectionBy,
  // Selection props
  selectedRef,
  applySelectionRect,
  gridBounds,
}) {
  const scrollRef = React.useRef(null);

  if (!current || !current.rows?.length) {
    return (
      <div className="excel-preview-grid-wrapper">
        <div className="excel-preview-empty-sheet">
          {t('excelPreview.emptySheet')}
        </div>
      </div>
    );
  }

  const totalRows = Math.max(current.rows.length - 1, 100);
  const dataCols = (current.colCount || current.rows[0]?.length || 1) - 1;
  // Extend columns to fill the viewport (like rows extend vertically)
  const viewportCols = typeof window !== 'undefined' ? Math.ceil((window.innerWidth - 52) / COL_WIDTH) : 26;
  const totalCols = Math.max(dataCols, viewportCols);

  return (
    <VirtualizedGridInner
      scrollRef={scrollRef}
      tableContainerRef={tableContainerRef}
      current={current}
      scale={scale}
      totalRows={totalRows}
      totalCols={totalCols}
      selected={selected}
      selectedRange={selectedRange}
      lockedCells={lockedCells}
      dragRect={dragRect}
      pendingState={pendingState}
      flashRect={flashRect}
      appliedHighlightRects={appliedHighlightRects}
      cellA1At={cellA1At}
      currentSheetName={currentSheetName}
      draftFormatOverrides={draftFormatOverrides}
      draftCellOverrides={draftCellOverrides}
      tableRangesForActiveSheet={tableRangesForActiveSheet}
      tablePaletteByStyle={tablePaletteByStyle}
      normalizeHex={normalizeHex}
      formatNumericLike={formatNumericLike}
      setUserHasSelected={setUserHasSelected}
      setLockedCells={setLockedCells}
      setSelected={setSelected}
      setSelectedRange={setSelectedRange}
      isDraggingRef={isDraggingRef}
      setDragAnchor={setDragAnchor}
      setDragEnd={setDragEnd}
      isInlineEditing={isInlineEditing}
      setIsInlineEditing={setIsInlineEditing}
      isApplying={isApplying}
      effectiveDraftValue={effectiveDraftValue}
      controlledDraftValue={controlledDraftValue}
      onDraftValueChange={onDraftValueChange}
      setDraftValue={setDraftValue}
      inlineEditorRef={inlineEditorRef}
      revert={revert}
      commitDraftIfDirty={commitDraftIfDirty}
      moveSelectionBy={moveSelectionBy}
      selectedRef={selectedRef}
      applySelectionRect={applySelectionRect}
      gridBounds={gridBounds}
    />
  );
}

function VirtualizedGridInner({
  scrollRef,
  tableContainerRef,
  current,
  scale,
  totalRows,
  totalCols,
  selected,
  selectedRange,
  lockedCells,
  dragRect,
  pendingState,
  flashRect,
  appliedHighlightRects,
  cellA1At,
  currentSheetName,
  draftFormatOverrides,
  draftCellOverrides,
  tableRangesForActiveSheet,
  tablePaletteByStyle,
  normalizeHex,
  formatNumericLike,
  setUserHasSelected,
  setLockedCells,
  setSelected,
  setSelectedRange,
  isDraggingRef,
  setDragAnchor,
  setDragEnd,
  // Inline editing
  isInlineEditing,
  setIsInlineEditing,
  isApplying,
  effectiveDraftValue,
  controlledDraftValue,
  onDraftValueChange,
  setDraftValue,
  inlineEditorRef,
  revert,
  commitDraftIfDirty,
  moveSelectionBy,
  // Selection
  selectedRef,
  applySelectionRect,
  gridBounds,
}) {
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // No column virtualization — render all columns.
  const allCols = React.useMemo(() => {
    const cols = [];
    for (let i = 0; i < totalCols; i++) {
      cols.push({ index: i, start: i * COL_WIDTH, size: COL_WIDTH });
    }
    return cols;
  }, [totalCols]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  const totalWidth = totalCols * COL_WIDTH + ROW_HEADER_WIDTH;
  const totalHeight = rowVirtualizer.getTotalSize() + HEADER_HEIGHT;

  return (
    <div
      ref={scrollRef}
      className="excel-preview-grid-wrapper"
      role="grid"
      aria-label="Spreadsheet grid"
      tabIndex={0}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
      }}
    >
      <div
        ref={tableContainerRef}
        style={{
          height: totalHeight * scale,
          width: totalWidth * scale,
          position: 'relative',
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        {/* Corner cell */}
        <div
          role="columnheader"
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 30,
            width: ROW_HEADER_WIDTH,
            height: HEADER_HEIGHT,
            background: '#FAFAFA',
            borderBottom: '1px solid #E6E6EC',
            borderRight: '1px solid #E6E6EC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
            color: '#555',
            boxSizing: 'border-box',
          }}
        />

        {/* Column headers (A, B, C...) — all rendered */}
        {allCols.map((col) => {
          const colIdx = col.index + 1;
          const headerCell = current.rows?.[0]?.[colIdx];
          const label = headerCell?.value || indexToColLetter(col.index);
          return (
            <div
              key={`ch-${col.index}`}
              role="columnheader"
              title="Select column"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                isDraggingRef.current = false;
                applySelectionRect?.(
                  { rowIdx: 1, colIdx },
                  { rowIdx: gridBounds?.maxRowIdx || totalRows, colIdx },
                  { inlineEdit: false },
                );
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: col.start + ROW_HEADER_WIDTH,
                width: col.size,
                height: HEADER_HEIGHT,
                background: '#FAFAFA',
                borderBottom: '1px solid #E6E6EC',
                borderRight: '1px solid #E6E6EC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                color: '#222',
                zIndex: 20,
                boxSizing: 'border-box',
                userSelect: 'none',
                cursor: 'pointer',
              }}
            >
              {label}
            </div>
          );
        })}

        {/* Row headers + Data cells (rows virtualized, columns all rendered) */}
        {virtualRows.map((vr) => {
          const rowIdx = vr.index + 1;
          const rowData = current.rows?.[rowIdx] || [];
          const rowHeaderCell = rowData?.[0];
          const rowLabel = rowHeaderCell?.value ?? (vr.index + 1);

          return (
            <React.Fragment key={`r-${vr.index}`}>
              {/* Row header */}
              <div
                role="rowheader"
                title="Select row"
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  isDraggingRef.current = false;
                  applySelectionRect?.(
                    { rowIdx, colIdx: 1 },
                    { rowIdx, colIdx: gridBounds?.maxColIdx || totalCols },
                    { inlineEdit: false },
                  );
                }}
                style={{
                  position: 'absolute',
                  top: vr.start + HEADER_HEIGHT,
                  left: 0,
                  width: ROW_HEADER_WIDTH,
                  height: vr.size,
                  background: '#FAFAFA',
                  borderRight: '1px solid #E6E6EC',
                  cursor: 'pointer',
                  borderBottom: '1px solid #E6E6EC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#333',
                  zIndex: 10,
                  boxSizing: 'border-box',
                  userSelect: 'none',
                }}
              >
                {rowLabel}
              </div>

              {/* Data cells for this row — all columns */}
              {allCols.map((col) => {
                const colIdx = col.index + 1;
                const cell = rowData?.[colIdx] || { value: '', className: '' };
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
                const fmtOvr = keyHere ? draftFormatOverrides?.[keyHere] : null;
                const showPendingCorner = pendingState?.rect
                  ? (inPendingRange && rowIdx === pendingState.rect.r1 && colIdx === pendingState.rect.c1)
                  : hasPendingOverride;
                const parsedCol = colLetterToIndex(String(a1Here || '').replace(/[0-9]/g, ''));
                const parsedRow = Number(String(a1Here || '').replace(/[^0-9]/g, ''));
                const tableMatch = tableRangesForActiveSheet.find((tt) => {
                  if (parsedCol == null || !Number.isFinite(parsedRow)) return false;
                  return parsedCol >= tt.c1 && parsedCol <= tt.c2 && parsedRow >= tt.r1 && parsedRow <= tt.r2;
                }) || null;
                const inAnyTableRange = Boolean(tableMatch);
                const isTableHeaderCell = Boolean(
                  tableMatch && tableMatch.hasHeader !== false && Number.isFinite(parsedRow) && parsedRow === tableMatch.r1,
                );
                const isTableTotalsCell = Boolean(
                  tableMatch && Number.isFinite(parsedRow) && parsedRow === tableMatch.r2,
                );
                const tablePalette = tablePaletteByStyle[String(tableMatch?.style || 'light_gray')] || tablePaletteByStyle.light_gray;
                const tableHeaderBg = normalizeHex(tableMatch?.colors?.header) || tablePalette.header;
                const tableStripeBg = normalizeHex(tableMatch?.colors?.stripe) || tablePalette.stripe;
                const tableTotalsBg = normalizeHex(tableMatch?.colors?.totals) || null;
                const tableBodyBg = tablePalette.base;
                const tableCellBg = (() => {
                  if (!tableMatch) return null;
                  if (isTableHeaderCell) return tableHeaderBg;
                  if (isTableTotalsCell && tableTotalsBg) return tableTotalsBg;
                  if (Number.isFinite(parsedRow) && parsedRow % 2 === 0) return tableStripeBg;
                  return tableBodyBg;
                })();

                const cellBoxShadow = (() => {
                  const shadows = [];
                  if (isSelected) shadows.push('inset 0 0 0 2px #2563EB');
                  if (isAppliedHighlighted) shadows.push('inset 0 0 0 2px rgba(217, 119, 6, 0.85)');
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

                const bgColor = isFlashing
                  ? 'rgba(245, 158, 11, 0.34)'
                  : isAppliedHighlighted
                    ? 'rgba(254, 243, 199, 0.82)'
                  : isLocked
                    ? '#E5E7EB'
                  : inDrag
                    ? 'rgba(17, 24, 39, 0.10)'
                    : isTableHeaderCell
                      ? tableCellBg
                      : inAnyTableRange
                        ? tableCellBg
                    : (inPendingRange || hasPendingOverride)
                      ? 'rgba(253, 230, 138, 0.35)'
                      : isSelected
                        ? 'rgba(37, 99, 235, 0.08)'
                        : inRange
                          ? 'rgba(37, 99, 235, 0.06)'
                          : 'white';

                return (
                  <div
                    key={`c-${vr.index}-${col.index}`}
                    role="gridcell"
                    aria-selected={isSelected || undefined}
                    aria-label={isSelected && a1Here ? `Cell ${a1Here}` : undefined}
                    data-row-idx={rowIdx}
                    data-col-idx={colIdx}
                    className={`${showPendingCorner ? 'excel-cell-pending' : ''}${isFlashing ? ' excel-cell-applied-flash' : ''}`}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      if (e.shiftKey && selectedRef?.current) {
                        isDraggingRef.current = false;
                        applySelectionRect?.(
                          selectedRef.current,
                          { rowIdx, colIdx },
                          { inlineEdit: false },
                        );
                        return;
                      }
                      setIsInlineEditing?.(false);
                      setUserHasSelected(true);
                      setLockedCells(new Set([`${rowIdx}:${colIdx}`]));
                      setSelected({ rowIdx, colIdx });
                      setSelectedRange(null);
                      isDraggingRef.current = true;
                      setDragAnchor({ rowIdx, colIdx });
                      setDragEnd({ rowIdx, colIdx });
                    }}
                    onDoubleClick={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      setIsInlineEditing?.(true);
                    }}
                    onMouseEnter={() => {
                      if (isDraggingRef.current) {
                        setDragEnd({ rowIdx, colIdx });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: vr.start + HEADER_HEIGHT,
                      left: col.start + ROW_HEADER_WIDTH,
                      width: col.size,
                      height: vr.size,
                      boxSizing: 'border-box',
                      padding: '4px 8px',
                      borderRight: '1px solid #E6E6EC',
                      borderBottom: '1px solid #E6E6EC',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: Number.isFinite(Number(fmtOvr?.fontSizePt)) ? `${Number(fmtOvr.fontSizePt)}pt` : 13,
                      lineHeight: `${vr.size - 8}px`,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: bgColor,
                      boxShadow: cellBoxShadow,
                      fontWeight: typeof fmtOvr?.bold === 'boolean' ? (fmtOvr.bold ? 700 : 400) : undefined,
                      fontStyle: typeof fmtOvr?.italic === 'boolean' ? (fmtOvr.italic ? 'italic' : 'normal') : undefined,
                      textDecoration: typeof fmtOvr?.underline === 'boolean' ? (fmtOvr.underline ? 'underline' : 'none') : undefined,
                      color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(fmtOvr?.color || '').trim()) ? String(fmtOvr.color).trim() : '#1a1a1a',
                      fontFamily: /^[A-Za-z0-9 ,\-]{2,60}$/.test(String(fmtOvr?.fontFamily || '').trim())
                        ? String(fmtOvr.fontFamily).trim()
                        : undefined,
                    }}
                    title={isLocked ? 'Locked' : 'Click to edit. Drag to select.'}
                  >
                    {(() => {
                      const pending = keyHere ? pendingState?.overrides?.[keyHere] : null;
                      const ovr = keyHere ? draftCellOverrides?.[keyHere] : null;
                      // Inline editor: render input when this cell is selected and in inline editing mode
                      if (isSelected && isInlineEditing && !isApplying) {
                        return (
                          <input
                            ref={inlineEditorRef}
                            className="excel-inline-editor"
                            value={effectiveDraftValue}
                            onMouseDown={(evt) => evt.stopPropagation()}
                            onChange={(evt) => {
                              const nextValue = evt.target.value;
                              if (controlledDraftValue != null) onDraftValueChange?.(nextValue);
                              else setDraftValue?.(nextValue);
                            }}
                            onBlur={() => setIsInlineEditing?.(false)}
                            onKeyDown={(evt) => {
                              if (evt.key === 'Escape') {
                                evt.preventDefault();
                                setIsInlineEditing?.(false);
                                revert?.();
                                return;
                              }
                              if (evt.key !== 'Enter' && evt.key !== 'Tab') return;
                              evt.preventDefault();
                              if (isApplying) return;
                              const deltaRow = evt.key === 'Enter' ? (evt.shiftKey ? -1 : 1) : 0;
                              const deltaCol = evt.key === 'Tab' ? (evt.shiftKey ? -1 : 1) : 0;
                              setIsInlineEditing?.(false);
                              void (async () => {
                                const ok = await commitDraftIfDirty?.();
                                if (!ok) return;
                                moveSelectionBy?.(deltaRow, deltaCol, { extendRange: false });
                              })();
                            }}
                            aria-label={`Edit cell ${a1Here || ''}`}
                          />
                        );
                      }
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
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
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
    onHistoryStateChange,
    onAskAllybi,
    selectionHint = null,
    clearSelectionNonce = 0,
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
  const [tables, setTables] = useState([]); // [{range,sheetName,hasHeader}]

  const [selected, setSelected] = useState(null); // { rowIdx (>=1), colIdx (>=1) in parsed grid }
  const [selectedRange, setSelectedRange] = useState(null); // { start:{rowIdx,colIdx}, end:{rowIdx,colIdx} }
  const [draftValue, setDraftValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [flashRect, setFlashRect] = useState(null); // { r1,r2,c1,c2 } for post-apply highlight
  const highlightsBySheetRef = useRef(new Map()); // Map<sheetName, rect[]>
  const [highlightVersion, setHighlightVersion] = useState(0);
  const [highlightNavIndex, setHighlightNavIndex] = useState(-1);
  const [bubbleViewportTick, setBubbleViewportTick] = useState(0);
  const [userHasSelected, setUserHasSelected] = useState(false);
  const [lockedCells, setLockedCells] = useState(new Set()); // Set of "rowIdx:colIdx" keys for locked cells
  const [draftOpsById, setDraftOpsById] = useState({}); // { [draftId]: ops[] }
  const [dragAnchor, setDragAnchor] = useState(null);   // { rowIdx, colIdx } — where drag started
  const [dragEnd, setDragEnd] = useState(null);          // { rowIdx, colIdx } — current drag position
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const isDraggingRef = React.useRef(false);
  const inlineEditorRef = useRef(null);
  const editUndoStackRef = useRef([]); // [{ kind, revisionId, payload }]
  const editRedoStackRef = useRef([]); // [{ kind, revisionId, payload }]
  const [editHistoryVersion, setEditHistoryVersion] = useState(0);
  const selectionHistoryRef = useRef({ items: [], index: -1 });
  const [selectionHistoryVersion, setSelectionHistoryVersion] = useState(0);
  const selectedRef = useRef(selected);
  const selectedRangeRef = useRef(selectedRange);
  const lockedCellsRef = useRef(lockedCells);

  const rootRef = React.useRef(null);
  const tableContainerRef = React.useRef(null);
  const lastAppliedSelectionHintRef = React.useRef('');
  const lastEmittedSelectionKeyRef = React.useRef('');
  const lastEmittedSheetMetaKeyRef = React.useRef('');
  const lastEmittedPreviewCountKeyRef = React.useRef('');
  const lastEmittedSelectedInfoKeyRef = React.useRef('');
  const lastHandledClearSelectionNonceRef = React.useRef(0);
  const lastBubbleViewportTickAtRef = React.useRef(0);
  const currentRef = React.useRef(null);
  const clearingSelectionRef = React.useRef(false);
  const pendingSelectionHintRef = React.useRef(null);

  const scale = zoom / 100;

  const extractRevisionId = useCallback((res) => {
    const verified = extractVerifiedApply(res);
    return (
      verified?.newRevisionId ||
      res?.result?.revisionId ||
      res?.result?.restoredRevisionId ||
      res?.receipt?.documentId ||
      res?.result?.receipt?.documentId ||
      null
    );
  }, []);

  const pushEditHistory = useCallback((entry) => {
    if (!entry || !entry.revisionId) return;
    const next = [...(editUndoStackRef.current || []), entry];
    editUndoStackRef.current = next.slice(-40);
    editRedoStackRef.current = [];
    setEditHistoryVersion((v) => v + 1);
  }, []);

  const canUndoEdit = useCallback(() => (editUndoStackRef.current?.length || 0) > 0, []);
  const canRedoEdit = useCallback(() => (editRedoStackRef.current?.length || 0) > 0, []);

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    setError('');
    setStatusMsg('');
    try {
      const res = await api.get(`/api/documents/${docId}/preview`, { params: { _t: Date.now() } });
      if (res.data?.previewType !== 'excel') {
        throw new Error(res.data?.error || 'Excel preview not available.');
      }
      const htmlContent = res.data?.htmlContent || '';
      const sheetList = Array.isArray(res.data?.sheets) ? res.data.sheets : [];
      const tablesList = Array.isArray(res.data?.tables) ? res.data.tables : [];
      setSheets(sheetList);
      const parsed = parseHtmlToSheetData(htmlContent);
      setSheetData(parsed);
      setTables(tablesList);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load Excel editor.');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    selectedRangeRef.current = selectedRange;
  }, [selectedRange]);

  useEffect(() => {
    lockedCellsRef.current = lockedCells;
  }, [lockedCells]);

  const currentSheetName = useMemo(() => asSheetName(sheets[activeSheet]), [sheets, activeSheet]);
  const current = sheetData[activeSheet] || null;
  currentRef.current = current;
  const gridBounds = useMemo(() => {
    const rows = Array.isArray(current?.rows) ? current.rows : [];
    const maxRowIdx = Math.max(1, rows.length - 1);
    const maxColIdx = Math.max(
      1,
      ...rows.map((row) => Math.max(1, (Array.isArray(row) ? row.length : 0) - 1)),
    );
    return { maxRowIdx, maxColIdx };
  }, [current]);

  // Per-sheet highlight rects — derived from the ref + version counter.
  const appliedHighlightRects = useMemo(
    () => highlightsBySheetRef.current.get(currentSheetName) || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSheetName, highlightVersion],
  );
  const setHighlightsForSheet = useCallback((sheetName, rects) => {
    const capped = Array.isArray(rects) ? rects.slice(-60) : [];
    highlightsBySheetRef.current.set(sheetName, capped);
    setHighlightVersion((v) => v + 1);
  }, []);
  const hasHighlights = appliedHighlightRects.length > 0;
  const jumpToNextHighlight = useCallback(() => {
    const rects = highlightsBySheetRef.current.get(currentSheetName) || [];
    if (!rects.length) return;
    const nextIdx = (highlightNavIndex + 1) % rects.length;
    setHighlightNavIndex(nextIdx);
    const rect = rects[nextIdx];
    if (rect) {
      setFlashRect(rect);
      window.setTimeout(() => setFlashRect(null), 950);
      // Scroll to the target cell
      window.requestAnimationFrame(() => {
        try {
          const root = rootRef.current;
          const target = root?.querySelector?.(`td[data-row-idx="${rect.r1}"][data-col-idx="${rect.c1}"]`) || null;
          target?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
        } catch {}
      });
    }
  }, [currentSheetName, highlightNavIndex]);
  const clearHighlights = useCallback(() => {
    highlightsBySheetRef.current.delete(currentSheetName);
    setHighlightNavIndex(-1);
    setHighlightVersion((v) => v + 1);
  }, [currentSheetName]);
  const previewRowIdxForWorksheetRow = useCallback((rowNumber) => {
    const n = Math.trunc(Number(rowNumber));
    if (!Number.isFinite(n)) return 1;
    const cur = currentRef.current;
    const rows = Array.isArray(cur?.rows) ? cur.rows : [];
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
  }, []); // stable: reads from currentRef
  const previewColIdxForWorksheetCol = useCallback((columnIndexZeroBased) => {
    const n = Math.trunc(Number(columnIndexZeroBased));
    if (!Number.isFinite(n)) return 1;
    const cur = currentRef.current;
    const rows = Array.isArray(cur?.rows) ? cur.rows : [];
    const header = Array.isArray(rows?.[0]) ? rows[0] : [];
    const wanted = indexToColLetter(n);
    for (let colIdx = 1; colIdx < header.length; colIdx += 1) {
      const token = String(header[colIdx]?.value || '').trim().toUpperCase();
      if (token && token === wanted) return colIdx;
    }
    return worksheetColToPreviewColIdx(n);
  }, []); // stable: reads from currentRef
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
    setIsInlineEditing(false);
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

  useEffect(() => {
    onHistoryStateChange?.({
      canUndoEdit: canUndoEdit(),
      canRedoEdit: canRedoEdit(),
      canUndoSelection: Boolean(canUndoSelection),
      canRedoSelection: Boolean(canRedoSelection),
      canUndo: Boolean(canUndoEdit() || canUndoSelection),
      canRedo: Boolean(canRedoEdit() || canRedoSelection),
    });
  }, [
    onHistoryStateChange,
    canUndoEdit,
    canRedoEdit,
    canUndoSelection,
    canRedoSelection,
    editHistoryVersion,
    selectionHistoryVersion,
  ]);

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
          const firstRow = Array.isArray(values?.[0]) ? values[0] : [];
          const scalarFill = (values.length === 1 && firstRow.length === 1) ? firstRow[0] : undefined;
          for (let rr = parsed.r1; rr <= parsed.r2; rr += 1) {
            for (let cc = parsed.c1; cc <= parsed.c2; cc += 1) {
              const vr = rr - parsed.r1;
              const vc = cc - parsed.c1;
              const row = Array.isArray(values?.[vr]) ? values[vr] : [];
              const v = Array.isArray(row) ? row[vc] : undefined;
              const resolved = v !== undefined ? v : scalarFill;
              if (resolved === undefined) continue;
              const a1Cell = `${indexToColLetter(cc)}${rr}`;
              overrides[`${activeSheetName}!${a1Cell}`] = { value: String(resolved ?? ''), kind: 'value' };
            }
          }
        }
      }
    }
    return overrides;
  }, [draftOpsById, currentSheetName]);

  const draftFormatOverrides = useMemo(() => {
    const overrides = {}; // key: `${sheetName}!A1` -> { bold, italic, underline, color, fontSizePt, fontFamily }
    const drafts = draftOpsById && typeof draftOpsById === 'object' ? draftOpsById : {};
    for (const id of Object.keys(drafts)) {
      const ops = Array.isArray(drafts[id]) ? drafts[id] : [];
      for (const op of ops) {
        const kind = String(op?.kind || '').trim();
        if (kind !== 'format_range') continue;
        const rangeA1 = String(op?.rangeA1 || op?.range || '').trim();
        const format = (op?.format && typeof op.format === 'object') ? op.format : {};
        if (!rangeA1) continue;
        const { sheetName: parsedSheet, a1 } = splitSheetAndA1(rangeA1);
        const activeSheetName = String(parsedSheet || currentSheetName || '').trim();
        const parsed = parseA1RangeOnly(a1);
        if (!parsed) continue;
        for (let rr = parsed.r1; rr <= parsed.r2; rr += 1) {
          for (let cc = parsed.c1; cc <= parsed.c2; cc += 1) {
            const a1Cell = `${indexToColLetter(cc)}${rr}`;
            const key = `${activeSheetName}!${a1Cell}`;
            const next = {
              ...(overrides[key] || {}),
              ...(typeof format.bold === 'boolean' ? { bold: format.bold } : {}),
              ...(typeof format.italic === 'boolean' ? { italic: format.italic } : {}),
              ...(typeof format.underline === 'boolean' ? { underline: format.underline } : {}),
              ...(typeof format.color === 'string' ? { color: String(format.color).trim() } : {}),
              ...(Number.isFinite(Number(format.fontSizePt)) ? { fontSizePt: Number(format.fontSizePt) } : {}),
              ...(typeof format.fontFamily === 'string' ? { fontFamily: String(format.fontFamily).trim() } : {}),
            };
            overrides[key] = next;
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
      out.push({
        ...parsed,
        hasHeader: t?.hasHeader !== false,
        style: String(t?.style || '').trim().toLowerCase() || 'light_gray',
        colors: (t?.colors && typeof t.colors === 'object') ? t.colors : undefined,
        source: 'persisted',
      });
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
        out.push({
          ...parsed,
          hasHeader: op?.hasHeader !== false,
          style: String(op?.style || '').trim().toLowerCase() || 'light_gray',
          colors: (op?.colors && typeof op.colors === 'object') ? op.colors : undefined,
          source: 'draft',
        });
      }
    }
    return out;
  }, [currentSheetName, draftOpsById, tables]);

  const tablePaletteByStyle = useMemo(() => ({
    light_gray: { header: 'rgba(17, 24, 39, 0.14)', stripe: 'rgba(17, 24, 39, 0.07)', base: 'rgba(255,255,255,1)' },
    gray: { header: 'rgba(55, 65, 81, 0.22)', stripe: 'rgba(55, 65, 81, 0.11)', base: 'rgba(255,255,255,1)' },
    blue: { header: 'rgba(37, 99, 235, 0.30)', stripe: 'rgba(37, 99, 235, 0.14)', base: 'rgba(255,255,255,1)' },
    green: { header: 'rgba(16, 185, 129, 0.30)', stripe: 'rgba(16, 185, 129, 0.14)', base: 'rgba(255,255,255,1)' },
    orange: { header: 'rgba(245, 158, 11, 0.30)', stripe: 'rgba(245, 158, 11, 0.14)', base: 'rgba(255,255,255,1)' },
    teal: { header: 'rgba(13, 148, 136, 0.30)', stripe: 'rgba(13, 148, 136, 0.14)', base: 'rgba(255,255,255,1)' },
  }), []);
  const normalizeHex = useCallback((raw) => {
    const s = String(raw || '').trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(s)) return null;
    return s.startsWith('#') ? s : `#${s}`;
  }, []);

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
    const key = [
      Number(sheetMeta?.activeIndex ?? -1),
      Number(sheetMeta?.sheetCount ?? 0),
      String(sheetMeta?.activeName || ''),
      Array.isArray(sheetMeta?.sheetNames) ? sheetMeta.sheetNames.join('|') : '',
    ].join('||');
    if (key === lastEmittedSheetMetaKeyRef.current) return;
    lastEmittedSheetMetaKeyRef.current = key;
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
    if (!onCountUpdate || !previewCount) return;
    const key = [
      String(previewCount?.unit || ''),
      String(previewCount?.total ?? ''),
      String(previewCount?.current ?? ''),
      String(previewCount?.label || ''),
      String(previewCount?.shortLabel || ''),
      String(previewCount?.durationSec ?? ''),
    ].join('||');
    if (key === lastEmittedPreviewCountKeyRef.current) return;
    lastEmittedPreviewCountKeyRef.current = key;
    onCountUpdate(previewCount);
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
    const cellData = row?.[selected.colIdx] || {};
    const draftKey = `${currentSheetName}!${a1}`;
    const draftFmt = draftFormatOverrides[draftKey] || {};
    const format = {
      fontFamily: draftFmt.fontFamily || cellData.font || 'Calibri',
      fontSizePt: draftFmt.fontSizePt ?? cellData.sizePt ?? 11,
      color: draftFmt.color || cellData.color || '#000000',
      bold: draftFmt.bold ?? cellData.bold ?? false,
      italic: draftFmt.italic ?? cellData.italic ?? false,
      underline: draftFmt.underline ?? cellData.underline ?? false,
    };
    return {
      a1,
      targetId: `${currentSheetName}!${a1}`,
      beforeText: String(cellValue ?? ''),
      format,
    };
  }, [current, selected, currentSheetName, draftFormatOverrides]);

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
      if (/[^A-Za-z0-9_]/.test(n)) return `'${n.replace(/'/g, "''")}'`;
      return n;
    };
    const text = `${quoteSheetName(currentSheetName)}!${rangeA1}`;
    const selectionKind = rangeA1.includes(':') ? 'range' : 'cell';
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
    };
  }, [cellA1At, currentSheetName]);

  const getClipboardRect = useCallback(() => {
    if (lockedBounds) return lockedBounds;
    if (selectedRange?.start && selectedRange?.end) {
      const r1 = Math.min(selectedRange.start.rowIdx, selectedRange.end.rowIdx);
      const r2 = Math.max(selectedRange.start.rowIdx, selectedRange.end.rowIdx);
      const c1 = Math.min(selectedRange.start.colIdx, selectedRange.end.colIdx);
      const c2 = Math.max(selectedRange.start.colIdx, selectedRange.end.colIdx);
      return { r1, r2, c1, c2 };
    }
    if (selected?.rowIdx && selected?.colIdx) {
      return { r1: selected.rowIdx, r2: selected.rowIdx, c1: selected.colIdx, c2: selected.colIdx };
    }
    return null;
  }, [lockedBounds, selectedRange, selected]);

  const getClipboardTextForRect = useCallback((rect) => {
    if (!rect || !current || !Array.isArray(current.rows)) return '';
    const rowsOut = [];
    for (let r = Number(rect.r1); r <= Number(rect.r2); r += 1) {
      const row = Array.isArray(current.rows?.[r]) ? current.rows[r] : [];
      const colsOut = [];
      for (let c = Number(rect.c1); c <= Number(rect.c2); c += 1) {
        const raw = row?.[c]?.value;
        colsOut.push(String(raw ?? ''));
      }
      rowsOut.push(colsOut.join('\t'));
    }
    return rowsOut.join('\n');
  }, [current]);

  const clampCellToGrid = useCallback((rowIdx, colIdx) => {
    const r = Math.max(1, Math.min(gridBounds.maxRowIdx, Number(rowIdx) || 1));
    const c = Math.max(1, Math.min(gridBounds.maxColIdx, Number(colIdx) || 1));
    return { rowIdx: r, colIdx: c };
  }, [gridBounds.maxColIdx, gridBounds.maxRowIdx]);

  const applySelectionRect = useCallback((startRaw, endRaw, opts = {}) => {
    const start = clampCellToGrid(startRaw?.rowIdx, startRaw?.colIdx);
    const end = clampCellToGrid(endRaw?.rowIdx, endRaw?.colIdx);
    const minR = Math.min(start.rowIdx, end.rowIdx);
    const maxR = Math.max(start.rowIdx, end.rowIdx);
    const minC = Math.min(start.colIdx, end.colIdx);
    const maxC = Math.max(start.colIdx, end.colIdx);
    const nextLocked = new Set();
    const lockedKeys = [];
    for (let r = minR; r <= maxR; r += 1) {
      for (let c = minC; c <= maxC; c += 1) {
        const key = `${r}:${c}`;
        nextLocked.add(key);
        lockedKeys.push(key);
      }
    }
    setLockedCells(nextLocked);
    setSelected(start);
    setSelectedRange(
      (start.rowIdx === end.rowIdx && start.colIdx === end.colIdx)
        ? null
        : { start, end },
    );
    setDragAnchor(null);
    setDragEnd(null);
    setUserHasSelected(true);
    const inlineEdit = Boolean(opts?.inlineEdit) && start.rowIdx === end.rowIdx && start.colIdx === end.colIdx;
    setIsInlineEditing(inlineEdit);
    if (opts?.recordHistory !== false) {
      pushSelectionSnapshot({
        selected: start,
        selectedRange: (start.rowIdx === end.rowIdx && start.colIdx === end.colIdx) ? null : { start, end },
        lockedKeys,
      });
    }
  }, [clampCellToGrid, pushSelectionSnapshot]);

  const selectionPayloadKey = useCallback((sel) => {
    if (!sel || typeof sel !== 'object') return '';
    const domain = String(sel?.domain || '').trim().toLowerCase();
    const sheet = String(sel?.sheetName || '').trim().toLowerCase();
    const rangeA1 = String(sel?.rangeA1 || '').trim().toUpperCase();
    const text = String(sel?.text || '').trim();
    const ranges = Array.isArray(sel?.ranges)
      ? sel.ranges
          .map((r) => `${String(r?.sheetName || '').trim().toLowerCase()}!${String(r?.rangeA1 || '').trim().toUpperCase()}`)
          .filter(Boolean)
          .sort()
      : [];
    return `${domain}|${sheet}|${rangeA1}|${text}|${ranges.join('||')}`;
  }, []);

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
    setIsInlineEditing(false);
    setFlashRect(null);
    setUserHasSelected(false);
    if (lastEmittedSelectionKeyRef.current !== '') {
      lastEmittedSelectionKeyRef.current = '';
      onLiveSelectionChange?.(null);
    }
    if (recordHistory && hadSelection) {
      pushSelectionSnapshot({ selected: null, selectedRange: null, lockedKeys: [] });
    }
  }, [lockedCells, onLiveSelectionChange, pushSelectionSnapshot, selected, selectedRange]);

  const qualifyA1WithSheet = useCallback((rangeLike, explicitSheetName = '') => {
    const raw = String(rangeLike || '').trim();
    if (!raw) return '';
    if (raw.includes('!')) return raw;
    const sheet = String(explicitSheetName || '').trim();
    if (!sheet) return raw;
    const quotedSheet = /^[A-Za-z0-9_]+$/.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`;
    return `${quotedSheet}!${raw}`;
  }, []);

  const normalizeComputeOpsForRequest = useCallback((ops) => {
    const inputList = Array.isArray(ops) ? ops : [];
    const list = inputList.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [entry];
      if (Array.isArray(entry?.ops)) return entry.ops;
      if (Array.isArray(entry?.operations)) return entry.operations;
      return [entry];
    });
    const fallbackRange = String(
      selectedRangeInfo?.targetId ||
      selectedInfo?.targetId ||
      ''
    ).trim();
    const fallbackSheet = String(currentSheetName || '').trim();
    const normalizeKind = (rawKind) => {
      const token = String(rawKind || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        const alias = {
          set_cell_value: 'set_values',
          set_cell: 'set_values',
          set_cells: 'set_values',
          update_cell: 'set_values',
          edit_cell: 'set_values',
          set_value: 'set_values',
          write_value: 'set_values',
          write_cell: 'set_values',
          values_set: 'set_values',
          write_values: 'set_values',
          xlsx_set_cell_value: 'set_values',
          xlsx_set_range_values: 'set_values',
        formula_set: 'set_formula',
        write_formula: 'set_formula',
        xlsx_set_cell_formula: 'set_formula',
        xlsx_set_range_formulas: 'set_formula',
        xlsx_fill_down: 'set_formula',
        xlsx_fill_right: 'set_formula',
        table_create: 'create_table',
        format_table: 'create_table',
        format_as_table: 'create_table',
        table_format: 'create_table',
        xlsx_sort_range: 'sort_range',
        sort: 'sort_range',
        xlsx_filter_apply: 'filter_range',
        filter: 'filter_range',
        filter_clear: 'clear_filter',
        xlsx_filter_clear: 'clear_filter',
        xlsx_table_create: 'create_table',
        number_format: 'set_number_format',
        format_number: 'set_number_format',
        xlsx_format_range: 'set_number_format',
        xlsx_set_number_format: 'set_number_format',
        data_validation: 'set_data_validation',
        data_validation_clear: 'clear_data_validation',
        xlsx_data_validation_set: 'set_data_validation',
        conditional_format: 'apply_conditional_format',
        conditional_formatting: 'apply_conditional_format',
          freeze_panes: 'set_freeze_panes',
          freeze_pane: 'set_freeze_panes',
          freeze: 'set_freeze_panes',
          xlsx_freeze_panes: 'set_freeze_panes',
          chart_create: 'create_chart',
          xlsx_chart_create: 'create_chart',
          chart_update: 'update_chart',
        xlsx_chart_set_series: 'update_chart',
        xlsx_chart_set_titles: 'update_chart',
        xlsx_chart_set_axes: 'update_chart',
        xlsx_chart_move_resize: 'update_chart',
      };
      return alias[token] || token;
    };

    return list
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const op = { ...raw };
        const rawKind = op?.kind || op?.type || op?.op || op?.operator || op?.id;
        const kind = normalizeKind(rawKind);
        if (!kind) return null;
        op.kind = kind;

        const attachRange = (value) => {
          const preferred = String(value || '').trim() || fallbackRange;
          return preferred ? qualifyA1WithSheet(preferred, fallbackSheet) : '';
        };

        const rangeKinds = new Set([
          'set_values',
          'create_table',
          'sort_range',
          'filter_range',
          'set_number_format',
          'set_data_validation',
          'clear_data_validation',
          'apply_conditional_format',
          'format_range',
        ]);
        if (rangeKinds.has(kind)) {
          const normalizedRange = attachRange(
            op.rangeA1 ||
            op.range ||
            op.targetRange ||
            op.a1Range ||
            op.a1 ||
            op.cell ||
            op.targetCell ||
            op.target
          );
          if (normalizedRange) op.rangeA1 = normalizedRange;
        }

        if (kind === 'set_formula') {
          const a1 = attachRange(op.a1 || op.cell || op.targetCell || op.target);
          if (a1) op.a1 = a1;
          const formula = String(op.formula || op.expression || op.value || '').trim();
          if (formula) op.formula = formula.startsWith('=') ? formula.slice(1).trim() : formula;
        }

        if (kind === 'set_values') {
          if (!Array.isArray(op.values)) {
            if (Array.isArray(op.data)) {
              op.values = op.data;
            }
          }
          if (!Array.isArray(op.values)) {
            const scalarValue =
              op.value ??
              op.newValue ??
              op.after ??
              op.text ??
              op.input;
            if (scalarValue !== undefined) {
              op.values = [[scalarValue]];
            }
          }
          if (Array.isArray(op.values) && typeof op.rangeA1 === 'string') {
            const split = splitSheetAndA1(String(op.rangeA1 || '').trim());
            const parsed = parseA1RangeOnly(split.a1 || op.rangeA1);
            const firstRow = Array.isArray(op.values?.[0]) ? op.values[0] : [];
            const isScalar = op.values.length === 1 && firstRow.length === 1;
            if (parsed && isScalar) {
              const rows = parsed.r2 - parsed.r1 + 1;
              const cols = parsed.c2 - parsed.c1 + 1;
              const scalar = firstRow[0];
              op.values = Array.from({ length: rows }, () => Array.from({ length: cols }, () => scalar));
            }
          }
        }

        if (kind === 'create_chart' || kind === 'update_chart') {
          const spec = (op.spec && typeof op.spec === 'object') ? { ...op.spec } : {};
          const specRange = attachRange(spec.range || op.sourceRange || op.rangeA1 || op.range);
          if (specRange) spec.range = specRange;
          const chartTitle = String(spec.title || op.title || '').trim();
          if (chartTitle) spec.title = chartTitle;
          const chartType = String(spec.type || op.chartType || op.type || '').trim();
          if (chartType) spec.type = chartType.toUpperCase();
          if (Object.keys(spec).length) op.spec = spec;
        }

        if (kind === 'set_freeze_panes' || kind === 'clear_filter' || kind === 'set_print_layout') {
          if (!String(op.sheetName || '').trim() && fallbackSheet) {
            op.sheetName = fallbackSheet;
          }
          if (!String(op.sheetName || '').trim()) {
            const rangeHint = String(op.rangeA1 || op.range || '').trim();
            const sheetFromRange = splitSheetAndA1(rangeHint).sheetName || '';
            if (String(sheetFromRange || '').trim()) op.sheetName = String(sheetFromRange).trim();
          }
        }

        if (kind === 'set_freeze_panes') {
          const atCellRaw = String(op.atCell || op.anchor || '').trim();
          if (atCellRaw) {
            const m = atCellRaw.match(/^([A-Za-z]{1,3})(\d{1,7})$/);
            if (m) {
              const row = Number(m[2]);
              let col = 0;
              for (const ch of String(m[1] || '').toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
              op.frozenRowCount = Math.max(0, row - 1);
              op.frozenColumnCount = Math.max(0, col - 1);
            }
          }
          const rawRow = Number(op.row ?? op.rows ?? op.frozenRowCount);
          const rawCol = Number(op.column ?? op.col ?? op.columns ?? op.frozenColumnCount);
          if (Number.isFinite(rawRow) && rawRow >= 0) op.frozenRowCount = Math.max(0, Math.trunc(rawRow));
          if (Number.isFinite(rawCol) && rawCol >= 0) op.frozenColumnCount = Math.max(0, Math.trunc(rawCol));
        }

        if (kind === 'set_number_format') {
          const pattern = String(op.pattern || op.format || op.numberFormat || op.formatString || '').trim();
          if (pattern) op.pattern = pattern;
        }

        if (kind === 'sort_range' && !Array.isArray(op.sortSpecs)) {
          const column = op.column ?? op.columnIndex ?? op.sortBy;
          const order = op.order ?? op.sortOrder ?? op.direction;
          if (column != null) {
            op.sortSpecs = [{ column, ...(order != null ? { order } : {}) }];
          }
        }

        return op;
      })
      .filter(Boolean);
  }, [currentSheetName, qualifyA1WithSheet, selectedInfo?.targetId, selectedRangeInfo?.targetId]);

  const isUsableComputeOp = useCallback((op) => {
    if (!op || typeof op !== 'object') return false;
    const hasA1 = (value) => typeof value === 'string' && String(value).trim().length > 0;
    const hasSheet = (value) => typeof value === 'string' && String(value).trim().length > 0;
    const hasSpecRange = (value) => value && typeof value === 'object' && hasA1(value.range);
    const kind = String(op.kind || '').trim();
    const supportedKinds = new Set([
      'set_values',
      'set_formula',
      'create_table',
      'sort_range',
      'filter_range',
      'clear_filter',
      'set_number_format',
      'set_data_validation',
      'clear_data_validation',
      'apply_conditional_format',
      'set_freeze_panes',
      'set_print_layout',
      'create_chart',
      'update_chart',
      'insert_rows',
      'delete_rows',
      'insert_columns',
      'delete_columns',
      'format_range',
    ]);
    if (!kind) return false;
    if (!supportedKinds.has(kind)) return false;
    if (kind === 'set_values') {
      const hasScalar = op.value !== undefined || op.newValue !== undefined || op.after !== undefined || op.text !== undefined || op.input !== undefined;
      return hasA1(op.rangeA1) && (Array.isArray(op.values) || hasScalar);
    }
    if (kind === 'set_formula') {
      const hasFormulaLike = hasA1(op.formula) || hasA1(op.expression) || hasA1(op.value);
      return hasA1(op.a1) && hasFormulaLike;
    }
    if (kind === 'create_table') return hasA1(op.rangeA1);
    if (kind === 'sort_range') {
      const hasSortHints = op.column != null || op.columnIndex != null || op.sortBy != null;
      return hasA1(op.rangeA1) && ((Array.isArray(op.sortSpecs) && op.sortSpecs.length > 0) || hasSortHints);
    }
    if (kind === 'filter_range' || kind === 'set_number_format' || kind === 'set_data_validation' || kind === 'clear_data_validation' || kind === 'apply_conditional_format') {
      if (kind === 'set_number_format') {
        const hasPattern = hasA1(op.pattern) || hasA1(op.format) || hasA1(op.numberFormat) || hasA1(op.formatString);
        return hasA1(op.rangeA1) && hasPattern;
      }
      return hasA1(op.rangeA1);
    }
    if (kind === 'clear_filter') return hasSheet(op.sheetName) || hasA1(op.rangeA1) || hasA1(op.range);
    if (kind === 'set_freeze_panes') {
      const hasCounts = Number.isFinite(Number(op.frozenRowCount ?? op.rows ?? op.row)) || Number.isFinite(Number(op.frozenColumnCount ?? op.columns ?? op.col ?? op.column));
      return hasSheet(op.sheetName) || hasA1(op.rangeA1) || hasA1(op.atCell) || hasA1(op.anchor) || hasCounts;
    }
    if (kind === 'set_print_layout') return hasSheet(op.sheetName) || hasA1(op.rangeA1);
    if (kind === 'format_range') return hasA1(op.rangeA1) && op.format && typeof op.format === 'object';
    if (kind === 'create_chart') return hasSpecRange(op.spec);
    if (kind === 'update_chart') {
      const chartId = Number(op.chartId);
      return Number.isInteger(chartId) && chartId > 0 && Boolean(op.spec && typeof op.spec === 'object');
    }
    return true;
  }, []);

  useEffect(() => {
    if (selectionHint && selectionHint.domain === 'sheets') return;
    lastAppliedSelectionHintRef.current = '';
    lastEmittedSelectionKeyRef.current = '';
  }, [selectionHint]);

  const applySelectionHintCore = useCallback((hint, sheetsArr, activeSheetIdx) => {
    if (!hint || hint.domain !== 'sheets') return;
    if (clearingSelectionRef.current) return;
    const normalizeSheetName = (raw) => {
      const s = String(raw || '').trim();
      if (!s) return '';
      if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
        return s.slice(1, -1).replace(/''/g, "'");
      }
      return s;
    };

    const hintedRanges = [];
    const addHintRange = (sheetNameRaw, rangeRaw) => {
      const raw = String(rangeRaw || '').trim();
      if (!raw) return;
      const split = splitSheetAndA1(raw);
      const a1 = String(split?.a1 || raw).trim();
      const parsed = parseA1RangeOnly(a1);
      if (!parsed) return;
      const sheetName = normalizeSheetName(sheetNameRaw || split?.sheetName || '');
      hintedRanges.push({ sheetName, parsed });
    };

    addHintRange(hint?.sheetName, hint?.rangeA1);
    const ranges = Array.isArray(hint?.ranges) ? hint.ranges : [];
    for (const r of ranges) addHintRange(r?.sheetName, r?.rangeA1);
    if (!hintedRanges.length) return;

    const hintedSheetName = String(
      normalizeSheetName(
        hint?.sheetName ||
        hint?.ranges?.[0]?.sheetName ||
        hintedRanges[0]?.sheetName ||
        '',
      ),
    ).trim();
    const normalizeRangeKeyPart = (r) => {
      const parsed = r?.parsed;
      return `${String(r?.sheetName || '').trim().toLowerCase()}|${parsed.c1}:${parsed.r1}:${parsed.c2}:${parsed.r2}`;
    };
    const key = `${hintedSheetName || ''}|${hintedRanges.map(normalizeRangeKeyPart).sort().join('||')}`;
    if (key === lastAppliedSelectionHintRef.current) return;
    if (hintedSheetName) {
      const idx = sheetsArr.findIndex((s) => asSheetName(s) === hintedSheetName);
      if (idx >= 0 && idx !== activeSheetIdx) {
        // Save the hint so it can be applied after the sheet change settles.
        pendingSelectionHintRef.current = hint;
        setActiveSheet(idx);
        return;
      }
    }

    const activeSheetName = String(asSheetName(sheetsArr[activeSheetIdx] || '')).trim();
    const relevant = hintedRanges.filter((r) => {
      const s = String(r.sheetName || '').trim();
      if (!s) return true;
      return s.toLowerCase() === activeSheetName.toLowerCase();
    });
    const toApply = relevant.length ? relevant : hintedRanges;
    if (!toApply.length) return;

    const rects = toApply.map(({ parsed }) => ({
      r1: previewRowIdxForWorksheetRow(parsed.r1),
      r2: previewRowIdxForWorksheetRow(parsed.r2),
      c1: previewColIdxForWorksheetCol(parsed.c1),
      c2: previewColIdxForWorksheetCol(parsed.c2),
    }));
    const first = rects[0];
    if (!first) return;
    const start = { rowIdx: first.r1, colIdx: first.c1 };
    const end = { rowIdx: first.r2, colIdx: first.c2 };

    const nextLocked = new Set();
    for (const rect of rects) {
      for (let r = rect.r1; r <= rect.r2; r += 1) {
        for (let c = rect.c1; c <= rect.c2; c += 1) {
          nextLocked.add(`${r}:${c}`);
        }
      }
    }
    const nextHasRange = !(first.r1 === first.r2 && first.c1 === first.c2);
    const selectedNow = selectedRef.current;
    const selectedRangeNow = selectedRangeRef.current;
    const lockedCellsNow = lockedCellsRef.current || new Set();
    const curHasRange = Boolean(selectedRangeNow?.start && selectedRangeNow?.end);
    const sameCell =
      Number(selectedNow?.rowIdx) === Number(start.rowIdx) &&
      Number(selectedNow?.colIdx) === Number(start.colIdx);
    const sameRange =
      (!nextHasRange && !curHasRange) ||
      (nextHasRange && curHasRange &&
        Number(selectedRangeNow?.start?.rowIdx) === Number(start.rowIdx) &&
        Number(selectedRangeNow?.start?.colIdx) === Number(start.colIdx) &&
        Number(selectedRangeNow?.end?.rowIdx) === Number(end.rowIdx) &&
        Number(selectedRangeNow?.end?.colIdx) === Number(end.colIdx));
    let sameLocked = lockedCellsNow.size === nextLocked.size;
    if (sameLocked) {
      for (const keyPart of Array.from(nextLocked)) {
        if (!lockedCellsNow.has(keyPart)) {
          sameLocked = false;
          break;
        }
      }
    }
    if (sameCell && sameRange && sameLocked) {
      lastAppliedSelectionHintRef.current = key;
      return;
    }

    lastAppliedSelectionHintRef.current = key;
    pendingSelectionHintRef.current = null;
    setSelected(start);
    setSelectedRange(nextHasRange ? { start, end } : null);
    setIsInlineEditing(false);
    setUserHasSelected(true);
    setDragAnchor(null);
    setDragEnd(null);
    setLockedCells(nextLocked);
    window.requestAnimationFrame(() => {
      try {
        const root = rootRef.current;
        const target = root?.querySelector?.(`td[data-row-idx="${start.rowIdx}"][data-col-idx="${start.colIdx}"]`) || null;
        target?.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
      } catch {}
    });
    const lockedKeys = Array.from(nextLocked);
    pushSelectionSnapshot({
      selected: start,
      selectedRange: (start.rowIdx === end.rowIdx && start.colIdx === end.colIdx) ? null : { start, end },
      lockedKeys,
    });
  }, [previewRowIdxForWorksheetRow, previewColIdxForWorksheetCol, pushSelectionSnapshot]);

  useEffect(() => {
    applySelectionHintCore(selectionHint, sheets, activeSheet);
  }, [selectionHint, sheets, activeSheet, applySelectionHintCore]);

  // Apply pending hint after a sheet change settles.
  useEffect(() => {
    const pending = pendingSelectionHintRef.current;
    if (!pending) return;
    // Reset the dedup key so the hint can be re-applied on the new sheet.
    lastAppliedSelectionHintRef.current = '';
    applySelectionHintCore(pending, sheets, activeSheet);
  }, [activeSheet, sheets, applySelectionHintCore]);

  useEffect(() => {
    const nonce = Number(clearSelectionNonce || 0);
    if (!nonce) return;
    if (nonce === lastHandledClearSelectionNonceRef.current) return;
    lastHandledClearSelectionNonceRef.current = nonce;
    clearingSelectionRef.current = true;
    lastAppliedSelectionHintRef.current = '';
    pendingSelectionHintRef.current = null;
    clearSelection({ recordHistory: false });
    clearingSelectionRef.current = false;
  }, [clearSelectionNonce, clearSelection]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase();
      const inInput = tag === 'input' || tag === 'textarea';

      if (e.key === 'Escape') {
        if (inInput) return;
        clearSelection();
        return;
      }

      // Arrow key, Tab, Enter, F2 navigation — only when not in an input
      if (inInput) return;
      const sel = selectedRef.current;
      if (!sel) return;
      const cur = currentRef.current;
      if (!cur) return;
      const maxRow = (cur.rows?.length || 1) - 1;
      const maxCol = (cur.rows?.[0]?.length || 1) - 1;

      const move = (dr, dc) => {
        const nextRow = Math.max(1, Math.min(maxRow, sel.rowIdx + dr));
        const nextCol = Math.max(1, Math.min(maxCol, sel.colIdx + dc));
        if (nextRow === sel.rowIdx && nextCol === sel.colIdx) return;
        e.preventDefault();
        setSelected({ rowIdx: nextRow, colIdx: nextCol });
        setSelectedRange(null);
        setUserHasSelected(true);
        setLockedCells(new Set());
      };

      switch (e.key) {
        case 'ArrowUp': move(-1, 0); break;
        case 'ArrowDown': move(1, 0); break;
        case 'ArrowLeft': move(0, -1); break;
        case 'ArrowRight': move(0, 1); break;
        case 'Tab':
          if (e.shiftKey) move(0, -1);
          else move(0, 1);
          break;
        case 'Enter':
          if (e.shiftKey) move(-1, 0);
          else move(1, 0);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [clearSelection]);

  // Keep selection persistent when the user interacts with chat/side panels.
  useEffect(() => {
    return undefined;
  }, []);

  useEffect(() => {
    const key = selectedInfo
      ? `${String(selectedInfo?.targetId || '')}||${String(selectedInfo?.beforeText || '')}||${JSON.stringify(selectedInfo?.format || {})}`
      : '';
    if (key === lastEmittedSelectedInfoKeyRef.current) return;
    lastEmittedSelectedInfoKeyRef.current = key;
    onSelectedInfoChange?.(selectedInfo);
  }, [onSelectedInfoChange, selectedInfo]);

  useEffect(() => {
    setSelected(null);
    setSelectedRange(null);
    setUserHasSelected(false);
    setLockedCells(new Set());
    setDragAnchor(null);
    setDragEnd(null);
    setIsInlineEditing(false);
    setFlashRect(null);
    // Highlights are now per-sheet; no need to clear on sheet change.
    selectionHistoryRef.current = {
      items: [{ selected: null, selectedRange: null, lockedKeys: [], userHasSelected: false }],
      index: 0,
    };
    setSelectionHistoryVersion((v) => v + 1);
  }, [activeSheet]);

  const dragRect = useMemo(() => {
    if (!dragAnchor || !dragEnd) return null;
    return {
      r1: Math.min(dragAnchor.rowIdx, dragEnd.rowIdx),
      r2: Math.max(dragAnchor.rowIdx, dragEnd.rowIdx),
      c1: Math.min(dragAnchor.colIdx, dragEnd.colIdx),
      c2: Math.max(dragAnchor.colIdx, dragEnd.colIdx),
    };
  }, [dragAnchor, dragEnd]);

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
    setIsInlineEditing(r1 === r2 && c1 === c2);
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

  const activeAskBubble = useMemo(() => {
    if (!userHasSelected) return null;
    return computeAskBubbleForSelection(selected, selectedRange, lockedBounds);
  }, [
    userHasSelected,
    selected,
    selectedRange,
    lockedBounds,
    bubbleViewportTick,
    computeAskBubbleForSelection,
  ]);

  // Editor chat needs to be "document-aware" even if the user didn't click Ask Allybi.
  // Continuously emit the current selection payload (cell or range) so the backend can
  // infer ranges/values (e.g. create chart) without asking the user to paste data.
  useEffect(() => {
    const sel = userHasSelected ? (activeAskBubble?.selection || null) : null;
    const key = selectionPayloadKey(sel);
    if (key === lastEmittedSelectionKeyRef.current) return;
    lastEmittedSelectionKeyRef.current = key;
    onLiveSelectionChange?.(sel);
  }, [activeAskBubble, onLiveSelectionChange, selectionPayloadKey, userHasSelected]);

  useEffect(() => {
    // Keep bubble position stable on scroll/resize without writing recursive bubble state.
    const root = rootRef.current;
    if (!root) return undefined;
    if (!userHasSelected) return undefined;

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

    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const now = Date.now();
        if ((now - Number(lastBubbleViewportTickAtRef.current || 0)) < 80) return;
        lastBubbleViewportTickAtRef.current = now;
        setBubbleViewportTick((prev) => prev + 1);
      });
    };

    try {
      scrollParent.addEventListener?.('scroll', onMove, { passive: true });
    } catch {}
    window.addEventListener('resize', onMove, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      try { scrollParent.removeEventListener?.('scroll', onMove); } catch {}
      window.removeEventListener('resize', onMove);
    };
  }, [userHasSelected]);

  const effectiveDraftValue = controlledDraftValue != null ? controlledDraftValue : draftValue;

  useEffect(() => {
    if (!isInlineEditing) return;
    window.requestAnimationFrame(() => {
      const el = inlineEditorRef.current;
      if (!el) return;
      try {
        el.focus();
        const textLength = String(el.value || '').length;
        el.setSelectionRange(textLength, textLength);
      } catch {}
    });
  }, [isInlineEditing, selected?.rowIdx, selected?.colIdx]);

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
  const computeHighlightRectsFromRanges = useCallback((ranges) => {
    const list = Array.isArray(ranges) ? ranges : [];
    const out = [];
    const seen = new Set();
    for (const rawRange of list) {
      const split = splitSheetAndA1(String(rawRange || '').trim());
      if (!split.a1) continue;
      if (split.sheetName && String(split.sheetName).trim().toLowerCase() !== String(currentSheetName || '').trim().toLowerCase()) {
        continue;
      }
      const parsed = parseA1RangeOnly(split.a1);
      if (!parsed) continue;
      const rect = {
        r1: previewRowIdxForWorksheetRow(parsed.r1),
        r2: previewRowIdxForWorksheetRow(parsed.r2),
        c1: previewColIdxForWorksheetCol(parsed.c1),
        c2: previewColIdxForWorksheetCol(parsed.c2),
      };
      const key = `${rect.r1}:${rect.c1}:${rect.r2}:${rect.c2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rect);
    }
    return out.slice(0, 12);
  }, [currentSheetName, previewColIdxForWorksheetCol, previewRowIdxForWorksheetRow]);
  const computeFlashRectFromOps = useCallback((ops) => {
    const list = computeHighlightRectsFromOps(ops);
    return list.length ? list[0] : null;
  }, [computeHighlightRectsFromOps]);
  const mergeHighlightRects = useCallback((prevRects, nextRects) => {
    const prev = Array.isArray(prevRects) ? prevRects : [];
    const next = Array.isArray(nextRects) ? nextRects : [];
    const out = [];
    const seen = new Set();
    for (const rect of [...prev, ...next]) {
      if (!rect) continue;
      const key = `${Number(rect.r1)}:${Number(rect.c1)}:${Number(rect.r2)}:${Number(rect.c2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        r1: Number(rect.r1),
        c1: Number(rect.c1),
        r2: Number(rect.r2),
        c2: Number(rect.c2),
      });
    }
    return out.slice(-60);
  }, []);

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

  const apply = useCallback(async (overrideDraftRaw = null) => {
    if (!docId || !selectedInfo) return { ok: false, error: 'No target selected.' };
    const proposedTextRaw = overrideDraftRaw != null
      ? String(overrideDraftRaw)
      : String(effectiveDraftValue ?? '');
    const proposedText = proposedTextRaw.trim();
    if (!proposedText && proposedText !== '') {
      setStatusMsg('Nothing to apply.');
      onStatusMsg?.('Nothing to apply.');
      return { ok: false, error: 'Nothing to apply.' };
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
      let latestRevisionId = null;
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

        const payload = {
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
        };
        const res = await applyEdit(payload);
        if (isNoopResult(res)) {
          setStatusMsg('No changes detected.');
          onStatusMsg?.('No changes detected.');
          setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1800);
          return { ok: true, noop: true };
        }
        const outcomeType = String(res?.outcomeType || res?.result?.outcomeType || '').toLowerCase();
        if (outcomeType && outcomeType !== 'applied') {
          const blockedMsg = String(
            res?.blockedReason?.message ||
            res?.result?.blockedReason?.message ||
            res?.receipt?.note ||
            'This edit was blocked before apply.',
          ).trim();
          throw new Error(blockedMsg);
        }
        const revisionId = extractRevisionId(res);
        if (!revisionId) {
          throw new Error('Apply proof verification failed.');
        }
        pushEditHistory({ kind: 'applyEdit', revisionId, payload });
        // Keep return shape consistent for explicit Save callers.
        // (The visual refresh is handled below.)
        latestRevisionId = revisionId;
      } else {
        const payload = {
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
        };
        const res = await applyEdit(payload);
        if (isNoopResult(res)) {
          setStatusMsg('No changes detected.');
          onStatusMsg?.('No changes detected.');
          setTimeout(() => { setStatusMsg(''); onStatusMsg?.(''); }, 1800);
          return { ok: true, noop: true };
        }
        const outcomeType = String(res?.outcomeType || res?.result?.outcomeType || '').toLowerCase();
        if (outcomeType && outcomeType !== 'applied') {
          const blockedMsg = String(
            res?.blockedReason?.message ||
            res?.result?.blockedReason?.message ||
            res?.receipt?.note ||
            'This edit was blocked before apply.',
          ).trim();
          throw new Error(blockedMsg);
        }
        const revisionId = extractRevisionId(res);
        if (!revisionId) {
          throw new Error('Apply proof verification failed.');
        }
        pushEditHistory({ kind: 'applyEdit', revisionId, payload });
        // Keep return shape consistent for explicit Save callers.
        // (The visual refresh is handled below.)
        latestRevisionId = revisionId;
      }

      setStatusMsg('Applied. Refreshing…');
      onStatusMsg?.('Applied. Refreshing…');
      await load();
      if (nextFlashRect) {
        setFlashRect(nextFlashRect);
        setHighlightsForSheet(currentSheetName, mergeHighlightRects(highlightsBySheetRef.current.get(currentSheetName) || [], [nextFlashRect]));
        window.setTimeout(() => setFlashRect(null), 950);
      }
      onApplied?.();
      setStatusMsg('Applied.');
      onStatusMsg?.('Applied.');
      setTimeout(() => setStatusMsg(''), 1500);
      return { ok: true, revisionId: latestRevisionId || null };
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Apply failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return { ok: false, error: msg };
    } finally {
      setIsApplying(false);
    }
  }, [docId, selectedInfo, selected, effectiveDraftValue, currentSheetName, document?.filename, load, onApplied, onStatusMsg, mergeHighlightRects, setHighlightsForSheet, extractRevisionId, pushEditHistory]);

  const compute = useCallback(async (ops) => {
    if (!docId) return;
    if (!Array.isArray(ops) || ops.length === 0) return;
    const normalizedOps = normalizeComputeOpsForRequest(ops);
    if (!normalizedOps.length) {
      const msg = 'No valid spreadsheet operations were found in this draft.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return;
    }
    const usableOps = normalizedOps.filter((op) => isUsableComputeOp(op));
    const droppedCount = normalizedOps.length - usableOps.length;
    if (!usableOps.length) {
      const msg = 'No usable spreadsheet operations were found. Include an explicit range/cell (for example: `SUMMARY1!D2` or `SUMMARY1!A4:G20`).';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return;
    }
    setIsApplying(true);
    setStatusMsg('');
    onStatusMsg?.('');
    try {
      const fallbackFlashRect = computeFlashRectFromOps(usableOps);
      const fallbackHighlightRects = computeHighlightRectsFromOps(usableOps);
      const response = await api.post(`/api/documents/${docId}/studio/sheets/compute`, {
        instruction: `Manual compute in viewer: ${cleanDocumentName(document?.filename)}`,
        activeSheetName: currentSheetName,
        ops: usableOps,
      });
      const responseData = response?.data?.data || {};
      const revisionId = String(responseData?.revisionId || '').trim() || null;
      const acceptedOps = Array.isArray(responseData?.acceptedOps) ? responseData.acceptedOps : [];
      const affectedRanges = Array.isArray(responseData?.affectedRanges) ? responseData.affectedRanges : [];
      const backendWarning = String(responseData?.warning || '').trim();
      if (!acceptedOps.length) {
        const msg = backendWarning || 'No spreadsheet changes were applied.';
        setStatusMsg(msg);
        onStatusMsg?.(msg);
        return;
      }
      if (revisionId) {
        pushEditHistory({
          kind: 'compute',
          revisionId,
          payload: {
            instruction: `Manual compute in viewer: ${cleanDocumentName(document?.filename)}`,
            activeSheetName: currentSheetName,
            ops: acceptedOps,
          },
        });
      }
      const responseHighlightRects = affectedRanges.length
        ? computeHighlightRectsFromRanges(affectedRanges)
        : computeHighlightRectsFromOps(acceptedOps);
      const highlightRects = responseHighlightRects.length ? responseHighlightRects : fallbackHighlightRects;
      const nextFlashRect = highlightRects[0] || fallbackFlashRect;

      setStatusMsg('Applied. Refreshing…');
      onStatusMsg?.('Applied. Refreshing…');
      await load();
      if (nextFlashRect) {
        setFlashRect(nextFlashRect);
        window.setTimeout(() => setFlashRect(null), 950);
      }
      if (highlightRects.length) {
        setHighlightsForSheet(currentSheetName, mergeHighlightRects(highlightsBySheetRef.current.get(currentSheetName) || [], highlightRects));
      } else if (nextFlashRect) {
        setHighlightsForSheet(currentSheetName, mergeHighlightRects(highlightsBySheetRef.current.get(currentSheetName) || [], [nextFlashRect]));
      }
      onApplied?.();
      // Build quantitative status message from metrics
      const metrics = responseData?.metrics || {};
      const metricsParts = [];
      if (metrics.changedCellsCount > 0) metricsParts.push(`${metrics.changedCellsCount} cell${metrics.changedCellsCount === 1 ? '' : 's'}`);
      const detailParts = [];
      if (metrics.valueOpsCount > 0) detailParts.push(`${metrics.valueOpsCount} value${metrics.valueOpsCount === 1 ? '' : 's'}`);
      if (metrics.formatOpsCount > 0) detailParts.push(`${metrics.formatOpsCount} format${metrics.formatOpsCount === 1 ? '' : 's'}`);
      if (metrics.formulaOpsCount > 0) detailParts.push(`${metrics.formulaOpsCount} formula${metrics.formulaOpsCount === 1 ? '' : 's'}`);
      if (metrics.objectOpsCount > 0) detailParts.push(`${metrics.objectOpsCount} object${metrics.objectOpsCount === 1 ? '' : 's'}`);
      if (metrics.structureOpsCount > 0) detailParts.push(`${metrics.structureOpsCount} structural`);
      let metricsMsg = 'Applied.';
      if (metricsParts.length > 0) {
        metricsMsg = `Updated ${metricsParts.join(', ')}`;
        if (detailParts.length > 0) metricsMsg += ` (${detailParts.join(', ')})`;
        metricsMsg += '.';
      }
      setStatusMsg(metricsMsg);
      onStatusMsg?.(metricsMsg);
      const rejectedOps = Array.isArray(responseData?.rejectedOps) ? responseData.rejectedOps : [];
      const chartRejected = rejectedOps.filter((r) => r?.reason === 'chart_engine_unavailable');
      const otherRejected = rejectedOps.filter((r) => r?.reason !== 'chart_engine_unavailable');
      if (chartRejected.length > 0) {
        const chartMsg = `Chart skipped — requires Google Sheets connection.`;
        onStatusMsg?.(`${metricsMsg} ${chartMsg}`);
      } else if (otherRejected.length > 0 || droppedCount > 0) {
        const totalDropped = otherRejected.length + droppedCount;
        const warning = `${totalDropped} operation${totalDropped === 1 ? '' : 's'} ignored due to missing/invalid fields.`;
        onStatusMsg?.(`${metricsMsg} ${warning}`);
      } else if (backendWarning) {
        onStatusMsg?.(backendWarning);
      }
      setTimeout(() => setStatusMsg(''), 2500);
    } catch (e) {
      const rejected = Array.isArray(e?.response?.data?.data?.rejectedOps) ? e.response.data.data.rejectedOps : [];
      const errorCode = String(e?.response?.data?.errorCode || '').trim().toUpperCase();
      const backendError = String(e?.response?.data?.error || '').trim();
      const backendWarning = String(e?.response?.data?.data?.warning || '').trim();
      const rejectedMsg = rejected.length
        ? ` (${rejected.length} invalid op${rejected.length === 1 ? '' : 's'})`
        : '';
      const baseMsg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Compute failed.';
      const guidance = errorCode === 'NO_USABLE_OPS'
        ? ' Use an explicit range/cell (e.g. `SUMMARY1!D2` or select cells first).'
        : '';
      const warningSuffix = backendWarning ? ` ${backendWarning}` : '';
      const msg = `${baseMsg}${rejectedMsg}${guidance}${warningSuffix}`.trim();
      try {
        // Keep full error payload visible for debugging server-side compute failures.
        // eslint-disable-next-line no-console
        console.error('[Excel compute failed]', {
          errorCode,
          backendError,
          rejectedOps: rejected,
          response: e?.response?.data,
        });
      } catch {}
      setStatusMsg(msg);
      onStatusMsg?.(msg);
    } finally {
      setIsApplying(false);
    }
  }, [docId, document?.filename, currentSheetName, load, onApplied, onStatusMsg, computeFlashRectFromOps, computeHighlightRectsFromOps, computeHighlightRectsFromRanges, isUsableComputeOp, mergeHighlightRects, normalizeComputeOpsForRequest, setHighlightsForSheet, pushEditHistory]);

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

  const hasPendingEdits = useCallback(() => {
    if (!selectedInfo?.a1) return false;
    const draft = String(effectiveDraftValue ?? '');
    const before = String(selectedInfo?.beforeText ?? '');
    const isGrid = draft.includes('\n') || draft.includes('\t');
    if (isGrid) return Boolean(draft.trim());
    return draft.trim() !== before.trim();
  }, [effectiveDraftValue, selectedInfo?.a1, selectedInfo?.beforeText]);

  const commitDraftIfDirty = useCallback(async () => {
    if (!hasPendingEdits()) return true;
    const result = await apply();
    return Boolean(result?.ok);
  }, [apply, hasPendingEdits]);

  const applyBlankToCurrentRect = useCallback(async () => {
    const rect = getClipboardRect();
    if (!rect) return false;
    const rows = Math.max(1, Number(rect.r2) - Number(rect.r1) + 1);
    const cols = Math.max(1, Number(rect.c2) - Number(rect.c1) + 1);
    const blankPayload = (rows === 1 && cols === 1)
      ? ''
      : Array.from({ length: rows }, () => Array.from({ length: cols }, () => '').join('\t')).join('\n');
    const result = await apply(blankPayload);
    return Boolean(result?.ok);
  }, [apply, getClipboardRect]);

  const moveSelectionBy = useCallback((deltaRow, deltaCol, opts = {}) => {
    const extend = Boolean(opts?.extendRange);
    const currentCell = selectedRef.current || { rowIdx: 1, colIdx: 1 };
    const next = clampCellToGrid(
      Number(currentCell.rowIdx) + Number(deltaRow || 0),
      Number(currentCell.colIdx) + Number(deltaCol || 0),
    );
    if (!extend) {
      applySelectionRect(next, next, { inlineEdit: false });
      return;
    }
    const existingRange = selectedRangeRef.current;
    const anchor = existingRange?.start || currentCell;
    applySelectionRect(anchor, next, { inlineEdit: false });
  }, [applySelectionRect, clampCellToGrid]);

  const moveSelectionTo = useCallback((targetRaw, opts = {}) => {
    const extend = Boolean(opts?.extendRange);
    const target = clampCellToGrid(targetRaw?.rowIdx, targetRaw?.colIdx);
    if (!extend) {
      applySelectionRect(target, target, { inlineEdit: false });
      return;
    }
    const currentCell = selectedRef.current || { rowIdx: 1, colIdx: 1 };
    const existingRange = selectedRangeRef.current;
    const anchor = existingRange?.start || currentCell;
    applySelectionRect(anchor, target, { inlineEdit: false });
  }, [applySelectionRect, clampCellToGrid]);

  const saveAllManualEdits = useCallback(async () => {
    if (!hasPendingEdits()) return [];
    const result = await apply();
    if (result?.ok && result?.revisionId) {
      return [{ ok: true, revisionId: result.revisionId }];
    }
    if (result?.ok && result?.noop) {
      return [{ ok: true, noop: true }];
    }
    return [{ ok: false, error: result?.error || 'Save failed.' }];
  }, [apply, hasPendingEdits]);

  const discardAllManualEdits = useCallback(() => {
    revert();
    return true;
  }, [revert]);

  useEffect(() => {
    const isEditableTarget = (node) => {
      const el = node?.nodeType === 1 ? node : node?.parentElement;
      if (!el) return false;
      const tag = String(el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return Boolean(el.closest?.('[contenteditable="true"]'));
    };

    const shouldHandleClipboard = (event) => {
      const root = rootRef.current;
      if (!root) return false;
      const target = event?.target || null;
      if (isEditableTarget(target)) return false;
      if (target && root.contains(target)) return true;
      const activeEl = window.document?.activeElement || null;
      if (activeEl && isEditableTarget(activeEl) && !root.contains(activeEl)) return false;
      return Boolean(getClipboardRect());
    };

    const onCopy = (event) => {
      if (!shouldHandleClipboard(event)) return;
      const rect = getClipboardRect();
      if (!rect) return;
      const text = getClipboardTextForRect(rect);
      if (text == null) return;
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
      }
    };

    const onCut = (event) => {
      if (!shouldHandleClipboard(event)) return;
      const rect = getClipboardRect();
      if (!rect) return;
      const text = getClipboardTextForRect(rect);
      if (text == null) return;
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
        if (!isApplying) {
          setIsInlineEditing(false);
          void applyBlankToCurrentRect();
        }
      }
    };

    const onPaste = (event) => {
      if (!shouldHandleClipboard(event)) return;
      const rect = getClipboardRect();
      if (!rect) return;
      const text = String(event.clipboardData?.getData('text/plain') || '');
      if (!text) return;
      event.preventDefault();
      if (controlledDraftValue != null) onDraftValueChange?.(text);
      else setDraftValue(text);
      window.setTimeout(() => {
        apply(text);
      }, 0);
    };

    window.addEventListener('copy', onCopy, true);
    window.addEventListener('cut', onCut, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('copy', onCopy, true);
      window.removeEventListener('cut', onCut, true);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [apply, applyBlankToCurrentRect, controlledDraftValue, getClipboardRect, getClipboardTextForRect, isApplying, onDraftValueChange]);

  const applyFormat = useCallback((formatProps) => {
    if (!formatProps || typeof formatProps !== 'object') return;
    const rangeA1 = (() => {
      if (selectedRangeInfo?.targetId) return selectedRangeInfo.targetId;
      if (selectedInfo?.targetId) return selectedInfo.targetId;
      return '';
    })();
    if (!rangeA1) return;
    const op = { kind: 'format_range', rangeA1, format: formatProps };
    // Instant visual feedback via draft overlays
    const draftId = `__toolbar_fmt_${Date.now()}`;
    setDraftOpsById((prev) => ({ ...(prev || {}), [draftId]: [op] }));
    // Execute the compute immediately
    compute([op]).then(() => {
      // Discard the draft overlay after the compute refreshes the data
      setDraftOpsById((prev) => {
        const next = { ...(prev || {}) };
        delete next[draftId];
        return next;
      });
    });
  }, [compute, selectedInfo?.targetId, selectedRangeInfo?.targetId]);

  const undoAction = useCallback(async () => {
    if (!docId) return false;
    const stack = editUndoStackRef.current || [];
    if (!stack.length) return false;
    const entry = stack[stack.length - 1];
    editUndoStackRef.current = stack.slice(0, -1);
    setEditHistoryVersion((v) => v + 1);
    setIsApplying(true);
    setStatusMsg('');
    onStatusMsg?.('');
    try {
      await undoEdit({ documentId: docId, revisionId: entry?.revisionId || undefined });
      editRedoStackRef.current = [...(editRedoStackRef.current || []), entry].slice(-40);
      setEditHistoryVersion((v) => v + 1);
      await load();
      const msg = 'Undid last change.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      setTimeout(() => setStatusMsg(''), 1200);
      return true;
    } catch (e) {
      editUndoStackRef.current = [...(editUndoStackRef.current || []), entry].slice(-40);
      setEditHistoryVersion((v) => v + 1);
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Undo failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return false;
    } finally {
      setIsApplying(false);
    }
  }, [docId, load, onStatusMsg]);

  const redoAction = useCallback(async () => {
    if (!docId) return false;
    const stack = editRedoStackRef.current || [];
    if (!stack.length) return false;
    const entry = stack[stack.length - 1];
    editRedoStackRef.current = stack.slice(0, -1);
    setEditHistoryVersion((v) => v + 1);
    setIsApplying(true);
    setStatusMsg('');
    onStatusMsg?.('');
    try {
      let nextRevisionId = null;
      if (entry?.kind === 'compute') {
        const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : null;
        if (!payload) throw new Error('Redo payload is missing.');
        const response = await api.post(`/api/documents/${docId}/studio/sheets/compute`, payload);
        const responseData = response?.data?.data || {};
        nextRevisionId = String(responseData?.revisionId || '').trim() || null;
        if (!nextRevisionId) throw new Error('Redo did not create a revision.');
      } else {
        const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : null;
        if (!payload) throw new Error('Redo payload is missing.');
        const res = await applyEdit(payload);
        const outcomeType = String(res?.outcomeType || res?.result?.outcomeType || '').toLowerCase();
        if (outcomeType && outcomeType !== 'applied' && outcomeType !== 'noop') {
          const blockedMsg = String(
            res?.blockedReason?.message ||
            res?.result?.blockedReason?.message ||
            res?.receipt?.note ||
            'Redo edit was blocked.',
          ).trim();
          throw new Error(blockedMsg);
        }
        nextRevisionId = extractRevisionId(res);
        if (!nextRevisionId) throw new Error('Redo did not create a revision.');
      }
      const nextEntry = { ...entry, revisionId: nextRevisionId };
      editUndoStackRef.current = [...(editUndoStackRef.current || []), nextEntry].slice(-40);
      setEditHistoryVersion((v) => v + 1);
      await load();
      const msg = 'Redid last change.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      setTimeout(() => setStatusMsg(''), 1200);
      return true;
    } catch (e) {
      editRedoStackRef.current = [...(editRedoStackRef.current || []), entry].slice(-40);
      setEditHistoryVersion((v) => v + 1);
      const msg = e?.response?.data?.error?.message || e?.response?.data?.error || e?.message || 'Redo failed.';
      setStatusMsg(msg);
      onStatusMsg?.(msg);
      return false;
    } finally {
      setIsApplying(false);
    }
  }, [docId, extractRevisionId, load, onStatusMsg]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const key = String(e.key || '').toLowerCase();
      const isMod = Boolean(e.metaKey || e.ctrlKey);
      if (!isMod) return;
      if (e.altKey) return;
      const tag = String(e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (canRedoEdit()) {
          redoAction();
          return;
        }
        if (canRedoSelection) redoSelection();
        return;
      }

      if (key === 'z') {
        e.preventDefault();
        if (canUndoEdit()) {
          undoAction();
          return;
        }
        if (canUndoSelection) undoSelection();
        return;
      }

      if (key === 'y') {
        e.preventDefault();
        if (canRedoEdit()) {
          redoAction();
          return;
        }
        if (canRedoSelection) redoSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [canRedoSelection, canUndoSelection, redoSelection, undoSelection, undoAction, redoAction, canUndoEdit, canRedoEdit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase();
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(e.target?.isContentEditable);
      if (isEditable) return;

      const hasSelection = Boolean(selectedRef.current?.rowIdx && selectedRef.current?.colIdx);
      if (!hasSelection) return;

      const key = String(e.key || '');
      const lower = key.toLowerCase();
      const isMod = Boolean(e.metaKey || e.ctrlKey);

      if (isMod && !e.altKey && lower === 'a') {
        e.preventDefault();
        applySelectionRect(
          { rowIdx: 1, colIdx: 1 },
          { rowIdx: gridBounds.maxRowIdx, colIdx: gridBounds.maxColIdx },
          { inlineEdit: false },
        );
        return;
      }

      if (key === 'F2') {
        e.preventDefault();
        setIsInlineEditing(true);
        return;
      }

      if ((key === 'Escape' || key === 'Esc') && isInlineEditing) {
        e.preventDefault();
        setIsInlineEditing(false);
        revert();
        return;
      }

      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        if (isApplying) return;
        setIsInlineEditing(false);
        void applyBlankToCurrentRect();
        return;
      }

      if (key === 'Tab' || key === 'Enter') {
        e.preventDefault();
        if (isApplying) return;
        setIsInlineEditing(false);
        const deltaRow = key === 'Enter' ? (e.shiftKey ? -1 : 1) : 0;
        const deltaCol = key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0;
        void (async () => {
          const ok = await commitDraftIfDirty();
          if (!ok) return;
          moveSelectionBy(deltaRow, deltaCol, { extendRange: false });
        })();
        return;
      }

      if (key === 'Home' || key === 'End') {
        e.preventDefault();
        const currentCell = selectedRef.current || { rowIdx: 1, colIdx: 1 };
        const toStart = key === 'Home';
        const target = isMod
          ? {
            rowIdx: toStart ? 1 : gridBounds.maxRowIdx,
            colIdx: toStart ? 1 : gridBounds.maxColIdx,
          }
          : {
            rowIdx: currentCell.rowIdx,
            colIdx: toStart ? 1 : gridBounds.maxColIdx,
          };
        moveSelectionTo(target, { extendRange: e.shiftKey });
        return;
      }

      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        e.preventDefault();
        if (isMod) {
          const currentCell = selectedRef.current || { rowIdx: 1, colIdx: 1 };
          const target = {
            rowIdx: key === 'ArrowUp'
              ? 1
              : key === 'ArrowDown'
                ? gridBounds.maxRowIdx
                : currentCell.rowIdx,
            colIdx: key === 'ArrowLeft'
              ? 1
              : key === 'ArrowRight'
                ? gridBounds.maxColIdx
                : currentCell.colIdx,
          };
          moveSelectionTo(target, { extendRange: e.shiftKey });
          return;
        }
        const deltaRow = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
        const deltaCol = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
        moveSelectionBy(deltaRow, deltaCol, { extendRange: e.shiftKey });
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    applyBlankToCurrentRect,
    applySelectionRect,
    commitDraftIfDirty,
    gridBounds.maxColIdx,
    gridBounds.maxRowIdx,
    isApplying,
    isInlineEditing,
    moveSelectionTo,
    moveSelectionBy,
    revert,
  ]);

  useEffect(() => {
    editUndoStackRef.current = [];
    editRedoStackRef.current = [];
    setEditHistoryVersion((v) => v + 1);
  }, [docId]);

  useImperativeHandle(ref, () => ({
    apply,
    revert,
    saveAllManualEdits,
    discardAllManualEdits,
    hasPendingEdits,
    compute,
    applyFormat,
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
    undo: undoAction,
    redo: redoAction,
    canUndo: () => canUndoEdit(),
    canRedo: () => canRedoEdit(),
    canUndoSelection: () => Boolean(canUndoSelection),
    canRedoSelection: () => Boolean(canRedoSelection),
    undoSelection,
    redoSelection,
    getViewerSelection: () => {
      if (activeAskBubble?.selection) return activeAskBubble.selection;
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
  }), [apply, revert, saveAllManualEdits, discardAllManualEdits, hasPendingEdits, compute, selectedInfo, effectiveDraftValue, controlledDraftValue, onDraftValueChange, isApplying, load, sheetMeta, lockedCells, current, cellA1At, currentSheetName, activeAskBubble, selectedRange, selected, viewerSelectionForRange, clearSelection, undoSelection, redoSelection, undoAction, redoAction, canUndoEdit, canRedoEdit, canUndoSelection, canRedoSelection, editHistoryVersion, selectionHistoryVersion]);

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
    <div
      ref={rootRef}
      className="excel-preview-container"
      style={{
        position: hideToolbar ? 'absolute' : 'relative',
        top: hideToolbar ? 0 : undefined,
        right: hideToolbar ? 0 : undefined,
        bottom: hideToolbar ? 0 : undefined,
        left: hideToolbar ? 0 : undefined,
        width: '100%',
        height: '100%',
        flex: '1 1 auto',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {userHasSelected && activeAskBubble?.rect && activeAskBubble?.selection ? (
        <div
          data-ask-allybi-bubble
          style={{
            position: 'fixed',
            left: activeAskBubble.rect.left + (activeAskBubble.rect.width / 2),
            top: Math.max(12, activeAskBubble.rect.top - 10),
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
          title={activeAskBubble.label}
        >
          <button
            type="button"
            onClick={() => onAskAllybi?.(activeAskBubble.selection)}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '4px 6px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Ask Allybi"
          >
            <img src={sphereIcon} alt="Ask Allybi" style={{ width: 20, height: 20, objectFit: 'contain' }} />
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
          subtitle="Click to edit. Drag or Shift+click to select ranges. Arrow keys navigate, Enter/Tab commits, Ctrl/Cmd+A selects all."
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
              title: 'Charts require Google Sheets connection',
              disabled: true,
              onClick: () => {},
            },
          ]}
          centerSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', overflow: 'hidden' }}>
              <input
                value={effectiveDraftValue}
                onChange={(e) => {
                  if (controlledDraftValue != null) onDraftValueChange?.(e.target.value);
                  else setDraftValue(e.target.value);
                }}
                placeholder="Value (or paste a grid)"
                style={{
                  flex: '1 1 80px',
                  minWidth: 80,
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
              {/* Highlight navigation — only visible when highlights exist */}
              {hasHighlights ? (
                <>
                  <button
                    type="button"
                    onClick={jumpToNextHighlight}
                    title="Jump to next highlighted change"
                    style={{
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 10,
                      border: '1px solid #E5E7EB',
                      background: 'white',
                      color: '#111827',
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: 950,
                      fontSize: 13,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Jump
                  </button>
                  <button
                    type="button"
                    onClick={clearHighlights}
                    title="Clear all highlights on this sheet"
                    style={{
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 10,
                      border: '1px solid #E5E7EB',
                      background: 'white',
                      color: '#111827',
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: 950,
                      fontSize: 13,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Clear
                  </button>
                </>
              ) : null}
              {statusMsg ? (
                <div style={{
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: 850,
                  fontSize: 12,
                  color: '#111827',
                  padding: '6px 10px',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  background: 'rgba(249, 250, 251, 0.9)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flexShrink: 1,
                  minWidth: 0,
                }} role="status" aria-live="polite" aria-atomic="true">
                  {statusMsg}
                </div>
              ) : null}
            </div>
          }
        />
      ) : null}

      {/* Spreadsheet Grid — Virtualized */}
      <VirtualizedGrid
        current={current}
        scale={scale}
        tableContainerRef={tableContainerRef}
        selected={selected}
        selectedRange={selectedRange}
        lockedCells={lockedCells}
        dragRect={dragRect}
        pendingState={pendingState}
        flashRect={flashRect}
        appliedHighlightRects={appliedHighlightRects}
        cellA1At={cellA1At}
        currentSheetName={currentSheetName}
        draftFormatOverrides={draftFormatOverrides}
        draftCellOverrides={draftCellOverrides}
        tableRangesForActiveSheet={tableRangesForActiveSheet}
        tablePaletteByStyle={tablePaletteByStyle}
        normalizeHex={normalizeHex}
        formatNumericLike={formatNumericLike}
        setUserHasSelected={setUserHasSelected}
        setLockedCells={setLockedCells}
        setSelected={setSelected}
        setSelectedRange={setSelectedRange}
        isDraggingRef={isDraggingRef}
        setDragAnchor={setDragAnchor}
        setDragEnd={setDragEnd}
        t={t}
        isInlineEditing={isInlineEditing}
        setIsInlineEditing={setIsInlineEditing}
        isApplying={isApplying}
        effectiveDraftValue={effectiveDraftValue}
        controlledDraftValue={controlledDraftValue}
        onDraftValueChange={onDraftValueChange}
        setDraftValue={setDraftValue}
        inlineEditorRef={inlineEditorRef}
        revert={revert}
        commitDraftIfDirty={commitDraftIfDirty}
        moveSelectionBy={moveSelectionBy}
        selectedRef={selectedRef}
        applySelectionRect={applySelectionRect}
        gridBounds={gridBounds}
      />

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
