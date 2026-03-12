# Retrieval Engine — Performance Plan

**Date:** 2026-03-12

## Benchmark Baseline (from `performance.bench.test.ts`)

| Metric | Target | Notes |
|--------|--------|-------|
| Full pipeline (600 candidates) | < 500ms | Includes all 12 orchestrator steps |
| Phase budget respected | Within budget + 50% grace | `RETRIEVAL_PHASE_BUDGET_MS` (25s default) |
| Cache speedup | < 5ms on cache hit | Second identical request |
| Memory per request | < 10MB heap delta | For 600 candidate pipeline |

## Phase Timing Instrumentation

Each `RetrievalPhaseResult` now includes `durationMs` from `performance.now()` measurements in `PhaseRunner`. This flows into the telemetry path.

Expected phase budgets:
- Semantic phase: 2000-6000ms (Pinecone query)
- Lexical phase: 500-2000ms (Postgres full-text)
- Structural phase: 200-1000ms (section anchor matching)

## Memory Guard

`RETRIEVAL_MAX_HEAP_USED_MB` (default 512) triggers early return with `memory_pressure` reason code when heap exceeds threshold. This prevents OOM crashes during peak load.

## Optimization Recommendations (Future)

| Optimization | Expected Impact | Effort |
|-------------|----------------|--------|
| Per-request `listDocs()` caching | -50ms (eliminates duplicate DB call) | Low |
| Parallel phase execution (all variants) | -30% latency for multi-variant queries | Medium |
| Candidate streaming (process as phases complete) | -20% latency for merge+rank | High |
| Pinecone batch queries | -40% semantic phase time | Medium (requires Pinecone API change) |
| Evidence cache warming | -80% for repeat queries | Low (already implemented, needs tuning) |

## Production Benchmark Plan

1. Deploy V2 with shadow mode at 1%
2. Collect p50/p95/p99 latency from `retrievalDurationMs` histogram
3. Compare V1 vs V2 latency distributions
4. Target: V2 p95 within 10% of V1 p95
5. If V2 slower: profile phase durations, identify bottleneck
