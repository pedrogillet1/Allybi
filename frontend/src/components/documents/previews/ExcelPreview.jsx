import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../services/api';
import { ReactComponent as ArrowLeftIcon } from '../../../assets/arrow-narrow-left.svg';
import { ReactComponent as ArrowRightIcon } from '../../../assets/arrow-narrow-right.svg';
import { getPreviewCountForFile, getFileExtension } from '../../../utils/previewCount';
import '../../../styles/ExcelPreview.css';

/**
 * ExcelPreview - Redesigned spreadsheet viewer
 *
 * Features:
 * - Real spreadsheet grid with row numbers + column letters
 * - Sticky headers (row/col pinned)
 * - Sheet tabs at bottom (Excel convention)
 * - Zoom controls consistent with PPTX/PDF viewer
 * - Proper Koda design system styling
 */
const ExcelPreview = ({ document, zoom, onCountUpdate }) => {
  const { t } = useTranslation();
  const [sheets, setSheets] = useState([]);
  const [sheetData, setSheetData] = useState({}); // { sheetIndex: { rows: [], colCount: number } }
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const gridContainerRef = useRef(null);

  // Canonical preview count computation
  const previewCount = useMemo(() => {
    if (!document) return null;
    const fileExt = getFileExtension(document.filename || '');
    const sheetCount = sheets.length;

    if (sheetCount > 0) {
      return getPreviewCountForFile({
        mimeType: document.mimeType,
        fileExt,
        totalSheets: sheetCount,
        currentSheet: activeSheet + 1,
        isLoading: loading,
        previewType: 'sheets'
      }, t);
    }

    return null;
  }, [document, sheets.length, activeSheet, loading, t]);

  // Propagate previewCount to parent DocumentViewer
  useEffect(() => {
    if (onCountUpdate && previewCount) {
      onCountUpdate(previewCount);
    }
  }, [previewCount, onCountUpdate]);

  // Parse HTML content into structured data for each sheet
  const parseHtmlToSheetData = useCallback((html, sheetList) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const sheetContainers = doc.querySelectorAll('.sheet-container');

    const parsedData = {};

    sheetContainers.forEach((container, index) => {
      const table = container.querySelector('.excel-table');
      if (!table) return;

      const rows = [];
      const tableRows = table.querySelectorAll('tr');
      let maxCols = 0;

      tableRows.forEach((tr, rowIdx) => {
        const cells = [];
        const tds = tr.querySelectorAll('th, td');

        tds.forEach((cell, colIdx) => {
          cells.push({
            value: cell.textContent || '',
            className: cell.className || '',
            isHeader: cell.tagName.toLowerCase() === 'th'
          });
        });

        if (cells.length > maxCols) maxCols = cells.length;
        rows.push(cells);
      });

      parsedData[index] = {
        rows,
        colCount: maxCols,
        rowCount: rows.length
      };
    });

    return parsedData;
  }, []);

  // Fetch Excel preview data
  useEffect(() => {
    const fetchExcelPreview = async () => {
      if (!document || !document.id) {
        setError(t('excelPreview.documentNotAvailable'));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await api.get(`/api/documents/${document.id}/preview`);

        // Handle excel-pdf mode - we'll request HTML instead
        if (response.data.previewType === 'excel-pdf') {
          // For now, show a message that we're using PDF mode
          // In production, you might want to request HTML conversion specifically
          console.log('📊 [ExcelPreview] PDF mode available, but using HTML for better UX');
        }

        if (response.data.previewType === 'excel' || response.data.previewType === 'excel-pdf') {
          if (response.data.htmlContent) {
            const sheetList = response.data.sheets || [];
            setSheets(sheetList);

            // Parse HTML into structured data
            const parsed = parseHtmlToSheetData(response.data.htmlContent, sheetList);
            setSheetData(parsed);
          } else if (response.data.error) {
            console.warn('Excel preview generation failed:', response.data.error);
            setError(response.data.error);
          }
          setDownloadUrl(response.data.downloadUrl);
        } else {
          setError(t('excelPreview.invalidPreviewType'));
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading Excel preview:', err);
        setError(err.response?.data?.error || t('excelPreview.failedToLoad'));
        setLoading(false);
      }
    };

    fetchExcelPreview();
  }, [document, t, parseHtmlToSheetData]);

  // Navigate to previous/next sheet
  const goToPrevSheet = useCallback(() => {
    setActiveSheet(prev => Math.max(0, prev - 1));
  }, []);

  const goToNextSheet = useCallback(() => {
    setActiveSheet(prev => Math.min(sheets.length - 1, prev + 1));
  }, [sheets.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' && e.altKey) {
        goToPrevSheet();
      } else if (e.key === 'ArrowRight' && e.altKey) {
        goToNextSheet();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevSheet, goToNextSheet]);

  // Loading state
  if (loading) {
    return (
      <div className="excel-preview-loading">
        <div className="excel-preview-loading-spinner" />
        <div className="excel-preview-loading-text">{t('excelPreview.loading')}</div>
      </div>
    );
  }

  // Error state
  if (error && Object.keys(sheetData).length === 0) {
    return (
      <div className="excel-preview-error">
        <div className="excel-preview-error-icon">📊</div>
        <div className="excel-preview-error-title">{t('excelPreview.previewNotAvailable')}</div>
        <div className="excel-preview-error-filename">{document?.filename}</div>
        <div className="excel-preview-error-message">{error}</div>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={document?.filename}
            className="excel-preview-download-btn"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M14 10V12.6667C14 13.4 13.4 14 12.6667 14H3.33333C2.6 14 2 13.4 2 12.6667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.66602 6.66667L7.99935 10L11.3327 6.66667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8 10V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('common.download')}
          </a>
        )}
      </div>
    );
  }

  const currentSheetData = sheetData[activeSheet];
  const scale = zoom / 100;
  const sheetCount = sheets.length;

  return (
    <div className="excel-preview-container">
      {/* Top Toolbar */}
      <div className="excel-preview-toolbar">
        <div className="excel-preview-toolbar-left">
          {/* Sheet navigation arrows */}
          <button
            className="excel-preview-nav-btn"
            onClick={goToPrevSheet}
            disabled={activeSheet <= 0}
            title={t('excelPreview.previousSheet')}
          >
            <ArrowLeftIcon />
          </button>
          <button
            className="excel-preview-nav-btn"
            onClick={goToNextSheet}
            disabled={activeSheet >= sheetCount - 1}
            title={t('excelPreview.nextSheet')}
          >
            <ArrowRightIcon />
          </button>
        </div>

        <div className="excel-preview-toolbar-center">
          <span className="excel-preview-sheet-indicator">
            {previewCount?.label || `Sheet ${activeSheet + 1} of ${sheetCount}`}
          </span>
        </div>

        <div className="excel-preview-toolbar-right">
          <span className="excel-preview-zoom-label">{zoom}%</span>
        </div>
      </div>

      {/* Spreadsheet Grid Container */}
      <div
        className="excel-preview-grid-wrapper"
        ref={gridContainerRef}
      >
        <div
          className="excel-preview-grid-scaler"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: scale !== 1 ? `${100 / scale}%` : '100%',
          }}
        >
          {currentSheetData && currentSheetData.rows.length > 0 ? (
            <div className="excel-preview-table-container">
              <table className="excel-preview-table">
                <thead>
                  {currentSheetData.rows.length > 0 && (
                    <tr>
                      {currentSheetData.rows[0].map((cell, colIdx) => (
                        <th
                          key={colIdx}
                          className={`excel-cell excel-header-cell ${colIdx === 0 ? 'excel-corner-cell' : ''}`}
                        >
                          {cell.value}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {currentSheetData.rows.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {row.map((cell, colIdx) => (
                        colIdx === 0 ? (
                          <th key={colIdx} className="excel-cell excel-row-header">
                            {cell.value}
                          </th>
                        ) : (
                          <td
                            key={colIdx}
                            className={`excel-cell ${cell.className || ''}`}
                          >
                            {cell.value}
                          </td>
                        )
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Truncation notice if applicable */}
              {currentSheetData.rowCount > 500 && (
                <div className="excel-preview-truncation-notice">
                  {t('excelPreview.truncationNotice', { rows: 500, cols: 50 })}
                </div>
              )}
            </div>
          ) : (
            <div className="excel-preview-empty-sheet">
              {t('excelPreview.emptySheet')}
            </div>
          )}
        </div>
      </div>

      {/* Sheet Tabs (Bottom - Excel convention) */}
      {sheetCount > 1 && (
        <div className="excel-preview-sheet-tabs">
          <div className="excel-preview-sheet-tabs-scroll">
            {sheets.map((sheet, index) => (
              <button
                key={index}
                className={`excel-preview-sheet-tab ${activeSheet === index ? 'active' : ''}`}
                onClick={() => setActiveSheet(index)}
                title={sheet.name}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExcelPreview;
