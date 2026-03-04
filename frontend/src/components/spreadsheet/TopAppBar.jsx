import React from 'react';
import { ArrowLeft, Download, Share2 } from 'lucide-react';
import sphereIcon from '../../assets/koda-knot-black.svg';
import allybiLogoWhite from '../../assets/koda-knot-white.svg';

const btnBase = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
  transition: 'background 120ms ease',
};

function TopAppBar({
  document: doc,
  onBack,
  onDownload,
  onShare,
  aiOpen = false,
  onToggleAI,
  hasPendingEdits = false,
  lastSavedAt,
  statusMsg = '',
}) {
  const fileName = doc?.name || doc?.originalName || 'Untitled';

  const saveLabel = (() => {
    if (statusMsg) return statusMsg;
    if (hasPendingEdits) return 'Unsaved changes';
    if (lastSavedAt) {
      const ago = Math.round((Date.now() - new Date(lastSavedAt).getTime()) / 1000);
      if (ago < 5) return 'Saved';
      if (ago < 60) return `Saved ${ago}s ago`;
      return 'Saved';
    }
    return 'Saved';
  })();

  const saveColor = hasPendingEdits ? '#D97706' : '#16A34A';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 48,
        padding: '0 12px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E6E6EC',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        flexShrink: 0,
        gap: 8,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {/* Back button */}
      <button
        type="button"
        aria-label="Go back"
        onClick={onBack}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
        style={{ ...btnBase, width: 32, height: 32 }}
      >
        <ArrowLeft size={18} color="#32302C" />
      </button>

      {/* Filename */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: '#32302C',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
        }}
        title={fileName}
      >
        {fileName}
      </span>

      {/* Save state indicator */}
      <span
        role="status"
        aria-live="polite"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: saveColor,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {saveLabel}
      </span>

      {/* Download */}
      {onDownload ? (
        <button
          type="button"
          aria-label="Download"
          title="Download"
          onClick={onDownload}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          style={{ ...btnBase, width: 32, height: 32 }}
        >
          <Download size={16} color="#6C6B6E" />
        </button>
      ) : null}

      {/* Share */}
      {onShare ? (
        <button
          type="button"
          aria-label="Share"
          title="Share"
          onClick={onShare}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          style={{ ...btnBase, width: 32, height: 32 }}
        >
          <Share2 size={16} color="#6C6B6E" />
        </button>
      ) : null}

      {/* AI toggle */}
      <button
        type="button"
        aria-label={aiOpen ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={aiOpen}
        aria-controls="ai-drawer"
        onClick={onToggleAI}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = aiOpen ? '#333333' : '#F5F5F5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = aiOpen ? '#181818' : 'white';
        }}
        style={{
          height: 34,
          paddingLeft: 10,
          paddingRight: 12,
          background: aiOpen ? '#181818' : 'white',
          borderRadius: 9999,
          border: aiOpen ? '1px solid #181818' : '1px solid #E6E6EC',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          transition: 'all 160ms ease',
          flexShrink: 0,
        }}
      >
        <img
          src={aiOpen ? allybiLogoWhite : sphereIcon}
          alt=""
          aria-hidden="true"
          style={{ width: 18, height: 18, objectFit: 'contain' }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: aiOpen ? '#FFFFFF' : '#181818',
            lineHeight: '18px',
          }}
        >
          Ask Allybi
        </span>
      </button>
    </div>
  );
}

export default TopAppBar;
