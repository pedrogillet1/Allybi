# Retrieval Engine — Hardening Changelog

**Date:** 2026-03-12

---

## Architecture Changes

### Factory Pattern (Phase 3A + 3D)
- **Created** `v2/RetrievalEngineFactory.ts` — single factory `createRetrievalEngine()` that reads `RETRIEVAL_USE_V2_ORCHESTRATOR` env var, constructs V1 or V2, and wraps V2 in try/catch with V1 fallback
- **Created** `RetrievalEngineDeps` interface — typed dependency bundle for engine construction
- **Renamed** `IRetrievalOrchestrator` → `IRetrievalEngine` in `retrieval.types.ts` (deprecated alias kept for backwards compat)
- **Updated** both `RetrievalEngineService` and `RetrievalOrchestratorV2` to implement `IRetrievalEngine`

### Consumer Rewrite (Phase 3D)
- **Replaced** 30-line manual V1/V2 construction in `CentralizedChatRuntimeDelegate.ts` with 3-line factory call
- **Removed** direct `RetrievalOrchestratorV2` import from consumer
- **Fixed** `this.logger` bug (class didn't have that field; now uses factory's internal logger)

### Barrel Rewrite (Phase 3E)
- **Narrowed** `modules/retrieval/application/index.ts` public surface
- **Added** `IRetrievalEngine` type export and `createRetrievalEngine` function export
- **Deprecated** direct engine class exports (kept for test compatibility)

### Config Finalization (Phase 3C)
- **Verified** zero `process.env` in V2 modules outside `retrieval.config.ts` and `RetrievalEngineFactory.ts`
- **Added** logger imports to 3 remaining V2 modules: RetrievalCache, RetrievalTelemetry, ScopeResolver
- All 18 V2 modules now have logger

---

## Bug Fixes

### Bug A — Locale Number Parsing (`CandidateMerge.service.ts`)
- **Before:** `Number(stripped.replace(/,/g, ""))` broke on BR/EU format `1.250,00` (parsed as `1.25` or `NaN`)
- **After:** Uses `parseLocaleNumber()` from `ConflictDetection.service.ts` which correctly handles US, BR, and FR number formats
- **Regression test:** Added to `bug-regression.test.ts`

### Bug B — Redundant Coalesce (`QueryPreparation.service.ts`)
- **Before:** `req.signals?.languageHint ?? req.signals?.languageHint ?? "en"` — same expression twice (copy-paste error)
- **After:** `req.signals?.languageHint ?? "en"` — single fallback
- **Regression test:** Added to `bug-regression.test.ts`

### Bug G — Pinecone Min-Similarity Not Encrypted-Aware (`prismaRetrievalAdapters.service.ts`)
- **Before:** Hardcoded `minSimilarity = 0.2` regardless of mode; encrypted-mode Pinecone scores (0.10–0.55) caused all candidates to be dropped
- **After:** `Math.min(baseMinSimilarity, 0.10)` in encrypted mode using `RETRIEVAL_CONFIG.isEncryptedOnlyMode`
- **Regression test:** Added to `bug-regression.test.ts`

---

## Test Surface

### New Test Files (6 created)
| File | Tests | Module Coverage |
|------|-------|----------------|
| `BoostEngine.test.ts` | 46 | applyBoosts, computeTokenOverlap, isGenericDocReferenceQuery, resolveCandidateTypeTag, resolveDocAgeDays, resolveExpectedTypeTags |
| `NegativeRules.test.ts` | 26 | looksLikeTOC, applyRetrievalNegatives (including encrypted mode) |
| `PlanHints.test.ts` | 35 | normalizePlanHintTerms, buildSearchableTextForPlannerHint, matchesPlannerLocationTarget, applyRetrievalPlanHints |
| `ScopeResolver.test.ts` | 37 | shouldEnforceScopedDocSet, resolveExplicitDocIds, resolveExplicitDocTypes, isDocLockActive |
| `QueryVariantBuilder.test.ts` | 34 | buildQueryVariants, buildDocTypeBoostPlan |
| `PhaseRunner.test.ts` | 13 | runPhases (timeout handling, multi-phase merge, failure status) |

### Updated Test Files
| File | Changes |
|------|---------|
| `bug-regression.test.ts` | +3 tests for Bug A, B, G regression coverage |

### Coverage Summary
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| V2 test files | 3 | 9 | +6 |
| V2 test cases | 34 | 226 | +192 |
| Modules with zero coverage | 7/17 (41%) | 1/17 (6%) | -6 modules |

---

## Documents Produced

| Document | Purpose |
|----------|---------|
| `RETRIEVAL_REAUDIT.md` | Full audit with 51/100 honest score, 8 dimensions, 20 ranked blockers |
| `RETRIEVAL_FILE_DECISION_MATRIX.md` | 80 files classified into keep/fix/rewrite/deprecate/new |
| `REWRITE_PLAN.md` | Target architecture, 7 execution phases, 9 cutover conditions |
| `CUTOVER_CHECKLIST.md` | 9 conditions verified (8 pass, 1 partial) |
| `CHANGELOG.md` | This file |

---

## Files Modified

| File | Change Type |
|------|------------|
| `retrieval.types.ts` | Added `IRetrievalEngine` interface, deprecated `IRetrievalOrchestrator` alias |
| `retrievalEngine.service.ts` | Updated `implements IRetrievalEngine` |
| `v2/RetrievalOrchestrator.service.ts` | Updated `implements IRetrievalEngine` |
| `v2/RetrievalEngineFactory.ts` | **NEW** — factory function |
| `v2/CandidateMerge.service.ts` | Bug A fix — locale-aware number parsing |
| `v2/QueryPreparation.service.ts` | Bug B fix — redundant coalesce |
| `prismaRetrievalAdapters.service.ts` | Bug G fix — encrypted-mode Pinecone threshold |
| `v2/RetrievalCache.service.ts` | Added logger import |
| `v2/RetrievalTelemetry.service.ts` | Added logger import |
| `v2/ScopeResolver.service.ts` | Added logger import |
| `modules/retrieval/application/index.ts` | Barrel rewrite — factory + interface as primary exports |
| `CentralizedChatRuntimeDelegate.ts` | Consumer rewrite — uses factory |
| `v2/__tests__/BoostEngine.test.ts` | **NEW** — 46 tests |
| `v2/__tests__/NegativeRules.test.ts` | **NEW** — 26 tests |
| `v2/__tests__/PlanHints.test.ts` | **NEW** — 35 tests |
| `v2/__tests__/ScopeResolver.test.ts` | **NEW** — 37 tests |
| `v2/__tests__/QueryVariantBuilder.test.ts` | **NEW** — 34 tests |
| `v2/__tests__/PhaseRunner.test.ts` | **NEW** — 13 tests |
| `v2/__tests__/bug-regression.test.ts` | +3 regression tests |

---

## Phase A-E Hardening (2026-03-12)

### Phase A: Architecture Hardening
- **V1 Deprecation:** Renamed `retrievalEngine.service.ts` → `retrievalEngine.legacy.service.ts`, added `@deprecated` JSDoc
- **Import Migrations:** All 11 direct V1 imports migrated to barrel or `retrieval.types`
- **Error Boundaries:** Added try-catch to `mergePhaseCandidates`, `packageEvidence`, `applyRetrievalNegatives`
- **EvidencePackager Split:** Extracted `EvidenceSelection.service.ts` (~217 lines) from `packageEvidence`
- **Orchestrator Slim-Down:** Extracted `loadRetrievalBanks()` + `prepareRulesAndVariants()` helpers

### Phase B: Test Coverage Expansion
- **RetrievalOrchestrator Integration Test:** 7 cases (happy path, unsafe gate, empty scope, phase failure, timeout, cache, error boundary)
- **Encrypted-Mode Tests:** 4 cases (weight redistribution, min relevance, min final score, end-to-end)
- **V1-V2 Parity Suite:** 5 seed requests comparing both engines
- **Performance Benchmarks:** 4 cases (throughput, phase budget, cache speedup, memory)

### Phase C: Runtime Hardening
- **Bank Shape Validation:** `BankShapeValidator.service.ts` validates 5 critical banks at load time
- **Mid-Request V1 Fallback:** `FallbackRetrievalEngine` wraps V2 with V1 fallback on failure
- **Memory Guard:** `maxHeapUsedMb` config (default 512) with early-return on heap pressure
- **Phase Timing:** `durationMs` added to `RetrievalPhaseResult`, instrumented in `PhaseRunner`

### Phase D: Observability Specs
- **Structured Metrics:** `metrics.types.ts` with OTel-compatible Counter/Histogram/Gauge interfaces
- **SLO Definitions:** `RETRIEVAL_SLOS_AND_ALERTS.md` — availability 99.5%, latency p95 < 800ms
- **Dashboard Spec:** `RETRIEVAL_DASHBOARD_SPEC.md` — 5 panel rows, 16 panels

### Phase E: Shadow Mode
- **Shadow Engine:** `ShadowModeEngine.ts` — fire-and-forget shadow on sample of requests
- **Comparison Service:** `ShadowComparison.service.ts` — Jaccard overlap, score delta, count delta
- **Runbook:** `RETRIEVAL_SHADOW_MODE_RUNBOOK.md` — activation, monitoring, escalation, rollback

### Phase F: Documentation
- Updated `CHANGELOG.md`, `CUTOVER_CHECKLIST.md`
- Produced 7 new documents: reaudit, file matrix, parity report, performance plan, SLO/alerts, dashboard, runbook
