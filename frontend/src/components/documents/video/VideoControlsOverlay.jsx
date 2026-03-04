import React, { useState, useRef, useCallback } from 'react';

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const iconBtn = {
  width: 36, height: 36, minWidth: 40, minHeight: 40,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', color: '#FFFFFF', border: 'none',
  borderRadius: 6, cursor: 'pointer', padding: 0, flexShrink: 0,
};

/**
 * Custom video controls overlay — appears at the bottom of the video stage.
 *
 * Shows on hover / interaction and auto-hides after inactivity.
 * The parent controls visibility via the `visible` prop.
 */
export default function VideoControlsOverlay({
  visible,
  playing, currentTime, duration, buffered,
  volume, muted, speed,
  fitMode,
  onTogglePlay, onSeek,
  onVolumeChange, onToggleMute,
  onSpeedChange,
  onToggleFitMode,
  onTogglePiP, onToggleFullscreen,
  pipSupported,
}) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const [volumeHover, setVolumeHover] = useState(false);
  const [seekHover, setSeekHover] = useState(false);
  const [seekHoverX, setSeekHoverX] = useState(0);
  const [seekHoverTime, setSeekHoverTime] = useState(0);
  const timelineRef = useRef(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  const handleTimelineClick = useCallback((e) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek?.(pct * duration);
  }, [duration, onSeek]);

  const handleTimelineHover = useCallback((e) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSeekHoverX(e.clientX - rect.left);
    setSeekHoverTime(pct * duration);
  }, [duration]);

  const effectiveVolume = muted ? 0 : volume;

  const VolumeIcon = () => {
    if (muted || effectiveVolume === 0) {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    }
    if (effectiveVolume < 0.5) {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    }
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 200ms, transform 200ms',
        pointerEvents: visible ? 'auto' : 'none',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        padding: '40px 16px 12px',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Timeline scrubber */}
      <div
        ref={timelineRef}
        role="slider"
        aria-label="Video timeline"
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        tabIndex={0}
        style={{
          width: '100%', height: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', position: 'relative',
          marginBottom: 6,
        }}
        onClick={handleTimelineClick}
        onMouseEnter={() => setSeekHover(true)}
        onMouseLeave={() => setSeekHover(false)}
        onMouseMove={handleTimelineHover}
      >
        {/* Track background */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: seekHover ? 6 : 4,
          background: 'rgba(255,255,255,0.2)', borderRadius: 3,
          transition: 'height 100ms',
        }}>
          {/* Buffered */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${bufferedPct}%`, background: 'rgba(255,255,255,0.3)',
            borderRadius: 3,
          }} />
          {/* Progress */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${progress}%`, background: '#FFFFFF',
            borderRadius: 3,
          }} />
        </div>
        {/* Scrub handle */}
        <div style={{
          position: 'absolute', left: `${progress}%`, top: '50%',
          width: seekHover ? 14 : 0, height: seekHover ? 14 : 0,
          background: '#FFFFFF', borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          transition: 'width 100ms, height 100ms',
          boxShadow: '0 0 4px rgba(0,0,0,0.3)',
        }} />
        {/* Hover time tooltip */}
        {seekHover && duration > 0 && (
          <div style={{
            position: 'absolute', bottom: 22,
            left: Math.max(20, Math.min(seekHoverX, (timelineRef.current?.offsetWidth || 0) - 20)),
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.85)', color: '#FFFFFF',
            padding: '2px 6px', borderRadius: 4,
            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {formatTime(seekHoverTime)}
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Play/Pause */}
        <button
          type="button" aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          style={iconBtn}
          onClick={onTogglePlay}
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Volume */}
        <div
          style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
          onMouseEnter={() => setVolumeHover(true)}
          onMouseLeave={() => setVolumeHover(false)}
        >
          <button
            type="button" aria-label={muted ? 'Unmute' : 'Mute'}
            title="Mute (M)"
            style={iconBtn}
            onClick={onToggleMute}
          >
            <VolumeIcon />
          </button>
          {volumeHover && (
            <div
              style={{
                width: 80, height: 4, background: 'rgba(255,255,255,0.2)',
                borderRadius: 2, cursor: 'pointer', position: 'relative',
                marginRight: 8,
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                onVolumeChange?.(pct);
              }}
            >
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${effectiveVolume * 100}%`, background: '#FFFFFF',
                borderRadius: 2,
              }} />
              <div style={{
                position: 'absolute', left: `${effectiveVolume * 100}%`, top: '50%',
                width: 10, height: 10, background: '#FFFFFF', borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          )}
        </div>

        {/* Time */}
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#FFFFFF',
          whiteSpace: 'nowrap', margin: '0 6px', userSelect: 'none',
        }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Speed */}
        <div style={{ position: 'relative' }}>
          <button
            type="button" aria-label="Playback speed"
            title="Playback speed"
            style={{ ...iconBtn, width: 'auto', minWidth: 40, padding: '0 6px', fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}
            onClick={() => setSpeedOpen((o) => !o)}
          >
            {speed}x
          </button>
          {speedOpen && (
            <div
              style={{
                position: 'absolute', bottom: 44, right: 0,
                background: 'rgba(0,0,0,0.9)', borderRadius: 8,
                padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
                minWidth: 72, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}
              onMouseLeave={() => setSpeedOpen(false)}
            >
              {SPEEDS.map((s) => (
                <button
                  key={s} type="button"
                  style={{
                    ...iconBtn, width: '100%', height: 32, minHeight: 32,
                    justifyContent: 'center', fontSize: 12, fontWeight: speed === s ? 700 : 500,
                    color: speed === s ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                    background: speed === s ? 'rgba(255,255,255,0.1)' : 'none',
                    borderRadius: 4,
                  }}
                  onClick={() => { onSpeedChange?.(s); setSpeedOpen(false); }}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fit / Fill toggle */}
        <button
          type="button" aria-label={fitMode === 'contain' ? 'Fill' : 'Fit'}
          title={fitMode === 'contain' ? 'Fill (crop edges)' : 'Fit (show all)'}
          style={{ ...iconBtn, fontSize: 11, fontWeight: 700, width: 'auto', minWidth: 40, padding: '0 6px' }}
          onClick={onToggleFitMode}
        >
          {fitMode === 'contain' ? 'Fit' : 'Fill'}
        </button>

        {/* PiP */}
        {pipSupported && (
          <button
            type="button" aria-label="Picture-in-Picture"
            title="Picture-in-Picture"
            style={iconBtn}
            onClick={onTogglePiP}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2.5" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8" y="7" width="6" height="5" rx="1" fill="currentColor" opacity="0.5" />
            </svg>
          </button>
        )}

        {/* Fullscreen */}
        <button
          type="button" aria-label="Fullscreen"
          title="Fullscreen (F)"
          style={iconBtn}
          onClick={onToggleFullscreen}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 5.5V3C2 2.44772 2.44772 2 3 2H5.5M10.5 2H13C13.5523 2 14 2.44772 14 3V5.5M14 10.5V13C14 13.5523 13.5523 14 13 14H10.5M5.5 14H3C2.44772 14 2 13.5523 2 13V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
