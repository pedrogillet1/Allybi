/**
 * Text Quality Service
 *
 * Derives text quality labels and scores from extraction results.
 */

import type { DispatchedExtractionResult } from "../extraction/extractionResult.types";

export function clamp01(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

export function deriveTextQuality(
  extraction: DispatchedExtractionResult,
  fullText: string,
): { label: "high" | "medium" | "low" | "none"; score: number | null } {
  const score = clamp01(extraction.textQualityScore ?? extraction.confidence);
  if (!fullText || fullText.trim().length === 0)
    return { label: "none", score: 0 };
  const VALID_LABELS = new Set(["high", "medium", "low", "none", "weak"]);

  if (typeof extraction.textQuality === "string") {
    const normalized = extraction.textQuality.trim().toLowerCase();
    if (VALID_LABELS.has(normalized)) {
      if (normalized === "high") return { label: "high", score };
      if (normalized === "medium") return { label: "medium", score };
      // "low", "weak", "none" all map to low
      return { label: "low", score };
    }
  }
  if (score != null) {
    if (score >= 0.8) return { label: "high", score };
    if (score >= 0.55) return { label: "medium", score };
    return { label: "low", score };
  }
  // No quality signal — conservative default rather than length-based guess
  return { label: "medium", score: null };
}
