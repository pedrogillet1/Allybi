/**
 * Diversifier — v2 extraction
 *
 * Standalone diversification utilities extracted from RetrievalEngineService.
 * Limits per-document candidate count, deduplicates near-duplicate snippets,
 * and enforces overall candidate caps.
 */

import { logger } from "../../../../utils/logger";
import type {
  CandidateChunk,
  RetrievalRequest,
} from "../retrieval.types";
import { sha256, safeNumber } from "../retrievalEngine.utils";

// ── Near-duplicate normalisation ─────────────────────────────────────

/**
 * Normalise a snippet for near-duplicate detection.
 * Lowercases, collapses whitespace, and strips non-letter/digit characters
 * (Unicode-aware).
 */
export function normalizeForNearDup(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

// ── Near-duplicate deduplication ─────────────────────────────────────

/**
 * Remove near-duplicate candidates within the same document.
 * Uses a truncated SHA-256 hash of the normalised snippet window
 * to identify duplicates.  Keeps at most `maxNearDupPerDoc` copies
 * of each hash per document.
 */
export function dedupeNearDuplicates(
  candidates: CandidateChunk[],
  maxNearDupPerDoc: number,
  windowChars: number,
): CandidateChunk[] {
  const perDocHashes = new Map<string, Map<string, number>>();
  const out: CandidateChunk[] = [];

  for (const c of candidates) {
    const docMap = perDocHashes.get(c.docId) ?? new Map<string, number>();
    perDocHashes.set(c.docId, docMap);

    const snippetNorm = normalizeForNearDup(c.snippet).slice(0, windowChars);
    const h = sha256(snippetNorm).slice(0, 16);

    const count = docMap.get(h) ?? 0;
    if (count >= maxNearDupPerDoc) continue;

    docMap.set(h, count + 1);
    out.push(c);
  }

  return out;
}

// ── Main diversification ─────────────────────────────────────────────

/**
 * Apply diversification to the ranked candidate list.
 *
 * 1. Near-duplicate deduplication within each document.
 * 2. Per-document cap (maxPerDocHard).
 * 3. Overall candidate cap (maxTotalHard).
 *
 * When `explicitDocLock` or `singleDocIntent` is active, full
 * diversification is skipped and only light near-duplicate deduplication
 * is performed (bank policy).
 */
export function applyDiversification(
  candidates: CandidateChunk[],
  req: RetrievalRequest,
  signals: RetrievalRequest["signals"],
  diversificationBank: Record<string, any> | null,
): CandidateChunk[] {
  if (!diversificationBank?.config?.enabled) return candidates;

  // Disable diversification when explicit lock or single doc intent (bank policy)
  const explicitDocLock = Boolean(signals.explicitDocLock);
  const singleDocIntent = Boolean(signals.singleDocIntent);
  if (explicitDocLock || singleDocIntent) {
    // Still dedupe near-duplicates lightly within doc
    return dedupeNearDuplicates(candidates, 3, 280);
  }

  const maxPerDocHard = safeNumber(
    diversificationBank.config.actionsContract?.thresholds?.maxPerDocHard,
    10,
  );
  const maxTotalHard = safeNumber(
    diversificationBank.config.actionsContract?.thresholds
      ?.maxTotalChunksHard,
    36,
  );
  const maxNearDupPerDoc = safeNumber(
    diversificationBank.config.actionsContract?.thresholds
      ?.maxNearDuplicatesPerDoc,
    3,
  );
  const windowChars = safeNumber(
    diversificationBank.config.actionsContract?.thresholds
      ?.nearDuplicateWindowChars,
    280,
  );

  // 1) Near-duplicate dedupe first
  let filtered = dedupeNearDuplicates(
    candidates,
    maxNearDupPerDoc,
    windowChars,
  );

  // 2) Doc spread cap
  const perDocCount = new Map<string, number>();
  const diversified: CandidateChunk[] = [];
  for (const c of filtered) {
    const n = perDocCount.get(c.docId) ?? 0;
    if (n >= maxPerDocHard) continue;
    perDocCount.set(c.docId, n + 1);
    diversified.push(c);
    if (diversified.length >= maxTotalHard) break;
  }

  return diversified;
}
