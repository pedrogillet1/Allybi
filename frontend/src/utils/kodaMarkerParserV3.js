/**
 * Koda Marker Parser V3 - Frontend
 *
 * Parses unified marker format from backend:
 * {{DOC::id=docId::name="filename"::ctx=text}}
 * {{CITE::id=docId::doc="filename"::page=1::chunk=chunkId}}
 * {{LOAD_MORE::total=50::shown=10::remaining=40}}
 *
 * Streaming-safe: handles incomplete markers gracefully
 */

/**
 * Decode marker value (matches backend encoding)
 */
export function decodeMarkerValue(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

/**
 * Parse document marker
 * Returns null if invalid or incomplete
 */
export function parseDocMarker(marker) {
  // Match: {{DOC::id=...::name="..."::ctx=...}}
  const regex = /^{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}$/;
  const match = marker.match(regex);

  if (!match) {
    return null;
  }

  return {
    type: 'doc',
    id: match[1],
    name: decodeMarkerValue(match[2]),
    ctx: match[3],
  };
}

/**
 * Parse citation marker
 * Returns null if invalid or incomplete
 */
export function parseCiteMarker(marker) {
  // Match: {{CITE::id=...::doc="..."[::page=...][::chunk=...]}}
  const regex = /^{{CITE::id=([^:]+)::doc="([^"]+)"(?:::page=(\d+))?(?:::chunk=([^}]+))?}}$/;
  const match = marker.match(regex);

  if (!match) {
    return null;
  }

  const result = {
    type: 'cite',
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
 * Parse load more marker
 * Returns null if invalid or incomplete
 */
export function parseLoadMoreMarker(marker) {
  // Match: {{LOAD_MORE::total=...::shown=...::remaining=...}}
  const regex = /^{{LOAD_MORE::total=(\d+)::shown=(\d+)::remaining=(\d+)}}$/;
  const match = marker.match(regex);

  if (!match) {
    return null;
  }

  return {
    type: 'load_more',
    total: parseInt(match[1], 10),
    shown: parseInt(match[2], 10),
    remaining: parseInt(match[3], 10),
  };
}

/**
 * Check if marker is complete
 * Useful for streaming: don't render incomplete markers
 */
export function isCompleteMarker(text) {
  if (!text.startsWith('{{')) {
    return false;
  }

  return text.endsWith('}}');
}

/**
 * Parse text into parts (text + markers)
 * Streaming-safe: treats incomplete markers as plain text
 */
export function parseTextWithMarkers(text) {
  const parts = [];

  // Regex to match complete markers only (DOC, CITE, LOAD_MORE)
  const markerRegex = /{{(DOC|CITE|LOAD_MORE)::[^}]+}}/g;

  let lastIndex = 0;
  let match;

  while ((match = markerRegex.exec(text)) !== null) {
    // Add text before marker
    if (match.index > lastIndex) {
      const textPart = text.slice(lastIndex, match.index);
      if (textPart) {
        parts.push({
          type: 'text',
          value: textPart,
        });
      }
    }

    // Parse and add marker
    const markerText = match[0];
    let parsed = null;

    if (markerText.startsWith('{{DOC::')) {
      parsed = parseDocMarker(markerText);
    } else if (markerText.startsWith('{{CITE::')) {
      parsed = parseCiteMarker(markerText);
    } else if (markerText.startsWith('{{LOAD_MORE::')) {
      parsed = parseLoadMoreMarker(markerText);
    }

    if (parsed) {
      parts.push(parsed);
    } else {
      // Invalid marker - treat as text
      parts.push({
        type: 'text',
        value: markerText,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textPart = text.slice(lastIndex);
    if (textPart) {
      parts.push({
        type: 'text',
        value: textPart,
      });
    }
  }

  return parts;
}

/**
 * Streaming-safe parser with holdback
 * Holds back last N characters to avoid rendering incomplete markers
 */
export function parseWithHoldback(text, holdbackChars = 50) {
  if (text.length < holdbackChars) {
    // Not enough text to hold back, treat all as text
    return {
      parts: [{ type: 'text', value: text }],
      heldBack: '',
    };
  }

  // Check if there's a potential incomplete marker in the last N chars
  const lastPart = text.slice(-holdbackChars);
  const hasOpenMarker = lastPart.includes('{{') && !lastPart.includes('}}');

  if (hasOpenMarker) {
    // Find the last complete marker boundary
    const lastCompleteIndex = text.lastIndexOf('}}');

    if (lastCompleteIndex === -1) {
      // No complete markers yet, hold everything
      return {
        parts: [],
        heldBack: text,
      };
    }

    // Parse up to last complete marker
    const safePart = text.slice(0, lastCompleteIndex + 2);
    const heldBack = text.slice(lastCompleteIndex + 2);

    return {
      parts: parseTextWithMarkers(safePart),
      heldBack,
    };
  }

  // No incomplete markers, parse everything
  return {
    parts: parseTextWithMarkers(text),
    heldBack: '',
  };
}

/**
 * Extract all document IDs from text
 * Extracts from both DOC:: and CITE:: markers
 */
export function extractDocumentIds(text) {
  const ids = new Set();

  // Extract from DOC markers
  const docRegex = /{{DOC::id=([^:]+)::/g;
  let match;
  while ((match = docRegex.exec(text)) !== null) {
    ids.add(match[1]);
  }

  // Extract from CITE markers
  const citeRegex = /{{CITE::id=([^:]+)::/g;
  while ((match = citeRegex.exec(text)) !== null) {
    ids.add(match[1]);
  }

  return Array.from(ids);
}

/**
 * Count markers in text
 */
export function countMarkers(text) {
  const docCount = (text.match(/{{DOC::/g) || []).length;
  const citeCount = (text.match(/{{CITE::/g) || []).length;
  const loadMoreCount = (text.match(/{{LOAD_MORE::/g) || []).length;

  return {
    doc: docCount,
    cite: citeCount,
    loadMore: loadMoreCount,
    total: docCount + citeCount + loadMoreCount,
  };
}

/**
 * Strip all markers from text (for copy/paste)
 */
export function stripMarkers(text) {
  return text.replace(/{{(DOC|CITE|LOAD_MORE)::[^}]+}}/g, (match) => {
    // For DOC markers, extract and return just the filename
    const docParsed = parseDocMarker(match);
    if (docParsed) {
      return docParsed.name;
    }

    // For CITE markers, extract and return just the doc name
    const citeParsed = parseCiteMarker(match);
    if (citeParsed) {
      return citeParsed.doc;
    }

    // For LOAD_MORE markers, return empty
    return '';
  });
}

/**
 * Check if text contains any markers
 */
export function containsMarkers(text) {
  return /{{(DOC|CITE|LOAD_MORE)::[^}]+}}/.test(text);
}

/**
 * Check if text has incomplete markers (for streaming detection)
 */
export function hasIncompleteMarkers(text) {
  const openCount = (text.match(/{{/g) || []).length;
  const closeCount = (text.match(/}}/g) || []).length;
  return openCount > closeCount;
}

export default {
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,
  isCompleteMarker,
  parseTextWithMarkers,
  parseWithHoldback,
  extractDocumentIds,
  countMarkers,
  stripMarkers,
  containsMarkers,
  hasIncompleteMarkers,
  decodeMarkerValue,
};
