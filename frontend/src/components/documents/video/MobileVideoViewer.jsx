import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import MobilePreviewShell from '../MobilePreviewShell';

/**
 * MobileVideoViewer — mobile video viewer using MobilePreviewShell.
 *
 * Uses the same shared shell as PDF/image mobile viewers:
 *  - Same header (back, filename, download, share)
 *  - Same body spacing (24px top, 12px gutter)
 *  - Same app-shell hiding, scroll lock, safe areas
 *
 * Renders a native HTML5 <video> element with browser controls.
 * No custom zoom/page toolbar — native video controls handle playback.
 * Attempts inline playback first; shows fallback only on actual error.
 */
export default function MobileVideoViewer({
  src,
  mimeType,
  filename = 'Video',
  onClose,
  onDownload,
}) {
  const { t } = useTranslation();

  const [error, setError] = useState(false);
  const [duration, setDuration] = useState(null);

  const handleLoadedMetadata = useCallback((e) => {
    const video = e.target;
    if (video.duration && isFinite(video.duration)) {
      setDuration(video.duration);
    }
  }, []);

  const handleError = useCallback(() => {
    setError(true);
  }, []);

  /* ── format duration for status text ─────────────── */
  const statusText = duration
    ? formatDuration(duration)
    : undefined;

  /* ── fallback content on error ───────────────────── */
  if (error) {
    return (
      <MobilePreviewShell
        filename={filename}
        onClose={onClose}
        onDownload={onDownload}
        toolbar={<></>}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 300, gap: 16, padding: 24,
          textAlign: 'center',
        }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.4 }}>
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="#6C6B6E" strokeWidth="1.5" />
            <path d="M10 9l5 3-5 3V9z" fill="#6C6B6E" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {t('documentPreview.previewNotAvailable')}
          </div>
          <div style={{ fontSize: 13, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans, sans-serif', maxWidth: 280 }}>
            This video format may not be supported by your browser. Try downloading the file.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {onDownload && (
              <button
                onClick={onDownload}
                style={{
                  padding: '10px 20px', background: 'rgba(24,24,24,0.90)', color: '#FFFFFF',
                  borderRadius: 10, fontSize: 13, fontWeight: 600,
                  fontFamily: 'Plus Jakarta Sans, sans-serif', border: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {t('common.download')}
              </button>
            )}
          </div>
        </div>
      </MobilePreviewShell>
    );
  }

  /* ── normal playback ─────────────────────────────── */
  return (
    <MobilePreviewShell
      filename={filename}
      onClose={onClose}
      onDownload={onDownload}
      statusText={statusText}
      toolbar={<></>}
    >
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: 200,
      }}>
        <video
          src={src}
          controls
          playsInline
          webkit-playsinline=""
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          style={{
            width: '100%',
            maxHeight: '65vh',
            borderRadius: 4,
            background: 'black',
            objectFit: 'contain',
          }}
        >
          <source src={src} type={mimeType || 'video/mp4'} />
        </video>
      </div>
    </MobilePreviewShell>
  );
}

/* ────────────────────────── helpers ────────────────────────── */

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
