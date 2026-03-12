# Retrieval Engine — Full Re-Audit

**Date:** 2026-03-12
**Auditor:** Automated analysis (Claude Code)
**Scope:** All retrieval-related code under `backend/src/services/core/retrieval/`, `backend/src/modules/retrieval/`, and consumer sites in `CentralizedChatRuntimeDelegate.ts`

---

## Executive Summary

The retrieval engine exists in a dual-engine state. A 4,189-line V1 monolith (`retrievalEngine.service.ts`) is the **default runtime**. A 4,600-line V2 decomposition across 18 modules is opt-in via `RETRIEVAL_USE_V2_ORCHESTRATOR` env flag. Both engines implement `IRetrievalOrchestrator` and are publicly exported through the barrel.

**Current honest score: 51/100.**

The V2 work improved architecture (+10 vs pre-decomposition) but introduced new problems: duplicate code paths, split test coverage, 7 modules with zero tests, and 2 confirmed bugs. No production traffic has run through V2. No parity proof exists.

---

## Section-by-Section Grading

### Architecture — 11/20

| Evidence | Score Impact |
|----------|-------------|
| V2 decomposition into 18 single-responsibility modules | +6 |
| `IRetrievalOrchestrator` interface with both engines implementing it | +2 |
| Centralized `retrieval.config.ts` (all env reads consolidated) | +2 |
| `BANK_IDS` constants registry (15 IDs, no hardcoded strings in v2) | +1 |
| **Dual-engine state**: both V1 and V2 publicly exported, no single surface | -3 |
| **V1 monolith still 4,189 lines**: not demoted, not fenced, not deprecated | -2 |
| **No factory**: consumer (`CentralizedChatRuntimeDelegate`) directly reads `process.env` to pick engine | -2 |
| **Barrel exports both engines**: import confusion possible | -1 |
| `EvidencePackager.packageEvidence()` is 404 lines — needs split | -1 |
| `RetrievalOrchestrator.retrieve()` is 611 lines total | -1 |

**Key blocker:** Two public engines with no factory, no deprecation fence, and the consumer hardcodes `process.env` selection logic.

### Correctness — 8/15

| Evidence | Score Impact |
|----------|-------------|
| Bug C (TOC penalty timing): correctly fixed in V2 — penalty applied post-ranking | +2 |
| Bug D (encrypted weight redistribution): correctly implemented in V2 | +2 |
| Bug E (scope lock bypass): correctly distinguishes system vs user locks | +1 |
| Bug F (minRelevanceScore encrypted mode): correctly lowered to 0.10 | +2 |
| Encrypted-mode evidence recovery pipeline working (20/20 tests passing) | +2 |
| **Bug A (locale parsing)**: `CandidateMerge.extractTablePayload()` uses `Number(stripped.replace(/,/g,""))` — breaks on BR/EU `1.250,00` format. `parseLocaleNumber()` exists in `ConflictDetection.service.ts` but is not reused. | -2 |
| **Bug B (redundant coalesce)**: `QueryPreparation.ts:65` — `req.signals?.languageHint ?? req.signals?.languageHint ?? "en"` — same expression twice. Should be `languageHint ?? preferredLanguage ?? "en"` | -1 |
| **Bug G (Pinecone thresholds)**: V2 does NOT propagate `isEncryptedOnlyMode` to `prismaRetrievalAdapters` for Pinecone `minSimilarity` adjustment. Adapter still uses hardcoded `0.2`. | -1 |
| No V1-vs-V2 parity test exists — correctness equivalence unproven | -3 |

**Key blocker:** No parity proof. Bug A affects financial document accuracy for BR/EU locales.

### Maintainability — 8/15

| Evidence | Score Impact |
|----------|-------------|
| V2 modules have clear single responsibility (18 focused files) | +4 |
| Shared types in `retrieval.types.ts` (473 lines, well-structured) | +2 |
| Shared utils in `retrievalEngine.utils.ts` (safeGetBank, clamp01, safeNumber, sha256) | +2 |
| Config centralization eliminates scattered env reads | +1 |
| Only 1 `as any` cast across all V2 service modules | +1 |
| Zero TODO/FIXME/HACK comments in V2 | +1 |
| **V1 monolith still exists as-is**: duplicate logic, no deprecation markers | -3 |
| **16 functions exceed 80 lines** (largest: `packageEvidence` at 404 lines) | -2 |
| **Remaining duplicates**: V1 still has its own `isEncryptedOnlyMode`, `shouldEnforceScopedDocSet`, `isFailClosedMode` | -1 |
| Dual-engine state doubles cognitive load for new developers | -2 |

**Key blocker:** V1 monolith is not fenced or deprecated. Developers must understand both engines.

### Testability — 5/15

| Evidence | Score Impact |
|----------|-------------|
| V2: 3 test files, 34 test cases covering 10 of 17 modules | +3 |
| V1: 14 test files, 80 test cases | +2 |
| Certification: 2 files, 3 test cases | +1 |
| Bug regression suite covers 7 named bugs with proof | +1 |
| **7 V2 modules have ZERO test coverage**: BoostEngine (7 exports), NegativeRules (2), PhaseRunner (1), PlanHints (4), QueryVariantBuilder (3), RetrievalOrchestrator (1), ScopeResolver (11) | -5 |
| **RetrievalOrchestratorV2 (the entry point) is completely untested** | -2 |
| **No parity test suite**: V1/V2 equivalence unverifiable | -2 |
| **60 `as any` casts across all test files** — type-unsafe mocking | -1 |
| **No performance benchmarks**: no test asserts latency or throughput | -1 |

**Key blocker:** 41% of V2 modules (7/17) have zero test coverage. The orchestrator itself is untested.

### Performance — 5/10

| Evidence | Score Impact |
|----------|-------------|
| Phase timeout handling in `PhaseRunner` (configurable per phase) | +2 |
| Retrieval cache with TTL (`RetrievalCache.service.ts`) | +2 |
| Encrypted-mode optimizations (weight redistribution, threshold lowering) | +1 |
| **No performance benchmarks exist**: no latency assertions | -2 |
| **`listDocs()` called multiple times per request**: no per-request caching | -1 |
| **No shadow-mode profiling**: V2 latency vs V1 unknown | -2 |

**Key blocker:** Zero performance data. Cannot claim V2 is faster or equivalent.

### Policy/Config — 7/10

| Evidence | Score Impact |
|----------|-------------|
| `retrieval.config.ts`: frozen config object, typed defaults | +3 |
| `BANK_IDS` constants: 15 named IDs, no magic strings in V2 | +2 |
| `failMode` (open/closed) centralized | +1 |
| `isEncryptedOnlyMode` centralized with multi-signal detection | +1 |
| **V1 still has its own env reads**: not migrated to shared config | -1 |
| **Consumer reads `process.env` directly** for engine selection (not via config/factory) | -1 |
| **4 v2 modules missing logger**: RetrievalCache, RetrievalTelemetry, ScopeResolver, retrieval.config | -1 |

**Key blocker:** Minor. Config is well-centralized for V2 but V1 is not wired to it.

### Observability — 4/10

| Evidence | Score Impact |
|----------|-------------|
| 14 of 18 V2 modules import logger | +2 |
| `RetrievalTelemetry.service.ts` builds diagnostic objects | +1 |
| Error boundary: V2 instantiation failure falls back to V1 with log | +1 |
| **4 modules lack logger** | -1 |
| **No structured retrieval metrics** (latency per phase, score distributions, cache hit rate) | -3 |
| **No alert/threshold triggers**: failures are logged but not actionable | -2 |
| **Phase timeout results not surfaced** in telemetry | -1 |

**Key blocker:** Logging is present but not actionable. No metrics pipeline.

### Safety/Scope — 3/5

| Evidence | Score Impact |
|----------|-------------|
| Scope lock enforced with source distinction (system vs user) | +1 |
| Fail-mode (open/closed) respects config | +1 |
| Encrypted-mode correctly handles all scoring stages | +1 |
| **No runtime invariant checks**: invalid bank data not caught at load time | -1 |
| **V2 error boundary is catch-all**: errors are swallowed, not classified | -1 |

---

## Score Summary

| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Architecture | 20% | 11/20 | 11.0 |
| Correctness | 15% | 8/15 | 8.0 |
| Maintainability | 15% | 8/15 | 8.0 |
| Testability | 15% | 5/15 | 5.0 |
| Performance | 10% | 5/10 | 5.0 |
| Policy/Config | 10% | 7/10 | 7.0 |
| Observability | 10% | 4/10 | 4.0 |
| Safety/Scope | 5% | 3/5 | 3.0 |
| **Total** | **100%** | | **51/100** |

---

## Top 20 Blockers (Ordered by Impact)

### Critical (blocks cutover)

| # | Blocker | Location | Evidence |
|---|---------|----------|----------|
| 1 | **No V1/V2 parity proof** — zero tests compare output of both engines on same input | Missing entirely | Neither engine can be declared equivalent |
| 2 | **RetrievalOrchestratorV2 is untested** — the 12-step pipeline entry point has no test | `v2/RetrievalOrchestrator.service.ts` (611 lines) | Zero test cases import this class |
| 3 | **7/17 V2 modules have zero test coverage** (41%) | BoostEngine, NegativeRules, PhaseRunner, PlanHints, QueryVariantBuilder, RetrievalOrchestrator, ScopeResolver | No test file covers these exports |
| 4 | **Dual-engine public surface** — both V1 and V2 exported, no single interface gate | `modules/retrieval/application/index.ts` exports both | Consumer hardcodes `process.env` for selection |
| 5 | **No performance data** — latency/throughput of V2 vs V1 unknown | Missing entirely | No benchmark test exists |

### High (degrades quality significantly)

| # | Blocker | Location | Evidence |
|---|---------|----------|----------|
| 6 | **Bug A: locale number parsing** — `extractTablePayload` breaks on BR/EU format `1.250,00` | `CandidateMerge.service.ts:287` | Uses `Number(stripped.replace(/,/g,""))` instead of `parseLocaleNumber()` |
| 7 | **Bug B: redundant coalesce** — `languageHint ?? languageHint ?? "en"` | `QueryPreparation.service.ts:65` | Same expression twice; second should be `preferredLanguage` |
| 8 | **Bug G: Pinecone min-similarity not encrypted-aware in adapter** | `prismaRetrievalAdapters.service.ts:1089` | Hardcoded `0.2` threshold, no `isEncryptedOnlyMode` check |
| 9 | **V1 monolith (4,189 lines) not deprecated** — no markers, no fence, still default | `retrievalEngine.service.ts` | File has no deprecation notice or migration path |
| 10 | **`packageEvidence()` is 404 lines** — single function doing packaging, dedup, balance, conflict detection, per-doc capping | `EvidencePackager.service.ts` | Needs split into 3-4 focused functions |

### Medium (technical debt)

| # | Blocker | Location | Evidence |
|---|---------|----------|----------|
| 11 | **16 functions exceed 80 lines** — cognitive load, harder to test | Across 8 V2 modules | Largest: `packageEvidence` (404), `runPhases` (219), `applyBoosts` (216) |
| 12 | **60 `as any` casts in test files** — type-unsafe mocking patterns | All test suites combined | `plan-hints` (12), `resilience` (10), `bug-regression` (16) |
| 13 | **V1 duplicate helpers still exist** — `isEncryptedOnlyMode`, `shouldEnforceScopedDocSet`, `isFailClosedMode` | `retrievalEngine.service.ts` | V2 versions exist but V1 copies remain |
| 14 | **No factory for engine construction** — consumer directly reads `process.env` | `CentralizedChatRuntimeDelegate.ts:5527` | `process.env.RETRIEVAL_USE_V2_ORCHESTRATOR` hardcoded |
| 15 | **4 V2 modules missing logger** | RetrievalCache, RetrievalTelemetry, ScopeResolver, retrieval.config | No `import { logger }` present |

### Low (cleanup)

| # | Blocker | Location | Evidence |
|---|---------|----------|----------|
| 16 | **No structured metrics pipeline** — logs exist but not actionable | All V2 modules | Logger calls but no metric counters/histograms |
| 17 | **Certification tests minimal** — only 3 test cases for retrieval certification | `tests/certification/retrieval-*.test.ts` | 1 behavioral + 2 golden eval |
| 18 | **Barrel exports too broad** — re-exports internal V2 implementation details | `modules/retrieval/application/index.ts` | Should export only `IRetrievalOrchestrator` + factory |
| 19 | **`listDocs()` called multiple times per request** — no per-request caching | `RetrievalOrchestrator.service.ts` | Same DB query repeated in scope resolution and evidence packaging |
| 20 | **Phase timeout results not surfaced** in telemetry | `PhaseRunner.service.ts` | Timeouts are handled but not reported |

---

## File Inventory

### V2 Modules (18 files, 4,600 lines)

| File | Lines | Test Coverage | Logger |
|------|-------|---------------|--------|
| RetrievalOrchestrator.service.ts | 611 | NONE | Yes |
| EvidencePackager.service.ts | 551 | Partial (contract) | Yes |
| ScopeResolver.service.ts | 411 | NONE | No |
| BoostEngine.service.ts | 385 | NONE | Yes |
| DocumentClassification.service.ts | 318 | Partial (1 fn) | Yes |
| CandidateMerge.service.ts | 299 | Partial (dedup) | Yes |
| QueryVariantBuilder.service.ts | 272 | NONE | Yes |
| PlanHints.service.ts | 264 | NONE | Yes |
| PhaseRunner.service.ts | 247 | NONE | Yes |
| Ranker.service.ts | 232 | Partial (2 fns) | Yes |
| NegativeRules.service.ts | 226 | NONE | Yes |
| Diversifier.service.ts | 132 | Partial (1 fn) | Yes |
| RetrievalCache.service.ts | 132 | Partial (1 fn) | No |
| ConflictDetection.service.ts | 125 | Partial (parseLocaleNumber) | Yes |
| RetrievalTelemetry.service.ts | 106 | Partial (2 fns) | No |
| SnippetCompression.service.ts | 105 | Partial (1 fn) | Yes |
| retrieval.config.ts | 104 | NONE (config) | No |
| QueryPreparation.service.ts | 80 | Partial (2 fns) | Yes |

### V1 Monolith

| File | Lines | Status |
|------|-------|--------|
| retrievalEngine.service.ts | 4,189 | DEFAULT runtime, undeprecated |

### Shared Infrastructure

| File | Lines | Role |
|------|-------|------|
| retrieval.types.ts | 473 | All shared types + IRetrievalOrchestrator |
| retrievalEngine.utils.ts | ~45 | clamp01, safeNumber, sha256, safeGetBank |
| retrievalPlanParser.service.ts | ~180 | Plan parsing |
| prismaRetrievalAdapters.service.ts | ~1,200 | DB/Pinecone adapters |
| sourceButtons.service.ts | ~200 | Source pill rendering |
| evidenceGate.service.ts | ~80 | Evidence gate enforcement |
| docScopeLock.ts | ~60 | Scope lock data structure |

### Test Files

| Location | Files | Cases | Coverage Target |
|----------|-------|-------|-----------------|
| v2/__tests__/ | 3 | 34 | 10/17 modules (partial) |
| retrieval/*.test.ts | 14 | 80 | V1 monolith (scattered) |
| certification/ | 2 | 3 | Integration |
| **Total** | **19** | **117** | |

---

## Uncommitted Working Tree Changes

Phase 1 (config centralization) and partial Phase 2 (interface, error boundary, logger additions) from an earlier plan iteration are applied but uncommitted. These affect ~20 files. The rewrite plan must decide: incorporate, adjust, or redo.

**Applied changes:**
- `retrieval.config.ts` created with `RETRIEVAL_CONFIG` + `BANK_IDS`
- `safeGetBank` moved to shared utils (removed from 3 files)
- `shouldEnforceScopedDocSet` deduplicated (removed from NegativeRules, imported from ScopeResolver)
- `IRetrievalOrchestrator` interface added to `retrieval.types.ts`
- Both engines marked `implements IRetrievalOrchestrator`
- V2 error boundary with V1 fallback in `CentralizedChatRuntimeDelegate.ts`
- Logger added to 14/18 V2 modules
- All `process.env` reads in V2 replaced with `RETRIEVAL_CONFIG.*`
- All hardcoded bank IDs in V2 replaced with `BANK_IDS.*`

---

## Honest Assessment

**What V2 does well:**
- Clean single-responsibility decomposition (18 focused modules vs 1 monolith)
- Strong type safety (1 `as any` in all service code)
- Config and bank ID centralization
- Correct encrypted-mode handling in ranking, negatives, and scope resolution

**What V2 does NOT do yet:**
- Prove it produces equivalent output to V1
- Prove it meets latency requirements
- Test 41% of its own modules
- Present a single public surface (factory + interface)
- Deprecate or fence the V1 monolith

**Ceiling from code changes alone: 73-76/100.** The remaining ~25 points require production deployment, real benchmarks, soak periods, and golden-query infrastructure.
