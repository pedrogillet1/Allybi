import React, { useEffect, useMemo, useRef, useState } from 'react';
import './AllybiEditingToolbar.css';

import UndoIcon from './icons/undo.svg';
import RedoIcon from './icons/redo.svg';

// Use the "text" variants so active-state inversion looks like Word/Docs.
import BoldIcon from './icons/bold-text.svg';
import ItalicIcon from './icons/italic-text.svg';
import UnderlineIcon from './icons/underline-text.svg';
import AlignLeftIcon from './icons/align-left.svg';
import AlignCenterIcon from './icons/align-center.svg';
import AlignRightIcon from './icons/align-right.svg';
import AlignJustifyIcon from './icons/align-justify.svg';
import ListBulletIcon from './icons/list-bullet.svg';
import ListNumberedIcon from './icons/list-numbered.svg';
import PlusIcon from './icons/plus.svg';
import MinusIcon from './icons/minus.svg';
import ChevronLeftIcon from './icons/chevron-left.svg';
import ChevronRightIcon from './icons/chevron-right.svg';
// No dropdowns in viewer editing toolbar (steppers only).

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
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

export default function AllybiEditingToolbar({
  fileType, // 'word' | 'excel' | 'powerpoint' | 'pdf'
  zoom,
  onZoomChange,

  // Word
  fontFamily,
  onFontFamilyChange,
  fontSize,
  onFontSizeChange,
  colorHex,
  onColorHexChange,
  activeFormats, // { bold, italic, underline, strikethrough }
  alignment, // 'left'|'center'|'right'|'justify'
  onCommand,
  wordSecondaryActionLabel,
  onWordSecondaryAction,
  wordPrimaryActionLabel,
  onWordPrimaryAction,
  wordPrimaryActionDisabled,

  // Excel
  excelDraftValue,
  onExcelDraftValueChange,
  onExcelApply,
  onExcelRevert,
  excelCanApply,
  excelSelectedInfo,
  excelSheetMeta,
  onExcelPrevSheet,
  onExcelNextSheet,
  onExcelSetSheetIndex,
  excelStatusMsg,

  // PPTX
  pptxTargets,
  pptxSelectedTargetId,
  onPptxSelectTargetId,
  pptxDraftText,
  onPptxDraftTextChange,
  onPptxApplyRewrite,
  pptxCanApplyRewrite,
  pptxLayout,
  onPptxLayoutChange,
  onPptxAddSlide,
  pptxBusy,
  onPptxOpenStudio,

  // PDF
  pdfIsEditingText,
  pdfCanEditText = true,
  onPdfToggleEditText,
  onPdfSave,
  onPdfRevert,
}) {
  const showWordControls = fileType === 'word' || (fileType === 'pdf' && pdfIsEditingText);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const colorMenuRef = useRef(null);
  const excelValueRef = useRef(null);

  const allybiFonts = useMemo(() => ([
    'Plus Jakarta Sans',
    'DM Sans',
    'Inter',
    'IBM Plex Sans',
    'Roboto',
    'Open Sans',
    'Lato',
    'Montserrat',
    'Poppins',
    'Raleway',
    'Source Sans 3',
    'Noto Sans',
    'Nunito Sans',
    'Work Sans',
    'Cabin',
    'Rubik',
    'Figtree',
    'Manrope',
    'Sora',
    'Space Grotesk',
    'Oswald',
    'Playfair Display',
    'Merriweather',
    'Lora',
    'Crimson Text',
    'Libre Baskerville',
    'EB Garamond',
    'Cormorant Garamond',
    'Source Serif 4',
    'Noto Serif',
    'PT Serif',
    'Inconsolata',
    'JetBrains Mono',
    'IBM Plex Mono',
  ]), []);

  const excelGridMeta = useMemo(() => {
    if (fileType !== 'excel') return null;
    const v = String(excelDraftValue || '');
    if (!excelSelectedInfo?.a1) return null;
    if (!isGridPayload(v)) return null;
    const { r, c } = gridSizeFromPayload(v);
    const colLetter = String(excelSelectedInfo.a1).replace(/[0-9]/g, '');
    const rowNumber = Number(String(excelSelectedInfo.a1).replace(/[^0-9]/g, ''));
    const startColIdx = colLetterToIndex(colLetter);
    if (startColIdx == null || !Number.isFinite(rowNumber) || rowNumber < 1) return { r, c, rangeA1: null };
    const endCol = indexToColLetter(startColIdx + (c - 1));
    const endRow = rowNumber + (r - 1);
    return { r, c, rangeA1: `${colLetter}${rowNumber}:${endCol}${endRow}` };
  }, [fileType, excelDraftValue, excelSelectedInfo?.a1]);

  useEffect(() => {
    if (fileType !== 'excel') return;
    const el = excelValueRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 96);
    el.style.height = `${Math.max(32, next)}px`;
  }, [fileType, excelDraftValue]);

  useEffect(() => {
    if (!colorMenuOpen) return;
    const onDown = (e) => {
      const t = e.target;
      const colorRoot = colorMenuRef.current;

      if (colorMenuOpen && colorRoot && !colorRoot.contains(t)) setColorMenuOpen(false);
    };
    window.document.addEventListener('mousedown', onDown, true);
    return () => window.document.removeEventListener('mousedown', onDown, true);
  }, [colorMenuOpen]);

  useEffect(() => {
    // Defensive: switching file types should not leave popovers open.
    setColorMenuOpen(false);
  }, [fileType]);

  const iconBtn = (title, icon, onActivate, { active = false, disabled = false } = {}) => (
    <button
      type="button"
      className={`toolbar-btn icon-btn ${active ? 'active' : ''}`}
      title={title}
      onMouseDown={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        // Preserve contentEditable selection (Word-like).
        e.preventDefault();
        onActivate?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (disabled) return;
          e.preventDefault();
          onActivate?.();
        }
      }}
      disabled={disabled}
    >
      <img src={icon} alt="" />
    </button>
  );

  const textBtn = (title, label, onActivate, { primary = false, disabled = false } = {}) => (
    <button
      type="button"
      className={`toolbar-btn text-btn ${primary ? 'primary' : ''}`}
      title={title}
      onMouseDown={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onActivate?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (disabled) return;
          e.preventDefault();
          onActivate?.();
        }
      }}
      disabled={disabled}
    >
      {label}
    </button>
  );

  const divider = () => <div className="toolbar-divider" />;

  const zoomOut = () => onZoomChange?.(clamp((zoom ?? 100) - 25, 50, 200));
  const zoomIn = () => onZoomChange?.(clamp((zoom ?? 100) + 25, 50, 200));

  // Apply selection styling immediately; no "Style" button.
  const applyInlineStyle = (next = {}) => {
    if (!showWordControls) return;
    onCommand?.({ type: 'applyStyle', style: { ...(next || {}) } });
  };

  const fontSizePx = useMemo(() => {
    const raw = String(fontSize || '16px');
    const n = Number(raw.replace('px', '').trim());
    return Number.isFinite(n) ? clamp(n, 8, 72) : 16;
  }, [fontSize]);

  const setFontSizeSafe = (px) => {
    if (!showWordControls) return;
    const n = clamp(px, 8, 72);
    const v = `${n}px`;
    onFontSizeChange?.(v);
    applyInlineStyle({ 'font-size': v });
  };

  const cycleFont = (delta) => {
    if (!showWordControls) return;
    const fonts = Array.isArray(allybiFonts) && allybiFonts.length ? allybiFonts : ['Calibri'];
    const cur = String(fontFamily || fonts[0] || 'Calibri');
    const idx = Math.max(0, fonts.findIndex((f) => String(f).toLowerCase() === cur.toLowerCase()));
    const next = fonts[(idx + delta + fonts.length) % fonts.length];
    onFontFamilyChange?.(next);
    applyInlineStyle({ 'font-family': next });
  };

  const colorPresets = useMemo(
    () => ['#111827', '#374151', '#6B7280', '#0F172A', '#1D4ED8', '#2563EB', '#16A34A', '#DC2626', '#F59E0B', '#A855F7'],
    []
  );

  const excelStatusToShow = useMemo(() => {
    const msg = String(excelStatusMsg || '').trim();
    if (!msg) return '';
    // Hide noisy success toasts in the Excel bar (users complained about "Applied.").
    if (/^applied\b/i.test(msg)) return '';
    if (/^applying\b/i.test(msg)) return '';
    if (/^reverted\b/i.test(msg)) return '';
    return msg;
  }, [excelStatusMsg]);

  return (
    <div className="formatting-toolbar allybi-one-line">
      {/* Content: centered, file-type specific */}
      <div className="allybi-toolbar-center">
        {showWordControls ? (
          <>
            <div className="toolbar-section">
              {iconBtn('Undo', UndoIcon, () => onCommand?.('undo'))}
              {iconBtn('Redo', RedoIcon, () => onCommand?.('redo'))}
              {divider()}
            </div>

            <div className="toolbar-section allybi-fontsize-section">
              {/* No dropdowns: stepper controls (font prev/next, size +/-). */}
              {iconBtn('Previous font', ChevronLeftIcon, () => cycleFont(-1))}
              <div className="toolbar-btn allybi-font-readout" title="Font">
                <span className="allybi-font-label" style={{ fontWeight: 900 }}>
                  {fontFamily || 'Calibri'}
                </span>
              </div>
              {iconBtn('Next font', ChevronRightIcon, () => cycleFont(+1))}

              {divider()}

              {iconBtn('Decrease font size', MinusIcon, () => setFontSizeSafe(fontSizePx - 1))}
              <div className="toolbar-btn allybi-font-readout allybi-size-readout" title="Font size">
                <span className="allybi-font-label" style={{ fontWeight: 950, minWidth: 44, textAlign: 'center' }}>
                  {fontSizePx}px
                </span>
              </div>
              {iconBtn('Increase font size', PlusIcon, () => setFontSizeSafe(fontSizePx + 1))}
            </div>

	            <div className="toolbar-section allybi-format-section">
	              {iconBtn('Bold', BoldIcon, () => onCommand?.('bold'), { active: Boolean(activeFormats?.bold) })}
	              {iconBtn('Italic', ItalicIcon, () => onCommand?.('italic'), { active: Boolean(activeFormats?.italic) })}
	              {iconBtn('Underline', UnderlineIcon, () => onCommand?.('underline'), { active: Boolean(activeFormats?.underline) })}
	            </div>

	            <div className="toolbar-section allybi-color-section">
	              <div ref={colorMenuRef} className="allybi-font-menu">
	                <button
	                  type="button"
	                  className="toolbar-btn icon-btn allybi-color-trigger"
	                  title="Text color"
	                  onMouseDown={(e) => {
	                    e.preventDefault();
	                    setColorMenuOpen((v) => !v);
	                  }}
	                >
	                  <span className="allybi-color-dot" style={{ background: colorHex || '#111827' }} />
	                </button>
	                {colorMenuOpen ? (
	                  <div className="allybi-font-popover" role="menu">
	                    <div className="allybi-color-row">
	                      <input
	                        type="color"
	                        value={colorHex || '#111827'}
	                        onChange={(e) => {
	                          const v = e.target.value;
	                          onColorHexChange?.(v);
	                          applyInlineStyle({ color: v });
	                        }}
	                        aria-label="Text color"
	                      />
	                      <div style={{ fontWeight: 900, fontSize: 12, color: '#111827' }}>
	                        {String(colorHex || '#111827').toUpperCase()}
	                      </div>
	                    </div>
	                    <div className="allybi-color-swatches">
	                      {colorPresets.map((c) => (
	                        <button
	                          key={c}
	                          type="button"
	                          className="allybi-color-swatch"
	                          onMouseDown={(e) => e.preventDefault()}
	                          onClick={() => {
	                            onColorHexChange?.(c);
	                            applyInlineStyle({ color: c });
	                            setColorMenuOpen(false);
	                          }}
	                          title={c}
	                        >
	                          <span style={{ background: c }} />
	                        </button>
	                      ))}
	                    </div>
	                  </div>
	                ) : null}
	              </div>
	            </div>

	            <div className="toolbar-section allybi-list-section">
	              {iconBtn('Bulleted list', ListBulletIcon, () => onCommand?.('insertUnorderedList'))}
	              {iconBtn('Numbered list', ListNumberedIcon, () => onCommand?.('insertOrderedList'))}
	            </div>

	            <div className="toolbar-section allybi-align-section">
	              {iconBtn('Align left', AlignLeftIcon, () => onCommand?.('justifyLeft'), { active: alignment === 'left', disabled: alignment === 'left' })}
	              {iconBtn('Align center', AlignCenterIcon, () => onCommand?.('justifyCenter'), { active: alignment === 'center', disabled: alignment === 'center' })}
	              {iconBtn('Align right', AlignRightIcon, () => onCommand?.('justifyRight'), { active: alignment === 'right', disabled: alignment === 'right' })}
	              {iconBtn('Justify', AlignJustifyIcon, () => onCommand?.('justifyFull'), { active: alignment === 'justify', disabled: alignment === 'justify' })}
	            </div>
          </>
        ) : null}

        {fileType === 'excel' ? (
          <div className="allybi-excel-row">
            <div className="allybi-excel-left">
              {iconBtn('Previous sheet', ChevronLeftIcon, () => onExcelPrevSheet?.(), {
                disabled: !(excelSheetMeta?.sheetCount > 1) || (excelSheetMeta?.activeIndex ?? 0) <= 0,
              })}

              <select
                className="toolbar-select allybi-excel-sheet-select"
                value={String(excelSheetMeta?.activeIndex ?? 0)}
                onChange={(e) => onExcelSetSheetIndex?.(Number(e.target.value))}
                title="Sheet"
              >
                {(excelSheetMeta?.sheetNames || []).map((name, idx) => (
                  <option key={`${idx}:${name}`} value={String(idx)}>{name}</option>
                ))}
              </select>

              {iconBtn('Next sheet', ChevronRightIcon, () => onExcelNextSheet?.(), {
                disabled: !(excelSheetMeta?.sheetCount > 1) || (excelSheetMeta?.activeIndex ?? 0) >= (excelSheetMeta?.sheetCount ?? 1) - 1,
              })}

              {typeof excelSheetMeta?.sheetCount === 'number' && excelSheetMeta.sheetCount > 0 ? (
                <div className="allybi-excel-sheetcount" title={`${excelSheetMeta.activeName || 'Sheet'} (${(excelSheetMeta.activeIndex ?? 0) + 1} of ${excelSheetMeta.sheetCount})`}>
                  Sheet {(excelSheetMeta.activeIndex ?? 0) + 1} of {excelSheetMeta.sheetCount}
                </div>
              ) : null}
            </div>

	            <div className="allybi-excel-center">
	              <div className="allybi-excel-namebox" title={excelSelectedInfo?.targetId || ''}>
	                {excelSelectedInfo?.a1 || 'Selection'}
	              </div>

	              <div className="allybi-excel-valuewrap">
	                <textarea
	                  ref={excelValueRef}
	                  value={excelDraftValue || ''}
	                  onChange={(e) => onExcelDraftValueChange?.(e.target.value)}
	                  className="toolbar-input allybi-excel-value"
	                  placeholder="Value or paste a grid"
	                  spellCheck={false}
	                  autoCorrect="off"
	                  autoCapitalize="off"
	                  data-gramm="false"
	                  rows={1}
	                  onKeyDown={(e) => {
	                    if (e.key === 'Escape') {
	                      e.preventDefault();
	                      onExcelRevert?.();
                      return;
                    }

                    const wantsApply = (e.key === 'Enter' && (e.metaKey || e.ctrlKey));
                    const singleLine = !isGridPayload(excelDraftValue || '');
                    const enterApplies = e.key === 'Enter' && singleLine && !e.shiftKey && !e.altKey;

                    if ((wantsApply || enterApplies) && excelCanApply) {
                      e.preventDefault();
                      onExcelApply?.();
                    }
                  }}
                />

                {excelGridMeta?.r && excelGridMeta?.c ? (
                  <div className="allybi-excel-gridpill" title="Grid paste detected (TSV/CSV)">
                    Grid {excelGridMeta.r}x{excelGridMeta.c}
                    {excelGridMeta.rangeA1 ? ` -> ${excelGridMeta.rangeA1}` : ''}
                  </div>
                ) : null}
              </div>
	            </div>

	            <div className="allybi-excel-right">
	              {excelStatusToShow ? (
	                <div className="allybi-excel-status" title={excelStatusToShow}>
	                  {excelStatusToShow}
	                </div>
	              ) : null}
	              {textBtn('Revert (Esc)', 'Revert', () => onExcelRevert?.(), { disabled: !excelCanApply })}
	              {textBtn('Apply (Enter)', 'Apply', () => onExcelApply?.(), { primary: true, disabled: !excelCanApply })}
	            </div>
	          </div>
	        ) : null}

        {fileType === 'powerpoint' ? (
          <>
            <div className="toolbar-section">
              {typeof onPptxOpenStudio === 'function'
                ? textBtn('Open Studio editor', 'Studio edit', () => onPptxOpenStudio?.(), { primary: true })
                : null}
              <select
                className="toolbar-select"
                value={pptxSelectedTargetId || ''}
                onChange={(e) => onPptxSelectTargetId?.(e.target.value)}
                title="Text target"
              >
                {(pptxTargets || []).length ? (
                  (pptxTargets || []).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))
                ) : (
                  <option value="">No text targets</option>
                )}
              </select>
              <input
                value={pptxDraftText || ''}
                onChange={(e) => onPptxDraftTextChange?.(e.target.value)}
                className="toolbar-input allybi-wide-input"
                placeholder="Rewrite selected text…"
              />
              {textBtn('Apply rewrite', 'Apply rewrite', () => onPptxApplyRewrite?.(), { primary: true, disabled: !pptxCanApplyRewrite || pptxBusy })}
              {divider()}
              <select
                className="toolbar-select"
                value={pptxLayout || 'TITLE_AND_BODY'}
                onChange={(e) => onPptxLayoutChange?.(e.target.value)}
                title="New slide layout"
              >
                <option value="TITLE_AND_BODY">Title and body</option>
                <option value="TITLE_ONLY">Title only</option>
                <option value="SECTION_HEADER">Section header</option>
                <option value="BLANK">Blank</option>
                <option value="TITLE_AND_TWO_COLUMNS">Title and two columns</option>
              </select>
              {textBtn('Add slide', 'Add slide', () => onPptxAddSlide?.(), { disabled: Boolean(pptxBusy) })}
            </div>
          </>
        ) : null}

        {fileType === 'pdf' ? (
          <div className="toolbar-section">
            {textBtn(
              'Edit PDF text (creates an editable working copy)',
              'Edit text',
              () => onPdfToggleEditText?.(),
              { disabled: !pdfCanEditText }
            )}
          </div>
        ) : null}
      </div>

      {/* Zoom: pinned to far right */}
      <div className="allybi-toolbar-zoom">
        {fileType === 'word' && (wordSecondaryActionLabel || wordPrimaryActionLabel) ? (
          <div className="toolbar-section" style={{ gap: 8 }}>
            {wordSecondaryActionLabel
              ? textBtn(wordSecondaryActionLabel, wordSecondaryActionLabel, () => onWordSecondaryAction?.())
              : null}
            {wordPrimaryActionLabel
              ? textBtn(
                  wordPrimaryActionLabel,
                  wordPrimaryActionLabel,
                  () => onWordPrimaryAction?.(),
                  { primary: true, disabled: Boolean(wordPrimaryActionDisabled) }
                )
              : null}
          </div>
        ) : null}
        {iconBtn('Zoom out', MinusIcon, zoomOut)}
        <div className="zoom-display">{clamp(zoom ?? 100, 50, 200)}%</div>
        {iconBtn('Zoom in', PlusIcon, zoomIn)}
      </div>
    </div>
  );
}
