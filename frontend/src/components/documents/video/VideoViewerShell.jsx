import React, { useState, useEffect, useCallback, useRef } from 'react';
import VideoControlsOverlay from './VideoControlsOverlay';
import useVideoPlayer from './useVideoPlayer';
import api from '../../../services/api';
import { isSafari, isIOS, downloadFile as safariDownloadFile } from '../../../utils/browser/browserUtils';

const HIDE_DELAY = 2500; // ms before controls auto-hide

/**
 * VideoViewerShell — full-featured video viewer.
 *
 * Dark stage that fills the available space. Renders a <video> element
 * with custom overlay controls (play/pause, timeline, volume, speed,
 * fit mode, PiP, fullscreen).
 *
 * @param {string}  src       — video URL
 * @param {object}  document  — document record (for filename, mimeType, id)
 */
export default function VideoViewerShell({ src, document: doc }) {
  const { videoRef, shellRef, state, actions } = useVideoPlayer();
  const [fitMode, setFitMode] = useState('contain'); // 'contain' | 'cover'
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);
  const [pipSupported] = useState(() =>
    typeof document !== 'undefined' && 'pictureInPictureEnabled' in document,
  );

  /* ── auto-hide controls on inactivity ───────────────── */
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    if (state.playing) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY);
    }
  }, [state.playing]);

  // Show controls when paused, hide timer when playing
  useEffect(() => {
    if (!state.playing) {
      clearTimeout(hideTimerRef.current);
      setControlsVisible(true);
    } else {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY);
    }
    return () => clearTimeout(hideTimerRef.current);
  }, [state.playing]);

  /* ── keyboard shortcuts ─────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      // Don't capture if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          actions.togglePlay();
          resetHideTimer();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          actions.seek(state.currentTime - (e.shiftKey ? 10 : 5));
          resetHideTimer();
          break;
        case 'ArrowRight':
          e.preventDefault();
          actions.seek(state.currentTime + (e.shiftKey ? 10 : 5));
          resetHideTimer();
          break;
        case 'ArrowUp':
          e.preventDefault();
          actions.setVolume(state.volume + 0.05);
          resetHideTimer();
          break;
        case 'ArrowDown':
          e.preventDefault();
          actions.setVolume(state.volume - 0.05);
          resetHideTimer();
          break;
        case 'm':
        case 'M':
          actions.toggleMute();
          resetHideTimer();
          break;
        case 'f':
        case 'F':
          if (!e.ctrlKey && !e.metaKey) {
            actions.toggleFullscreen();
            resetHideTimer();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions, state.currentTime, state.volume, resetHideTimer]);

  /* ── error state ────────────────────────────────────── */
  if (state.error) {
    return (
      <div
        ref={shellRef}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', width: '100%', height: '100%',
          background: '#181818', gap: 16, padding: 40,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="#6C6B6E" strokeWidth="1.5" />
          <path d="M10 9l5 3-5 3V9z" fill="#6C6B6E" />
        </svg>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>
          {state.error === 'codec'
            ? 'Preview unavailable in browser'
            : state.error === 'network'
              ? 'Network error loading video'
              : 'Failed to play video'}
        </div>
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', maxWidth: 360 }}>
          {state.error === 'codec'
            ? 'This video format may not be supported by your browser. Try downloading the file to play it locally.'
            : 'An error occurred while loading the video.'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px', background: 'rgba(255,255,255,0.1)',
              color: '#FFFFFF', borderRadius: 8, fontSize: 13, fontWeight: 600,
              fontFamily: 'Plus Jakarta Sans', border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <button
            onClick={async () => {
              try {
                const res = await api.get(`/api/documents/${doc?.id}/download`);
                safariDownloadFile(res.data.url, doc?.filename);
              } catch {}
            }}
            style={{
              padding: '8px 16px', background: '#FFFFFF', color: '#181818',
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              fontFamily: 'Plus Jakarta Sans', border: 'none', cursor: 'pointer',
            }}
          >
            {isSafari() || isIOS() ? 'Open file' : 'Download'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      style={{
        display: 'flex', flexDirection: 'column',
        width: '100%', height: '100%',
        minHeight: 0, minWidth: 0,
        background: '#181818',
        position: 'relative',
        cursor: controlsVisible ? 'default' : 'none',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => {
        if (state.playing) setControlsVisible(false);
      }}
    >
      {/* Video stage */}
      <div
        style={{
          flex: 1, minHeight: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
          padding: 16,
        }}
        onClick={() => { actions.togglePlay(); resetHideTimer(); }}
        onDoubleClick={(e) => { e.stopPropagation(); actions.toggleFullscreen(); }}
      >
        {/* Loading spinner */}
        {(!state.canPlay || state.waiting) && !state.error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 3,
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 48, height: 48, border: '3px solid rgba(255,255,255,0.2)',
              borderTopColor: '#FFFFFF', borderRadius: '50%',
              animation: 'videoSpin 0.8s linear infinite',
            }} />
          </div>
        )}

        {/* Big play button (when paused and not loading) */}
        {!state.playing && state.canPlay && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2,
            pointerEvents: 'none',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#FFFFFF">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          src={src}
          preload="metadata"
          playsInline
          style={{
            maxWidth: '100%', maxHeight: '100%',
            width: fitMode === 'cover' ? '100%' : 'auto',
            height: fitMode === 'cover' ? '100%' : 'auto',
            objectFit: fitMode,
            borderRadius: 4,
          }}
        >
          <source src={src} type={doc?.mimeType || 'video/mp4'} />
        </video>
      </div>

      {/* Controls overlay */}
      <VideoControlsOverlay
        visible={controlsVisible}
        playing={state.playing}
        currentTime={state.currentTime}
        duration={state.duration}
        buffered={state.buffered}
        volume={state.volume}
        muted={state.muted}
        speed={state.speed}
        fitMode={fitMode}
        onTogglePlay={() => { actions.togglePlay(); resetHideTimer(); }}
        onSeek={(t) => { actions.seek(t); resetHideTimer(); }}
        onVolumeChange={(v) => { actions.setVolume(v); resetHideTimer(); }}
        onToggleMute={() => { actions.toggleMute(); resetHideTimer(); }}
        onSpeedChange={(s) => { actions.setSpeed(s); resetHideTimer(); }}
        onToggleFitMode={() => { setFitMode((m) => m === 'contain' ? 'cover' : 'contain'); resetHideTimer(); }}
        onTogglePiP={() => { actions.requestPiP(); resetHideTimer(); }}
        onToggleFullscreen={() => { actions.toggleFullscreen(); resetHideTimer(); }}
        pipSupported={pipSupported}
      />

      {/* Spinner keyframes */}
      <style>{`
        @keyframes videoSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
