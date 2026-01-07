/**
 * Inline Upload Button - For chat messages
 *
 * Renders an upload button with the upload.svg icon
 * Used when Koda suggests the user upload documents
 */

import React from 'react';
import { ReactComponent as UploadIcon } from '../assets/upload.svg';
import './InlineUploadButton.css';

export default function InlineUploadButton({
  label = 'Upload documents',
  onClick,
  className = '',
}) {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
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
      className={`inline-upload-button ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={label}
      aria-label={label}
    >
      <UploadIcon className="inline-upload-icon" />
      <span>{label}</span>
    </button>
  );
}
