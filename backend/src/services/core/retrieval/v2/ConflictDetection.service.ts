/**
 * ConflictDetection — v2 extraction
 *
 * Standalone numeric-conflict detection extracted from RetrievalEngineService.
 * Scans evidence items for numeric values associated with metric labels and
 * reports cross-document conflicts when the same metric has materially
 * different values in different documents.
 *
 * BUG FIX #5: `parseLocaleNumber` now handles three locale formats:
 *   - US:  1,500.00  (commas as thousands, dot as decimal)
 *   - BR:  1.500,00  (dots as thousands, comma as decimal)
 *   - FR:  1 500,00  (spaces as thousands, comma as decimal)
 */

import { logger } from "../../../../utils/logger";
import type { EvidenceItem } from "../retrieval.types";

// ── Locale-aware number parsing ──────────────────────────────────────

/**
 * Parse a numeric string respecting US, BR, and FR locale conventions.
 *
 * BUG FIX #5: The legacy implementation did not handle French-style
 * space-separated thousands (e.g. "1 500,00") because whitespace was
 * not stripped before format detection.  The new implementation:
 *   1. Strips all whitespace (handles FR grouping).
 *   2. Detects BR/FR format (dot-thousands + comma-decimal).
 *   3. Falls back to US format (comma-thousands + dot-decimal).
 */
export function parseLocaleNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "");
  // FR format with space thousands: already removed spaces above
  // BR format: dots as thousands, comma as decimal
  const brMatch = cleaned.match(/^([+-]?\d[\d.]*),(\d{1,2})$/);
  if (brMatch) {
    const intPart = brMatch[1].replace(/\./g, "");
    return parseFloat(`${intPart}.${brMatch[2]}`);
  }
  // US format: commas as thousands
  return parseFloat(cleaned.replace(/,/g, ""));
}

// ── Main conflict detection ──────────────────────────────────────────

/**
 * Scan evidence items for cross-document numeric conflicts.
 *
 * For each evidence snippet, extract numeric values paired with their
 * preceding metric label (up to ~40 chars of context).  When the same
 * metric appears in two different documents with values differing by
 * more than 1%, a conflict entry is emitted.
 *
 * Returns an array of conflict records suitable for inclusion in the
 * EvidencePack.
 */
export function detectEvidenceConflicts(
  evidence: EvidenceItem[],
): Array<{
  metric: string;
  docA: string;
  valueA: number;
  docB: string;
  valueB: number;
}> {
  const conflicts: Array<{
    metric: string;
    docA: string;
    valueA: number;
    docB: string;
    valueB: number;
  }> = [];

  const docMetrics = new Map<string, Map<string, number>>();
  const numPattern = /(?:[\w\s]{1,40}?)\s*([-+]?\d[\d.,]*)/g;

  for (const item of evidence) {
    const text = String(item.snippet || "");
    if (!text) continue;
    let match: RegExpExecArray | null;
    while ((match = numPattern.exec(text)) !== null) {
      const fullMatch = match[0].trim();
      const value = parseLocaleNumber(match[1]);
      if (!Number.isFinite(value)) continue;
      const words = fullMatch
        .replace(/[-+]?\d[\d.,]*/g, "")
        .trim()
        .toLowerCase();
      const metricKey = words.split(/\s+/).slice(-10).join(" ").trim();
      if (!metricKey || metricKey.length < 3) continue;

      const docMap =
        docMetrics.get(item.docId) ?? new Map<string, number>();
      if (!docMap.has(metricKey)) {
        docMap.set(metricKey, value);
      }
      docMetrics.set(item.docId, docMap);
    }
  }

  const docIds = Array.from(docMetrics.keys());
  for (let i = 0; i < docIds.length; i++) {
    for (let j = i + 1; j < docIds.length; j++) {
      const mapA = docMetrics.get(docIds[i])!;
      const mapB = docMetrics.get(docIds[j])!;
      for (const [metric, valueA] of mapA) {
        const valueB = mapB.get(metric);
        if (valueB === undefined) continue;
        if (valueA === 0 && valueB === 0) continue;
        const diff = Math.abs(valueA - valueB);
        const denom = Math.max(Math.abs(valueA), Math.abs(valueB));
        if (denom > 0 && diff / denom > 0.01) {
          conflicts.push({
            metric,
            docA: docIds[i],
            valueA,
            docB: docIds[j],
            valueB,
          });
        }
      }
    }
  }

  return conflicts;
}
