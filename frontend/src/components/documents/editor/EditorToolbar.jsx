import React from 'react';

function ToolbarButton({ children, onClick, disabled, active, title, variant = 'ghost', style }) {
  const base = {
    height: 34,
    padding: '0 10px',
    borderRadius: 10,
    border: variant === 'primary' ? '1px solid #111827' : '1px solid #E5E7EB',
    background: variant === 'primary' ? '#111827' : active ? 'rgba(17, 24, 39, 0.06)' : 'white',
    color: variant === 'primary' ? 'white' : '#111827',
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: 950,
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...style,
  };

  return (
    <button onClick={onClick} disabled={disabled} title={title} style={base}>
      {children}
    </button>
  );
}

function ToolbarSelect({ value, onChange, disabled, title, children, style }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      title={title}
      style={{
        height: 34,
        borderRadius: 10,
        border: '1px solid #E5E7EB',
        padding: '0 10px',
        fontFamily: 'Plus Jakarta Sans',
        fontWeight: 850,
        fontSize: 13,
        background: disabled ? '#F9FAFB' : 'white',
        color: disabled ? '#9CA3AF' : '#111827',
        outline: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function ToolbarDivider() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 1,
        height: 28,
        background: '#E5E7EB',
        borderRadius: 999,
        margin: '0 2px',
      }}
    />
  );
}

export default function EditorToolbar({
  title,
  subtitle,
  scopeLabel,
  format, // 'docx' | 'sheets' | 'slides' | 'pdf'
  canFormatText = false,
  fontFamily,
  fontSizePx,
  colorHex,
  onFontFamilyChange,
  onFontSizeChange,
  onColorChange,
  onBold,
  onItalic,
  onUnderline,
  onUndo,
  onRedo,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignJustify,
  onBullets,
  onNumbers,
  onIndent,
  onOutdent,
  onClearFormatting,
  onApplyTextStyle,
  onRevert,
  onApply,
  applyLabel = 'Apply',
  revertLabel = 'Revert',
  isApplying = false,
  canApply = true,
  canRevert = true,
  extraActions = [], // [{label,onClick,disabled,variant,title}]
  centerSlot = null,
}) {
  const showTextControls = canFormatText && format === 'docx';

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        marginBottom: 12,
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        boxShadow: '0 10px 24px rgba(17, 24, 39, 0.08)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #F3F4F6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 950, fontSize: 13, color: '#111827' }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 650, fontSize: 12, color: '#6B7280' }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {extraActions.map((a) => (
            <ToolbarButton
              key={a.label}
              onClick={a.onClick}
              disabled={Boolean(a.disabled) || isApplying}
              variant={a.variant || 'ghost'}
              title={a.title || a.label}
            >
              {a.label}
            </ToolbarButton>
          ))}
          {onRevert ? (
            <ToolbarButton
              onClick={onRevert}
              disabled={!canRevert || isApplying}
              title={revertLabel}
            >
              {revertLabel}
            </ToolbarButton>
          ) : null}
          {onApply ? (
            <ToolbarButton
              onClick={onApply}
              disabled={!canApply || isApplying}
              variant="primary"
              title={applyLabel}
            >
              {isApplying ? 'Applying…' : applyLabel}
            </ToolbarButton>
          ) : null}
        </div>
      </div>

      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            minWidth: 180,
            maxWidth: 360,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: 950,
            fontSize: 12,
            color: '#111827',
            padding: '8px 10px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#F9FAFB',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={scopeLabel || ''}
        >
          {scopeLabel || 'Selection'}
        </div>

        {showTextControls ? (
          <>
            <ToolbarButton onClick={onUndo} disabled={false} title="Undo (Ctrl/Cmd+Z)">
              Undo
            </ToolbarButton>
            <ToolbarButton onClick={onRedo} disabled={false} title="Redo (Ctrl/Cmd+Shift+Z)">
              Redo
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarSelect
              value={fontFamily || 'Calibri'}
              onChange={(e) => onFontFamilyChange?.(e.target.value)}
              disabled={false}
              title="Font"
            >
              <option value="Calibri">Calibri</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
            </ToolbarSelect>

            <ToolbarSelect
              value={fontSizePx || '16px'}
              onChange={(e) => onFontSizeChange?.(e.target.value)}
              disabled={false}
              title="Font size"
            >
              {['11px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'].map((s) => (
                <option key={s} value={s}>
                  {s.replace('px', '')}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarButton onClick={onBold} disabled={false} title="Bold (Ctrl/Cmd+B)">
              B
            </ToolbarButton>
            <ToolbarButton
              onClick={onItalic}
              disabled={false}
              title="Italic (Ctrl/Cmd+I)"
              style={{ fontStyle: 'italic' }}
            >
              I
            </ToolbarButton>
            <ToolbarButton
              onClick={onUnderline}
              disabled={false}
              title="Underline (Ctrl/Cmd+U)"
              style={{ textDecoration: 'underline' }}
            >
              U
            </ToolbarButton>

            <input
              type="color"
              value={colorHex || '#111827'}
              onChange={(e) => onColorChange?.(e.target.value)}
              disabled={false}
              title="Text color"
              style={{
                width: 34,
                height: 34,
                padding: 0,
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                background: 'white',
                cursor: 'pointer',
              }}
            />

            <ToolbarButton onClick={onApplyTextStyle} disabled={false} title="Apply font/size/color to selection">
              Apply style
            </ToolbarButton>

            <ToolbarButton onClick={onClearFormatting} disabled={false} title="Clear formatting">
              Clear
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={onAlignLeft} disabled={false} title="Align left">
              Left
            </ToolbarButton>
            <ToolbarButton onClick={onAlignCenter} disabled={false} title="Align center">
              Center
            </ToolbarButton>
            <ToolbarButton onClick={onAlignRight} disabled={false} title="Align right">
              Right
            </ToolbarButton>
            <ToolbarButton onClick={onAlignJustify} disabled={false} title="Justify">
              Justify
            </ToolbarButton>

            <ToolbarDivider />

            <ToolbarButton onClick={onBullets} disabled={false} title="Bulleted list">
              Bullets
            </ToolbarButton>
            <ToolbarButton onClick={onNumbers} disabled={false} title="Numbered list">
              Numbers
            </ToolbarButton>
            <ToolbarButton onClick={onOutdent} disabled={false} title="Outdent">
              Outdent
            </ToolbarButton>
            <ToolbarButton onClick={onIndent} disabled={false} title="Indent">
              Indent
            </ToolbarButton>
          </>
        ) : null}

        {/* Format-specific contextual controls */}
        {centerSlot ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 auto', minWidth: 240 }}>
            {centerSlot}
          </div>
        ) : null}
      </div>
    </div>
  );
}
