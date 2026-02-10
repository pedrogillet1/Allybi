import React, { useCallback, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../services/api';
import { applyEdit } from '../../../services/editingService';
import cleanDocumentName from '../../../utils/cleanDocumentName';
import { getPreviewCountForFile, getFileExtension } from '../../../utils/files/previewCount';
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

const ExcelEditCanvas = forwardRef(function ExcelEditCanvas(
  {
    document,
    zoom = 100,
    onApplied,
    onCountUpdate,
    hideToolbar = false,
    hideSheetTabs = false,
    onSelectedInfoChange,
    draftValue: controlledDraftValue,
    onDraftValueChange,
    onStatusMsg,
    onSheetMetaChange,
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

  const [selected, setSelected] = useState(null); // { rowIdx (>=1), colIdx (>=1) in parsed grid }
  const [draftValue, setDraftValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isApplying, setIsApplying] = useState(false);

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
      setSheets(sheetList);
      const parsed = parseHtmlToSheetData(htmlContent);
      setSheetData(parsed);

      // Initialize selection to first data cell (B2 equivalent in preview grid).
      setSelected((prev) => prev || { rowIdx: 1, colIdx: 1 });
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

  useEffect(() => {
    onSelectedInfoChange?.(selectedInfo);
  }, [onSelectedInfoChange, selectedInfo]);

  // When switching sheets, reset selection so we don't point at an invalid cell.
  useEffect(() => {
    setSelected({ rowIdx: 1, colIdx: 1 });
  }, [activeSheet]);

  const effectiveDraftValue = controlledDraftValue != null ? controlledDraftValue : draftValue;

  // Keep draftValue in sync with selection changes unless user has started typing.
  useEffect(() => {
    if (!selectedInfo) return;
    if (controlledDraftValue != null) {
      // Only overwrite if empty or matching previous beforeText (mirrors local behavior).
      onDraftValueChange?.((!controlledDraftValue || controlledDraftValue === selectedInfo.beforeText) ? selectedInfo.beforeText : controlledDraftValue);
      return;
    }
    setDraftValue((prev) => {
      // If previous draft equals previous beforeText (or empty), refresh to new beforeText.
      if (!prev || prev === selectedInfo.beforeText) return selectedInfo.beforeText;
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInfo?.targetId, controlledDraftValue, onDraftValueChange, selectedInfo?.beforeText]);

  const apply = useCallback(async () => {
    if (!docId || !selectedInfo) return;
    const proposedText = String(effectiveDraftValue ?? '').trim();
    if (!proposedText && proposedText !== '') {
      setStatusMsg('Nothing to apply.');
      onStatusMsg?.('Nothing to apply.');
      return;
    }

    const beforeText = String(selectedInfo.beforeText ?? '');
    const targetId = selectedInfo.targetId;

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
  }, [docId, selectedInfo, effectiveDraftValue, currentSheetName, document?.filename, load, onApplied, onStatusMsg]);

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
  }), [apply, revert, selectedInfo, effectiveDraftValue, controlledDraftValue, onDraftValueChange, isApplying, load, sheetMeta]);

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
    <div className="excel-preview-container" style={{ position: 'relative' }}>
      {!hideToolbar ? (
        <EditorToolbar
          title={`Editing ${cleanDocumentName(document?.filename)}`}
          subtitle="Click a cell to edit. Paste a TSV/CSV grid to edit a range."
          scopeLabel={selectedInfo?.targetId || `${currentSheetName}!A1`}
          format="sheets"
          canFormatText={false}
          onRevert={revert}
          onApply={apply}
          applyLabel="Apply"
          revertLabel="Revert"
          isApplying={isApplying}
          canApply={Boolean(selectedInfo)}
          canRevert={Boolean(selectedInfo)}
          centerSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
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
            <div className="excel-preview-table-container">
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
                          return (
                            <td
                              key={colIdx}
                              className={`excel-cell ${cell.className || ''}`}
                              onClick={() => setSelected({ rowIdx, colIdx })}
                              style={{
                                cursor: 'pointer',
                                boxShadow: isSelected ? 'inset 0 0 0 2px rgba(17, 24, 39, 0.6)' : undefined,
                                background: isSelected ? 'rgba(17, 24, 39, 0.06)' : undefined,
                              }}
                              title="Click to edit"
                            >
                              {cell.value}
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
