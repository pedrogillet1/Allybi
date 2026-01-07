/**
 * Inline Document Parser
 *
 * Parses legacy and current document marker formats from chat responses.
 * Supports multiple marker formats for backward compatibility.
 */

// Legacy format: [DOC:id:filename]
const LEGACY_DOC_REGEX = /\[DOC:([^:]+):([^\]]+)\]/g;

// Simple format: {{DOC:id:filename}} or {{DOC::id::filename}} (both supported)
// Updated: Allow both UUID format AND special action words (browse, upload, etc.)
const SIMPLE_DOC_REGEX = /{{DOC::?([a-f0-9-]+|browse|upload)::?([^}]+)}}/g;

// V3 format: {{DOC::id=xxx::name="yyy"::ctx=zzz}}
const V3_DOC_REGEX = /{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}/g;

// Test-only regexes (without 'g' flag to avoid state issues)
const LEGACY_DOC_TEST = /\[DOC:([^:]+):([^\]]+)\]/;
const SIMPLE_DOC_TEST = /{{DOC::?([a-f0-9-]+|browse|upload)::?([^}]+)}}/;
const V3_DOC_TEST = /{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}/;

// Folder format: {{FOLDER:id:name}}
const FOLDER_REGEX = /{{FOLDER:([^:}]+):([^}]+)}}/g;
const FOLDER_TEST = /{{FOLDER:([^:}]+):([^}]+)}}/;

// Load more format: {{LOAD_MORE:total:shown:remaining}}
const LOAD_MORE_REGEX = /{{LOAD_MORE:(\d+):(\d+):(\d+)}}/g;
const LOAD_MORE_TEST = /{{LOAD_MORE:(\d+):(\d+):(\d+)}}/;

// V3 Load more: {{LOAD_MORE::total=X::shown=Y::remaining=Z}}
const V3_LOAD_MORE_REGEX = /{{LOAD_MORE::total=(\d+)::shown=(\d+)::remaining=(\d+)}}/g;
const V3_LOAD_MORE_TEST = /{{LOAD_MORE::total=(\d+)::shown=(\d+)::remaining=(\d+)}}/;

// See all format: {{SEE_ALL:count}}
const SEE_ALL_REGEX = /{{SEE_ALL:(\d+)}}/g;
const SEE_ALL_TEST = /{{SEE_ALL:(\d+)}}/;

// Document listing format (from kodaMarkdownEngine)
const DOC_LISTING_REGEX = /<!-- DOC_LIST_START -->([\s\S]*?)<!-- DOC_LIST_END -->/g;
const LOAD_MORE_COMMENT_REGEX = /<!-- LOAD_MORE: (\d+) more documents -->/g;

/**
 * Check if text has any inline document markers
 */
export function hasInlineDocuments(text) {
  if (!text) return false;
  // Use test-only regexes (without 'g' flag) to avoid state issues
  return LEGACY_DOC_TEST.test(text) ||
         SIMPLE_DOC_TEST.test(text) ||
         V3_DOC_TEST.test(text);
}

/**
 * Check if text has any markers (docs, folders, load more)
 */
export function hasMarkers(text) {
  if (!text) return false;
  // Use test-only regexes (without 'g' flag) to avoid state issues
  return hasInlineDocuments(text) ||
         FOLDER_TEST.test(text) ||
         LOAD_MORE_TEST.test(text) ||
         V3_LOAD_MORE_TEST.test(text) ||
         SEE_ALL_TEST.test(text);
}

/**
 * Check if text has simple markers (non-V3)
 */
export function hasSimpleMarkers(text) {
  if (!text) return false;
  // Use test-only regexes (without 'g' flag) to avoid state issues
  return SIMPLE_DOC_TEST.test(text) || LEGACY_DOC_TEST.test(text);
}

/**
 * Check if text has document listing format
 */
export function hasDocumentListingFormat(text) {
  if (!text) return false;
  return DOC_LISTING_REGEX.test(text);
}

/**
 * Parse inline documents from text
 */
export function parseInlineDocuments(text) {
  if (!text) return [];
  const documents = [];

  // Parse V3 format first
  let match;
  const v3Regex = new RegExp(V3_DOC_REGEX.source, 'g');
  while ((match = v3Regex.exec(text)) !== null) {
    documents.push({
      id: match[1],
      name: decodeURIComponent(match[2]),
      ctx: match[3],
      format: 'v3',
      fullMatch: match[0]
    });
  }

  // Parse simple format
  const simpleRegex = new RegExp(SIMPLE_DOC_REGEX.source, 'g');
  while ((match = simpleRegex.exec(text)) !== null) {
    documents.push({
      id: match[1],
      name: match[2],
      format: 'simple',
      fullMatch: match[0]
    });
  }

  // Parse legacy format
  const legacyRegex = new RegExp(LEGACY_DOC_REGEX.source, 'g');
  while ((match = legacyRegex.exec(text)) !== null) {
    documents.push({
      id: match[1],
      name: match[2],
      format: 'legacy',
      fullMatch: match[0]
    });
  }

  return documents;
}

/**
 * Parse simple doc markers only
 */
export function parseSimpleDocMarkers(text) {
  if (!text) return [];
  const documents = [];
  let match;
  const regex = new RegExp(SIMPLE_DOC_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    documents.push({
      id: match[1],
      name: match[2],
      fullMatch: match[0]
    });
  }
  return documents;
}

/**
 * Parse inline folders from text
 */
export function parseInlineFolders(text) {
  if (!text) return [];
  const folders = [];
  let match;
  const regex = new RegExp(FOLDER_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    folders.push({
      id: match[1],
      name: match[2],
      fullMatch: match[0]
    });
  }
  return folders;
}

/**
 * Parse load more markers from text
 */
export function parseLoadMoreMarkers(text) {
  if (!text) return [];
  const markers = [];
  let match;

  // V3 format
  const v3Regex = new RegExp(V3_LOAD_MORE_REGEX.source, 'g');
  while ((match = v3Regex.exec(text)) !== null) {
    markers.push({
      total: parseInt(match[1], 10),
      shown: parseInt(match[2], 10),
      remaining: parseInt(match[3], 10),
      format: 'v3',
      fullMatch: match[0]
    });
  }

  // Legacy format
  const legacyRegex = new RegExp(LOAD_MORE_REGEX.source, 'g');
  while ((match = legacyRegex.exec(text)) !== null) {
    markers.push({
      total: parseInt(match[1], 10),
      shown: parseInt(match[2], 10),
      remaining: parseInt(match[3], 10),
      format: 'legacy',
      fullMatch: match[0]
    });
  }

  return markers;
}

/**
 * Parse see all markers from text
 */
export function parseSeeAllMarkers(text) {
  if (!text) return [];
  const markers = [];
  let match;
  const regex = new RegExp(SEE_ALL_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    markers.push({
      count: parseInt(match[1], 10),
      fullMatch: match[0]
    });
  }
  return markers;
}

/**
 * Parse all markers from text
 */
export function parseAllMarkers(text) {
  return {
    documents: parseInlineDocuments(text),
    folders: parseInlineFolders(text),
    loadMore: parseLoadMoreMarkers(text),
    seeAll: parseSeeAllMarkers(text)
  };
}

/**
 * Parse document listing format
 */
export function parseDocumentListingFormat(text) {
  if (!text) return null;
  const match = DOC_LISTING_REGEX.exec(text);
  if (!match) return null;
  return {
    content: match[1],
    fullMatch: match[0]
  };
}

/**
 * Parse load more comment
 */
export function parseLoadMoreComment(text) {
  if (!text) return null;
  const match = LOAD_MORE_COMMENT_REGEX.exec(text);
  if (!match) return null;
  return {
    count: parseInt(match[1], 10),
    fullMatch: match[0]
  };
}

/**
 * Split text into parts with document markers
 */
export function splitTextWithDocuments(text) {
  if (!text) return [{ type: 'text', value: text }];

  const parts = [];
  // Updated: Include simple double-colon format with browse|upload support
  const allMarkerRegex = /{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}|{{DOC::([a-f0-9-]+|browse|upload)::([^}]+)}}|{{DOC:([^:}]+):([^}]+)}}|\[DOC:([^:]+):([^\]]+)\]/g;

  let lastIndex = 0;
  let match;

  while ((match = allMarkerRegex.exec(text)) !== null) {
    // Add text before marker
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: text.slice(lastIndex, match.index)
      });
    }

    // Add document marker
    if (match[1]) {
      // V3 format: {{DOC::id=xxx::name="yyy"::ctx=zzz}}
      parts.push({
        type: 'document',
        id: match[1],
        name: decodeURIComponent(match[2]),
        ctx: match[3]
      });
    } else if (match[4]) {
      // Simple double-colon format: {{DOC::uuid::filename}} or {{DOC::browse::text}}
      parts.push({
        type: 'document',
        id: match[4],
        name: match[5]
      });
    } else if (match[6]) {
      // Simple single-colon format: {{DOC:uuid:filename}}
      parts.push({
        type: 'document',
        id: match[6],
        name: match[7]
      });
    } else if (match[8]) {
      // Legacy format: [DOC:uuid:filename]
      parts.push({
        type: 'document',
        id: match[8],
        name: match[9]
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      value: text.slice(lastIndex)
    });
  }

  return parts;
}

/**
 * Split content with all marker types
 */
export function splitContentWithMarkers(text) {
  if (!text) return [{ type: 'text', value: text }];

  const parts = [];
  // Match all marker formats:
  // 1. V3 format: {{DOC::id=xxx::name="yyy"::ctx=zzz}}
  // 2. Simple double-colon format: {{DOC::uuid::filename}}
  // 3. Simple single-colon format: {{DOC:uuid:filename}}
  // 4. Legacy format: [DOC:uuid:filename]
  // 5. Folder, LoadMore, SeeAll markers
  // Updated: Allow browse|upload in simple double-colon format
  const allRegex = /{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}|{{DOC::([a-f0-9-]+|browse|upload)::([^}]+)}}|{{DOC:([^:}]+):([^}]+)}}|\[DOC:([^:]+):([^\]]+)\]|{{FOLDER:([^:}]+):([^}]+)}}|{{LOAD_MORE::total=(\d+)::shown=(\d+)::remaining=(\d+)}}|{{LOAD_MORE:(\d+):(\d+):(\d+)}}|{{SEE_ALL:(\d+)}}/g;

  let lastIndex = 0;
  let match;

  while ((match = allRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: text.slice(lastIndex, match.index)
      });
    }

    if (match[1]) {
      // V3 format: {{DOC::id=xxx::name="yyy"::ctx=zzz}}
      parts.push({ type: 'document', id: match[1], name: decodeURIComponent(match[2]), ctx: match[3] });
    } else if (match[4]) {
      // Simple double-colon format: {{DOC::uuid::filename}}
      parts.push({ type: 'document', id: match[4], name: match[5] });
    } else if (match[6]) {
      // Simple single-colon format: {{DOC:uuid:filename}}
      parts.push({ type: 'document', id: match[6], name: match[7] });
    } else if (match[8]) {
      // Legacy format: [DOC:uuid:filename]
      parts.push({ type: 'document', id: match[8], name: match[9] });
    } else if (match[10]) {
      // Folder: {{FOLDER:id:name}}
      parts.push({ type: 'folder', id: match[10], name: match[11] });
    } else if (match[12]) {
      // V3 LoadMore: {{LOAD_MORE::total=X::shown=Y::remaining=Z}}
      parts.push({ type: 'loadMore', total: +match[12], shown: +match[13], remaining: +match[14] });
    } else if (match[15]) {
      // Legacy LoadMore: {{LOAD_MORE:X:Y:Z}}
      parts.push({ type: 'loadMore', total: +match[15], shown: +match[16], remaining: +match[17] });
    } else if (match[18]) {
      // SeeAll: {{SEE_ALL:count}}
      parts.push({ type: 'seeAll', count: +match[18] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}

/**
 * Strip all document markers from text
 */
export function stripAllDocumentMarkers(text) {
  if (!text) return text;
  return text
    .replace(V3_DOC_REGEX, '')
    .replace(SIMPLE_DOC_REGEX, '')
    .replace(LEGACY_DOC_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Strip simple markers from text
 */
export function stripSimpleMarkers(text) {
  if (!text) return text;
  return text
    .replace(SIMPLE_DOC_REGEX, '')
    .replace(LEGACY_DOC_REGEX, '')
    .trim();
}

/**
 * Strip load more comment from text
 */
export function stripLoadMoreComment(text) {
  if (!text) return text;
  return text.replace(LOAD_MORE_COMMENT_REGEX, '').trim();
}

export default {
  hasInlineDocuments,
  hasMarkers,
  hasSimpleMarkers,
  hasDocumentListingFormat,
  parseInlineDocuments,
  parseSimpleDocMarkers,
  parseInlineFolders,
  parseLoadMoreMarkers,
  parseSeeAllMarkers,
  parseAllMarkers,
  parseDocumentListingFormat,
  parseLoadMoreComment,
  splitTextWithDocuments,
  splitContentWithMarkers,
  stripAllDocumentMarkers,
  stripSimpleMarkers,
  stripLoadMoreComment
};
