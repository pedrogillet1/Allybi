/**
 * Inline Document Button - Production V4
 *
 * Features:
 * - CSS-only styling (no <u> tags)
 * - Inline-flex for proper text flow
 * - Different styles for list vs text context
 * - Proper spacing (no double spaces, no missing spaces)
 * - Supports both legacy (docId/docName) and document object props
 * - onClick passes full document object for ChatInterface compatibility
 */

import React from 'react';
import './InlineDocumentButton.css';

export default function InlineDocumentButton({
  // New prop - document object (from DocumentSources)
  document,
  // Legacy props (direct values)
  docId,
  docName,
  // Context/variant for styling
  context = 'text',
  variant,  // Alias for context (from DocumentSources)
  onClick,
  className = '',
}) {
  // Resolve from either pattern - document object takes precedence for new callers
  const resolvedId = docId || document?.documentId || document?.id;
  const resolvedName = docName || document?.documentName || document?.filename;
  const resolvedContext = variant || context;

  // Build full document object for onClick callback
  const resolvedDocument = document || {
    documentId: resolvedId,
    documentName: resolvedName,
    filename: resolvedName,
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Pass full document object for ChatInterface.jsx compatibility
    onClick?.(resolvedDocument);
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
      className={`inline-doc-button inline-doc-button--${resolvedContext} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-doc-id={resolvedId}
      data-doc-name={resolvedName}
      data-testid="source-open-button"
      title={`Open ${resolvedName}`}
      aria-label={`Open document ${resolvedName}`}
    >
      {resolvedName}
    </button>
  );
}
