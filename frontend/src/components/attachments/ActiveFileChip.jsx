/**
 * ActiveFileChip - Shows the currently locked document at top of chat
 *
 * CHATGPT PARITY: Visual indicator showing which document is in scope.
 * Users can click to clear the lock or click the filename to preview.
 *
 * Variants:
 * - "hard" lock: Explicit user command ("use P&L.xlsx") - shows with lock icon
 * - "soft" lock: Inferred from context - shows with pin icon
 * - "discovery" mode: No doc locked, searching all - shows search icon
 */

import React from 'react';
import { getFileIcon } from '../../utils/iconMapper';

/**
 * ActiveFileChip component
 *
 * DISABLED: User requested to never show "Locked to" banner.
 * The internal activeDocRef state still works for context continuity,
 * but the UI chip is hidden. Locking/unlocking is now fully automatic.
 *
 * @param {Object} props
 * @param {Object} props.activeDoc - Currently active document { id, filename, mimeType }
 * @param {string} props.lockType - 'hard' | 'soft' | 'discovery' | null
 * @param {Function} props.onFileClick - Handler when filename is clicked (opens preview)
 * @param {Function} props.onClearClick - Handler when X is clicked (clears lock)
 * @param {string} props.language - 'en' | 'pt' | 'es' for labels
 */
const ActiveFileChip = ({
  activeDoc,
  lockType = 'soft',
  onFileClick,
  onClearClick,
  language = 'en',
}) => {
  // DISABLED: Never show the lock banner - locking is now automatic
  // Internal activeDocRef state still works for backend context continuity
  return null;

  // Don't render if no active doc
  if (!activeDoc && lockType !== 'discovery') {
    return null;
  }

  // Labels by language
  const labels = {
    en: {
      using: 'Using',
      hardLock: 'Locked to',
      discovery: 'Searching all files',
      clear: 'Clear',
    },
    pt: {
      using: 'Usando',
      hardLock: 'Focado em',
      discovery: 'Buscando em todos',
      clear: 'Limpar',
    },
    es: {
      using: 'Usando',
      hardLock: 'Enfocado en',
      discovery: 'Buscando en todos',
      clear: 'Limpiar',
    },
  };

  const t = labels[language] || labels.en;

  // Discovery mode (no specific doc)
  if (lockType === 'discovery' || !activeDoc) {
    return (
      <div
        className="active-file-chip discovery"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '16px',
          fontSize: '13px',
          color: '#3b82f6',
          fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        }}
      >
        <SearchIcon />
        <span>{t.discovery}</span>
      </div>
    );
  }

  // Hard lock (explicit user command)
  const isHardLock = lockType === 'hard';

  return (
    <div
      className={`active-file-chip ${isHardLock ? 'hard-lock' : 'soft-lock'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        backgroundColor: isHardLock
          ? 'rgba(168, 85, 247, 0.1)'
          : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${isHardLock
          ? 'rgba(168, 85, 247, 0.25)'
          : 'rgba(255, 255, 255, 0.12)'}`,
        borderRadius: '16px',
        fontSize: '13px',
        color: isHardLock ? '#a855f7' : 'rgba(255, 255, 255, 0.8)',
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      }}
    >
      {/* Lock/Pin icon */}
      {isHardLock ? <LockIcon /> : <PinIcon />}

      {/* Label */}
      <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
        {isHardLock ? t.hardLock : t.using}
      </span>

      {/* Clickable filename */}
      <button
        onClick={() => onFileClick?.(activeDoc)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0',
          background: 'none',
          border: 'none',
          color: isHardLock ? '#a855f7' : '#fff',
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          textDecoration: 'none',
          maxWidth: '180px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.textDecoration = 'underline';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.textDecoration = 'none';
        }}
      >
        <img
          src={getFileIcon(activeDoc.filename, activeDoc.mimeType)}
          alt=""
          style={{ width: '14px', height: '14px', flexShrink: 0 }}
        />
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {activeDoc.filename}
        </span>
      </button>

      {/* Clear button (X) */}
      {onClearClick && (
        <button
          onClick={onClearClick}
          title={t.clear}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            padding: '0',
            marginLeft: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '50%',
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

// ============================================================================
// ICONS
// ============================================================================

const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
  </svg>
);

const PinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
  </svg>
);

export default ActiveFileChip;
