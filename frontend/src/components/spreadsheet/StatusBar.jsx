import React, { useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';

function StatusBar({ selectionStats, zoom = 100, onZoomChange, saveStatus = 'idle' }) {
  const stats = selectionStats || {};
  const hasStats = Number.isFinite(stats.sum) && stats.count > 0;

  const clampZoom = useCallback((v) => Math.max(50, Math.min(200, Math.round(v))), []);

  const saveLabel = saveStatus === 'saving' ? 'Saving…'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'error' ? 'Not saved'
    : saveStatus === 'pending' ? 'Unsaved changes'
    : null;

  const saveColor = saveStatus === 'saving' ? '#6C6B6E'
    : saveStatus === 'saved' ? '#16A34A'
    : saveStatus === 'error' ? '#DC2626'
    : saveStatus === 'pending' ? '#D97706'
    : '#6C6B6E';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 28,
        padding: '0 12px',
        borderTop: '1px solid #E6E6EC',
        background: '#FAFAFA',
        flexShrink: 0,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 11,
        color: '#6C6B6E',
        userSelect: 'none',
      }}
    >
      {/* Left: selection stats + save status */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
        {saveLabel && (
          <span style={{ color: saveColor, fontWeight: 500 }}>{saveLabel}</span>
        )}
        {hasStats ? (
          <>
            <span>Sum: <strong style={{ color: '#32302C' }}>{stats.sum.toLocaleString()}</strong></span>
            <span>Average: <strong style={{ color: '#32302C' }}>{Number(stats.average).toFixed(2)}</strong></span>
            <span>Count: <strong style={{ color: '#32302C' }}>{stats.count}</strong></span>
          </>
        ) : null}
      </div>

      {/* Right: zoom controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => onZoomChange?.(clampZoom(zoom - 10))}
          disabled={zoom <= 50}
          style={{
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: 4,
            cursor: zoom <= 50 ? 'not-allowed' : 'pointer',
            opacity: zoom <= 50 ? 0.35 : 1,
            padding: 0,
          }}
        >
          <Minus size={12} color="#6C6B6E" />
        </button>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={zoom}
          aria-label="Zoom level"
          onChange={(e) => onZoomChange?.(clampZoom(Number(e.target.value)))}
          style={{ width: 80, height: 3, accentColor: '#181818', cursor: 'pointer' }}
        />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => onZoomChange?.(clampZoom(zoom + 10))}
          disabled={zoom >= 200}
          style={{
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: 4,
            cursor: zoom >= 200 ? 'not-allowed' : 'pointer',
            opacity: zoom >= 200 ? 0.35 : 1,
            padding: 0,
          }}
        >
          <Plus size={12} color="#6C6B6E" />
        </button>
        <span style={{ minWidth: 32, textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#32302C' }}>
          {zoom}%
        </span>
      </div>
    </div>
  );
}

export default StatusBar;
