/**
 * Marker Utilities - Production V3
 *
 * Unified marker format for backend/frontend contract:
 * {{DOC::id=docId::name="filename"::ctx=text}}
 * {{CITE::id=docId::doc="filename"::page=1::chunk=chunkId}}
 * {{LOAD_MORE::total=50::shown=10::remaining=40}}
 *
 * Rules:
 * - Markdown-safe (no < > angle brackets)
 * - Deterministic regex parsing
 * - Survives streaming chunk boundaries
 * - Safe encoding for special characters
 */

// ============================================================================
// MARKER DATA INTERFACES
// ============================================================================

export interface DocMarkerData {
  id: string;
  name: string;
  ctx: 'list' | 'text';
}

export interface CiteMarkerData {
  id: string;           // Document ID
  doc: string;          // Document filename
  page?: number;        // Page number (if applicable)
  chunk?: string;       // Chunk ID for precise citation
}

export interface LoadMoreMarkerData {
  total: number;
  shown: number;
  remaining: number;
}

export type MarkerData = DocMarkerData | CiteMarkerData | LoadMoreMarkerData;

// ============================================================================
// ENCODING / DECODING
// ============================================================================

/**
 * Encode a string value for use in marker
 * Handles quotes, colons, and special characters
 */
export function encodeMarkerValue(value: string): string {
  // URL encode to handle all special characters safely
  return encodeURIComponent(value);
}

/**
 * Decode a marker value
 */
export function decodeMarkerValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    // Fallback to original if decode fails
    return value;
  }
}

// ============================================================================
// MARKER CREATION
// ============================================================================

/**
 * Create a document marker
 * Format: {{DOC::id=docId::name="filename"::ctx=text}}
 */
export function createDocMarker(data: DocMarkerData): string {
  const encodedName = encodeMarkerValue(data.name);
  return `{{DOC::id=${data.id}::name="${encodedName}"::ctx=${data.ctx}}}`;
}

/**
 * Create a citation marker
 * Format: {{CITE::id=docId::doc="filename"::page=1::chunk=chunkId}}
 */
export function createCiteMarker(data: CiteMarkerData): string {
  const encodedDoc = encodeMarkerValue(data.doc);
  let marker = `{{CITE::id=${data.id}::doc="${encodedDoc}"`;

  if (data.page !== undefined) {
    marker += `::page=${data.page}`;
  }

  if (data.chunk) {
    marker += `::chunk=${data.chunk}`;
  }

  marker += '}}';
  return marker;
}

/**
 * Create a load more marker
 * Format: {{LOAD_MORE::total=50::shown=10::remaining=40}}
 */
export function createLoadMoreMarker(data: LoadMoreMarkerData): string {
  return `{{LOAD_MORE::total=${data.total}::shown=${data.shown}::remaining=${data.remaining}}}`;
}

// ============================================================================
// MARKER PARSING
// ============================================================================

/**
 * Parse a document marker
 * Returns null if invalid
 */
export function parseDocMarker(marker: string): DocMarkerData | null {
  // Match: {{DOC::id=...::name="..."::ctx=...}}
  const regex = /^{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}$/;
  const match = marker.match(regex);

  if (!match) {
    return null;
  }

  return {
    id: match[1],
    name: decodeMarkerValue(match[2]),
    ctx: match[3] as 'list' | 'text',
  };
}

/**
 * Parse a citation marker
 * Returns null if invalid
 */
export function parseCiteMarker(marker: string): CiteMarkerData | null {
  // Match: {{CITE::id=...::doc="..."[::page=...][::chunk=...]}}
  const regex = /^{{CITE::id=([^:]+)::doc="([^"]+)"(?:::page=(\d+))?(?:::chunk=([^}]+))?}}$/;
  const match = marker.match(regex);

  if (!match) {
    return null;
  }

  const result: CiteMarkerData = {
    id: match[1],
    doc: decodeMarkerValue(match[2]),
  };

  if (match[3]) {
    result.page = parseInt(match[3], 10);
  }

  if (match[4]) {
    result.chunk = match[4];
  }

  return result;
}

/**
 * Parse a load more marker
 * Returns null if invalid
 */
export function parseLoadMoreMarker(marker: string): LoadMoreMarkerData | null {
  // Match: {{LOAD_MORE::total=...::shown=...::remaining=...}}
  const regex = /^{{LOAD_MORE::total=(\d+)::shown=(\d+)::remaining=(\d+)}}$/;
  const match = marker.match(regex);

  if (!match) {
    return null;
  }

  return {
    total: parseInt(match[1], 10),
    shown: parseInt(match[2], 10),
    remaining: parseInt(match[3], 10),
  };
}

// ============================================================================
// MARKER DETECTION
// ============================================================================

/**
 * Check if a string contains any markers
 */
export function containsMarkers(text: string): boolean {
  return /{{(DOC|CITE|LOAD_MORE)::[^}]+}}/.test(text);
}

/**
 * Check if a string has incomplete markers
 * (useful for streaming detection)
 */
export function hasIncompleteMarkers(text: string): boolean {
  // Check for opening {{ without closing }}
  const openCount = (text.match(/{{/g) || []).length;
  const closeCount = (text.match(/}}/g) || []).length;

  return openCount > closeCount;
}

/**
 * Extract all markers from text
 * Returns array of marker strings
 */
export function extractMarkers(text: string): string[] {
  const regex = /{{(DOC|CITE|LOAD_MORE)::[^}]+}}/g;
  return text.match(regex) || [];
}

/**
 * Validate that a marker is complete and parseable
 */
export function isValidMarker(marker: string): boolean {
  if (marker.startsWith('{{DOC::')) {
    return parseDocMarker(marker) !== null;
  }

  if (marker.startsWith('{{CITE::')) {
    return parseCiteMarker(marker) !== null;
  }

  if (marker.startsWith('{{LOAD_MORE::')) {
    return parseLoadMoreMarker(marker) !== null;
  }

  return false;
}

// ============================================================================
// MARKER MANIPULATION
// ============================================================================

/**
 * Strip all markers from text
 * Useful for plain text export
 */
export function stripMarkers(text: string): string {
  return text.replace(/{{(DOC|CITE|LOAD_MORE)::[^}]+}}/g, (match) => {
    // For DOC markers, extract and return just the filename
    const docData = parseDocMarker(match);
    if (docData) {
      return docData.name;
    }

    // For CITE markers, extract and return just the doc name
    const citeData = parseCiteMarker(match);
    if (citeData) {
      return citeData.doc;
    }

    // For LOAD_MORE markers, return empty string
    return '';
  });
}

/**
 * Count markers in text
 */
export function countMarkers(text: string): { doc: number; cite: number; loadMore: number; total: number } {
  const markers = extractMarkers(text);

  const doc = markers.filter(m => m.startsWith('{{DOC::')).length;
  const cite = markers.filter(m => m.startsWith('{{CITE::')).length;
  const loadMore = markers.filter(m => m.startsWith('{{LOAD_MORE::')).length;

  return {
    doc,
    cite,
    loadMore,
    total: doc + cite + loadMore,
  };
}

// ============================================================================
// MARKER LOCATION VALIDATION
// ============================================================================

/**
 * Validate markers are not in unsafe locations
 * Returns array of issues found
 */
export function validateMarkerLocations(text: string): string[] {
  const issues: string[] = [];

  // Check for markers inside code blocks
  const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
  for (const block of codeBlocks) {
    if (containsMarkers(block)) {
      issues.push('Marker found inside code block');
    }
  }

  // Check for markers inside inline code
  const inlineCode = text.match(/`[^`]+`/g) || [];
  for (const code of inlineCode) {
    if (containsMarkers(code)) {
      issues.push('Marker found inside inline code');
    }
  }

  // Check for markers inside URLs
  const urls = text.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  for (const url of urls) {
    if (containsMarkers(url)) {
      issues.push('Marker found inside markdown link');
    }
  }

  return issues;
}

/**
 * Get safe insertion points for markers
 * Returns indices where markers can be safely inserted
 * (not inside code blocks, inline code, or URLs)
 */
export function getSafeInsertionPoints(text: string): number[] {
  const unsafe: Array<[number, number]> = [];

  // Mark code blocks as unsafe
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    unsafe.push([match.index, match.index + match[0].length]);
  }

  // Mark inline code as unsafe
  const inlineCodeRegex = /`[^`]+`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    unsafe.push([match.index, match.index + match[0].length]);
  }

  // Mark URLs as unsafe
  const urlRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = urlRegex.exec(text)) !== null) {
    unsafe.push([match.index, match.index + match[0].length]);
  }

  // Find safe points (not in any unsafe range)
  const safePoints: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const isSafe = !unsafe.some(([start, end]) => i >= start && i < end);
    if (isSafe) {
      safePoints.push(i);
    }
  }

  return safePoints;
}

// ============================================================================
// STREAMING MARKER BUFFER
// ============================================================================

/**
 * StreamingMarkerBuffer handles incomplete markers across chunk boundaries.
 *
 * When streaming text that contains markers, a marker may be split across
 * multiple chunks (e.g., "{{DOC:" in one chunk and "id=123::name...}}" in the next).
 *
 * This buffer holds back potentially incomplete markers until they're complete
 * or confirmed to not be markers.
 *
 * Usage:
 *   const buffer = new StreamingMarkerBuffer();
 *   for (const chunk of streamChunks) {
 *     const safeText = buffer.append(chunk);
 *     emit(safeText);  // Safe to display
 *   }
 *   emit(buffer.flush());  // Emit any remaining content
 */
export class StreamingMarkerBuffer {
  private buffer: string = '';

  // Minimum holdback to detect potential marker start
  private static readonly MARKER_PREFIX_PATTERN = /{{[A-Z_]*:?:?[^}]*$/;

  // Maximum marker length (prevents unbounded buffering)
  private static readonly MAX_MARKER_LENGTH = 200;

  /**
   * Append a chunk to the buffer and return safe-to-emit text.
   * Text returned is guaranteed not to contain incomplete markers.
   */
  append(chunk: string): string {
    this.buffer += chunk;

    // Find the safe emission point
    const safePoint = this.findSafeEmitPoint();

    if (safePoint === 0) {
      return '';
    }

    const safeText = this.buffer.slice(0, safePoint);
    this.buffer = this.buffer.slice(safePoint);

    return safeText;
  }

  /**
   * Flush remaining buffer content.
   * Call this when the stream ends.
   */
  flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    return remaining;
  }

  /**
   * Check if buffer has any pending content.
   */
  hasPending(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Get pending buffer length.
   */
  getPendingLength(): number {
    return this.buffer.length;
  }

  /**
   * Find the safe point to emit text (avoiding incomplete markers).
   */
  private findSafeEmitPoint(): number {
    // Look for potential incomplete marker at the end of buffer
    const match = this.buffer.match(StreamingMarkerBuffer.MARKER_PREFIX_PATTERN);

    if (!match) {
      // No potential marker prefix found - entire buffer is safe
      return this.buffer.length;
    }

    const prefixStart = match.index!;
    const potentialMarker = this.buffer.slice(prefixStart);

    // If the potential marker is too long, it's probably not a real marker
    // Emit everything except the last few characters that could be a new marker start
    if (potentialMarker.length > StreamingMarkerBuffer.MAX_MARKER_LENGTH) {
      // Find if there's a more recent "{{" in the buffer
      const lastOpen = this.buffer.lastIndexOf('{{');
      if (lastOpen > prefixStart) {
        return lastOpen;
      }
      // Otherwise emit most of the buffer, keeping only the last 2 chars
      return Math.max(0, this.buffer.length - 2);
    }

    // Check if we have a complete marker
    if (potentialMarker.includes('}}')) {
      // Marker is complete - find end of marker and emit up to that point
      const closeIndex = this.buffer.indexOf('}}', prefixStart);
      return closeIndex + 2;
    }

    // Incomplete marker - emit everything before it
    return prefixStart;
  }

  /**
   * Reset the buffer.
   */
  reset(): void {
    this.buffer = '';
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Encoding/decoding
  encodeMarkerValue,
  decodeMarkerValue,

  // Creation
  createDocMarker,
  createCiteMarker,
  createLoadMoreMarker,

  // Parsing
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,

  // Detection
  containsMarkers,
  hasIncompleteMarkers,
  extractMarkers,
  isValidMarker,

  // Manipulation
  stripMarkers,
  countMarkers,

  // Validation
  validateMarkerLocations,
  getSafeInsertionPoints,

  // Streaming
  StreamingMarkerBuffer,
};
