# Deletion Plan - Cleanroom Hardening

## Phase 1: Remove Duplicate Detectors

### 1.1 Remove `detectFileActionQuery` from Orchestrator
**File**: `src/services/core/kodaOrchestratorV3.service.ts`
**Lines**: 6714-7077 (~360 lines)

**Reason**: Duplicates contentGuard.isFileActionQuery

**Replacement**:
```typescript
// Before
const fileAction = this.detectFileActionQuery(query);

// After
import { classifyQuery, isFileActionQuery } from './contentGuard.service';
const classification = classifyQuery(query, language);
const isFileAction = classification.type === 'file_action';
```

**Impact**: High - used in 5+ places in orchestrator

### 1.2 Remove Inline Patterns from DecisionTree
**File**: `src/services/core/decisionTree.service.ts`
**Lines**: 97-180 (PATTERNS const)

**Reason**: Should use runtimePatterns service instead

**Replacement**:
```typescript
// Before
const PATTERNS = { ... };
const isFileActionPattern = PATTERNS.somePattern.test(query);

// After
import { runtimePatterns } from './runtimePatterns.service';
const isFileActionPattern = runtimePatterns.isFileActionQuery(query, lang);
```

### 1.3 Remove Hardcoded Domain Patterns from Orchestrator
**File**: `src/services/core/kodaOrchestratorV3.service.ts`
**Lines**: 3941-3950

```typescript
// REMOVE THESE:
if (/revenue|sales|income/.test(queryLower)) { ... }
if (/expense|cost|spending/.test(queryLower)) { ... }
if (/profit|margin/.test(queryLower)) { ... }
if (/budget/.test(queryLower)) { ... }
```

**Replacement**: Move to `data_banks/routing/domain_signals.{en,pt}.json`

---

## Phase 2: Consolidate Done Event Emission

### 2.1 Refactor Orchestrator Done Emissions
**File**: `src/services/core/kodaOrchestratorV3.service.ts`

**Current done emissions at lines**:
- 1323, 1742, 1862, 1970, 2110, 2186, 2219, 2244, 2389, 2436, 2912, 8593

**Target**: All these should yield to composer, not emit done directly

**Pattern**:
```typescript
// Before
yield { type: 'done', fullAnswer: msg, composedBy: 'AnswerComposerV1' };

// After
const composed = getAnswerComposer().compose({
  rawAnswer: msg,
  context: composerContext,
  constraints: {}
});
yield* composed.events; // Composer yields content + done
```

### 2.2 Refactor AnswerEngine Done Emissions
**File**: `src/services/core/kodaAnswerEngineV3.service.ts`
**Lines**: 557, 585, 622, 755

**Same pattern as 2.1**

---

## Phase 3: Remove Unused Exports (ts-prune)

### High Priority Removals

| File | Export | Reason |
|------|--------|--------|
| `src/config/quotas.ts` | `QUOTA_TIERS`, `formatBytes` | Unused |
| `src/config/infinite-memory.config.ts` | `getChunkingConfig`, `getEmbeddingConfig`, etc. | Unused |
| `src/config/kodaPersonaConfig.ts` | `getKodaSystemPrompt`, `getIdentityNormalizationRules` | Unused |
| `src/controllers/session.controller.ts` | All exports | Route disabled |
| `src/controllers/analytics.controller.ts` | All exports | Route disabled |
| `src/infra/serviceTracer.ts` | Most exports | Debug only |
| `src/middleware/ipFilter.middleware.ts` | `checkAutoBlacklist`, `configureIPFilter` | Unused |

### Component Removals (Unused Slide Components)
- `src/components/ChartSlide.tsx`
- `src/components/ComparisonSlide.tsx`
- `src/components/ImageSlide.tsx`
- `src/components/QuoteSlide.tsx`
- `src/components/SummarySlide.tsx`
- `src/components/TextSlide.tsx`
- `src/components/TitleSlide.tsx`

**Decision**: Keep if presentation feature is planned, otherwise remove

---

## Phase 4: Remove Backup Files

| File | Action |
|------|--------|
| `src/services/core/routingPriority.service.ts.backup` | DELETE |

---

## Phase 5: Fix TypeScript Errors (Blocking Build)

### Critical Fixes Required

1. **Duplicate property names** in `kodaRetrievalEngineV3.service.ts:239-394`
2. **Type mismatches** in `kodaOrchestratorV3.service.ts`:
   - "browse" not assignable to '"text" | "list"'
   - Missing properties in streaming types
3. **Duplicate function implementations** in generators

### Suggested Approach
1. Run `npx tsc --noEmit` to get full error list
2. Fix type definitions first (streaming.types.ts)
3. Fix implementation mismatches
4. Re-run tsc until clean

---

## Phase 6: Archive vs Delete Decision Matrix

| Category | Files | Decision |
|----------|-------|----------|
| Disabled routes | sessionRoutes, agentRoutes, creativityRoutes | Archive to `/archive` |
| Unused configs | quotas.ts, infinite-memory.config.ts | Archive |
| Debug utilities | serviceTracer.ts | Keep (useful for debugging) |
| Backup files | *.backup | Delete |
| Test utilities | stress-test-*.ts | Keep in tests/ |

---

## Execution Order

1. **Fix TypeScript errors** (required for build)
2. **Remove duplicate detectors** (Phase 1)
3. **Consolidate done emissions** (Phase 2) - requires careful testing
4. **Remove unused exports** (Phase 3)
5. **Clean up backup files** (Phase 4)
6. **Run test ladder** to verify

---

## Rollback Strategy

Before each phase:
1. Create git checkpoint: `git stash` or `git commit -m "pre-cleanup checkpoint"`
2. Run test ladder
3. If tests fail after changes, `git checkout .` to revert

---

## Estimated Impact

| Phase | Files Modified | Lines Removed | Risk Level |
|-------|----------------|---------------|------------|
| 1 | 3 | ~500 | HIGH |
| 2 | 2 | ~200 | HIGH |
| 3 | 15+ | ~1000 | LOW |
| 4 | 1 | ~1500 | NONE |
| 5 | 5 | ~0 (fixes) | MEDIUM |
| 6 | 10+ | ~2000 | LOW |

**Total estimated removal**: ~5000 lines of code
