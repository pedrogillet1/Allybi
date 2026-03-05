import React, { useState, useCallback, useMemo } from 'react';
import SpreadsheetToolbar from './SpreadsheetToolbar';
import FormulaBar from './FormulaBar';
import SheetTabs from './SheetTabs';
import StatusBar from './StatusBar';
import AIDrawer from './AIDrawer';
import { useIsMobile } from '../../hooks/useIsMobile';

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
  return {
    r: rows.length || 1,
    c: Math.max(1, ...rows.map((row) => row.length || 1)),
  };
}

function SpreadsheetPageLayout({
  document: doc,
  onBack,
  onDownload,
  onShare,

  // AI panel
  aiOpen = false,
  onToggleAI,
  assistantPanel,

  // Excel canvas ref
  excelCanvasRef,

  // Draft / editing state
  draftValue = '',
  onDraftValueChange,
  selectedInfo,
  sheetMeta,
  historyState,
  statusMsg = '',

  // Formatting
  fontFamily = 'Calibri',
  fontSizePt = 11,
  colorHex = '#000000',
  bold = false,
  italic = false,
  underline = false,
  onFormatChange,

  // Undo / redo
  onUndo,
  onRedo,

  // Zoom
  zoom = 100,
  onZoomChange,

  // Save
  hasPendingEdits = false,
  lastSavedAt,
  saveStatus = 'idle',

  // Grid children (ExcelEditCanvas)
  children,
}) {
  const isMobile = useIsMobile();
  const [aiWidth, setAiWidth] = useState(380);

  const sheetNames = useMemo(() => {
    if (!sheetMeta?.sheets) return [];
    return Array.isArray(sheetMeta.sheets)
      ? sheetMeta.sheets.map((s) => (typeof s === 'string' ? s : s?.name || s?.label || `Sheet${sheetMeta.sheets.indexOf(s) + 1}`))
      : [];
  }, [sheetMeta]);

  const activeSheetIndex = sheetMeta?.activeSheet ?? 0;

  const cellRef = selectedInfo?.a1 || selectedInfo?.targetId || '';

  const isGrid = isGridPayload(draftValue);
  const gridMeta = isGrid ? gridSizeFromPayload(draftValue) : null;

  const canApply = useMemo(() => {
    if (!selectedInfo?.a1) return false;
    const draft = String(draftValue ?? '');
    const before = String(selectedInfo?.beforeText ?? '');
    if (isGrid) return Boolean(draft.trim());
    return draft.trim() !== before.trim();
  }, [draftValue, selectedInfo, isGrid]);

  const handleCellRefSubmit = useCallback((ref) => {
    // Navigate to cell — would need canvas ref to scroll
    // For now this is a visual placeholder
  }, []);

  const selectionStats = useMemo(() => {
    // TODO: compute from selected range data
    return null;
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        width: '100%',
        alignSelf: 'stretch',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        background: '#FFFFFF',
      }}
    >
      {/* (A) Spreadsheet Toolbar — fixed at top */}
      <SpreadsheetToolbar
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={Boolean(historyState?.canUndo)}
        canRedo={Boolean(historyState?.canRedo)}
        fontFamily={fontFamily}
        fontSizePt={fontSizePt}
        bold={bold}
        italic={italic}
        underline={underline}
        colorHex={colorHex}
        onFormatChange={onFormatChange}
      />

      {/* (B) Formula Bar — fixed below toolbar */}
      <FormulaBar
        cellRef={cellRef}
        value={draftValue}
        onValueChange={onDraftValueChange}
        onApply={() => excelCanvasRef?.current?.apply?.()}
        onRevert={() => excelCanvasRef?.current?.revert?.()}
        canApply={canApply}
        isGridPayload={isGrid}
        gridMeta={gridMeta}
        onCellRefSubmit={handleCellRefSubmit}
        isApplying={false}
      />

      {/* (C) Main content: Grid + AI Drawer — grid is the ONLY scroll area */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Grid area — stretches to fill, inner excel-preview-grid-wrapper scrolls */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </div>

        {/* AI Drawer */}
        <AIDrawer
          open={aiOpen}
          width={aiWidth}
          onWidthChange={setAiWidth}
          overlayMode={isMobile || (typeof window !== 'undefined' && window.innerWidth < 900)}
        >
          {assistantPanel}
        </AIDrawer>
      </div>

      {/* (D) Bottom bar: Sheet tabs + Status bar — fixed at bottom */}
      <SheetTabs
        sheetNames={sheetNames}
        activeIndex={activeSheetIndex}
        onSelectSheet={(i) => excelCanvasRef?.current?.setActiveSheet?.(i)}
      />
      <StatusBar
        selectionStats={selectionStats}
        zoom={zoom}
        onZoomChange={onZoomChange}
        saveStatus={saveStatus}
      />
    </div>
  );
}

export default SpreadsheetPageLayout;
