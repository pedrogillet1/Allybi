/**
 * ShadowComparison — compares primary and shadow EvidencePacks
 * to measure V1/V2 divergence during shadow mode rollout.
 */

import type { EvidencePack } from "../retrieval.types";

export interface ShadowComparison {
  /** ISO timestamp of comparison */
  timestamp: string;
  /** Original query text */
  query: string;
  /** Primary engine runtimeStatus */
  primaryStatus: string;
  /** Shadow engine runtimeStatus */
  shadowStatus: string;
  /** Difference in evidence count (shadow - primary) */
  evidenceCountDelta: number;
  /** Jaccard similarity of evidence doc IDs (0–1) */
  docIdOverlap: number;
  /** Difference in top scores (shadow - primary) */
  topScoreDelta: number;
  /** Duration difference in ms (shadow - primary), if available */
  durationDelta: number | null;
  /** Primary evidence count */
  primaryEvidenceCount: number;
  /** Shadow evidence count */
  shadowEvidenceCount: number;
}

/**
 * Compare two EvidencePacks and produce a divergence summary.
 */
export function compareEvidencePacks(
  primary: EvidencePack,
  shadow: EvidencePack,
  query: string,
): ShadowComparison {
  const primaryDocIds = new Set(primary.evidence.map((e) => e.docId));
  const shadowDocIds = new Set(shadow.evidence.map((e) => e.docId));

  const intersection = new Set([...primaryDocIds].filter((id) => shadowDocIds.has(id)));
  const union = new Set([...primaryDocIds, ...shadowDocIds]);
  const docIdOverlap = union.size > 0 ? intersection.size / union.size : 1;

  const primaryTopScore = primary.stats?.topScore ?? 0;
  const shadowTopScore = shadow.stats?.topScore ?? 0;

  return {
    timestamp: new Date().toISOString(),
    query,
    primaryStatus: primary.runtimeStatus ?? "unknown",
    shadowStatus: shadow.runtimeStatus ?? "unknown",
    evidenceCountDelta: shadow.evidence.length - primary.evidence.length,
    docIdOverlap,
    topScoreDelta: shadowTopScore - primaryTopScore,
    durationDelta: null,
    primaryEvidenceCount: primary.evidence.length,
    shadowEvidenceCount: shadow.evidence.length,
  };
}
