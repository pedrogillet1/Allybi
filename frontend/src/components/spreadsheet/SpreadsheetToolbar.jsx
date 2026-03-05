import React, { useState, useRef, useEffect } from 'react';
import {
  Undo2, Redo2, Bold, Italic, Underline, ChevronDown, MoreHorizontal,
} from 'lucide-react';

const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Helvetica'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];

const iconBtn = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
  transition: 'background 120ms ease',
  flexShrink: 0,
};

const sep = {
  width: 1,
  height: 20,
  background: '#E6E6EC',
  margin: '0 6px',
  flexShrink: 0,
};

function DropdownMenu({ trigger, items, value, onChange, width = 100 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.document.addEventListener('mousedown', handler);
    return () => window.document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={trigger}
        aria-expanded={open}
        style={{
          height: 28,
          padding: '0 6px 0 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'none',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: '#32302C',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          transition: 'background 120ms ease',
          whiteSpace: 'nowrap',
          maxWidth: width,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 0,
            background: '#FFFFFF',
            border: '1px solid #E6E6EC',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 50,
            minWidth: width,
            maxHeight: 240,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { onChange?.(item); setOpen(false); }}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: item === value ? '#F5F5F5' : 'none',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: item === value ? 700 : 400,
                color: '#32302C',
                textAlign: 'left',
                fontFamily: trigger === 'Font family' ? item : 'Plus Jakarta Sans, sans-serif',
              }}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const COLOR_PRESETS = [
  '#111827', '#374151', '#6B7280', '#0F172A',
  '#1D4ED8', '#2563EB', '#16A34A', '#DC2626',
  '#F59E0B', '#A855F7',
];

function ColorPicker({ colorHex = '#000000', onColorChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.document.addEventListener('mousedown', handler);
    return () => window.document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Font color"
        title="Font color"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        style={{ ...iconBtn, position: 'relative' }}
      >
        <span style={{ fontSize: 16, fontWeight: 800, color: colorHex || '#000000', lineHeight: 1 }}>A</span>
        <span style={{
          position: 'absolute',
          bottom: 3,
          left: 6,
          right: 6,
          height: 3,
          background: colorHex || '#000000',
          borderRadius: 1,
        }} />
      </button>
      {open ? (
        <div style={{
          position: 'absolute',
          top: 30,
          left: 0,
          background: '#FFFFFF',
          border: '1px solid #E6E6EC',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 50,
          padding: 10,
          minWidth: 160,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="color"
              value={colorHex || '#000000'}
              onChange={(e) => onColorChange?.(e.target.value)}
              aria-label="Text color"
              style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 900, fontSize: 12, color: '#111827', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {String(colorHex || '#000000').toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onColorChange?.(c); setOpen(false); }}
                title={c}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  border: c === colorHex ? '2px solid #111827' : '1px solid #E6E6EC',
                  background: c,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SpreadsheetToolbar({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  fontFamily = 'Calibri',
  fontSizePt = 11,
  bold = false,
  italic = false,
  underline = false,
  colorHex = '#000000',
  onFormatChange,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 36,
        padding: '0 8px',
        background: '#FAFAFA',
        borderBottom: '1px solid #E6E6EC',
        flexShrink: 0,
        gap: 2,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {/* G1: Undo / Redo */}
      <button
        type="button"
        aria-label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        onClick={onUndo}
        disabled={!canUndo}
        onMouseEnter={(e) => { if (canUndo) e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        style={{ ...iconBtn, opacity: canUndo ? 1 : 0.35 }}
      >
        <Undo2 size={16} color="#32302C" />
      </button>
      <button
        type="button"
        aria-label="Redo (Ctrl+Y)"
        title="Redo (Ctrl+Y)"
        onClick={onRedo}
        disabled={!canRedo}
        onMouseEnter={(e) => { if (canRedo) e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        style={{ ...iconBtn, opacity: canRedo ? 1 : 0.35 }}
      >
        <Redo2 size={16} color="#32302C" />
      </button>

      <div style={sep} />

      {/* G2: Font / Size */}
      <DropdownMenu
        trigger="Font family"
        items={FONTS}
        value={fontFamily}
        onChange={(v) => onFormatChange?.({ fontFamily: v })}
        width={110}
      />
      <DropdownMenu
        trigger="Font size"
        items={SIZES}
        value={fontSizePt}
        onChange={(v) => onFormatChange?.({ fontSizePt: Number(v) })}
        width={50}
      />

      <div style={sep} />

      {/* G3: Bold / Italic / Underline / Color */}
      <button
        type="button"
        aria-label="Bold (Ctrl+B)"
        title="Bold (Ctrl+B)"
        onClick={() => onFormatChange?.({ bold: !bold })}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = bold ? '#E6E6EC' : 'none'; }}
        style={{ ...iconBtn, background: bold ? '#E6E6EC' : 'none' }}
      >
        <Bold size={16} color="#32302C" />
      </button>
      <button
        type="button"
        aria-label="Italic (Ctrl+I)"
        title="Italic (Ctrl+I)"
        onClick={() => onFormatChange?.({ italic: !italic })}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = italic ? '#E6E6EC' : 'none'; }}
        style={{ ...iconBtn, background: italic ? '#E6E6EC' : 'none' }}
      >
        <Italic size={16} color="#32302C" />
      </button>
      <button
        type="button"
        aria-label="Underline (Ctrl+U)"
        title="Underline (Ctrl+U)"
        onClick={() => onFormatChange?.({ underline: !underline })}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = underline ? '#E6E6EC' : 'none'; }}
        style={{ ...iconBtn, background: underline ? '#E6E6EC' : 'none' }}
      >
        <Underline size={16} color="#32302C" />
      </button>

      {/* Font color picker */}
      <ColorPicker
        colorHex={colorHex}
        onColorChange={(c) => onFormatChange?.({ color: c })}
      />

      <div style={sep} />

      {/* G4: More */}
      <button
        type="button"
        aria-label="More formatting options"
        title="More…"
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        style={iconBtn}
      >
        <MoreHorizontal size={16} color="#6C6B6E" />
      </button>
    </div>
  );
}

export default SpreadsheetToolbar;
