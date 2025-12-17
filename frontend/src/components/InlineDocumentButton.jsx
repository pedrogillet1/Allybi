/**
 * Inline Document Button - Production V3
 * 
 * Features:
 * - CSS-only styling (no <u> tags)
 * - Inline-flex for proper text flow
 * - Different styles for list vs text context
 * - Proper spacing (no double spaces, no missing spaces)
 */

import React from 'react';
import './InlineDocumentButton.css';

export default function InlineDocumentButton({
  docId,
  docName,
  context = 'text',
  onClick,
  className = '',
}) {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.(docId, docName);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <button
      type="button"
      className={`inline-doc-button inline-doc-button--${context} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-doc-id={docId}
      data-doc-name={docName}
      title={`Open ${docName}`}
      aria-label={`Open document ${docName}`}
    >
      {docName}
    </button>
  );
}
