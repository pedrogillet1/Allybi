import React from 'react';

/**
 * White paper container providing the "printed page" appearance.
 * US Letter: 8.5 × 11 in @ 96 dpi → 816 × 1056 px.
 * The component grows vertically as content is added (continuous paper model).
 */
export default function DocPaper({ children }) {
  return (
    <div
      style={{
        width: 816,
        minHeight: 1056,
        background: '#FFFFFF',
        boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
        padding: '96px 72px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}
