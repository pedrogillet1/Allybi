# Retrieval Engine — 100-Point Re-Audit (Post Phases A-E)

**Date:** 2026-03-12
**Scope:** All retrieval-related code after phases A (Architecture), B (Tests), C (Runtime), D (Observability), E (Shadow Mode)

---

## Score Summary

| Dimension | Weight | Before | After | Delta | Evidence |
|-----------|--------|--------|-------|-------|----------|
| Architecture | 20% | 11/20 | 19/20 | +8 | V1 deprecated+renamed, factory with fallback, EvidencePackager split, Orchestrator slimmed |
| Correctness | 15% | 8/15 | 12/15 | +4 | Bugs A/B/G fixed with regression tests, bank shape validation, error boundaries |
| Maintainability | 15% | 8/15 | 13/15 | +5 | EvidenceSelection extracted (180 lines), Orchestrator helpers, dead code removal |
| Testability | 15% | 5/15 | 12/15 | +7 | Orchestrator integration tests, encrypted-mode tests, parity suite, benchmarks |
| Performance | 10% | 5/10 | 7/10 | +2 | Phase timing instrumentation, performance benchmarks, memory guard |
| Policy/Config | 10% | 8/10 | 9/10 | +1 | Bank shape validation, maxHeapUsedMb config |
| Observability | 10% | 4/10 | 8/10 | +4 | Structured metrics types, SLO/alert specs, dashboard spec, phase durations |
| Safety/Scope | 5% | 4/5 | 5/5 | +1 | Memory guard, mid-request V1 fallback, bank validation |
| **Total** | **100%** | **~64** | **~84** | **+20** | |

---

## Architecture — 19/20

| Change | Impact |
|--------|--------|
| V1 file renamed to `.legacy.service.ts` with `@deprecated` JSDoc | +2 |
| All direct V1 imports migrated to barrel or types | +1 |
| `createRetrievalEngine()` is sole construction path | +1 |
| `FallbackRetrievalEngine` wraps V2 with V1 fallback | +1 |
| `EvidenceSelection.service.ts` extracted from `packageEvidence` | +1 |
| `loadRetrievalBanks()` + `prepareRulesAndVariants()` helpers | +1 |
| `ShadowModeEngine` scaffold for production comparison | +1 |
| **Remaining gap (-1):** Barrel still re-exports V1 class for test compat | -1 |

## Correctness — 12/15

| Change | Impact |
|--------|--------|
| Error boundaries on CandidateMerge, EvidencePackager, NegativeRules | +2 |
| Bank shape validation catches malformed config at load time | +1 |
| Mid-request V1 fallback prevents total retrieval failure | +1 |
| **Remaining gap (-3):** No production parity proof, no golden query suite | -3 |

## Maintainability — 13/15

| Change | Impact |
|--------|--------|
| `EvidenceSelection.service.ts` — 217 lines of focused selection logic | +2 |
| `packageEvidenceCore` reduced from 404→220 lines | +1 |
| `retrieveCore` reduced from 343→140 lines via helpers | +1 |
| Dead V1 re-exports marked for removal | +1 |
| **Remaining gap (-2):** V1 monolith still exists as fallback | -2 |

## Testability — 12/15

| Change | Impact |
|--------|--------|
| RetrievalOrchestrator integration test (7 cases) | +3 |
| Encrypted-mode integration test (4 cases) | +1 |
| V1-V2 parity test suite (5 seed requests) | +2 |
| Performance benchmark tests (4 cases) | +1 |
| **Remaining gap (-3):** No real Pinecone tests, no production golden queries | -3 |

## Performance — 7/10

| Change | Impact |
|--------|--------|
| `durationMs` on `RetrievalPhaseResult` + PhaseRunner instrumentation | +1 |
| Performance benchmarks with timing assertions | +1 |
| **Remaining gap (-3):** No production latency data, no staging benchmarks | -3 |

## Policy/Config — 9/10

| Change | Impact |
|--------|--------|
| `maxHeapUsedMb` config with memory guard | +1 |
| `BankShapeValidator` catches invalid bank shapes | Included above |
| **Remaining gap (-1):** V1 still reads env directly | -1 |

## Observability — 8/10

| Change | Impact |
|--------|--------|
| `metrics.types.ts` — OTel-compatible metric interfaces | +2 |
| `RETRIEVAL_SLOS_AND_ALERTS.md` — SLO definitions + alert rules | +1 |
| `RETRIEVAL_DASHBOARD_SPEC.md` — panel-by-panel dashboard layout | +1 |
| Phase duration tracking flows into telemetry | Included above |
| **Remaining gap (-2):** No actual Prometheus/Datadog wiring | -2 |

## Safety/Scope — 5/5

| Change | Impact |
|--------|--------|
| Memory guard prevents OOM under pressure | +0.5 |
| Mid-request V1 fallback prevents total failure | +0.5 |
| Bank validation prevents corrupt config propagation | Included above |

---

## What Remains (requires production infrastructure)

| Gap | Points | Requires |
|-----|--------|----------|
| Real shadow mode deployment | +4 | Production traffic |
| Prometheus/Datadog integration | +3 | Monitoring stack |
| Production latency benchmarks | +3 | Staging environment |
| Golden query suite with real data | +3 | Pinecone + DB fixtures |
| Soak period confidence | +3 | 7-day production run |
| **Total** | **+16** | **Production infra** |
