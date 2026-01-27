/**
 * InlineNavPill - Renders document buttons INLINE with content
 *
 * Used for "open" queries where the button should appear right after
 * the text "Here it is:" instead of in a separate Sources row.
 */

import React from 'react';
import { getFileIcon } from '../../utils/iconMapper';

const InlineNavPill = ({ navPills, onSourceClick }) => {
  if (!navPills?.buttons?.length) {
    return null;
  }

  const handleClick = (btn) => {
    if (onSourceClick) {
      onSourceClick({
        id: btn.documentId,
        filename: btn.title,
        mimeType: btn.mimeType,
      });
    }
  };

  // Get the first button only (nav mode shows single doc)
  const btn = navPills.buttons[0];

  return (
    <button
      className="nav-pill-button"
      onClick={() => handleClick(btn)}
      title={btn.title}
      type="button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        height: '36px',
        padding: '0 14px',
        background: '#FFFFFF',
        border: '1px solid #1F2937',
        borderRadius: '999px',
        cursor: 'pointer',
        fontSize: '14px',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontWeight: 500,
        color: '#1F2937',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        maxWidth: '300px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#F9FAFB';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#FFFFFF';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
      }}
    >
      <img
        src={getFileIcon(btn.title, btn.mimeType)}
        alt=""
        style={{ width: '26px', height: '26px', flexShrink: 0 }}
      />
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        height: '26px',
        display: 'inline-flex',
        alignItems: 'center',
      }}>
        {btn.title}
      </span>
    </button>
  );
};

export default InlineNavPill;
