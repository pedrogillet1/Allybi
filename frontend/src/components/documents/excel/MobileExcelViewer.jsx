import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import MobilePreviewShell from '../MobilePreviewShell';
import api from '../../../services/api';

/* ────────────────────────── constants ────────────────────────── */
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];

const mobileBtnStyle = {
  width: 44, height: 44, minWidth: 44, minHeight: 44,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 10,
  cursor: 'pointer', padding: 0, color: '#32302C', flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
};

/* ────────────────────────── HTML parser ────────────────────────── */

/**
 * Parse backend HTML preview into structured sheet data.
 * Identical logic to ExcelPreview.impl.js parseHtmlToSheetData.
 */
function parseHtmlToSheetData(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const containers = doc.querySelectorAll('.sheet-container');
  const parsed = {};

  containers.forEach((container, index) => {
    const table = container.querySelector('.excel-table');
    if (!table) return;

    const rows = [];
    let maxCols = 0;

    table.querySelectorAll('tr').forEach((tr) => {
      const cells = [];
      tr.querySelectorAll('th, td').forEach((cell) => {
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

/* ────────────────────────── component ────────────────────────── */

/**
 * MobileExcelViewer — mobile read-only spreadsheet viewer using MobilePreviewShell.
 *
 * Mirrors MobilePptxViewer:
 *  - Same shell (header, body, toolbar)
 *  - Same toolbar layout (sheet nav, zoom, overflow menu)
 *  - Custom scroll container for both horizontal + vertical scrolling
 *
 * Renders a static HTML table with sticky headers — no editing.
 */
export default function MobileExcelViewer({
  document: doc,
  onClose,
  onDownload,
  onShare,
}) {
  const { t } = useTranslation();

  /* ── data state ──────────────────────────────── */
  const [sheets, setSheets] = useState([]);
  const [sheetData, setSheetData] = useState({});
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── zoom state ──────────────────────────────── */
  const [zoomPct, setZoomPct] = useState(100);
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollRef = useRef(null);

  const sheetCount = sheets.length;
  const hasData = Object.keys(sheetData).length > 0;
  const currentSheetData = sheetData[activeSheet];
  const scale = zoomPct / 100;
  const displayZoom = zoomPct;

  /* ── fetch data ──────────────────────────────── */
  useEffect(() => {
    if (!doc?.id) {
      setError(t('excelPreview.documentNotAvailable'));
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const response = await api.get(`/api/documents/${doc.id}/preview`);

        if (cancelled) return;

        if (
          response.data.previewType === 'excel' ||
          response.data.previewType === 'excel-pdf'
        ) {
          if (response.data.htmlContent) {
            const sheetList = response.data.sheets || [];
            setSheets(sheetList);
            setSheetData(parseHtmlToSheetData(response.data.htmlContent));
          } else if (response.data.error) {
            setError(response.data.error);
          }
        } else {
          setError(t('excelPreview.invalidPreviewType'));
        }

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || t('excelPreview.failedToLoad'));
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [doc?.id, t]);

  /* ── sheet navigation ────────────────────────── */
  const goToPrevSheet = useCallback(() => {
    setActiveSheet((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNextSheet = useCallback(() => {
    setActiveSheet((prev) => Math.min(sheets.length - 1, prev + 1));
  }, [sheets.length]);

  /* ── zoom helpers ────────────────────────────── */
  const stepZoom = useCallback((dir) => {
    const cur = displayZoom;
    if (dir > 0) {
      setZoomPct(ZOOM_STEPS.find((s) => s > cur) || ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    } else {
      setZoomPct([...ZOOM_STEPS].reverse().find((s) => s < cur) || ZOOM_STEPS[0]);
    }
  }, [displayZoom]);

  const handleZoomIn = useCallback(() => stepZoom(1), [stepZoom]);
  const handleZoomOut = useCallback(() => stepZoom(-1), [stepZoom]);
  const handleResetZoom = useCallback(() => setZoomPct(100), []);

  /* ── share ───────────────────────────────────── */
  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: doc?.filename || 'Spreadsheet',
          text: doc?.filename || 'Spreadsheet',
        });
      } catch { /* user cancelled */ }
    } else if (onShare) {
      onShare();
    } else if (onDownload) {
      onDownload();
    }
  }, [doc?.filename, onShare, onDownload]);

  /* ── status text ─────────────────────────────── */
  const statusText = useMemo(() => {
    if (!sheetCount) return undefined;
    return `${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'}`;
  }, [sheetCount]);

  /* ── toolbar ─────────────────────────────────── */
  const excelToolbar = (
    <div style={{
      height: 52,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 4px',
    }}>
      {/* Sheet navigation (only if multi-sheet) */}
      {sheetCount > 1 && (
        <>
          <button
            onClick={goToPrevSheet}
            disabled={activeSheet <= 0}
            aria-label="Previous sheet"
            style={{ ...mobileBtnStyle, opacity: activeSheet <= 0 ? 0.3 : 1 }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <span style={{
            fontSize: 13, fontWeight: 700, color: '#32302C',
            minWidth: 48, textAlign: 'center', userSelect: 'none',
          }}>
            {activeSheet + 1} / {sheetCount}
          </span>

          <button
            onClick={goToNextSheet}
            disabled={activeSheet >= sheetCount - 1}
            aria-label="Next sheet"
            style={{ ...mobileBtnStyle, opacity: activeSheet >= sheetCount - 1 ? 0.3 : 1 }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div style={{ width: 1, height: 20, background: '#E6E6EC', flexShrink: 0 }} />
        </>
      )}

      {/* Zoom controls */}
      <button
        onClick={handleZoomOut}
        disabled={displayZoom <= ZOOM_STEPS[0]}
        aria-label="Zoom out"
        style={{ ...mobileBtnStyle, opacity: displayZoom <= ZOOM_STEPS[0] ? 0.3 : 1 }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      <button
        onClick={handleResetZoom}
        aria-label="Reset zoom"
        style={{
          ...mobileBtnStyle,
          background: zoomPct === 100 ? '#111827' : 'transparent',
          color: zoomPct === 100 ? '#FFFFFF' : '#32302C',
          borderRadius: 8, fontSize: 11, fontWeight: 700, minWidth: 44,
        }}
      >
        {zoomPct === 100 ? '100%' : `${displayZoom}%`}
      </button>

      <button
        onClick={handleZoomIn}
        disabled={displayZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
        aria-label="Zoom in"
        style={{ ...mobileBtnStyle, opacity: displayZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? 0.3 : 1 }}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M8 4V12M4 8H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      <div style={{ width: 1, height: 20, background: '#E6E6EC', flexShrink: 0 }} />

      {/* Overflow menu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="More options"
          style={mobileBtnStyle}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="3" r="1.5" fill="#32302C"/>
            <circle cx="8" cy="8" r="1.5" fill="#32302C"/>
            <circle cx="8" cy="13" r="1.5" fill="#32302C"/>
          </svg>
        </button>
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 30 }}
            />
            <div style={{
              position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
              background: '#FFFFFF', borderRadius: 12, minWidth: 180, zIndex: 31,
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
            }}>
              {onDownload && (
                <MenuRow
                  label={t('common.download')}
                  icon={<DownloadIcon />}
                  onClick={() => { setMenuOpen(false); onDownload(); }}
                />
              )}
              {navigator.share && (
                <MenuRow
                  label="Share"
                  icon={<ShareIcon />}
                  onClick={() => { setMenuOpen(false); handleShare(); }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  /* ── render ──────────────────────────────────── */
  return (
    <MobilePreviewShell
      filename={doc?.filename || 'Spreadsheet'}
      onClose={onClose}
      onDownload={onDownload}
      statusText={statusText}
      toolbar={excelToolbar}
    >
      {/* Scrollable body — both horizontal and vertical */}
      <div
        ref={scrollRef}
        style={{
          width: '100%',
          flex: 1,
          minHeight: 0,
          alignSelf: 'stretch',
          marginTop: -8,
          overflowX: 'auto',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          background: '#FFFFFF',
        }}
      >

        {/* Loading state */}
        {loading && !hasData && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 300, gap: 16,
          }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid #E6E6EC',
              borderTopColor: '#181818',
              borderRadius: '50%',
              animation: 'mobileExcelSpin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 14, color: '#6C6B6E', fontWeight: 500 }}>
              {t('excelPreview.loading')}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !hasData && !loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 300, gap: 12, padding: 40,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48 }}>📊</div>
            <div style={{
              fontSize: 16, fontWeight: 600, color: '#32302C',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}>
              {t('excelPreview.previewNotAvailable')}
            </div>
            <div style={{
              fontSize: 13, color: '#6C6B6E',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              maxWidth: 280,
            }}>
              {error}
            </div>
            {onDownload && (
              <button
                onClick={onDownload}
                style={{
                  marginTop: 8, padding: '10px 20px',
                  background: 'rgba(24,24,24,0.90)', color: '#FFFFFF',
                  borderRadius: 10, fontSize: 13, fontWeight: 600,
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  border: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {t('common.download')}
              </button>
            )}
          </div>
        )}

        {/* Spreadsheet grid */}
        {hasData && currentSheetData && (
          <div style={{
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
            width: scale !== 1 ? `${100 / scale}%` : '100%',
            minWidth: 'max-content',
          }}>
            {currentSheetData.rows.length > 0 ? (
              <>
                <table style={{
                  borderCollapse: 'collapse',
                  borderSpacing: 0,
                  width: 'max-content',
                  minWidth: '100%',
                  tableLayout: 'auto',
                  fontSize: 13,
                  lineHeight: 1.4,
                  fontFamily: 'Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, sans-serif',
                }}>
                  <thead>
                    {currentSheetData.rows.length > 0 && (
                      <tr>
                        {currentSheetData.rows[0].map((cell, colIdx) => (
                          <th
                            key={colIdx}
                            style={{
                              padding: '4px 8px',
                              borderRight: '1px solid #E6E6EC',
                              borderBottom: '1px solid #E6E6EC',
                              whiteSpace: 'nowrap',
                              background: '#FAFAFA',
                              fontWeight: 600,
                              color: '#222',
                              textAlign: 'center',
                              fontSize: 13,
                              position: 'sticky',
                              top: 0,
                              zIndex: colIdx === 0 ? 30 : 20,
                              ...(colIdx === 0 ? {
                                left: 0,
                                minWidth: 44,
                                width: 44,
                              } : {}),
                            }}
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
                        {row.map((cell, colIdx) => {
                          const isNumber = (cell.className || '').includes('number');
                          if (colIdx === 0) {
                            return (
                              <th
                                key={colIdx}
                                style={{
                                  padding: '4px 8px',
                                  borderRight: '1px solid #E6E6EC',
                                  borderBottom: '1px solid #E6E6EC',
                                  background: '#FAFAFA',
                                  fontWeight: 500,
                                  color: '#333',
                                  textAlign: 'center',
                                  position: 'sticky',
                                  left: 0,
                                  zIndex: 10,
                                  minWidth: 44,
                                  width: 44,
                                  fontSize: 13,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {cell.value}
                              </th>
                            );
                          }
                          return (
                            <td
                              key={colIdx}
                              style={{
                                padding: '4px 8px',
                                borderRight: '1px solid #E6E6EC',
                                borderBottom: '1px solid #E6E6EC',
                                whiteSpace: 'nowrap',
                                maxWidth: 300,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                verticalAlign: 'middle',
                                color: '#1a1a1a',
                                background: 'white',
                                ...(isNumber ? {
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums',
                                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                                  fontSize: 12,
                                } : {}),
                              }}
                            >
                              {cell.value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Truncation notice */}
                {currentSheetData.rowCount > 500 && (
                  <div style={{
                    padding: '12px 16px',
                    background: '#FFF8E6',
                    borderTop: '1px solid #FFE082',
                    color: '#8D6E0F',
                    fontSize: 12,
                    fontWeight: 500,
                    textAlign: 'center',
                  }}>
                    {t('excelPreview.truncationNotice', { rows: 500, cols: 50 })}
                  </div>
                )}
              </>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 200, color: '#A0A0A0', fontSize: 14, fontWeight: 500,
              }}>
                {t('excelPreview.emptySheet')}
              </div>
            )}
          </div>
        )}

        {/* Sheet tabs for multi-sheet workbooks */}
        {hasData && sheetCount > 1 && (
          <div style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            background: 'white',
            borderTop: '1px solid #D4D4D4',
            padding: '4px 8px',
            zIndex: 25,
          }}>
            <div style={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              padding: 2,
              WebkitOverflowScrolling: 'touch',
            }}>
              {sheets.map((sheet, index) => (
                <button
                  key={index}
                  onClick={() => setActiveSheet(index)}
                  aria-label={`Sheet: ${sheet.name}`}
                  style={{
                    padding: '6px 14px',
                    background: activeSheet === index ? 'white' : 'transparent',
                    border: activeSheet === index ? '1px solid #D4D4D4' : '1px solid transparent',
                    borderBottom: activeSheet === index ? '1px solid white' : '1px solid transparent',
                    borderRadius: '4px 4px 0 0',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: activeSheet === index ? 700 : 400,
                    color: activeSheet === index ? '#111' : '#555',
                    whiteSpace: 'nowrap',
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes mobileExcelSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </MobilePreviewShell>
  );
}

/* ────────────────────────── helpers ────────────────────────── */

function MenuRow({ label, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px',
      background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
      color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif',
      WebkitTapHighlightColor: 'transparent',
    }}>
      <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {label}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M14 10V12.667C14 13.02 13.86 13.36 13.61 13.61C13.36 13.86 13.02 14 12.667 14H3.333C2.98 14 2.64 13.86 2.39 13.61C2.14 13.36 2 13.02 2 12.667V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4.666 6.667L8 10L11.333 6.667" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 10V2" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M4 10V12.667C4 13.02 4.14 13.36 4.39 13.61C4.64 13.86 4.98 14 5.333 14H10.667C11.02 14 11.36 13.86 11.61 13.61C11.86 13.36 12 13.02 12 12.667V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.333 5.333L8 2L4.666 5.333" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 2V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
