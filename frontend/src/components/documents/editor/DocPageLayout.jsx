import React, { forwardRef, useState } from 'react';
import DocToolbar from './DocToolbar';
import DocViewport from './DocViewport';
import DocPaper from './DocPaper';

/**
 * Orchestrator that composes DocToolbar + DocViewport + DocPaper for DOCX editing.
 * Follows the same pattern as SpreadsheetPageLayout.
 *
 * The forwarded ref is attached to the scroll container (DocViewport) so the
 * parent (DocumentViewer) can use it for selection-bubble positioning, etc.
 */
const DocPageLayout = forwardRef(function DocPageLayout(
  {
    // Toolbar formatting state
    fontFamily, onFontFamilyChange,
    fontSize, onFontSizeChange,
    colorHex, onColorHexChange,
    activeFormats, listType, alignment,
    onCommand,

    // Save/Discard
    hasPendingEdits, saveStatus,
    onSave, onDiscard,

    // Zoom
    zoom, onZoomChange,

    // Misc
    onBackgroundClick,
    onScroll,

    // Selection overlay (absolutely positioned inside viewport)
    selectionOverlay,

    // Save notice toast
    saveNotice,

    children,
  },
  ref,
) {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      <DocToolbar
        fontFamily={fontFamily}
        onFontFamilyChange={onFontFamilyChange}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        colorHex={colorHex}
        onColorHexChange={onColorHexChange}
        activeFormats={activeFormats}
        listType={listType}
        alignment={alignment}
        onCommand={onCommand}
        hasPendingEdits={hasPendingEdits}
        saveStatus={saveStatus}
        onSave={onSave}
        onDiscard={onDiscard}
        zoom={zoom}
        onZoomChange={onZoomChange}
        currentPage={currentPage}
        totalPages={totalPages}
        onBackgroundClick={onBackgroundClick}
      />

      <DocViewport
        ref={ref}
        zoom={zoom}
        onPageChange={(page, total) => { setCurrentPage(page); setTotalPages(total); }}
        onScroll={onScroll}
      >
        {/* Selection overlay */}
        {selectionOverlay}

        <DocPaper>
          {children}
        </DocPaper>
      </DocViewport>

      {/* Save notice toast */}
      {saveNotice ? (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: saveNotice === 'Save failed' ? '#D92D20' : '#111827',
          color: '#FFFFFF', padding: '10px 24px', borderRadius: 8,
          fontSize: 14, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}>
          {saveNotice}
        </div>
      ) : null}
    </div>
  );
});

export default DocPageLayout;
