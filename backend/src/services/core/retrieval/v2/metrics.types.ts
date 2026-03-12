/**
 * Retrieval Metrics — TypeScript interfaces for structured observability.
 *
 * These match the OpenTelemetry API shape so they can be backed by
 * Prometheus, Datadog, or any OTel-compatible collector.
 *
 * Not wired to a real backend yet — this is the contract spec.
 */

// ── Generic metric primitives (pluggable backends) ──────────────────

export interface Counter<Labels extends Record<string, string> = Record<string, string>> {
  inc(labels: Labels, value?: number): void;
}

export interface Histogram<Labels extends Record<string, string> = Record<string, string>> {
  observe(labels: Labels, value: number): void;
}

export interface Gauge<Labels extends Record<string, string> = Record<string, string>> {
  set(labels: Labels, value: number): void;
}

// ── Retrieval-specific label types ──────────────────────────────────

export type EngineLabel = { engine: "v1" | "v2" };
export type StatusLabel = { status: string };
export type PhaseLabel = { phase: string };
export type PhaseStatusLabel = { phase: string; status: "ok" | "failed" | "timed_out" };
export type CacheResultLabel = { result: "hit" | "miss" };
export type StageLabel = { stage: string };

// ── Retrieval Metrics Interface ─────────────────────────────────────

export interface RetrievalMetrics {
  // Counters
  retrievalRequestsTotal: Counter<EngineLabel & StatusLabel>;
  retrievalCacheHitsTotal: Counter<CacheResultLabel>;
  retrievalPhasesTotal: Counter<PhaseStatusLabel>;
  retrievalFallbacksTotal: Counter<{ from: string; to: string }>;
  retrievalBankValidationFailuresTotal: Counter<{ bankId: string }>;

  // Histograms
  retrievalDurationMs: Histogram<EngineLabel>;
  retrievalPhaseDurationMs: Histogram<PhaseLabel>;
  retrievalCandidateCount: Histogram<StageLabel>;
  retrievalEvidenceCount: Histogram<Record<string, never>>;
  retrievalTopScore: Histogram<Record<string, never>>;

  // Gauges
  retrievalCacheSize: Gauge<Record<string, never>>;
  retrievalHeapUsedMb: Gauge<Record<string, never>>;
}

// ── No-op implementation for dev/test ───────────────────────────────

export function createNoopMetrics(): RetrievalMetrics {
  const noop = { inc: () => {}, observe: () => {}, set: () => {} };
  return {
    retrievalRequestsTotal: noop,
    retrievalCacheHitsTotal: noop,
    retrievalPhasesTotal: noop,
    retrievalFallbacksTotal: noop,
    retrievalBankValidationFailuresTotal: noop,
    retrievalDurationMs: noop,
    retrievalPhaseDurationMs: noop,
    retrievalCandidateCount: noop,
    retrievalEvidenceCount: noop,
    retrievalTopScore: noop,
    retrievalCacheSize: noop,
    retrievalHeapUsedMb: noop,
  };
}
