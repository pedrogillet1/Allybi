/**
 * QueryPreparation — v2 extraction
 *
 * Standalone query normalization utilities extracted from the monolithic
 * RetrievalEngineService. The active runtime must supply a concrete
 * QueryNormalizer at bootstrap.
 *
 * BUG FIX #1: The legacy code passed `req.signals?.intentFamily ?? "any"` to
 * the external normalizer, but QueryNormalizer.normalize expects a *language*
 * hint, not an intent family.  Fixed to pass `languageHint` (or
 * `preferredLanguage`, falling back to "en").
 */

import { logger } from "../../../../utils/logger";
import type { RetrievalRequest, QueryNormalizer } from "../retrieval.types";

// ── Token helpers ────────────────────────────────────────────────────

/**
 * Naive whitespace tokeniser that lowercases, strips smart-quotes,
 * and splits on common punctuation.  Used for keyword-overlap checks
 * elsewhere in the pipeline.
 */
export function simpleTokens(q: string): string[] {
  return (q ?? "")
    .toLowerCase()
    .replace(/[\u201C\u201D\u201E]/g, " ") // smart quotes → space
    .split(/[\s,;:.!?()]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Escape a string so it can be safely interpolated into a RegExp constructor.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Main normaliser ──────────────────────────────────────────────────

/**
 * Normalise the user query for retrieval.
 *
 * Delegates to the configured `queryNormalizer`.
 */
export async function normalizeQuery(
  req: RetrievalRequest,
  queryNormalizer: QueryNormalizer,
): Promise<{ normalized: string; hasQuotedText: boolean; hasFilename: boolean }> {
  // BUG FIX #1: pass languageHint, not intentFamily.
  // QueryNormalizer.normalize(query, langHint) expects a BCP-47-ish
  // language code so that locale-specific stemming/stop-word removal
  // can be applied.  The legacy code mistakenly forwarded intentFamily
  // ("documents", "editing", etc.) which is not a language identifier.
  return queryNormalizer.normalize(req.query, req.signals?.languageHint ?? "en");
}
