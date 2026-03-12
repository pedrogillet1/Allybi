# Retrieval Engine — Dashboard Spec

Panel-by-panel layout for Grafana/Datadog monitoring.

## Row 1: Request Overview

| Panel | Metric | Query | Refresh | Alert Line |
|-------|--------|-------|---------|------------|
| Request Rate | `retrievalRequestsTotal` | `sum(rate(retrieval_requests_total[5m])) by (engine)` | 15s | — |
| Error Rate | `retrievalRequestsTotal{status="failed"}` | `sum(rate(retrieval_requests_total{status="failed"}[5m])) / sum(rate(retrieval_requests_total[5m]))` | 15s | 5% (CRITICAL) |
| Latency (p50/p95/p99) | `retrievalDurationMs` | `histogram_quantile(0.5\|0.95\|0.99, sum(rate(retrieval_duration_ms_bucket[5m])) by (le, engine))` | 15s | p95 @ 800ms, p99 @ 2000ms |

## Row 2: Phase Breakdown

| Panel | Metric | Query | Refresh | Alert Line |
|-------|--------|-------|---------|------------|
| Phase Success Rate | `retrievalPhasesTotal` | `sum(rate(retrieval_phases_total{status="ok"}[5m])) by (phase) / sum(rate(retrieval_phases_total[5m])) by (phase)` | 30s | 95% per phase |
| Phase Duration (p50) | `retrievalPhaseDurationMs` | `histogram_quantile(0.5, sum(rate(retrieval_phase_duration_ms_bucket[5m])) by (le, phase))` | 30s | 3000ms (semantic), 1000ms (lexical/structural) |
| Fallback Rate | `retrievalFallbacksTotal` | `sum(rate(retrieval_fallbacks_total[5m]))` | 30s | 10/min (CRITICAL) |

## Row 3: Candidate Funnel

| Panel | Metric | Query | Refresh | Alert Line |
|-------|--------|-------|---------|------------|
| Considered | `retrievalCandidateCount{stage="considered"}` | `avg(retrieval_candidate_count{stage="considered"})` | 30s | — |
| After Negatives | `retrievalCandidateCount{stage="after_negatives"}` | `avg(retrieval_candidate_count{stage="after_negatives"})` | 30s | — |
| After Boosts | `retrievalCandidateCount{stage="after_boosts"}` | `avg(retrieval_candidate_count{stage="after_boosts"})` | 30s | — |
| Evidence Items | `retrievalEvidenceCount` | `avg(retrieval_evidence_count)` | 30s | — |
| Top Score (p50) | `retrievalTopScore` | `histogram_quantile(0.5, sum(rate(retrieval_top_score_bucket[5m])) by (le))` | 30s | 0.20 (WARNING) |

## Row 4: Infrastructure

| Panel | Metric | Query | Refresh | Alert Line |
|-------|--------|-------|---------|------------|
| Cache Hit Rate | `retrievalCacheHitsTotal` | `sum(rate(retrieval_cache_hits_total{result="hit"}[5m])) / sum(rate(retrieval_cache_hits_total[5m]))` | 30s | 10% (WARNING) |
| Cache Size | `retrievalCacheSize` | `retrieval_cache_size` | 60s | — |
| Heap Usage | `retrievalHeapUsedMb` | `retrieval_heap_used_mb` | 30s | 80% of max (WARNING) |

## Row 5: Rule Intelligence

| Panel | Metric | Query | Refresh | Alert Line |
|-------|--------|-------|---------|------------|
| Top Boost Rules | telemetry aggregation | `topk(10, sum(retrieval_boost_rule_applied_total) by (rule_id))` | 60s | — |
| Scope Violations | telemetry aggregation | `sum(rate(retrieval_scope_violations_total[5m]))` | 30s | — |
| Cross-Doc Gating | telemetry aggregation | `sum(rate(retrieval_crossdoc_gated_total[5m]))` | 60s | — |
| Bank Validation Failures | `retrievalBankValidationFailuresTotal` | `sum(rate(retrieval_bank_validation_failures_total[5m])) by (bank_id)` | 30s | > 0 (WARNING) |

## Notes

- All panels use 5-minute rate windows for stability
- Engine dimension (`v1` vs `v2`) should be available on all request-level metrics
- Phase dimension should be one of: `semantic`, `lexical`, `structural`
- Variable selectors: `$engine`, `$environment`, `$time_range`
