import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../../../hooks/useIsMobile';

import UndoIcon from './allybi-toolbar/icons/undo.svg';
import RedoIcon from './allybi-toolbar/icons/redo.svg';
import AlignLeftIcon from './allybi-toolbar/icons/align-left.svg';
import AlignCenterIcon from './allybi-toolbar/icons/align-center.svg';
import AlignRightIcon from './allybi-toolbar/icons/align-right.svg';
import AlignJustifyIcon from './allybi-toolbar/icons/align-justify.svg';
import ListBulletIcon from './allybi-toolbar/icons/list-bullet.svg';
import ListNumberedIcon from './allybi-toolbar/icons/list-numbered.svg';
import UnderlineIcon from './allybi-toolbar/icons/underline.svg';
import DropdownIcon from './allybi-toolbar/icons/dropdown.svg';

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

const FONTS = [
  'Plus Jakarta Sans', 'DM Sans', 'Inter', 'IBM Plex Sans', 'Roboto',
  'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Source Sans 3', 'Noto Sans', 'Nunito Sans', 'Work Sans', 'Cabin',
  'Rubik', 'Figtree', 'Manrope', 'Sora', 'Space Grotesk',
  'Oswald', 'Playfair Display', 'Merriweather', 'Lora', 'Crimson Text',
  'Libre Baskerville', 'EB Garamond', 'Cormorant Garamond',
  'Source Serif 4', 'Noto Serif', 'PT Serif',
  'Inconsolata', 'JetBrains Mono', 'IBM Plex Mono',
];

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

const COLOR_PRESETS = [
  '#111827', '#374151', '#6B7280', '#0F172A', '#1D4ED8',
  '#2563EB', '#16A34A', '#DC2626', '#F59E0B', '#A855F7',
];

// -- Shared inline styles --------------------------------------------------

const sep = { width: 1, height: 20, background: '#E6E6EC', margin: '0 4px', flexShrink: 0 };

const iconBtnBase = {
  width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', borderRadius: 6,
  cursor: 'pointer', padding: 0, flexShrink: 0,
};

const dropdownTrigger = {
  display: 'flex', alignItems: 'center', gap: 4,
  height: 28, padding: '0 6px',
  background: 'none', border: 'none', borderRadius: 6,
  cursor: 'pointer', fontSize: 13, fontWeight: 700,
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  color: '#32302C', flexShrink: 0, whiteSpace: 'nowrap',
};

const popoverBase = {
  position: 'absolute', top: 32, left: 0,
  background: '#FFFFFF', borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
  border: '1px solid #E6E6EC',
  zIndex: 100, maxHeight: 280, overflowY: 'auto',
  padding: '4px 0', minWidth: 140,
};

const popoverItem = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', padding: '6px 12px',
  background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  color: '#32302C', textAlign: 'left',
};

// --------------------------------------------------------------------------

export default function DocToolbar({
  fontFamily, onFontFamilyChange,
  fontSize, onFontSizeChange,
  colorHex, onColorHexChange,
  activeFormats, listType, alignment,
  onCommand,

  hasPendingEdits, saveStatus,
  onSave, onDiscard,

  zoom, onZoomChange,
  currentPage, totalPages,
  onBackgroundClick,
}) {
  const isMobile = useIsMobile();
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [discardMenuOpen, setDiscardMenuOpen] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const fontMenuRef = useRef(null);
  const sizeMenuRef = useRef(null);
  const colorMenuRef = useRef(null);
  const discardMenuRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const anyOpen = fontMenuOpen || sizeMenuOpen || colorMenuOpen || discardMenuOpen;
    if (!anyOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (fontMenuOpen && fontMenuRef.current && !fontMenuRef.current.contains(t)) setFontMenuOpen(false);
      if (sizeMenuOpen && sizeMenuRef.current && !sizeMenuRef.current.contains(t)) setSizeMenuOpen(false);
      if (colorMenuOpen && colorMenuRef.current && !colorMenuRef.current.contains(t)) setColorMenuOpen(false);
      if (discardMenuOpen && discardMenuRef.current && !discardMenuRef.current.contains(t)) {
        setDiscardMenuOpen(false);
        setDiscardConfirm(false);
      }
    };
    window.document.addEventListener('mousedown', onDown, true);
    return () => window.document.removeEventListener('mousedown', onDown, true);
  }, [fontMenuOpen, sizeMenuOpen, colorMenuOpen, discardMenuOpen]);

  const fontSizePx = useMemo(() => {
    const raw = String(fontSize || '16px');
    const n = Number(raw.replace('px', '').trim());
    return Number.isFinite(n) ? clamp(n, 8, 72) : 16;
  }, [fontSize]);

  const applyInlineStyle = (next) => {
    onCommand?.({ type: 'applyStyle', style: { ...(next || {}) } });
  };

  const setFontSizeSafe = (px) => {
    const n = clamp(px, 8, 72);
    const v = `${n}px`;
    onFontSizeChange?.(v);
    applyInlineStyle({ 'font-size': v });
  };

  const zoomOut = () => onZoomChange?.(clamp((zoom ?? 100) - 25, 50, 200));
  const zoomIn = () => onZoomChange?.(clamp((zoom ?? 100) + 25, 50, 200));

  // -- Render helpers -------------------------------------------------------

  const renderIconBtn = (title, icon, onActivate, { active = false, disabled = false } = {}) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onActivate?.(); }}
      style={{
        ...iconBtnBase,
        background: active ? '#111827' : 'none',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F5F5F5'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'none'; }}
    >
      <img
        src={icon} alt="" aria-hidden="true"
        style={{ width: 16, height: 16, filter: active ? 'invert(1) brightness(2)' : 'brightness(0) invert(0.2)', opacity: disabled ? 0.35 : 1 }}
      />
    </button>
  );

  // -- Save status ----------------------------------------------------------

  const statusText = (() => {
    if (saveStatus === 'saving') return 'Saving...';
    if (saveStatus === 'saved') return 'Saved';
    if (saveStatus === 'failed') return 'Save failed';
    if (hasPendingEdits) return 'Unsaved changes';
    return null;
  })();

  const statusDotColor = (() => {
    if (saveStatus === 'saving') return '#F59E0B';
    if (saveStatus === 'saved') return '#34A853';
    if (saveStatus === 'failed') return '#D92D20';
    if (hasPendingEdits) return '#F59E0B';
    return '#34A853';
  })();

  // -------------------------------------------------------------------------

  return (
    <div
      onMouseDown={(e) => {
        const tag = String(e.target?.tagName || '').toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'select') return;
        if (e.target?.closest?.('button') || e.target?.closest?.('input')) return;
        onBackgroundClick?.();
      }}
      style={{
        display: 'flex', alignItems: 'center',
        height: 40, padding: '0 12px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E6E6EC',
        flexShrink: 0, gap: 2,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* ---- Save status + actions ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginRight: 4 }}>
        {statusText ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: '#6C6B6E', whiteSpace: 'nowrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDotColor, flexShrink: 0 }} />
            {statusText}
          </div>
        ) : null}

        {hasPendingEdits ? (
          <button
            type="button"
            title="Save (Ctrl+S)"
            aria-label="Save"
            onMouseDown={(e) => { e.preventDefault(); onSave?.(); }}
            style={{
              height: 24, padding: '0 10px',
              background: '#111827', color: '#FFFFFF',
              border: 'none', borderRadius: 6,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              flexShrink: 0,
            }}
          >
            Save
          </button>
        ) : null}

        {/* Discard dropdown */}
        {hasPendingEdits ? (
          <div ref={discardMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              title="More actions"
              aria-label="More actions"
              onMouseDown={(e) => {
                e.preventDefault();
                setDiscardMenuOpen((v) => !v);
                setDiscardConfirm(false);
              }}
              style={{ ...iconBtnBase, width: 24, height: 24 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="4" cy="8" r="1.2" fill="#6C6B6E" />
                <circle cx="8" cy="8" r="1.2" fill="#6C6B6E" />
                <circle cx="12" cy="8" r="1.2" fill="#6C6B6E" />
              </svg>
            </button>
            {discardMenuOpen ? (
              <div style={{ ...popoverBase, minWidth: 170, left: -4 }}>
                <button
                  type="button"
                  style={{ ...popoverItem, color: discardConfirm ? '#D92D20' : '#32302C', fontWeight: discardConfirm ? 700 : 600 }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (discardConfirm) {
                      onDiscard?.();
                      setDiscardMenuOpen(false);
                      setDiscardConfirm(false);
                    } else {
                      setDiscardConfirm(true);
                    }
                  }}
                >
                  {discardConfirm ? 'Discard all changes?' : 'Discard changes'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={sep} />

      {/* ---- Undo / Redo ---- */}
      {renderIconBtn('Undo (Ctrl+Z)', UndoIcon, () => onCommand?.('undo'))}
      {renderIconBtn('Redo (Ctrl+Shift+Z)', RedoIcon, () => onCommand?.('redo'))}

      {!isMobile ? (
        <>
          <div style={sep} />

          {/* ---- Font dropdown ---- */}
          <div ref={fontMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              title="Font family"
              style={dropdownTrigger}
              onMouseDown={(e) => { e.preventDefault(); setSizeMenuOpen(false); setFontMenuOpen((v) => !v); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fontFamily || 'Calibri'}
              </span>
              <img src={DropdownIcon} alt="" style={{ width: 10, height: 10, opacity: 0.5 }} />
            </button>
            {fontMenuOpen ? (
              <div style={popoverBase}>
                {FONTS.map((f) => {
                  const isActive = (f.toLowerCase() === String(fontFamily || 'Calibri').toLowerCase());
                  return (
                    <button
                      key={f} type="button"
                      style={{ ...popoverItem, background: isActive ? '#F5F5F5' : 'none' }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onFontFamilyChange?.(f); applyInlineStyle({ 'font-family': f }); setFontMenuOpen(false); }}
                    >
                      <span style={{ fontFamily: f, fontSize: 13, fontWeight: 600 }}>{f}</span>
                      {isActive ? <span style={{ color: '#111827', fontWeight: 800 }}>&#10003;</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* ---- Size dropdown ---- */}
          <div ref={sizeMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              title="Font size"
              style={{ ...dropdownTrigger, minWidth: 44, justifyContent: 'center' }}
              onMouseDown={(e) => { e.preventDefault(); setFontMenuOpen(false); setSizeMenuOpen((v) => !v); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <span>{fontSizePx}px</span>
              <img src={DropdownIcon} alt="" style={{ width: 10, height: 10, opacity: 0.5 }} />
            </button>
            {sizeMenuOpen ? (
              <div style={{ ...popoverBase, width: 100 }}>
                {SIZES.map((sz) => {
                  const isActive = sz === fontSizePx;
                  return (
                    <button
                      key={sz} type="button"
                      style={{ ...popoverItem, background: isActive ? '#F5F5F5' : 'none' }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setFontSizeSafe(sz); setSizeMenuOpen(false); }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{sz}px</span>
                      {isActive ? <span style={{ color: '#111827', fontWeight: 800 }}>&#10003;</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div style={sep} />

          {/* ---- Bold / Italic / Underline ---- */}
          <button
            type="button" title="Bold (Ctrl+B)" aria-label="Bold" aria-pressed={activeFormats?.bold}
            onMouseDown={(e) => { e.preventDefault(); onCommand?.('bold'); }}
            style={{ ...iconBtnBase, background: activeFormats?.bold ? '#111827' : 'none' }}
            onMouseEnter={(e) => { if (!activeFormats?.bold) e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { if (!activeFormats?.bold) e.currentTarget.style.background = 'none'; }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, color: activeFormats?.bold ? '#FFFFFF' : '#32302C' }}>B</span>
          </button>

          <button
            type="button" title="Italic (Ctrl+I)" aria-label="Italic" aria-pressed={activeFormats?.italic}
            onMouseDown={(e) => { e.preventDefault(); onCommand?.('italic'); }}
            style={{ ...iconBtnBase, background: activeFormats?.italic ? '#111827' : 'none' }}
            onMouseEnter={(e) => { if (!activeFormats?.italic) e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { if (!activeFormats?.italic) e.currentTarget.style.background = 'none'; }}
          >
            <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 15, color: activeFormats?.italic ? '#FFFFFF' : '#32302C' }}>I</span>
          </button>

          {renderIconBtn('Underline (Ctrl+U)', UnderlineIcon, () => onCommand?.('underline'), { active: activeFormats?.underline })}

          <div style={sep} />

          {/* ---- Color picker ---- */}
          <div ref={colorMenuRef} style={{ position: 'relative' }}>
            <button
              type="button" title="Text color" aria-label="Text color"
              onMouseDown={(e) => { e.preventDefault(); setColorMenuOpen((v) => !v); }}
              style={iconBtnBase}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: colorHex || '#111827', border: '1.5px solid rgba(0,0,0,0.12)' }} />
            </button>
            {colorMenuOpen ? (
              <div style={{ ...popoverBase, padding: 10, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="color"
                    value={colorHex || '#111827'}
                    onChange={(e) => { onColorHexChange?.(e.target.value); applyInlineStyle({ color: e.target.value }); }}
                    style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer' }}
                    aria-label="Text color"
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                    {String(colorHex || '#111827').toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c} type="button" title={c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onColorHexChange?.(c); applyInlineStyle({ color: c }); setColorMenuOpen(false); }}
                      style={{ width: 22, height: 22, borderRadius: 4, border: c === (colorHex || '#111827') ? '2px solid #111827' : '1px solid rgba(0,0,0,0.08)', background: c, cursor: 'pointer', padding: 0 }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div style={sep} />

          {/* ---- Lists ---- */}
          {renderIconBtn('Bulleted list', ListBulletIcon, () => onCommand?.('insertUnorderedList'), { active: listType === 'bullet' })}
          {renderIconBtn('Numbered list', ListNumberedIcon, () => onCommand?.('insertOrderedList'), { active: listType === 'numbered' })}

          <div style={sep} />

          {/* ---- Alignment ---- */}
          {renderIconBtn('Align left', AlignLeftIcon, () => onCommand?.('justifyLeft'), { active: alignment === 'left' })}
          {renderIconBtn('Center', AlignCenterIcon, () => onCommand?.('justifyCenter'), { active: alignment === 'center' })}
          {renderIconBtn('Align right', AlignRightIcon, () => onCommand?.('justifyRight'), { active: alignment === 'right' })}
          {renderIconBtn('Justify', AlignJustifyIcon, () => onCommand?.('justifyFull'), { active: alignment === 'justify' })}
        </>
      ) : null}

      {/* ---- Spacer ---- */}
      <div style={{ flex: 1 }} />

      {/* ---- Page indicator ---- */}
      {!isMobile && totalPages > 0 ? (
        <div style={{ fontSize: 12, fontWeight: 500, color: '#6C6B6E', whiteSpace: 'nowrap', marginRight: 6, flexShrink: 0 }}>
          Page {currentPage || 1} / {totalPages}
        </div>
      ) : null}

      {/* ---- Zoom ---- */}
      {!isMobile ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button
            type="button" title="Zoom out" aria-label="Zoom out"
            disabled={(zoom ?? 100) <= 50}
            onMouseDown={(e) => { e.preventDefault(); zoomOut(); }}
            style={{ ...iconBtnBase, opacity: (zoom ?? 100) <= 50 ? 0.35 : 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 8H12" stroke="#32302C" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div style={{ minWidth: 40, textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#32302C' }}>
            {clamp(zoom ?? 100, 50, 200)}%
          </div>
          <button
            type="button" title="Zoom in" aria-label="Zoom in"
            disabled={(zoom ?? 100) >= 200}
            onMouseDown={(e) => { e.preventDefault(); zoomIn(); }}
            style={{ ...iconBtnBase, opacity: (zoom ?? 100) >= 200 ? 0.35 : 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 4V12M4 8H12" stroke="#32302C" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
