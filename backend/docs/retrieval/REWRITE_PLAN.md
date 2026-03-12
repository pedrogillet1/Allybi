# Retrieval Engine — Rewrite Plan

**Date:** 2026-03-12
**Prerequisites:** RETRIEVAL_REAUDIT.md (51/100 score), FILE_DECISION_MATRIX.md (80 files classified)
**Target score:** 73-76/100 (code-only ceiling; remaining 25 pts require production deployment)

---

## Target Architecture

```
Consumer (CentralizedChatRuntimeDelegate)
    │
    ▼
createRetrievalEngine(deps, config)  ←── RetrievalEngineFactory.ts (NEW)
    │
    ├── V1: RetrievalEngineService (legacy, default)
    │       └── retrievalEngine.legacy.service.ts (renamed)
    │
    └── V2: RetrievalOrchestratorV2 (opt-in via RETRIEVAL_USE_V2_ORCHESTRATOR)
            └── 17 focused modules (existing v2/)
    │
    ▼
IRetrievalEngine interface  ←── retrieval.types.ts
    retrieve(req: RetrievalRequest): Promise<EvidencePack>
```

**One public surface:** `modules/retrieval/application/index.ts` exports only `IRetrievalEngine`, `createRetrievalEngine()`, and shared types. No direct engine class exports.

**One factory:** `createRetrievalEngine()` reads config, constructs the correct engine, returns `IRetrievalEngine`. Consumer never touches `process.env` for engine selection.

**One interface:** `IRetrievalEngine` is the only type consumers depend on. Both V1 and V2 implement it.

---

## Execution Phases

### Phase 3A: Interface + Factory

**Goal:** Single public retrieval surface.

**Files to create:**
- `v2/RetrievalEngineFactory.ts` (~60 lines)

**Files to modify:**
- `retrieval.types.ts` — rename `IRetrievalOrchestrator` → `IRetrievalEngine` (update all refs)
- `retrievalEngine.service.ts` — update `implements` clause
- `v2/RetrievalOrchestrator.service.ts` — update `implements` clause

**Factory contract:**
```typescript
import type { IRetrievalEngine } from "../retrieval.types";
import { RETRIEVAL_CONFIG } from "./retrieval.config";

export function createRetrievalEngine(deps: RetrievalDeps): IRetrievalEngine {
  const useV2 = ["1","true","yes","on"].includes(
    String(process.env.RETRIEVAL_USE_V2_ORCHESTRATOR || "").trim().toLowerCase()
  );
  if (useV2) {
    try {
      return new RetrievalOrchestratorV2(deps);
    } catch (err) {
      logger.error("[retrieval] V2 instantiation failed, falling back to V1", { err });
    }
  }
  return new RetrievalEngineService(deps);
}
```

**Verification:**
- `npx tsc --noEmit` passes
- Factory returns correct engine based on env var
- Error boundary catches V2 construction failure

---

### Phase 3B: V1 Monolith Deprecation

**Goal:** V1 file renamed and marked deprecated. Still functional.

**Actions:**
1. Rename `retrievalEngine.service.ts` → `retrievalEngine.legacy.service.ts`
2. Add `@deprecated` JSDoc to `RetrievalEngineService` class
3. Update all imports (factory, barrel, test files) to new path
4. V1 remains the DEFAULT engine — no behavior change

**Verification:**
- `npx tsc --noEmit` passes
- All existing V1 tests still pass (they import from new path)
- `rg "retrievalEngine\.service" --glob '!*.legacy.*' --glob '!*.md'` returns zero hits (all refs updated)

---

### Phase 3C: Config Finalization

**Goal:** Zero `process.env` reads outside `retrieval.config.ts` and the factory.

**Current state:** V2 modules already migrated. Only remaining `process.env` read is the V2 flag in `CentralizedChatRuntimeDelegate.ts`.

**Actions:**
1. Move V2 flag read from `CentralizedChatRuntimeDelegate.ts` into factory (done as part of Phase 3A)
2. Verify: `rg "process\.env" backend/src/services/core/retrieval/v2/ --glob '!retrieval.config.ts' --glob '!RetrievalEngineFactory.ts'` returns zero hits
3. Add logger to remaining 4 V2 modules (RetrievalCache, RetrievalTelemetry, ScopeResolver, retrieval.config)

**Verification:**
- Zero `process.env` in V2 modules except config and factory
- All 18 V2 modules have logger import

---

### Phase 3D: Consumer Rewrite

**Goal:** `CentralizedChatRuntimeDelegate` uses factory, not direct construction.

**Before (current, ~20 lines):**
```typescript
const useV2 = String(process.env.RETRIEVAL_USE_V2_ORCHESTRATOR || "").trim().toLowerCase();
let retrievalEngine: { retrieve(r: RetrievalRequest): Promise<EvidencePack> };
if (["1", "true", "yes", "on"].includes(useV2)) {
  try {
    retrievalEngine = new RetrievalOrchestratorV2(dependencies);
    this.logger.info("[retrieval] Using V2 orchestrator");
  } catch (err) {
    this.logger.error("[retrieval] V2 failed, falling back to V1", { err });
    retrievalEngine = new RetrievalEngineService(dependencies);
  }
} else {
  retrievalEngine = new RetrievalEngineService(dependencies);
}
```

**After (~3 lines):**
```typescript
const retrievalEngine: IRetrievalEngine = createRetrievalEngine(dependencies);
```

**Verification:**
- `CentralizedChatRuntimeDelegate` no longer imports either engine class directly
- It imports only `IRetrievalEngine` and `createRetrievalEngine`

---

### Phase 3E: Barrel Rewrite

**Goal:** One public surface, no leaked internals.

**Before (current):**
```typescript
export { RetrievalEngineService } from "...";
export { RetrievalOrchestratorV2 } from "...";
// + many internal types
```

**After:**
```typescript
// Public API
export type { IRetrievalEngine } from "../../../services/core/retrieval/retrieval.types";
export { createRetrievalEngine } from "../../../services/core/retrieval/v2/RetrievalEngineFactory";

// Shared types (needed by consumers)
export type {
  RetrievalRequest,
  EvidencePack,
  EvidenceItem,
  RetrievalScope,
  DocMeta,
} from "../../../services/core/retrieval/retrieval.types";

// Helper services (engine-agnostic)
export { SourceButtonsService } from "../../../services/core/retrieval/sourceButtons.service";
export { EvidenceGateService } from "../../../services/core/retrieval/evidenceGate.service";
```

**Verification:**
- `rg "RetrievalEngineService|RetrievalOrchestratorV2" backend/src/modules/` returns zero hits outside the internal retrieval directory
- All consumers compile with narrowed exports

---

### Phase 3F: V2 Bug Fixes

Three confirmed bugs to fix:

**Bug A — Locale number parsing** (`CandidateMerge.service.ts:287`):
- Import `parseLocaleNumber` from `ConflictDetection.service.ts`
- Replace `Number(stripped.replace(/,/g, ""))` with `parseLocaleNumber(stripped)`
- Add regression test for BR format `1.250,00`

**Bug B — Redundant coalesce** (`QueryPreparation.service.ts:65`):
- Change `req.signals?.languageHint ?? req.signals?.languageHint ?? "en"`
- To: `req.signals?.languageHint ?? req.signals?.preferredLanguage ?? "en"`
- Add regression test

**Bug G — Pinecone min-similarity** (`prismaRetrievalAdapters.service.ts`):
- Pass `isEncryptedOnlyMode` from `RETRIEVAL_CONFIG` to adapter
- Lower `minSimilarity` from `0.2` to `0.10` in encrypted mode
- Add regression test

**Verification:**
- Each bug fix has a corresponding test that fails before and passes after
- `npx tsc --noEmit` passes

---

### Phase 3G: EvidencePackager Split

**Goal:** Split 404-line `packageEvidence()` into focused functions.

**Target decomposition:**
1. `buildEvidenceMap()` (~120 lines) — evidence item assembly per candidate
2. `assembleSourceButtons()` (~80 lines) — source attribution UI objects
3. `applyPerDocCapping()` (~60 lines) — cap items per document
4. `integrateConflicts()` (~40 lines) — merge conflict detection results
5. `packageEvidence()` (~100 lines) — orchestrator calling the above 4

All functions stay in `EvidencePackager.service.ts` (no new files). The split is internal decomposition for testability and readability.

**Verification:**
- Existing contract tests still pass
- `packageEvidence()` produces identical output
- Each sub-function is independently testable

---

### Phase 4: Dead Code Cleanup

**Actions:**
1. Remove V1 duplicate helpers that are now in shared utils:
   - `isEncryptedOnlyMode()` in `retrievalEngine.legacy.service.ts` → use `RETRIEVAL_CONFIG.isEncryptedOnlyMode`
   - `shouldEnforceScopedDocSet()` in `retrievalEngine.legacy.service.ts` → import from ScopeResolver
   - `isFailClosedMode()` in `retrievalEngine.legacy.service.ts` → import from retrieval.config
   - `safeGetBank()` in `retrievalEngine.legacy.service.ts` → import from utils
2. Verify no stale imports point to deleted V2 files (from git status: deleted `*.v2.service.ts` files)
3. Clean up stale re-exports in barrel if any remain

**Verification:**
- `rg "function isEncryptedOnlyMode" backend/src/services/core/retrieval/` → 0 hits (only in config)
- `rg "function shouldEnforceScopedDocSet" backend/src/services/core/retrieval/` → 1 hit (ScopeResolver)
- `rg "function safeGetBank" backend/src/services/core/retrieval/` → 1 hit (utils)
- `npx tsc --noEmit` passes

---

### Phase 5: Test Surface

**Goal:** 25+ test files covering all V2 modules, parity, and performance.

#### 5a. Per-Module Unit Tests (7 new files)

| Test File | Target Module | Min Cases | Priority |
|-----------|--------------|-----------|----------|
| `BoostEngine.test.ts` | BoostEngine (7 exports) | 5 | High — production-critical scoring |
| `NegativeRules.test.ts` | NegativeRules (2 exports) | 4 | High — candidate filtering |
| `PhaseRunner.test.ts` | PhaseRunner (1 export) | 3 | High — timeout handling |
| `PlanHints.test.ts` | PlanHints (4 exports) | 4 | Medium |
| `QueryVariantBuilder.test.ts` | QueryVariantBuilder (3 exports) | 4 | Medium |
| `ScopeResolver.test.ts` | ScopeResolver (11 exports) | 6 | High — scope enforcement |
| `EvidencePackager.test.ts` | EvidencePackager (split functions) | 5 | High — evidence assembly |

#### 5b. Orchestrator Integration Test (1 new file)

| Test File | Purpose | Min Cases |
|-----------|---------|-----------|
| `RetrievalOrchestrator.test.ts` | 12-step pipeline with mocked deps | 5 |

#### 5c. Parity Test (1 new file)

| Test File | Purpose | Min Cases |
|-----------|---------|-----------|
| `parity.test.ts` | Same input → same output for V1 and V2 | 3 (skip initially) |

#### 5d. Performance Benchmark (1 new file)

| Test File | Purpose | Min Cases |
|-----------|---------|-----------|
| `performance.test.ts` | Latency assertions for ranking/packaging | 4 (skip initially) |

#### 5e. Existing Test Improvements

- Reduce `as any` casts in `module-units.test.ts` from 8 to ≤3
- Reduce `as any` casts in `bug-regression.test.ts` from 16 to ≤6
- Add Bug A, Bug B, Bug G regression tests to `bug-regression.test.ts`

**Total test target:** 34 existing + ~43 new = ~77 test cases across 13 test files.

**Verification:**
- `npx jest --testPathPattern="backend/src/services/core/retrieval/v2/__tests__" --verbose` — all pass
- `rg "as any" backend/src/services/core/retrieval/v2/__tests__/ --count` — total ≤ 15

---

### Phase 6: Cutover Verification

All 9 conditions must be TRUE:

| # | Condition | How to Verify |
|---|-----------|---------------|
| 1 | `IRetrievalEngine` is the only public interface | `rg "RetrievalEngineService\|RetrievalOrchestratorV2" backend/src/modules/` → 0 outside retrieval dir |
| 2 | `createRetrievalEngine()` is the only construction path | `rg "new RetrievalEngineService\|new RetrievalOrchestratorV2" backend/src/ --glob '!*.test.*' --glob '!*.legacy.*' --glob '!*Factory*'` → 0 |
| 3 | Zero `process.env` in V2 modules (except config/factory) | `rg "process\.env" backend/src/services/core/retrieval/v2/ --glob '!retrieval.config.ts' --glob '!RetrievalEngineFactory.ts'` → 0 |
| 4 | Zero hardcoded bank IDs in V2 modules (except config) | `rg "getBank\(\"" backend/src/services/core/retrieval/v2/ --glob '!retrieval.config.ts'` → 0 |
| 5 | All 17 V2 modules have test coverage | Each module's exports appear in at least one test file |
| 6 | All 3 bug fixes have regression tests | Bug A, B, G tests in `bug-regression.test.ts` |
| 7 | V1 monolith is renamed and deprecated | File is `retrievalEngine.legacy.service.ts` with `@deprecated` |
| 8 | TypeScript compiles cleanly | `npx tsc --noEmit` → 0 retrieval errors |
| 9 | All retrieval tests pass | `npx jest --testPathPattern="retrieval" --verbose` → 0 failures |

---

### Phase 7: Reports

Three documents to produce after all work is complete:

1. **RETRIEVAL_REAUDIT_POST.md** — Re-run the same audit from Phase 0 with updated scores
2. **CUTOVER_CHECKLIST.md** — 9 conditions with pass/fail evidence (command output)
3. **CHANGELOG.md** — Summary of all changes, bugs fixed, files created/modified/renamed

---

## Execution Order

```
Phase 3A (interface + factory)
  └→ Phase 3B (V1 rename/deprecate)
  └→ Phase 3C (config finalization)
  └→ Phase 3D (consumer rewrite)
  └→ Phase 3E (barrel rewrite)
  └→ Phase 3F (bug fixes: A, B, G)
  └→ Phase 3G (EvidencePackager split)
Phase 4 (dead code cleanup) — depends on 3A-3G
Phase 5 (test surface) — depends on 3F, 3G
Phase 6 (cutover verification) — depends on 4, 5
Phase 7 (reports) — depends on 6
```

Phases 3A-3E are sequential (each builds on the previous). Phases 3F and 3G can run in parallel with 3D-3E. Phase 5 can start partially during Phase 3F (writing tests for unmodified modules).

---

## What This Plan Does NOT Do

- **Delete V1 monolith** — requires production parity proof first
- **Deploy V2 as default** — requires shadow mode + soak period
- **Create golden query test suite** — requires real Pinecone data
- **Measure production latency** — requires staging environment
- **Score above 76** — remaining points need production infrastructure

These are post-cutover activities tracked separately.
