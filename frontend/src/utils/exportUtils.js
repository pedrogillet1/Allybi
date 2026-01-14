/**
 * Export Utilities
 * Determines which export formats are supported for each file type
 */

/**
 * Get supported export formats for a given mime type and filename
 * @param {string} mimeType - The MIME type of the document
 * @param {string} filename - The filename (used for extension fallback)
 * @returns {Array<{format: string, label: string, icon: string}>} - Array of supported export formats
 */
export function getSupportedExports(mimeType, filename = '') {
  const mime = (mimeType || '').toLowerCase();
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // PDF files - already PDF, only offer download original
  if (mime === 'application/pdf' || ext === 'pdf') {
    return []; // No export options, just download original
  }

  // Images - can be exported to PDF
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg'].includes(ext)) {
    return [
      { format: 'pdf', label: 'Export as PDF', icon: 'pdf' }
    ];
  }

  // Office documents - can be exported to PDF (via LibreOffice conversion)
  const officeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/msword', // doc
    'application/vnd.ms-excel', // xls
    'application/vnd.ms-powerpoint', // ppt
  ];
  const officeExts = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  if (officeTypes.includes(mime) || officeExts.includes(ext)) {
    return [
      { format: 'pdf', label: 'Export as PDF', icon: 'pdf' }
    ];
  }

  // Text/Markdown files - NOT supported for PDF export (backend doesn't support)
  // Note: These file types would need a text-to-PDF renderer in the backend

  // Everything else - no export options
  return [];
}

/**
 * Check if a specific export format is supported
 * @param {string} mimeType - The MIME type of the document
 * @param {string} format - The export format to check
 * @param {string} filename - The filename (optional)
 * @returns {boolean}
 */
export function isExportSupported(mimeType, format, filename = '') {
  const supported = getSupportedExports(mimeType, filename);
  return supported.some(s => s.format === format);
}

/**
 * Check if any export options are available for this file type
 * @param {string} mimeType - The MIME type of the document
 * @param {string} filename - The filename (optional)
 * @returns {boolean}
 */
export function hasExportOptions(mimeType, filename = '') {
  return getSupportedExports(mimeType, filename).length > 0;
}
