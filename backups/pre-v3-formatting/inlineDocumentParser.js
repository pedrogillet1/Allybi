/**
 * ============================================================================
 * ENHANCED INLINE DOCUMENT PARSER
 * ============================================================================
 *
 * PURPOSE: Parse all marker types from backend responses
 *
 * MARKER TYPES (Legacy Format - {{...}}):
 * - {{DOC:::id:::filename:::mimeType:::fileSize:::folderPath}}
 * - {{FOLDER:::id:::folderName:::fileCount:::folderPath}}
 * - {{LOADMORE:::remainingCount:::totalCount:::loadedCount}}
 *
 * NEW MARKER TYPES (Simple Format - [[...]]):
 * - [[DOC:documentId:documentName]] - Document link (from RAG answers)
 * - [[FOLDER:folderId:folderName]] - Folder link
 * - [[SEE_ALL:linkText]] - "See all" navigation link
 *
 * NEW DOCUMENT LISTING FORMAT (from kodaMarkdownEngine):
 * - Numbered list with **bold** document names and "Pasta:" folder path
 * - Format: "1. **DocumentName.pdf**    Pasta: Folder / Subfolder"
 * - Also handles: "<!-- LOAD_MORE:totalCount -->" for "See all X" link
 */

/**
 * ============================================================================
 * DOCUMENT LISTING FORMAT (from kodaMarkdownEngine.formatDocumentListingMarkdown)
 * ============================================================================
 *
 * Format: "1. **DocumentName.pdf**    Pasta: Folder / Subfolder"
 * - Bold document names are clickable
 * - Folder path shown after "Pasta:" or "Folder:"
 * - LOAD_MORE comment: "<!-- LOAD_MORE:totalCount -->" for "See all X"
 */

/**
 * Check if content contains document listing format (numbered list with bold names + Pasta:)
 */
export const hasDocumentListingFormat = (content) => {
  if (!content || typeof content !== 'string') return false;
  // Match: "1. **SomeName**" followed by "Pasta:" or "Folder:"
  return /^\d+\.\s+\*\*[^*]+\*\*.*(?:Pasta|Folder):/m.test(content);
};

/**
 * Parse document listing format
 * Returns array of { documentName, folderPath, lineNumber }
 *
 * Input format (from backend):
 * "1. **Report.pdf**    Pasta: Finance / Reports"
 * "2. **Contract.docx**    Pasta: Legal"
 */
export const parseDocumentListingFormat = (content) => {
  if (!content || typeof content !== 'string') return { documents: [], loadMoreCount: null };

  const documents = [];
  let loadMoreCount = null;

  // Parse each line
  const lines = content.split('\n');

  for (const line of lines) {
    // Match document listing line: "1. **Name**    Pasta: Path"
    // Also handles: "1. **Name** (metadata)    Pasta: Path"
    const docMatch = line.match(/^\d+\.\s+\*\*([^*]+)\*\*(?:\s*\([^)]*\))?\s+(?:Pasta|Folder):\s*(.*)$/);
    if (docMatch) {
      const [, documentName, folderPath] = docMatch;
      documents.push({
        documentName: documentName.trim(),
        folderPath: folderPath.trim() || 'Root',
        fullLine: line
      });
    }

    // Match LOAD_MORE comment: "<!-- LOAD_MORE:25 -->"
    const loadMoreMatch = line.match(/<!--\s*LOAD_MORE:(\d+)\s*-->/);
    if (loadMoreMatch) {
      loadMoreCount = parseInt(loadMoreMatch[1], 10);
    }
  }

  return { documents, loadMoreCount };
};

/**
 * Check if content has LOAD_MORE marker
 */
export const hasLoadMoreComment = (content) => {
  if (!content || typeof content !== 'string') return false;
  return /<!--\s*LOAD_MORE:\d+\s*-->/.test(content);
};

/**
 * Parse LOAD_MORE comment and return the total count
 */
export const parseLoadMoreComment = (content) => {
  if (!content || typeof content !== 'string') return null;
  const match = content.match(/<!--\s*LOAD_MORE:(\d+)\s*-->/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Strip LOAD_MORE comment from content
 */
export const stripLoadMoreComment = (content) => {
  if (!content || typeof content !== 'string') return content;
  return content.replace(/<!--\s*LOAD_MORE:\d+\s*-->/g, '').trim();
};

/**
 * ============================================================================
 * NEW SIMPLE MARKERS ([[DOC:]], [[FOLDER:]], [[SEE_ALL:]])
 * ============================================================================
 */

/**
 * Check if content contains new simple markers
 */
export const hasSimpleMarkers = (content) => {
  if (!content || typeof content !== 'string') return false;
  return /\[\[(DOC|FOLDER|SEE_ALL):/.test(content);
};

/**
 * Parse simple document markers: [[DOC:documentId:documentName]]
 */
export const parseSimpleDocMarkers = (content) => {
  if (!content || typeof content !== 'string') return [];

  const docRegex = /\[\[DOC:([^:\]]+):([^\]]+)\]\]/g;
  const documents = [];
  let match;

  while ((match = docRegex.exec(content)) !== null) {
    documents.push({
      documentId: match[1],
      filename: match[2],
      documentName: match[2],
      mimeType: null, // Not available in simple format
      size: null,
      marker: match[0]
    });
  }

  return documents;
};

/**
 * Parse simple folder markers: [[FOLDER:folderId:folderName]]
 */
export const parseSimpleFolderMarkers = (content) => {
  if (!content || typeof content !== 'string') return [];

  const folderRegex = /\[\[FOLDER:([^:\]]+):([^\]]+)\]\]/g;
  const folders = [];
  let match;

  while ((match = folderRegex.exec(content)) !== null) {
    folders.push({
      folderId: match[1],
      folderName: match[2],
      marker: match[0]
    });
  }

  return folders;
};

/**
 * Parse see all markers: [[SEE_ALL:linkText]]
 */
export const parseSeeAllMarkers = (content) => {
  if (!content || typeof content !== 'string') return [];

  const seeAllRegex = /\[\[SEE_ALL:([^\]]+)\]\]/g;
  const seeAlls = [];
  let match;

  while ((match = seeAllRegex.exec(content)) !== null) {
    seeAlls.push({
      linkText: match[1],
      marker: match[0]
    });
  }

  return seeAlls;
};

/**
 * Strip simple markers from content (replace with display name)
 */
export const stripSimpleMarkers = (content) => {
  if (!content || typeof content !== 'string') return content;

  let cleaned = content;
  // [[DOC:id:name]] -> name
  cleaned = cleaned.replace(/\[\[DOC:[^:\]]+:([^\]]+)\]\]/g, '$1');
  // [[FOLDER:id:name]] -> name
  cleaned = cleaned.replace(/\[\[FOLDER:[^:\]]+:([^\]]+)\]\]/g, '$1');
  // [[SEE_ALL:text]] -> text
  cleaned = cleaned.replace(/\[\[SEE_ALL:([^\]]+)\]\]/g, '$1');

  return cleaned;
};

/**
 * ============================================================================
 * LEGACY DOCUMENT MARKERS ({{DOC:::...}})
 * ============================================================================
 */

/**
 * Clean up filename - fix encoding issues and duplicates
 */
const cleanFilename = (raw) => {
  if (!raw) return 'Document';

  let cleaned = raw;

  // Fix common UTF-8 encoding issues (double-encoded Portuguese characters)
  const encodingFixes = {
    'Ã¡': 'á', 'Ã ': 'à', 'Ã£': 'ã', 'Ã¢': 'â',
    'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê',
    'Ã­': 'í', 'Ã¬': 'ì',
    'Ã³': 'ó', 'Ã²': 'ò', 'Ãµ': 'õ', 'Ã´': 'ô',
    'Ãº': 'ú', 'Ã¹': 'ù',
    'Ã§': 'ç',
    'Ã': 'Á', 'Ã€': 'À', 'Ãƒ': 'Ã', 'Ã‚': 'Â',
    'Ã‰': 'É', 'Ãˆ': 'È', 'ÃŠ': 'Ê',
    'ÃŒ': 'Ì', 'Ãš': 'Ú', 'Ã™': 'Ù', 'Ã‡': 'Ç',
    'CapiÌ': 'Capí', // Common issue with "Capítulo"
    'iÌ': 'í',
    'aÌ': 'á',
    'eÌ': 'é',
    'oÌ': 'ó',
    'uÌ': 'ú',
  };

  for (const [wrong, correct] of Object.entries(encodingFixes)) {
    cleaned = cleaned.split(wrong).join(correct);
  }

  // Remove duplicate extensions (e.g., ".pdf.pdf" → ".pdf")
  cleaned = cleaned.replace(/(\.pdf)+$/i, '.pdf');
  cleaned = cleaned.replace(/(\.docx)+$/i, '.docx');
  cleaned = cleaned.replace(/(\.xlsx)+$/i, '.xlsx');
  cleaned = cleaned.replace(/(\.pptx)+$/i, '.pptx');
  cleaned = cleaned.replace(/(\.png)+$/i, '.png');
  cleaned = cleaned.replace(/(\.jpg)+$/i, '.jpg');
  cleaned = cleaned.replace(/(\.jpeg)+$/i, '.jpeg');

  return cleaned.trim();
};

/**
 * Check if content contains inline document markers (legacy format)
 */
export const hasInlineDocuments = (content) => {
  if (!content || typeof content !== 'string') return false;
  return /\{\{DOC:::[\s\S]*?\}\}/g.test(content);
};

/**
 * Parse inline document markers
 * Format: {{DOC:::id:::filename:::mimeType:::fileSize:::folderPath}}
 */
export const parseInlineDocuments = (content) => {
  if (!content || typeof content !== 'string') return [];

  const markerRegex = /\{\{DOC:::([\s\S]*?)\}\}/g;
  const documents = [];
  let match;

  while ((match = markerRegex.exec(content)) !== null) {
    const fullMatch = match[0];
    const innerContent = match[1];
    const fields = innerContent.split(':::');

    const documentId = fields[0] || '';
    const rawFilename = fields[1] ? decodeURIComponent(fields[1]) : 'Document';
    const filename = cleanFilename(rawFilename);  // ✅ Clean up filename
    const mimeType = fields[2] || 'application/octet-stream';
    const sizeStr = fields[3] || '';
    const folderPath = fields[4] ? decodeURIComponent(fields[4]) : '';

    let size = parseInt(sizeStr, 10);
    if (isNaN(size)) size = null;

    documents.push({
      documentId,
      filename,
      documentName: filename,  // ✅ Add documentName for consistency
      mimeType,
      size,
      fileSize: size,
      folderPath: folderPath || null,
      marker: fullMatch
    });
  }

  return documents;
};

/**
 * ============================================================================
 * FOLDER MARKERS (NEW)
 * ============================================================================
 */

/**
 * Check if content contains inline folder markers
 */
export const hasInlineFolders = (content) => {
  if (!content || typeof content !== 'string') return false;
  return /\{\{FOLDER:::[\s\S]*?\}\}/g.test(content);
};

/**
 * Parse inline folder markers
 * Format: {{FOLDER:::id:::folderName:::fileCount:::folderPath}}
 */
export const parseInlineFolders = (content) => {
  if (!content || typeof content !== 'string') return [];

  const folderRegex = /\{\{FOLDER:::([^:]+):::([^:]+):::([^:]+):::([^}]+)\}\}/g;
  const folders = [];
  let match;

  while ((match = folderRegex.exec(content)) !== null) {
    try {
      folders.push({
        folderId: match[1],
        folderName: decodeURIComponent(match[2]),
        fileCount: parseInt(match[3]),
        folderPath: decodeURIComponent(match[4]),
        marker: match[0]
      });
    } catch (error) {
      console.error('Error parsing folder marker:', error, match[0]);
    }
  }

  return folders;
};

/**
 * ============================================================================
 * LOAD MORE MARKERS (NEW)
 * ============================================================================
 */

/**
 * Check if content contains load more markers
 */
export const hasLoadMoreMarkers = (content) => {
  if (!content || typeof content !== 'string') return false;
  return /\{\{LOADMORE:::[\s\S]*?\}\}/g.test(content);
};

/**
 * Parse load more markers
 * Format: {{LOADMORE:::remainingCount:::totalCount:::loadedCount}}
 */
export const parseLoadMoreMarkers = (content) => {
  if (!content || typeof content !== 'string') return [];

  const loadMoreRegex = /\{\{LOADMORE:::(\d+):::(\d+):::(\d+)\}\}/g;
  const loadMoreButtons = [];
  let match;

  while ((match = loadMoreRegex.exec(content)) !== null) {
    try {
      loadMoreButtons.push({
        remainingCount: parseInt(match[1]),
        totalCount: parseInt(match[2]),
        loadedCount: parseInt(match[3]),
        marker: match[0]
      });
    } catch (error) {
      console.error('Error parsing load more marker:', error, match[0]);
    }
  }

  return loadMoreButtons;
};

/**
 * ============================================================================
 * UNIFIED PARSING
 * ============================================================================
 */

/**
 * Check if content has any markers (legacy or new format)
 */
export const hasMarkers = (content) => {
  if (!content || typeof content !== 'string') return false;

  return (
    // Legacy format
    content.includes('{{DOC:::') ||
    content.includes('{{FOLDER:::') ||
    content.includes('{{LOADMORE:::') ||
    // New simple format
    content.includes('[[DOC:') ||
    content.includes('[[FOLDER:') ||
    content.includes('[[SEE_ALL:')
  );
};

/**
 * Parse all marker types at once (legacy + new simple format)
 * Returns object with all parsed markers
 */
export const parseAllMarkers = (content) => {
  // Combine legacy and new format markers
  const legacyDocs = parseInlineDocuments(content);
  const simpleDocs = parseSimpleDocMarkers(content);
  const legacyFolders = parseInlineFolders(content);
  const simpleFolders = parseSimpleFolderMarkers(content);
  const seeAlls = parseSeeAllMarkers(content);

  return {
    documents: [...legacyDocs, ...simpleDocs],
    folders: [...legacyFolders, ...simpleFolders],
    loadMore: parseLoadMoreMarkers(content),
    seeAll: seeAlls
  };
};

/**
 * Get marker count by type
 */
export const getMarkerCounts = (content) => {
  const markers = parseAllMarkers(content);

  return {
    documents: markers.documents.length,
    folders: markers.folders.length,
    loadMore: markers.loadMore.length,
    total: markers.documents.length + markers.folders.length + markers.loadMore.length
  };
};

/**
 * ============================================================================
 * STRIPPING FUNCTIONS
 * ============================================================================
 */

/**
 * Strip document markers from content
 */
export const stripDocumentMarkers = (content) => {
  if (!content || typeof content !== 'string') return content;

  let result = content.replace(/\{\{DOC:::[\s\S]*?\}\}/g, '');
  result = result.replace(/\{\{DOC:::[^\}]*$/g, '');
  result = result.replace(/\{\{DOC:::[^}]*(?![^{]*\}\})/g, (match) => {
    if (!match.includes('}}')) {
      return '';
    }
    return match;
  });

  return result.trim();
};

/**
 * Strip folder markers from content
 */
export const stripFolderMarkers = (content) => {
  if (!content || typeof content !== 'string') return content;
  return content.replace(/\{\{FOLDER:::([^}]+)\}\}/g, '');
};

/**
 * Strip load more markers from content
 */
export const stripLoadMoreMarkers = (content) => {
  if (!content || typeof content !== 'string') return content;
  return content.replace(/\{\{LOADMORE:::([^}]+)\}\}/g, '');
};

/**
 * Strip ALL marker types from content (legacy + new format)
 */
export const stripAllMarkers = (content) => {
  if (!content || typeof content !== 'string') return content;

  let cleaned = content;
  // Legacy format
  cleaned = stripDocumentMarkers(cleaned);
  cleaned = stripFolderMarkers(cleaned);
  cleaned = stripLoadMoreMarkers(cleaned);
  // New simple format
  cleaned = stripSimpleMarkers(cleaned);

  return cleaned.trim();
};

/**
 * Strip ALL document markers (complete or incomplete) from content
 * More aggressive than stripDocumentMarkers
 * Handles both legacy and simple formats
 */
export const stripAllDocumentMarkers = (content) => {
  if (!content || typeof content !== 'string') return content;

  // Legacy format
  let result = content.replace(/\{\{DOC:::[\s\S]*?\}\}/g, '');
  result = result.replace(/\{\{DOC:::[^\n]*/g, '');

  // Simple format - replace with display name
  result = stripSimpleMarkers(result);

  return result.trim();
};

/**
 * ============================================================================
 * CONTENT SPLITTING
 * ============================================================================
 */

/**
 * Helper to strip incomplete markers from text
 */
const stripIncompleteMarkers = (text) => {
  if (!text) return text;
  return text
    // Legacy format incomplete markers
    .replace(/\{\{DOC:::[^\}]*$/g, '')
    .replace(/\{\{DOC:::[^\n]*/g, '')
    .replace(/\{\{FOLDER:::[^\}]*$/g, '')
    .replace(/\{\{LOADMORE:::[^\}]*$/g, '')
    // Simple format incomplete markers
    .replace(/\[\[DOC:[^\]]*$/g, '')
    .replace(/\[\[FOLDER:[^\]]*$/g, '')
    .replace(/\[\[SEE_ALL:[^\]]*$/g, '')
    .trim();
};

/**
 * Split content into text and marker segments
 * Returns array of segments: { type: 'text'|'document'|'folder'|'loadmore'|'seeall', content: string|object }
 */
export const splitContentWithMarkers = (content) => {
  if (!content || typeof content !== 'string') {
    return [{ type: 'text', content: content || '' }];
  }

  if (!hasMarkers(content)) {
    const cleanedContent = stripIncompleteMarkers(content);
    return [{ type: 'text', content: cleanedContent }];
  }

  const markers = parseAllMarkers(content);
  const segments = [];
  let lastIndex = 0;

  // Combine all markers with their types and positions
  const allMarkers = [
    ...markers.documents.map(m => ({ ...m, type: 'document', index: content.indexOf(m.marker) })),
    ...markers.folders.map(m => ({ ...m, type: 'folder', index: content.indexOf(m.marker) })),
    ...markers.loadMore.map(m => ({ ...m, type: 'loadmore', index: content.indexOf(m.marker) })),
    ...markers.seeAll.map(m => ({ ...m, type: 'seeall', index: content.indexOf(m.marker) }))
  ].filter(m => m.index !== -1).sort((a, b) => a.index - b.index);

  // Split content into alternating text and marker segments
  allMarkers.forEach((marker, idx) => {
    // Add text segment before this marker
    if (marker.index > lastIndex) {
      let textContent = content.substring(lastIndex, marker.index).trim();
      textContent = stripIncompleteMarkers(textContent);
      if (textContent) {
        segments.push({
          type: 'text',
          content: textContent
        });
      }
    }

    // Add marker segment
    if (marker.type === 'document') {
      segments.push({
        type: 'document',
        content: {
          documentId: marker.documentId,
          filename: marker.filename,
          documentName: marker.documentName || marker.filename,
          mimeType: marker.mimeType,
          size: marker.size,
          fileSize: marker.fileSize,
          folderPath: marker.folderPath
        }
      });
    } else if (marker.type === 'folder') {
      segments.push({
        type: 'folder',
        content: {
          folderId: marker.folderId,
          folderName: marker.folderName,
          fileCount: marker.fileCount,
          folderPath: marker.folderPath
        }
      });
    } else if (marker.type === 'loadmore') {
      segments.push({
        type: 'loadmore',
        content: {
          remainingCount: marker.remainingCount,
          totalCount: marker.totalCount,
          loadedCount: marker.loadedCount
        }
      });
    } else if (marker.type === 'seeall') {
      segments.push({
        type: 'seeall',
        content: {
          linkText: marker.linkText
        }
      });
    }

    lastIndex = marker.index + marker.marker.length;
  });

  // Add remaining text after last marker
  if (lastIndex < content.length) {
    let textContent = content.substring(lastIndex).trim();
    textContent = stripIncompleteMarkers(textContent);
    if (textContent) {
      segments.push({
        type: 'text',
        content: textContent
      });
    }
  }

  return segments;
};

/**
 * Split content into text and document segments (LEGACY - for backward compatibility)
 */
export const splitTextWithDocuments = (content) => {
  if (!content || typeof content !== 'string') {
    return [{ type: 'text', content: content || '' }];
  }

  if (!hasInlineDocuments(content)) {
    const cleanedContent = stripIncompleteMarkers(content);
    return [{ type: 'text', content: cleanedContent }];
  }

  const documents = parseInlineDocuments(content);
  const segments = [];
  let lastIndex = 0;

  const sortedDocs = documents
    .map(doc => ({
      ...doc,
      index: content.indexOf(doc.marker)
    }))
    .filter(doc => doc.index !== -1)
    .sort((a, b) => a.index - b.index);

  sortedDocs.forEach(doc => {
    if (doc.index > lastIndex) {
      let textContent = content.substring(lastIndex, doc.index).trim();
      textContent = stripIncompleteMarkers(textContent);
      if (textContent) {
        segments.push({
          type: 'text',
          content: textContent
        });
      }
    }

    segments.push({
      type: 'document',
      content: {
        documentId: doc.documentId,
        filename: doc.filename,
        mimeType: doc.mimeType,
        size: doc.size,
        fileSize: doc.fileSize,
        folderPath: doc.folderPath
      }
    });

    lastIndex = doc.index + doc.marker.length;
  });

  if (lastIndex < content.length) {
    let textContent = content.substring(lastIndex).trim();
    textContent = stripIncompleteMarkers(textContent);
    if (textContent) {
      segments.push({
        type: 'text',
        content: textContent
      });
    }
  }

  return segments;
};

/**
 * ============================================================================
 * UTILITIES
 * ============================================================================
 */

/**
 * Format file size for display
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default {
  // Document listing format (NEW - from kodaMarkdownEngine)
  hasDocumentListingFormat,
  parseDocumentListingFormat,
  hasLoadMoreComment,
  parseLoadMoreComment,
  stripLoadMoreComment,

  // Simple markers (NEW - [[DOC:]], [[FOLDER:]], [[SEE_ALL:]])
  hasSimpleMarkers,
  parseSimpleDocMarkers,
  parseSimpleFolderMarkers,
  parseSeeAllMarkers,
  stripSimpleMarkers,

  // Legacy document parsing ({{DOC:::...}})
  hasInlineDocuments,
  parseInlineDocuments,
  stripDocumentMarkers,
  stripAllDocumentMarkers,

  // Legacy folder parsing ({{FOLDER:::...}})
  hasInlineFolders,
  parseInlineFolders,
  stripFolderMarkers,

  // Load more parsing ({{LOADMORE:::...}})
  hasLoadMoreMarkers,
  parseLoadMoreMarkers,
  stripLoadMoreMarkers,

  // Unified parsing (all formats)
  hasMarkers,
  parseAllMarkers,
  getMarkerCounts,
  stripAllMarkers,
  splitContentWithMarkers,

  // Legacy compatibility
  splitTextWithDocuments,

  // Utilities
  formatFileSize
};
