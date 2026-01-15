/**
 * Canonical PreviewCount System
 * Single source of truth for all preview count displays across file types
 */

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds) {
  if (seconds == null || !isFinite(seconds)) {
    return '0:00';
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Determine the correct count unit based on file type and metadata
 */
export function determineCountUnit(meta) {
  const { mimeType, fileExt, previewType } = meta;

  // Explicit preview type takes precedence
  if (previewType) {
    switch (previewType) {
      case 'pdf': return 'pages';
      case 'slides': return 'slides';
      case 'sheets': return 'sheets';
      case 'video':
      case 'audio': return 'duration';
      case 'image': return 'items';
      case 'html':
      case 'text': return 'unknown';
    }
  }

  // MIME type detection
  if (mimeType) {
    // PDFs
    if (mimeType === 'application/pdf') {
      return 'pages';
    }

    // PowerPoint
    if (mimeType.includes('presentation') ||
        mimeType.includes('powerpoint') ||
        fileExt === 'ppt' || fileExt === 'pptx') {
      return 'slides';
    }

    // Excel
    if (mimeType.includes('spreadsheet') ||
        mimeType.includes('excel') ||
        fileExt === 'xls' || fileExt === 'xlsx') {
      return 'sheets';
    }

    // Images
    if (mimeType.startsWith('image/')) {
      return 'items';
    }

    // Video
    if (mimeType.startsWith('video/')) {
      return 'duration';
    }

    // Audio
    if (mimeType.startsWith('audio/')) {
      return 'duration';
    }

    // Word documents - tricky, depends on how we preview
    if (mimeType.includes('word') ||
        mimeType.includes('document') ||
        fileExt === 'doc' || fileExt === 'docx') {
      // If we have page count metadata, use pages
      if (meta.numPages != null) {
        return 'pages';
      }
      // Otherwise unknown (scrollable)
      return 'unknown';
    }

    // Text-based formats
    if (mimeType.startsWith('text/') ||
        fileExt === 'md' || fileExt === 'txt' ||
        fileExt === 'json' || fileExt === 'csv') {
      return 'unknown';
    }
  }

  // File extension fallback
  if (fileExt) {
    const ext = fileExt.toLowerCase();

    if (ext === 'pdf') return 'pages';
    if (['ppt', 'pptx'].includes(ext)) return 'slides';
    if (['xls', 'xlsx'].includes(ext)) return 'sheets';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'items';
    if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'duration';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'duration';
    if (['txt', 'md', 'json', 'csv', 'xml', 'html'].includes(ext)) return 'unknown';
  }

  return 'unknown';
}

/**
 * Get the canonical preview count for any file type
 * This is the single source of truth for all preview count displays
 */
export function getPreviewCountForFile(meta, t) {
  const unit = determineCountUnit(meta);
  const { isLoading, numPages, totalSlides, totalSheets, durationSec, currentPage, currentSlide, currentSheet } = meta;

  // Loading state
  if (isLoading) {
    return {
      unit,
      total: null,
      current: null,
      label: t('common.loading'),
      shortLabel: t('common.loading')
    };
  }

  // Handle each unit type
  switch (unit) {
    case 'pages': {
      const total = numPages ?? null;
      const current = currentPage ?? null;

      if (total == null) {
        return {
          unit,
          total: null,
          current,
          label: current != null ? t('previewCount.pageNumber', { page: current }) : t('previewCount.pagesUnknown'),
          shortLabel: t('previewCount.pagesUnknown')
        };
      }

      if (current != null) {
        return {
          unit,
          total,
          current,
          label: t('previewCount.pageOf', { current, total }),
          shortLabel: `${current}/${total}`
        };
      }

      return {
        unit,
        total,
        label: t('previewCount.pages', { count: total }),
        shortLabel: t('previewCount.pagesShort', { count: total })
      };
    }

    case 'slides': {
      const total = totalSlides ?? numPages ?? null; // fallback to numPages if PDF-based preview
      const current = currentSlide ?? currentPage ?? null;

      if (total == null) {
        return {
          unit,
          total: null,
          current,
          label: current != null ? t('previewCount.slideNumber', { slide: current }) : t('previewCount.slidesUnknown'),
          shortLabel: t('previewCount.slidesUnknown')
        };
      }

      if (current != null) {
        return {
          unit,
          total,
          current,
          label: t('previewCount.slideOf', { current, total }),
          shortLabel: `${current}/${total}`
        };
      }

      return {
        unit,
        total,
        label: t('previewCount.slides', { count: total }),
        shortLabel: t('previewCount.slidesShort', { count: total })
      };
    }

    case 'sheets': {
      const total = totalSheets ?? null;
      const current = currentSheet ?? null;

      if (total == null) {
        return {
          unit,
          total: null,
          current,
          label: current != null ? t('previewCount.sheetNumber', { sheet: current }) : t('previewCount.sheetsUnknown'),
          shortLabel: t('previewCount.sheetsUnknown')
        };
      }

      if (current != null && total > 1) {
        return {
          unit,
          total,
          current,
          label: t('previewCount.sheetOf', { current, total }),
          shortLabel: `${current}/${total}`
        };
      }

      return {
        unit,
        total,
        label: t('previewCount.sheets', { count: total }),
        shortLabel: t('previewCount.sheetsShort', { count: total })
      };
    }

    case 'items': {
      // Single image or file
      return {
        unit,
        total: 1,
        label: t('previewCount.imageSingle'),
        shortLabel: t('previewCount.image')
      };
    }

    case 'duration': {
      const duration = durationSec ?? null;

      if (duration == null || duration === 0) {
        return {
          unit,
          total: null,
          durationSec: null,
          label: t('previewCount.durationUnknown'),
          shortLabel: t('previewCount.durationUnknown')
        };
      }

      const formatted = formatDuration(duration);
      return {
        unit,
        total: null,
        durationSec: duration,
        label: t('previewCount.duration', { time: formatted }),
        shortLabel: formatted
      };
    }

    case 'unknown':
    default: {
      return {
        unit: 'unknown',
        total: null,
        label: t('previewCount.preview'),
        shortLabel: t('previewCount.preview')
      };
    }
  }
}

/**
 * Helper to get file extension from filename
 */
export function getFileExtension(filename) {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Helper to detect MIME type from file extension (client-side fallback)
 */
export function getMimeTypeFromExtension(ext) {
  const mimeMap = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html'
  };

  return mimeMap[ext.toLowerCase()];
}
