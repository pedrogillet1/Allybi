/**
 * Marker Utilities
 *
 * Low-level helpers for Koda document markers embedded in answer text.
 * Higher-level operations live in KodaMarkerGeneratorService; this module
 * provides the shared constants, regexes, encode/decode, and field helpers.
 *
 * Marker format: {{PREFIX::key=value::key="quoted value"::...}}
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MARKER_OPEN = "{{";
export const MARKER_CLOSE = "}}";
export const FIELD_SEP = "::";
export const DOC_PREFIX = "DOC";
export const LOAD_MORE_PREFIX = "LOAD_MORE";

// ---------------------------------------------------------------------------
// Compiled regex patterns
// ---------------------------------------------------------------------------

/** Matches a single DOC marker (use with .exec loop or String.match). */
export const DOC_MARKER_RE = /\{\{DOC::[^}]+\}\}/g;

/** Matches a single LOAD_MORE marker. */
export const LOAD_MORE_MARKER_RE = /\{\{LOAD_MORE::[^}]+\}\}/g;

/** Matches any Koda marker (DOC or LOAD_MORE). */
export const ANY_MARKER_RE = /\{\{(?:DOC|LOAD_MORE)::[^}]+\}\}/g;

// ---------------------------------------------------------------------------
// Encode / Decode
// ---------------------------------------------------------------------------

/** URI-encode a value for safe embedding inside a marker field. */
export function encodeMarkerValue(value: string): string {
  return encodeURIComponent(value);
}

/** Decode a URI-encoded marker field value. */
export function decodeMarkerValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Strip surrounding double-quotes then URI-decode. */
export function stripAndDecode(value: string): string {
  const stripped = value.replace(/^"(.*)"$/, "$1");
  return decodeMarkerValue(stripped);
}

// ---------------------------------------------------------------------------
// Marker creation
// ---------------------------------------------------------------------------

/** Build a LOAD_MORE marker string. */
export function createLoadMoreMarker(opts: {
  total: number;
  shown: number;
  remaining: number;
}): string {
  return `${MARKER_OPEN}${LOAD_MORE_PREFIX}${FIELD_SEP}total=${opts.total}${FIELD_SEP}shown=${opts.shown}${FIELD_SEP}remaining=${opts.remaining}${MARKER_CLOSE}`;
}

/**
 * Build a DOC marker from an ordered list of key=value fields.
 *
 * Values containing special characters should be pre-encoded with
 * `encodeMarkerValue` and wrapped in quotes by the caller.
 *
 *   createDocumentMarker([
 *     ['id', 'abc'],
 *     ['name', '"My%20File.pdf"'],
 *     ['type', 'pdf'],
 *   ]);
 *   // → '{{DOC::id=abc::name="My%20File.pdf"::type=pdf}}'
 */
export function createDocumentMarker(
  fields: [string, string | number][],
): string {
  const inner = fields.map(([k, v]) => `${k}=${v}`).join(FIELD_SEP);
  return `${MARKER_OPEN}${DOC_PREFIX}${FIELD_SEP}${inner}${MARKER_CLOSE}`;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse all `key=value` fields from a raw marker string into a map.
 * Surrounding quotes on values are preserved (caller strips if needed).
 */
export function parseMarkerFields(marker: string): Record<string, string> {
  // Strip outer {{ PREFIX :: ... }}
  const inner = marker.replace(/^\{\{[A-Z_]+::/, "").replace(/\}\}$/, "");
  const result: Record<string, string> = {};

  for (const segment of inner.split(FIELD_SEP)) {
    const eqIdx = segment.indexOf("=");
    if (eqIdx === -1) continue;
    const key = segment.slice(0, eqIdx);
    const val = segment.slice(eqIdx + 1);
    result[key] = val;
  }

  return result;
}

/** Extract a single field value from a marker (returns raw value or null). */
export function extractMarkerField(
  marker: string,
  fieldName: string,
): string | null {
  const fields = parseMarkerFields(marker);
  return fields[fieldName] ?? null;
}

// ---------------------------------------------------------------------------
// Type guards / predicates
// ---------------------------------------------------------------------------

export function isDocumentMarker(text: string): boolean {
  return (
    text.startsWith(`${MARKER_OPEN}${DOC_PREFIX}${FIELD_SEP}`) &&
    text.endsWith(MARKER_CLOSE)
  );
}

export function isLoadMoreMarker(text: string): boolean {
  return (
    text.startsWith(`${MARKER_OPEN}${LOAD_MORE_PREFIX}${FIELD_SEP}`) &&
    text.endsWith(MARKER_CLOSE)
  );
}

export function isMarker(text: string): boolean {
  return isDocumentMarker(text) || isLoadMoreMarker(text);
}

// ---------------------------------------------------------------------------
// Bulk helpers
// ---------------------------------------------------------------------------

/** Count how many DOC markers appear in the text. */
export function countDocumentMarkers(text: string): number {
  const matches = text.match(new RegExp(DOC_MARKER_RE.source, "g"));
  return matches ? matches.length : 0;
}

/** Remove all Koda markers from text, collapsing leftover whitespace. */
export function removeAllMarkers(text: string): string {
  return text
    .replace(new RegExp(ANY_MARKER_RE.source, "g"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
