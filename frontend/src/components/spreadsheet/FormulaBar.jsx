import React, { useRef, useCallback } from 'react';

function FormulaBar({
  cellRef = '',
  value = '',
  onValueChange,
  onApply,
  onRevert,
  canApply = false,
  isGridPayload = false,
  gridMeta,
  onCellRefSubmit,
  isApplying = false,
}) {
  const nameBoxRef = useRef(null);
  const valueRef = useRef(null);

  const handleNameBoxKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val) onCellRefSubmit?.(val);
    }
  }, [onCellRefSubmit]);

  const handleValueKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      onApply?.();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      onApply?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onRevert?.();
    }
  }, [onApply, onRevert]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 32,
        borderBottom: '1px solid #E6E6EC',
        background: '#FFFFFF',
        flexShrink: 0,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {/* Name box */}
      <input
        ref={nameBoxRef}
        type="text"
        aria-label="Cell reference"
        defaultValue={cellRef}
        key={cellRef}
        onKeyDown={handleNameBoxKeyDown}
        style={{
          width: 80,
          height: 32,
          border: 'none',
          borderRight: '1px solid #E6E6EC',
          padding: '0 8px',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          color: '#32302C',
          textAlign: 'center',
          outline: 'none',
          background: '#FAFAFA',
        }}
      />

      {/* fx label */}
      <div
        aria-hidden="true"
        style={{
          padding: '0 8px',
          fontSize: 12,
          fontStyle: 'italic',
          fontWeight: 600,
          color: '#9CA3AF',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        fx
      </div>

      {/* Value input */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, paddingRight: 8 }}>
        <input
          ref={valueRef}
          type="text"
          aria-label="Cell value"
          value={value}
          onChange={(e) => onValueChange?.(e.target.value)}
          onKeyDown={handleValueKeyDown}
          placeholder={cellRef ? 'Enter value…' : 'Select a cell'}
          style={{
            flex: 1,
            height: 26,
            border: 'none',
            padding: '0 4px',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            color: '#32302C',
            outline: 'none',
            background: 'transparent',
            minWidth: 0,
          }}
        />

        {/* Grid paste indicator */}
        {isGridPayload && gridMeta ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#6C6B6E',
              background: '#F1F0EF',
              padding: '2px 8px',
              borderRadius: 9999,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Grid {gridMeta.r}×{gridMeta.c}
          </span>
        ) : null}

        {/* Apply / Revert micro-buttons */}
        {cellRef ? (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button
              type="button"
              aria-label="Revert cell value"
              title="Revert (Escape)"
              onClick={onRevert}
              disabled={isApplying}
              style={{
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', borderRadius: 4,
                cursor: isApplying ? 'not-allowed' : 'pointer',
                color: '#9CA3AF',
                fontSize: 15,
                fontWeight: 800,
                padding: 0,
              }}
            >
              ✕
            </button>
            <button
              type="button"
              aria-label="Apply cell value"
              title="Apply (Enter)"
              onClick={onApply}
              disabled={!canApply || isApplying}
              style={{
                width: 24, height: 24,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', borderRadius: 4,
                cursor: (!canApply || isApplying) ? 'not-allowed' : 'pointer',
                color: canApply ? '#16A34A' : '#D1D5DB',
                fontSize: 15,
                fontWeight: 800,
                padding: 0,
              }}
            >
              ✓
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default FormulaBar;
