/**
 * Koda Marker Parser
 *
 * Re-exports from kodaMarkerParserV3 for backward compatibility.
 * Uses the unified V3 marker format:
 * - {{DOC::id=xxx::name="yyy"::ctx=zzz}}
 * - {{CITE::id=xxx::doc="yyy"::page=z::chunk=chunkId}}
 * - {{LOAD_MORE::total=X::shown=Y::remaining=Z}}
 */

import {
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,
  parseTextWithMarkers,
  countMarkers,
  extractDocumentIds,
  stripMarkers,
  containsMarkers,
  hasIncompleteMarkers,
  decodeMarkerValue
} from './kodaMarkerParserV3';

// V3 format regex
const V3_DOC_REGEX = /{{DOC::id=([^:]+)::name="([^"]+)"::ctx=(list|text)}}/g;
const V3_CITE_REGEX = /{{CITE::id=([^:]+)::doc="([^"]+)"(?:::page=(\d+))?(?:::chunk=([^}]+))?}}/g;
const V3_LOAD_MORE_REGEX = /{{LOAD_MORE::total=(\d+)::shown=(\d+)::remaining=(\d+)}}/g;

/**
 * Check if text has V3 markers
 */
export function hasMarkers(text) {
  if (!text) return false;
  return /{{(DOC|CITE|LOAD_MORE)::/g.test(text);
}

/**
 * Parse document markers from text
 */
export function parseDocumentMarkers(text) {
  if (!text) return [];
  const markers = [];
  let match;
  const regex = new RegExp(V3_DOC_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    markers.push({
      type: 'doc',
      id: match[1],
      name: decodeMarkerValue(match[2]),
      ctx: match[3],
      fullMatch: match[0]
    });
  }

  return markers;
}

/**
 * Parse citation markers from text
 */
export function parseCitationMarkers(text) {
  if (!text) return [];
  const markers = [];
  let match;
  const regex = new RegExp(V3_CITE_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    const marker = {
      type: 'cite',
      id: match[1],
      doc: decodeMarkerValue(match[2]),
      fullMatch: match[0]
    };

    if (match[3]) {
      marker.page = parseInt(match[3], 10);
    }

    if (match[4]) {
      marker.chunk = match[4];
    }

    markers.push(marker);
  }

  return markers;
}

/**
 * Parse load more markers from text
 */
export function parseLoadMoreMarkers(text) {
  if (!text) return [];
  const markers = [];
  let match;
  const regex = new RegExp(V3_LOAD_MORE_REGEX.source, 'g');

  while ((match = regex.exec(text)) !== null) {
    markers.push({
      type: 'load_more',
      total: parseInt(match[1], 10),
      shown: parseInt(match[2], 10),
      remaining: parseInt(match[3], 10),
      fullMatch: match[0]
    });
  }

  return markers;
}

// Re-export V3 functions
export {
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,
  parseTextWithMarkers,
  countMarkers,
  extractDocumentIds,
  stripMarkers,
  containsMarkers,
  hasIncompleteMarkers,
  decodeMarkerValue
};

export default {
  hasMarkers,
  parseDocumentMarkers,
  parseCitationMarkers,
  parseLoadMoreMarkers,
  parseDocMarker,
  parseCiteMarker,
  parseLoadMoreMarker,
  parseTextWithMarkers,
  countMarkers,
  extractDocumentIds,
  stripMarkers,
  containsMarkers,
  hasIncompleteMarkers,
  decodeMarkerValue
};
