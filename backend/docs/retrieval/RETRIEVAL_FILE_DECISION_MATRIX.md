# Retrieval Engine — File Decision Matrix

**Date:** 2026-03-12
**Scope:** All 68 retrieval-related files (~27,400 lines)
**Purpose:** Classify every file's fate: keep as-is, rewrite, move, deprecate, or delete.

---

## Decision Categories

| Category | Meaning |
|----------|---------|
| **KEEP** | File is correct, well-placed, and needs no changes |
| **KEEP+FIX** | File stays but has specific bugs or gaps to address |
| **REWRITE** | File needs substantial rework (>50% changed) |
| **MOVE** | File needs to be relocated (path change, no logic change) |
| **DEPRECATE** | File is superseded by V2 equivalent; add deprecation notice, keep until parity proven |
| **DELETE** | File is dead code with no consumers |
| **NEW** | File must be created (does not exist yet) |

---

## 1. Shared Infrastructure (keep / keep+fix)

These files serve both V1 and V2 and are correctly placed.

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `retrieval.types.ts` | 482 | **KEEP+FIX** | Add `IRetrievalEngine` (rename from `IRetrievalOrchestrator` for consistency), add `RetrievalEngineFactory` type |
| `retrievalEngine.utils.ts` | 52 | **KEEP** | Already has `safeGetBank`, `clamp01`, `safeNumber`, `sha256`. No changes needed. |
| `docScopeLock.ts` | 182 | **KEEP** | Scope lock logic is shared and correct |
| `retrievalPlanParser.service.ts` | 233 | **KEEP** | Plan parsing is engine-agnostic |
| `slotResolver.service.ts` | 132 | **KEEP** | Slot resolution is engine-agnostic |

---

## 2. V1 Monolith (deprecate)

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `retrievalEngine.service.ts` | 4,189 | **DEPRECATE** | 1. Rename to `retrievalEngine.legacy.service.ts` 2. Add `@deprecated` JSDoc to class 3. Keep fully functional as V1 fallback 4. Do NOT delete until parity proven via 9 cutover conditions |

**Why not delete:** V2 has zero parity proof. V1 is the production-proven path. Deleting it before V2 is validated would be reckless.

**Why not rewrite as facade:** The facade pattern requires V2 to be complete and proven. We're not there yet.

---

## 3. V1 Helpers (deprecate when V2 equivalents proven)

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `sourceButtons.service.ts` | 674 | **KEEP** | Used by both V1 and V2 evidence packaging. No V2 replacement exists. |
| `evidenceGate.service.ts` | 571 | **KEEP** | Post-retrieval gate. Used by runtime, not by engine internals. Engine-agnostic. |
| `prismaRetrievalAdapters.service.ts` | 1,687 | **KEEP+FIX** | Shared adapter layer for both engines. Fix: propagate `isEncryptedOnlyMode` for Pinecone `minSimilarity` threshold (Bug G). |

---

## 4. V2 Modules (keep+fix / rewrite)

### 4a. V2 Config & Infrastructure

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `v2/retrieval.config.ts` | 104 | **KEEP+FIX** | Add logger import. Move to shared location if V1 also needs it. Currently V2-only which is correct. |
| `v2/RetrievalOrchestrator.service.ts` | 611 | **KEEP+FIX** | Add `listDocs()` per-request caching. Ensure all 12 steps have error boundaries. Needs tests. |
| `v2/RetrievalCache.service.ts` | 132 | **KEEP+FIX** | Add logger import. Otherwise correct. |
| `v2/RetrievalTelemetry.service.ts` | 106 | **KEEP+FIX** | Add logger import. Surface phase timeout results. |

### 4b. V2 Query Pipeline

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `v2/QueryPreparation.service.ts` | 80 | **KEEP+FIX** | Fix Bug B: line 65 redundant coalesce `languageHint ?? languageHint` → `languageHint ?? preferredLanguage` |
| `v2/QueryVariantBuilder.service.ts` | 272 | **KEEP** | Clean, correct. Needs tests only. |
| `v2/ScopeResolver.service.ts` | 411 | **KEEP+FIX** | Add logger import. Needs tests. |
| `v2/DocumentClassification.service.ts` | 318 | **KEEP** | Clean. Already partially tested. |

### 4c. V2 Retrieval Phases

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `v2/PhaseRunner.service.ts` | 247 | **KEEP** | Correct. Needs tests only. |
| `v2/CandidateMerge.service.ts` | 299 | **KEEP+FIX** | Fix Bug A: `extractTablePayload` must use `parseLocaleNumber()` from ConflictDetection instead of naive `Number()`. |

### 4d. V2 Scoring & Ranking

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `v2/NegativeRules.service.ts` | 226 | **KEEP** | Bug F (encrypted minRelevance) already fixed. Needs tests. |
| `v2/BoostEngine.service.ts` | 385 | **KEEP** | Correct. Needs tests (7 exports, zero coverage). |
| `v2/PlanHints.service.ts` | 264 | **KEEP** | Correct. Needs tests. |
| `v2/Ranker.service.ts` | 232 | **KEEP** | Bug C and D already fixed. Partially tested. |
| `v2/Diversifier.service.ts` | 132 | **KEEP** | Correct. Partially tested. |

### 4e. V2 Evidence Assembly

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `v2/EvidencePackager.service.ts` | 551 | **REWRITE** | `packageEvidence()` is 404 lines — must be split into 3-4 focused functions: evidence map building, source button assembly, per-doc capping, conflict integration. |
| `v2/SnippetCompression.service.ts` | 105 | **KEEP** | Correct, well-tested. |
| `v2/ConflictDetection.service.ts` | 125 | **KEEP** | Correct. `parseLocaleNumber()` is reusable (Bug A fix depends on it). |

---

## 5. V2 Test Files (keep+expand)

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `v2/__tests__/contract.test.ts` | 238 | **KEEP** | Covers evidence pack shapes. |
| `v2/__tests__/module-units.test.ts` | 319 | **KEEP+FIX** | Reduce `as any` casts (currently 8). Add tests for untested modules. |
| `v2/__tests__/bug-regression.test.ts` | 328 | **KEEP+FIX** | Reduce `as any` casts (currently 16). Add regression test for Bug A fix. |

---

## 6. V1 Test Files (keep until V1 deprecated)

All 14 test files under `retrieval/*.test.ts` stay as long as V1 exists.

| File | Lines | Decision |
|------|-------|----------|
| `retrievalEngine.error-paths.test.ts` | 241 | **KEEP** |
| `retrievalEngine.plan-hints.test.ts` | 239 | **KEEP** |
| `retrievalEngine.resilience.test.ts` | 157 | **KEEP** |
| `retrievalEngine.scope-lock.test.ts` | 119 | **KEEP** |
| `retrievalEngine.telemetry.test.ts` | 385 | **KEEP** |
| `retrievalEngine.utils.test.ts` | 45 | **KEEP** |
| `retrievalScoring.formula.test.ts` | 235 | **KEEP** |
| `retrievalDocLock.benchmark.test.ts` | 201 | **KEEP** |
| `prismaRetrievalAdapters.service.test.ts` | 480 | **KEEP** |
| `prismaRetrievalAdapters.stability.test.ts` | 84 | **KEEP** |
| `evidenceGate.service.test.ts` | 87 | **KEEP** |
| `sourceButtons.service.test.ts` | 226 | **KEEP** |
| `docScopeLock.test.ts` | 34 | **KEEP** |
| `retrievalPlanParser.service.test.ts` | 70 | **KEEP** |

---

## 7. Barrel Export (rewrite)

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `modules/retrieval/application/index.ts` | 76 | **REWRITE** | Must export: `IRetrievalEngine` (interface), `createRetrievalEngine()` (factory), shared types. Must NOT export: `RetrievalEngineService` directly, `RetrievalOrchestratorV2` directly. Consumers use factory only. |

---

## 8. Vector Embedding Stack (keep — out of scope)

These files are in the embedding/indexing path, not the retrieval orchestration path. They are consumers of retrieval types but not part of the engine rewrite.

| File | Lines | Decision |
|------|-------|----------|
| `services/retrieval/vectorEmbedding.service.ts` | 880 | **KEEP** (out of scope) |
| `services/retrieval/embedding.service.ts` | 456 | **KEEP** (out of scope) |
| `services/retrieval/pinecone.service.ts` | 651 | **KEEP** (out of scope) |
| `services/retrieval/gcsStorage.service.ts` | 403 | **KEEP** (out of scope) |
| `services/retrieval/chunkCrypto.service.ts` | 72 | **KEEP** (out of scope) |
| `services/retrieval/document_intelligence/ruleInterpreter.ts` | 1,249 | **KEEP** (out of scope) |
| `services/retrieval/pinecone/*.ts` (4 files) | ~220 | **KEEP** (out of scope) |
| All 6 embedding test files | ~2,503 | **KEEP** (out of scope) |

---

## 9. Certification Tests (keep+expand)

| File | Lines | Decision |
|------|-------|----------|
| `tests/certification/retrieval-behavioral.cert.test.ts` | 329 | **KEEP** |
| `tests/certification/retrieval-golden-eval.cert.test.ts` | 273 | **KEEP** |
| `tests/certification/evidence-fidelity.cert.test.ts` | 132 | **KEEP** |
| `tests/certification/no-lexical-evidence-reparse.cert.test.ts` | 67 | **KEEP** |

---

## 10. Consumer Sites (rewrite)

| File | Lines | Decision | Action |
|------|-------|----------|--------|
| `modules/chat/runtime/CentralizedChatRuntimeDelegate.ts` | 6,404 | **KEEP+FIX** | Replace direct `process.env.RETRIEVAL_USE_V2_ORCHESTRATOR` read + manual construction with `createRetrievalEngine()` factory call. ~15 lines changed. |

---

## 11. Files That Must Be Created (NEW)

| File | Purpose | Blocked By |
|------|---------|------------|
| `v2/RetrievalEngineFactory.ts` | Factory: reads config, returns `IRetrievalEngine` (V1 or V2) | REWRITE_PLAN approval |
| `v2/__tests__/parity.test.ts` | V1 vs V2 equivalence test suite | Factory + both engines working |
| `v2/__tests__/BoostEngine.test.ts` | Unit tests for 7 untested exports | None |
| `v2/__tests__/NegativeRules.test.ts` | Unit tests for 2 untested exports | None |
| `v2/__tests__/PhaseRunner.test.ts` | Unit tests for phase execution | None |
| `v2/__tests__/PlanHints.test.ts` | Unit tests for 4 untested exports | None |
| `v2/__tests__/QueryVariantBuilder.test.ts` | Unit tests for 3 untested exports | None |
| `v2/__tests__/ScopeResolver.test.ts` | Unit tests for 11 untested exports | None |
| `v2/__tests__/RetrievalOrchestrator.test.ts` | Integration test for 12-step pipeline | All module tests passing |
| `v2/__tests__/performance.test.ts` | Latency benchmarks for ranking/packaging | None |
| `v2/__tests__/EvidencePackager.test.ts` | Tests for split packager functions | EvidencePackager rewrite |

---

## Summary Counts

| Decision | Files | Lines |
|----------|-------|-------|
| KEEP | 38 | ~12,400 |
| KEEP+FIX | 12 | ~4,100 |
| REWRITE | 2 | ~630 |
| DEPRECATE | 1 | ~4,190 |
| DELETE | 0 | 0 |
| NEW | 11 | ~2,500 (est.) |
| Out of scope | 16 | ~5,930 |
| **Total** | **80** (68 existing + 11 new + 1 rename) | ~29,750 |

---

## Key Decisions Explained

**Why zero deletes:** Every file has either active consumers or is needed as V1 fallback. No dead code was found.

**Why deprecate, not delete, V1:** V2 has zero parity proof, zero production traffic, 41% untested modules. V1 is the proven path. Deprecation marks intent without destroying the safety net.

**Why rewrite EvidencePackager:** `packageEvidence()` at 404 lines is the single largest function in V2. It combines 4 distinct responsibilities. Splitting it is the highest-leverage maintainability improvement.

**Why rewrite barrel:** The current barrel exports both engine implementations directly, allowing consumers to bypass the factory pattern. The rewrite narrows the public surface to interface + factory only.

**Why vector stack is out of scope:** The embedding/indexing pipeline is architecturally separate from retrieval orchestration. It produces the Pinecone index that retrieval queries against, but the two don't share code paths beyond types.
