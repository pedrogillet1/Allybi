import React from 'react';
import './MessageLoadingSkeleton.css';

export default function MessageLoadingSkeleton() {
  return (
    <div className="message-loading-skeleton">
      <div className="skeleton-avatar"></div>
      <div className="skeleton-content">
        <div className="skeleton-line skeleton-line-1"></div>
        <div className="skeleton-line skeleton-line-2"></div>
        <div className="skeleton-line skeleton-line-3"></div>
      </div>
    </div>
  );
}
