/**
 * File-Type Intelligence System (A1 requirement)
 *
 * Analyzes uploaded files to detect meaningful file-type conditions:
 * - Multiple file types in one batch
 * - Unsupported extensions
 * - Limited extraction support
 * - Potentially empty text content
 */

// ============================================================================
// FILE TYPE CLASSIFICATION
// ============================================================================

/**
 * Supported file types with full text extraction
 */
const FULLY_SUPPORTED = {
  // Documents
  pdf: { category: 'document', fullSupport: true },
  doc: { category: 'document', fullSupport: true },
  docx: { category: 'document', fullSupport: true },
  txt: { category: 'text', fullSupport: true },
  rtf: { category: 'document', fullSupport: true },
  odt: { category: 'document', fullSupport: true },

  // Spreadsheets
  xls: { category: 'spreadsheet', fullSupport: true },
  xlsx: { category: 'spreadsheet', fullSupport: true },
  csv: { category: 'data', fullSupport: true },

  // Presentations
  ppt: { category: 'presentation', fullSupport: true },
  pptx: { category: 'presentation', fullSupport: true },

  // Code
  js: { category: 'code', fullSupport: true },
  jsx: { category: 'code', fullSupport: true },
  ts: { category: 'code', fullSupport: true },
  tsx: { category: 'code', fullSupport: true },
  py: { category: 'code', fullSupport: true },
  java: { category: 'code', fullSupport: true },
  cpp: { category: 'code', fullSupport: true },
  c: { category: 'code', fullSupport: true },
  cs: { category: 'code', fullSupport: true },
  go: { category: 'code', fullSupport: true },
  rb: { category: 'code', fullSupport: true },
  php: { category: 'code', fullSupport: true },
  html: { category: 'code', fullSupport: true },
  css: { category: 'code', fullSupport: true },
  json: { category: 'data', fullSupport: true },
  xml: { category: 'data', fullSupport: true },
  yaml: { category: 'data', fullSupport: true },
  yml: { category: 'data', fullSupport: true },
  md: { category: 'text', fullSupport: true },

  // Data
  sql: { category: 'data', fullSupport: true },

  // Images (visual-only, OCR attempted when possible)
  jpg: { category: 'image', fullSupport: true },
  jpeg: { category: 'image', fullSupport: true },
  png: { category: 'image', fullSupport: true },
  gif: { category: 'image', fullSupport: true },
  bmp: { category: 'image', fullSupport: true },
  tiff: { category: 'image', fullSupport: true },
  tif: { category: 'image', fullSupport: true },
  webp: { category: 'image', fullSupport: true },
  svg: { category: 'image', fullSupport: true },
  ico: { category: 'image', fullSupport: true },
};

/**
 * Limited support file types (extraction may be incomplete)
 */
const LIMITED_SUPPORT = {
  // Video files (supported by backend, limited text extraction)
  mp4: { category: 'video', reason: 'limited_extraction' },
  webm: { category: 'video', reason: 'limited_extraction' },
  ogg: { category: 'video', reason: 'limited_extraction' },
  mov: { category: 'video', reason: 'limited_extraction' },
  avi: { category: 'video', reason: 'limited_extraction' },

  // Design files (supported by backend, limited extraction)
  psd: { category: 'design', reason: 'limited_extraction' },
  ai: { category: 'design', reason: 'limited_extraction' },
  sketch: { category: 'design', reason: 'limited_extraction' },
  fig: { category: 'design', reason: 'limited_extraction' },
  xd: { category: 'design', reason: 'limited_extraction' },

  // Archives (need extraction)
  zip: { category: 'archive', reason: 'extraction_needed' },
  rar: { category: 'archive', reason: 'extraction_needed' },
  '7z': { category: 'archive', reason: 'extraction_needed' },
  tar: { category: 'archive', reason: 'extraction_needed' },
  gz: { category: 'archive', reason: 'extraction_needed' },

  // Proprietary formats
  pages: { category: 'document', reason: 'proprietary_format' },
  numbers: { category: 'spreadsheet', reason: 'proprietary_format' },
  key: { category: 'presentation', reason: 'proprietary_format' },
};

/**
 * Unsupported file types (truly unsupported - backend will reject)
 */
const UNSUPPORTED = [
  // Executables
  'exe', 'dll', 'bin', 'app', 'dmg', 'pkg', 'deb', 'rpm',

  // System files
  'sys', 'ini', 'cfg', 'dat',

  // Audio (not supported for text extraction)
  'mp3', 'wav', 'flac', 'm4a', 'weba', 'oga',

  // Video (NOT in backend whitelist)
  'mkv', 'flv', 'wmv', 'mpeg', 'mpg',

  // 3D/CAD
  'stl', 'obj', 'fbx', 'blend', 'max', '3ds', 'dwg', 'dxf',

  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
];

// ============================================================================
// CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Get file extension from filename
 * @param {string} filename - File name
 * @returns {string} Lowercase extension without dot
 */
export function getExtension(filename) {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Classify a file by extension
 * @param {string} filename - File name
 * @returns {object} Classification { extension, isSupported, hasLimitedSupport, isUnsupported, category, reason }
 */
export function classifyFile(filename) {
  const extension = getExtension(filename);

  if (FULLY_SUPPORTED[extension]) {
    return {
      extension,
      isSupported: true,
      hasLimitedSupport: false,
      isUnsupported: false,
      category: FULLY_SUPPORTED[extension].category,
      reason: null,
    };
  }

  if (LIMITED_SUPPORT[extension]) {
    return {
      extension,
      isSupported: false,
      hasLimitedSupport: true,
      isUnsupported: false,
      category: LIMITED_SUPPORT[extension].category,
      reason: LIMITED_SUPPORT[extension].reason,
    };
  }

  if (UNSUPPORTED.includes(extension)) {
    return {
      extension,
      isSupported: false,
      hasLimitedSupport: false,
      isUnsupported: true,
      category: 'unsupported',
      reason: 'unsupported_type',
    };
  }

  // Unknown extension - treat as unsupported
  return {
    extension,
    isSupported: false,
    hasLimitedSupport: false,
    isUnsupported: true,
    category: 'unknown',
    reason: 'unknown_type',
  };
}

/**
 * Analyze a batch of files
 * @param {array} files - Array of File objects or {name, size} objects
 * @returns {object} Analysis result
 */
export function analyzeFileBatch(files) {
  const analysis = {
    totalCount: files.length,
    supportedFiles: [],
    limitedSupportFiles: [],
    unsupportedFiles: [],
    typeGroups: {}, // { category: { count, extensions: Set } }
    allExtensions: new Set(),
  };

  files.forEach(file => {
    const filename = file.name || file.filename;
    const classification = classifyFile(filename);

    analysis.allExtensions.add(classification.extension);

    // Group by category
    if (!analysis.typeGroups[classification.category]) {
      analysis.typeGroups[classification.category] = {
        count: 0,
        extensions: new Set(),
      };
    }
    analysis.typeGroups[classification.category].count++;
    analysis.typeGroups[classification.category].extensions.add(classification.extension);

    // Categorize files
    if (classification.isSupported) {
      analysis.supportedFiles.push({
        name: filename,
        extension: classification.extension,
        category: classification.category,
      });
    } else if (classification.hasLimitedSupport) {
      analysis.limitedSupportFiles.push({
        name: filename,
        extension: classification.extension,
        category: classification.category,
        reason: classification.reason,
      });
    } else if (classification.isUnsupported) {
      analysis.unsupportedFiles.push({
        name: filename,
        extension: classification.extension,
        category: classification.category,
        reason: classification.reason,
      });
    }
  });

  // Convert typeGroups to array for easier consumption
  analysis.typeGroupsArray = Object.entries(analysis.typeGroups).map(([type, data]) => ({
    type,
    count: data.count,
    extensions: Array.from(data.extensions),
  }));

  return analysis;
}

/**
 * Determine which notifications to show based on file analysis
 * @param {object} analysis - Result from analyzeFileBatch
 * @returns {array} Array of notification configs to trigger
 */
export function determineNotifications(analysis) {
  const notifications = [];

  // 1. Unsupported files (highest priority - blocks upload)
  if (analysis.unsupportedFiles.length > 0) {
    notifications.push({
      type: 'unsupportedFiles',
      data: analysis.unsupportedFiles,
    });
  }

  // 2. Limited support files (warning - may not extract fully)
  if (analysis.limitedSupportFiles.length > 0) {
    notifications.push({
      type: 'limitedSupportFiles',
      data: analysis.limitedSupportFiles,
    });
  }

  // 3. File-type detection (info - show mix of types)
  // Only show if multiple file types detected (2+ categories)
  if (analysis.typeGroupsArray.length > 1) {
    notifications.push({
      type: 'fileTypeDetected',
      data: {
        totalCount: analysis.totalCount,
        typeGroups: analysis.typeGroupsArray,
      },
    });
  }

  return notifications;
}

/**
 * Check if a file is likely to have no extractable text
 * Heuristic: scanned PDFs, images without OCR, empty files
 * @param {File|object} file - File object
 * @returns {boolean} True if likely empty
 */
export function isLikelyEmptyText(file) {
  const classification = classifyFile(file.name);

  // Images need OCR
  if (classification.category === 'image') {
    return true;
  }

  // Very small PDFs might be scanned images
  if (classification.extension === 'pdf' && file.size < 10000) {
    return true; // Heuristic: < 10KB PDF is likely scanned
  }

  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getExtension,
  classifyFile,
  analyzeFileBatch,
  determineNotifications,
  isLikelyEmptyText,
};
