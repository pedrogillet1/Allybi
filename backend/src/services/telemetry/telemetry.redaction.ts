// backend/src/services/telemetry/telemetry.redaction.ts
//
// Redaction + hashing helpers for telemetry.
// Goals:
// - Avoid storing sensitive raw text (queries, filenames) unless explicitly desired.
// - Provide deterministic hashing for grouping (keywords, query signatures).
// - Small, dependency-free.
//
// Usage examples:
// - store raw query? NO → store hash + keywords
// - store filename? optional → store extension + hash + length
//
// NOTE: This does NOT do full PII detection. It is a lightweight privacy layer.
// You can later integrate your piiExtractor.service.ts for stronger guarantees.

import crypto from "crypto";

export interface RedactionConfig {
  /** Stable salt for hashes (set via env) */
  salt: string;

  /** Max chars to keep if allowing partial previews */
  maxPreviewChars?: number;

  /** If true, store a short redacted preview (still risky) */
  allowPreview?: boolean;
}

export interface RedactedText {
  /** Stable hash for grouping */
  hash: string;

  /** Optional redacted preview (only if allowPreview=true) */
  preview?: string;

  /** Length of original string */
  length: number;

  /** Lightweight tokens/keywords extracted without LLM */
  keywords: string[];
}

/**
 * Main entry: redact a string into safe telemetry representation.
 */
export function redactText(input: string, cfg: RedactionConfig): RedactedText {
  const s = String(input ?? "");
  const normalized = normalizeForHash(s);

  const hash = sha256(`${cfg.salt}:${normalized}`).slice(0, 32);
  const keywords = extractKeywords(normalized);

  const length = s.length;

  const allowPreview = cfg.allowPreview === true;
  const maxPreview = Number.isFinite(cfg.maxPreviewChars) ? Math.max(0, cfg.maxPreviewChars!) : 0;

  let preview: string | undefined;
  if (allowPreview && maxPreview > 0) {
    preview = buildSafePreview(s, maxPreview);
  }

  return { hash, preview, length, keywords };
}

/**
 * Safe filename telemetry:
 * - keep extension
 * - keep length
 * - hash the base name
 */
export function redactFilename(filename: string, cfg: RedactionConfig): {
  baseHash: string;
  ext: string;
  length: number;
} {
  const s = String(filename ?? "").trim();
  const ext = getExt(s);
  const base = stripExt(s);
  const baseHash = sha256(`${cfg.salt}:${normalizeForHash(base)}`).slice(0, 24);
  return { baseHash, ext, length: s.length };
}

/**
 * Optional: hash an arbitrary object deterministically.
 * Useful for “query signatures” based on intent+scope+doc lock.
 */
export function stableObjectHash(obj: unknown, cfg: RedactionConfig): string {
  const stable = JSON.stringify(sortKeysDeep(normalizeJson(obj)));
  return sha256(`${cfg.salt}:${stable}`).slice(0, 32);
}

/* ----------------------------- keyword extraction ----------------------------- */

/**
 * Very lightweight keyword extraction without LLM:
 * - lowercase
 * - split on non-letters/numbers
 * - remove stopwords
 * - keep top N by frequency
 */
export function extractKeywords(text: string, maxKeywords = 8): string[] {
  const t = String(text ?? "").toLowerCase();

  const tokens = t
    .split(/[^a-z0-9]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length >= 3)
    .filter((x) => !STOPWORDS.has(x));

  const freq = new Map<string, number>();
  for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([k]) => k);
}

const STOPWORDS = new Set([
  // English
  "the","and","for","with","this","that","from","into","your","you","are","was","were","have","has","had",
  "what","when","where","why","how","can","could","should","would","will","not","yes","but","about","over",
  "under","between","during","before","after","than","then","there","here","their","they","them","his","her",
  "she","him","our","ours","who","whom","which","while","also",

  // Portuguese (common)
  "para","com","sem","isso","essa","este","esta","aquele","aquela","sobre","entre","durante","antes","depois",
  "como","qual","quais","quando","onde","porque","porquê","pode","podem","deve","devem","não","sim","mas",
  "tambem","também","seus","suas","dele","dela","eles","elas","nosso","nossa","vocês","voce","você"
]);

/* ----------------------------- helpers ----------------------------- */

function buildSafePreview(s: string, maxChars: number): string {
  // Remove line breaks + compress whitespace
  const singleLine = s.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxChars) return singleLine;
  return singleLine.slice(0, Math.max(0, maxChars - 1)) + "…";
}

function normalizeForHash(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function getExt(name: string): string {
  const n = String(name ?? "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  return n.slice(i + 1).toLowerCase();
}

function stripExt(name: string): string {
  const n = String(name ?? "");
  const i = n.lastIndexOf(".");
  if (i === -1) return n;
  return n.slice(0, i);
}

function normalizeJson(x: unknown): unknown {
  if (x === null || x === undefined) return null;
  const t = typeof x;
  if (t === "string" || t === "number" || t === "boolean") return x;
  if (t === "bigint") return (x as bigint).toString();
  if (t === "undefined" || t === "function" || t === "symbol") return null;
  if (Array.isArray(x)) return x.map(normalizeJson);

  if (t === "object") {
    const obj = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "undefined") continue;
      out[k] = normalizeJson(v);
    }
    return out;
  }

  return null;
}

function sortKeysDeep(x: unknown): unknown {
  if (x === null) return null;
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (typeof x !== "object") return x;

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortKeysDeep(obj[k]);
  return out;
}
