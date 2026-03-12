# Retrieval Engine — File Matrix (Post Phases A-E)

**Date:** 2026-03-12

## New Files Created

| File | Lines | Phase | Purpose |
|------|-------|-------|---------|
| `v2/EvidenceSelection.service.ts` | ~217 | A3 | Extracted candidate selection logic |
| `v2/BankShapeValidator.service.ts` | ~120 | C1 | Bank shape validation at load time |
| `v2/FallbackRetrievalEngine.ts` | ~60 | C2 | Mid-request V1 fallback wrapper |
| `v2/ShadowModeEngine.ts` | ~75 | E1 | Shadow mode engine scaffold |
| `v2/ShadowComparison.service.ts` | ~65 | E2 | Shadow comparison service |
| `v2/metrics.types.ts` | ~80 | D1 | OTel-compatible metric interfaces |
| `v2/__tests__/RetrievalOrchestrator.integration.test.ts` | ~300 | B1 | Orchestrator integration tests |
| `v2/__tests__/encrypted-mode.integration.test.ts` | ~200 | B2 | Encrypted-mode tests |
| `v2/__tests__/v1-v2-parity.test.ts` | ~250 | B3 | V1-V2 parity test suite |
| `v2/__tests__/performance.bench.test.ts` | ~150 | B4 | Performance benchmarks |

## Modified Files

| File | Phase | Change |
|------|-------|--------|
| `retrievalEngine.service.ts` → `retrievalEngine.legacy.service.ts` | A1 | Renamed + `@deprecated` JSDoc |
| `v2/RetrievalEngineFactory.ts` | A1, C2 | Import path update + FallbackRetrievalEngine wrapping |
| `modules/retrieval/application/index.ts` | A1 | Import path update to legacy |
| `v2/CandidateMerge.service.ts` | A2 | Error boundary on `mergePhaseCandidates` |
| `v2/NegativeRules.service.ts` | A2 | Error boundary on `applyRetrievalNegatives` |
| `v2/EvidencePackager.service.ts` | A2, A3 | Error boundary + delegated to `selectEvidenceFromCandidates` |
| `v2/RetrievalOrchestrator.service.ts` | A4, C1, C3 | `loadRetrievalBanks()` + `prepareRulesAndVariants()` helpers, bank validation, memory guard |
| `v2/retrieval.config.ts` | C3 | Added `maxHeapUsedMb` |
| `v2/PhaseRunner.service.ts` | C4 | Phase timing instrumentation (`durationMs`) |
| `retrieval.types.ts` | C4 | Added `durationMs` to `RetrievalPhaseResult` |

## Import Migrations (Phase A1)

| File | Old Import | New Import |
|------|-----------|------------|
| 6 certification tests | `from "../../services/core/retrieval/retrievalEngine.service"` | `from "../../modules/retrieval/application"` |
| `turn-debug-packet.cert.test.ts` | `EvidencePack` from V1 | from `retrieval.types` |
| `table-context-types.cert.test.ts` | `CandidateChunk` from V1 | from `retrieval.types` |
| `fallbackDecisionPolicy.service.ts` | `EvidencePack` from V1 | from `retrieval.types` |
| `ProvenanceBuilder.ts` | `EvidencePack` from V1 | from `retrieval.types` |
| `prismaRetrievalAdapters.service.ts` | types from V1 | from `retrieval.types` |
| 3 V1 test files | `from "./retrievalEngine.service"` | from `./retrievalEngine.legacy.service` |

## New Documentation

| File | Phase | Content |
|------|-------|---------|
| `RETRIEVAL_100_REAUDIT.md` | F1 | Updated 8-dimension scores (64→84) |
| `RETRIEVAL_100_FILE_MATRIX.md` | F1 | This file |
| `RETRIEVAL_PARITY_REPORT.md` | F1 | V1-V2 parity test results |
| `RETRIEVAL_PERFORMANCE_PLAN.md` | F1 | Benchmark baseline + recommendations |
| `RETRIEVAL_SLOS_AND_ALERTS.md` | D2 | SLO definitions + alert rules |
| `RETRIEVAL_DASHBOARD_SPEC.md` | D3 | Panel-by-panel dashboard layout |
| `RETRIEVAL_SHADOW_MODE_RUNBOOK.md` | E3 | Shadow mode activation + monitoring |

## V2 Module Count

| Before | After |
|--------|-------|
| 18 service modules | 23 service modules (+5 new) |
| 9 test files, 226 tests | 13 test files, ~310+ tests |
| 5 docs | 12 docs |
