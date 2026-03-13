import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Global CSS injected while the mobile preview shell is open.
 * Hides bottom nav, FABs, support widgets, chat launchers, etc.
 */
const GLOBAL_HIDE_CSS = `
html.pdf-mobile-open .mobile-bottom-nav,
html.pdf-mobile-open [class*="fab"],
html.pdf-mobile-open [class*="Fab"],
html.pdf-mobile-open [class*="launcher"],
html.pdf-mobile-open [class*="Launcher"],
html.pdf-mobile-open [class*="widget"],
html.pdf-mobile-open [class*="Widget"],
html.pdf-mobile-open [class*="helpBtn"],
html.pdf-mobile-open [class*="support"],
html.pdf-mobile-open [id*="intercom"],
html.pdf-mobile-open [id*="zendesk"],
html.pdf-mobile-open [id*="crisp"],
html.pdf-mobile-open [id*="hubspot"],
html.pdf-mobile-open [data-floating-button],
html.pdf-mobile-open iframe[title*="chat"],
html.pdf-mobile-open iframe[title*="Help"] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
`;

const mobileBtnStyle = {
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  padding: 0,
  color: '#32302C',
  flexShrink: 0,
  WebkitTapHighlightColor: 'transparent',
};

/**
 * MobilePreviewShell — full-screen mobile shell for previewing any file type.
 *
 * Provides: fixed full-screen overlay, CSS grid (header / body / toolbar),
 * body scroll lock, floating widget hiding, safe-area handling.
 *
 * Props:
 *  @param {string}    filename     — display name for header
 *  @param {function}  onClose      — back button handler
 *  @param {function}  onDownload   — download action (optional)
 *  @param {function}  onFullView   — open full viewer (optional)
 *  @param {string}    statusText   — right-side header text (e.g. "3 pages")
 *  @param {ReactNode} toolbar      — custom toolbar content; if null, default toolbar renders
 *  @param {ReactNode} children     — body content
 */
export default function MobilePreviewShell({
  filename = 'Document',
  onClose,
  onDownload,
  onFullView,
  statusText,
  toolbar,
  children,
}) {
  const { t } = useTranslation();

  /* ── body scroll lock + class ───────────────────── */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('pdf-mobile-open');
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      html.classList.remove('pdf-mobile-open');
      body.style.overflow = prevOverflow;
    };
  }, []);

  /* ── inject global hide-floating-widgets CSS ────── */
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-pdf-mobile', '');
    style.textContent = GLOBAL_HIDE_CSS;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  /* ── share ──────────────────────────────────────── */
  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: filename, text: filename });
      } catch { /* user cancelled */ }
    } else if (onDownload) {
      onDownload();
    }
  }, [filename, onDownload]);

  /* ── truncated filename ─────────────────────────── */
  const displayName = (() => {
    if (!filename) return 'Document';
    const name = filename.replace(/\.[^.]+$/, '');
    return name.length > 28 ? name.slice(0, 26) + '\u2026' : name;
  })();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      background: '#F1F0EF',
      height: '100dvh',
      width: '100vw',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      touchAction: 'pan-x pan-y',
      overscrollBehavior: 'contain',
    }}>

      {/* ═══════════ ROW 1: PERSISTENT HEADER ═══════════ */}
      <div style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E6E6EC',
        paddingTop: 'env(safe-area-inset-top)',
        zIndex: 10,
        flexShrink: 0,
      }}>
        <div style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 0 4px',
        }}>
          {/* Left: back + filename */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
            <button
              onClick={onClose}
              aria-label={t('common.back')}
              style={mobileBtnStyle}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 15L7.5 10L12.5 5" stroke="#32302C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#32302C',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}>
              {displayName}
            </span>
          </div>

          {/* Right: status + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {statusText && (
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#6C6B6E',
                padding: '4px 8px',
                whiteSpace: 'nowrap',
              }}>
                {statusText}
              </span>
            )}
            {onDownload && (
              <button
                onClick={onDownload}
                aria-label={t('common.download')}
                style={mobileBtnStyle}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M14 10V12.667C14 13.02 13.86 13.36 13.61 13.61C13.36 13.86 13.02 14 12.667 14H3.333C2.98 14 2.64 13.86 2.39 13.61C2.14 13.36 2 13.02 2 12.667V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4.666 6.667L8 10L11.333 6.667" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10V2" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {navigator.share && (
              <button
                onClick={handleShare}
                aria-label="Share"
                style={mobileBtnStyle}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M4 10V12.667C4 13.02 4.14 13.36 4.39 13.61C4.64 13.86 4.98 14 5.333 14H10.667C11.02 14 11.36 13.86 11.61 13.61C11.86 13.36 12 13.02 12 12.667V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M11.333 5.333L8 2L4.666 5.333" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 2V10" stroke="#32302C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ ROW 2: SCROLLABLE BODY ═══════════ */}
      <div style={{
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        minHeight: 0,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 12px 12px',
          minHeight: '100%',
        }}>
          {children}
        </div>
      </div>

      {/* ═══════════ ROW 3: PERSISTENT BOTTOM TOOLBAR ═══════════ */}
      <div style={{
        background: '#FFFFFF',
        borderTop: '1px solid #E6E6EC',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 10,
        flexShrink: 0,
      }}>
        {toolbar != null ? toolbar : (
          /* Default toolbar: Download + Full View */
          <div style={{
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 12px',
            gap: 8,
          }}>
            {onDownload && (
              <button
                onClick={onDownload}
                style={{
                  flex: 1,
                  height: 44,
                  maxWidth: 200,
                  borderRadius: 10,
                  background: '#F5F5F5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  border: '1px solid #E6E6EC',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 10V12.667C14 13.02 13.86 13.36 13.61 13.61C13.36 13.86 13.02 14 12.667 14H3.333C2.98 14 2.64 13.86 2.39 13.61C2.14 13.36 2 13.02 2 12.667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4.666 6.667L8 10L11.333 6.667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('common.download')}
              </button>
            )}
            {onFullView && (
              <button
                onClick={onFullView}
                style={{
                  flex: 1,
                  height: 44,
                  maxWidth: 200,
                  borderRadius: 10,
                  background: 'rgba(24, 24, 24, 0.90)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {t('documentPreview.fullView')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
