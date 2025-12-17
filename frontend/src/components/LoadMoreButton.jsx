/**
 * Load More Button - Production V3
 * 
 * Renders pagination control for document listings
 */

import React from 'react';
import './LoadMoreButton.css';

export default function LoadMoreButton({
  total,
  shown,
  remaining,
  onClick,
  className = '',
}) {
  const handleClick = (e) => {
    e.preventDefault();
    onClick?.(shown, remaining);
  };

  return (
    <div className={`load-more-container ${className}`}>
      <button
        type="button"
        className="load-more-button"
        onClick={handleClick}
        aria-label={`Load ${remaining} more documents`}
      >
        <span className="load-more-text">
          Load {remaining} more {remaining === 1 ? 'document' : 'documents'}
        </span>
        <span className="load-more-stats">
          (Showing {shown} of {total})
        </span>
      </button>
    </div>
  );
}
