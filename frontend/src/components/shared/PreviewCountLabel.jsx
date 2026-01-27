/**
 * Canonical Preview Count Label Component
 *
 * Single UI component for rendering preview count labels across all preview types.
 * Prevents formatting drift and ensures consistent typography.
 *
 * Usage:
 *   <PreviewCountLabel
 *     document={document}
 *     viewerState={{ currentPage, totalPages, currentSlide, totalSlides, ... }}
 *     variant="full" // or "compact"
 *   />
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getPreviewCountForFile, getFileExtension } from '../../utils/files/previewCount';

/**
 * PreviewCountLabel - Canonical count display component
 *
 * @param {object} document - Document object with filename, mimeType
 * @param {object} viewerState - Current viewer state (pages, slides, sheets, duration, etc.)
 * @param {string} variant - 'full' (default) or 'compact' for shortLabel
 * @param {object} style - Optional inline styles to override typography
 * @param {string} className - Optional CSS class
 */
export const PreviewCountLabel = ({
  document,
  viewerState = {},
  variant = 'full',
  style = {},
  className = ''
}) => {
  const { t } = useTranslation();

  const previewCount = useMemo(() => {
    if (!document) return null;

    const fileExt = getFileExtension(document.filename || '');
    const {
      numPages,
      currentPage,
      totalSlides,
      currentSlide,
      totalSheets,
      currentSheet,
      durationSec,
      isLoading,
      previewType
    } = viewerState;

    return getPreviewCountForFile({
      mimeType: document.mimeType,
      fileExt,
      numPages,
      currentPage,
      totalSlides,
      currentSlide,
      totalSheets,
      currentSheet,
      durationSec,
      isLoading,
      previewType
    }, t);
  }, [document, viewerState, t]);

  // Don't render if no count or unknown unit with no label
  if (!previewCount || (previewCount.unit === 'unknown' && !previewCount.label)) {
    return null;
  }

  // Choose label variant
  const label = variant === 'compact'
    ? (previewCount.shortLabel || previewCount.label)
    : previewCount.label;

  // Default typography - consistent across all preview types
  const defaultStyle = {
    fontSize: 14,
    fontWeight: '600',
    color: '#32302C',
    fontFamily: 'Plus Jakarta Sans',
    lineHeight: '20px',
    wordWrap: 'break-word',
    ...style // Allow override
  };

  return (
    <div style={defaultStyle} className={className}>
      {label}
    </div>
  );
};

/**
 * Mobile variant with compact styling
 */
export const PreviewCountLabelMobile = ({
  document,
  viewerState,
  style = {},
  className = ''
}) => {
  return (
    <PreviewCountLabel
      document={document}
      viewerState={viewerState}
      variant="compact"
      style={{
        fontSize: 12,
        fontWeight: '500',
        ...style
      }}
      className={className}
    />
  );
};

export default PreviewCountLabel;
