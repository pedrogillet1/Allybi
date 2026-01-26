# Preflight Findings Report

Generated: 2026-01-16 19:47

## Critical Findings

### P0.9 ✅ FIXED: List Cap Changed from 8 to 10

**Severity:** RESOLVED

**Location:** `backend/src/services/core/kodaOrchestratorV3.service.ts:3346-3358`

**Current Code:**
```typescript
// Truncate to first 8 DOC markers if too long
if (markers.length > 8) {
  const keptMarkers = markers.slice(0, 8).join('\n');
  const textBeforeMarkers = processedAnswer.split('{{DOC::')[0].trim().substring(0, 100);
  // P0-6: Add LOAD_MORE marker so frontend can offer "See All" button
  const loadMoreMarker = createLoadMoreMarker({
    total: markers.length,
    shown: 8,
    remaining: markers.length - 8,
  });
```

**Issue:** The code truncates document lists to 8 items, but the requirement specifies 10 items per list cap before showing "See All".

**Remediation:**

1. Change condition from `> 8` to `> 10`
2. Change slice from `slice(0, 8)` to `slice(0, 10)`
3. Change `shown: 8` to `shown: 10`
4. Change `remaining: markers.length - 8` to `remaining: markers.length - 10`

**Fixed Code:**
```typescript
// Truncate to first 10 DOC markers if too long
if (markers.length > 10) {
  const keptMarkers = markers.slice(0, 10).join('\n');
  const textBeforeMarkers = processedAnswer.split('{{DOC::')[0].trim().substring(0, 100);
  // P0-6: Add LOAD_MORE marker so frontend can offer "See All" button
  const loadMoreMarker = createLoadMoreMarker({
    total: markers.length,
    shown: 10,
    remaining: markers.length - 10,
  });
```

---

## Warnings

### P0.8 NEEDS VERIFICATION: Metadata Leaks in File Listing

**Severity:** MEDIUM

**Status:** Static inspection inconclusive - requires runtime verification

**Description:** Need to verify that `formatResultsAsMarkdown` in fileSearch.service.ts does not expose internal file paths or database IDs in user-visible output.

**Verification Method:**
```bash
# Run query that triggers file listing
curl -X POST http://localhost:5000/api/rag/query/stream \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"list all my documents","userId":"test-user-001"}'
# Check output for internal paths like /Users/, /var/, or raw UUIDs
```

---

### P0.15 PARTIAL: Single Source of Truth for Banks

**Severity:** LOW

**Status:** Multiple loaders exist - not fully consolidated

**Description:** Found multiple locations loading intent patterns:
- `dataBankRegistry.ts:78-79`: Registers `intent_patterns_runtime`
- `dataBankLoader.ts:344`: `getBank('intent_patterns_runtime')` accessor
- `intentConfig.service.ts:50`: Direct load from `intent_patterns.runtime.json`
- `brainDataLoader.service.ts:182`: Direct load from `intent_patterns.json`

**Recommendation:** After bank generation completes, consolidate all loaders to use the registry/loader pattern exclusively.

---

## Pending Verifications

### P0.16: EN/PT Parity

**Status:** PENDING - Waiting for bank generation to complete

**Action:** Run parity linter:
```bash
npx ts-node tools/data_bank_generator_v2/lint_parity.ts
```

**Acceptance Criteria:** EN and PT item counts within ±5%

---

### P0.17: No Duplicates and No Critical Collisions

**Status:** PENDING - Waiting for bank generation to complete

**Action:** Run dedupe and collision scans:
```bash
npx ts-node tools/data_bank_generator_v2/dedupe_banks.ts
npx ts-node tools/data_bank_generator_v2/collision_scan.ts
```

**Acceptance Criteria:**
- Zero exact duplicates within same intent
- No critical collisions between intents (e.g., "summarize this" matching both documents and extraction)

---

## Remediation Priority

| Finding | Severity | Action Required |
|---------|----------|-----------------|
| P0.9 | ✅ RESOLVED | Fixed - list cap changed to 10 in kodaOrchestratorV3.service.ts:3346 |
| P0.8 | MEDIUM | Runtime verification of metadata in file listings |
| P0.15 | LOW | Consolidate bank loaders after generation |
| P0.16 | BLOCKING | Run parity linter after generation |
| P0.17 | BLOCKING | Run dedupe/collision after generation |

---

## Next Steps

1. **IMMEDIATE:** Apply P0.9 fix (list cap 8 → 10)
2. **AFTER GENERATION:** Run P0.16 parity linter
3. **AFTER GENERATION:** Run P0.17 dedupe/collision scans
4. **IF ALL PASS:** Create PREFLIGHT_READY.md to unblock frontend testing
