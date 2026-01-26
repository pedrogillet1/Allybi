# Fix Backlog - Path to A=50/50

**Generated:** 2026-01-15T20:00:00Z
**Source:** deep_grade_20260115T194500/
**Current State:** A=5, B=24, C=16, D=2, F=3 (90% pass rate)
**Target:** A=50 (100% pass rate)

---

## Priority 1: F-Grade Fixes (BLOCKING)

### F1. q14 & q16: Extraction intent bypass on follow-up

| Field | Value |
|-------|-------|
| Queries | q14, q16 |
| Grade | F |
| Root Cause | `extraction` case in decisionTree.service.ts bypasses wasDocContext check |
| Evidence | q14: "Abril e maio..." routed to extraction (9ms, 0 sources); q16: "Com base nesses números..." routed to extraction (12ms, 0 sources) |
| File | `backend/src/services/core/decisionTree.service.ts` |
| Location | Line 294-295 |
| Fix | Add wasDocContext + hasDocs check before returning extraction |

**Current code (line 294-295):**
```typescript
case 'extraction':
  return 'extraction';
```

**Fixed code:**
```typescript
case 'extraction':
  // CRITICAL FIX: Block extraction when previous turn was doc-related
  if (wasDocContext && hasDocs && !hasExplicitHelpKeyword) {
    return 'documents';
  }
  return 'extraction';
```

---

### F2. q28: Raw Portuguese in English answer

| Field | Value |
|-------|-------|
| Query | q28 |
| Grade | F |
| Root Cause | languageEnforcement.service.ts doesn't sanitize cross-language fragments |
| Evidence | Answer contains "aparência, cheiro e organização da loja" without translation |
| File | `backend/src/services/core/languageEnforcement.service.ts` |
| Location | sanitize() function (or create new) |
| Fix | Add post-generation sanitization to translate/quote PT fragments in EN answers |

---

## Priority 2: D-Grade Fixes (HIGH)

### D1. q04: Documents follow-up misrouted to excel

| Field | Value |
|-------|-------|
| Query | q04 |
| Grade | D |
| Root Cause | "intervalo" (range) pattern triggered excel intent instead of documents |
| Evidence | Intent=excel, 0 sources, 10ms latency (instant template) |
| Files | `backend/src/services/core/routingPriority.service.ts`, `backend/src/data/intent_patterns.runtime.json` |
| Fix | Tighten excel triggers; add follow-up inheritance boost for documents |

---

### D2. q40: Follow-up retrieved wrong docs

| Field | Value |
|-------|-------|
| Query | q40 |
| Grade | D |
| Root Cause | lastDocumentIds not boosted in retrieval |
| Evidence | q40 "o guia" should stick to Integration Guide, but retrieved Scrum PDF |
| File | `backend/src/services/core/kodaRetrievalEngineV3.service.ts` |
| Location | retrieveWithMetadata() |
| Fix | Apply score boost to chunks from lastDocumentIds |

---

## Priority 3: C-Grade Fixes (MEDIUM)

### C1. Month column mapping (q11, q15, q26, q43)

| Field | Value |
|-------|-------|
| Queries | q11, q15, q26, q43 |
| Grade | C |
| Root Cause | Spreadsheet columns not mapped to month names |
| Evidence | Hedges "não vejo" for month questions, no November data found |
| File | `backend/src/services/core/monthNormalization.service.ts` or spreadsheet chunking |
| Fix | Map column indices to canonical month names |

---

### C2. Hedging removal (q07, q13, q17, q46, q47)

| Field | Value |
|-------|-------|
| Queries | q07, q13, q17, q46, q47 |
| Grade | C |
| Root Cause | Answer hedges "não vejo", "não está explícito" when data exists |
| File | `backend/src/services/core/kodaAnswerEngineV3.service.ts` |
| Location | generateAnswer() or post-processor |
| Fix | Remove hedging when evidence exists in sources |

---

### C3. Follow-up memory failures (q19, q22, q36)

| Field | Value |
|-------|-------|
| Queries | q19, q22, q36 |
| Grade | C |
| Root Cause | lastDocumentIds not used effectively |
| Evidence | Wrong docs retrieved on follow-ups |
| File | `backend/src/services/core/kodaRetrievalEngineV3.service.ts` |
| Fix | Same as D2 - boost lastDocumentIds |

---

## Priority 4: B-Grade Fixes (POLISH)

### B1. Language lock enforcement (q23, q29, q35, q37, q41, q49)

| Field | Value |
|-------|-------|
| Queries | q23, q29, q35, q37, q41, q49 |
| Grade | B |
| Root Cause | PT fragments in EN answers not translated |
| Evidence | PT quoted without translation in EN answers |
| File | `backend/src/services/core/languageEnforcement.service.ts` |
| Fix | Same as F2 - sanitize cross-language fragments |

---

### B2. Formatting enforcement (q01, q03, q44)

| Field | Value |
|-------|-------|
| Queries | q01, q03, q44 |
| Grade | B |
| Root Cause | Bullet/list format not enforced, line count not enforced |
| Evidence | No bullet formatting, "6 linhas" constraint ignored |
| Files | `backend/src/services/core/kodaFormattingPipelineV3.service.ts`, `backend/src/services/core/formatConstraintParser.ts` |
| Fix | Enforce bullet lists when implied; enforce line counts |

---

### B3. Style tuning (q09, q10, q31, q50)

| Field | Value |
|-------|-------|
| Queries | q09, q10, q31, q50 |
| Grade | B |
| Root Cause | Too verbose, too formal for "chat" style |
| File | `backend/src/data/answer_styles.json` |
| Fix | Reduce verbosity, add casual chat style option |

---

## Implementation Order

1. **F1** - decisionTree.service.ts extraction fix (5 LOC) → q14, q16 F→B+
2. **F2** - languageEnforcement.service.ts sanitizer (30 LOC) → q28 F→B+
3. **D2/C3** - kodaRetrievalEngineV3.ts lastDocIds boost (20 LOC) → q40, q19, q22, q36 D/C→B+
4. **D1** - routingPriority.service.ts excel tightening (15 LOC) → q04 D→B+
5. **C2** - kodaAnswerEngineV3.ts hedging removal (15 LOC) → q07, q13, q17, q46, q47 C→B+
6. **B1** - languageEnforcement already covered by F2
7. **B2** - kodaFormattingPipelineV3.ts enforcement (40 LOC) → q01, q03, q44 B→A
8. **C1** - monthNormalization.service.ts mapping (50 LOC) → q11, q15, q26, q43 C→B+

---

## Files to Modify (Summary)

| File | Changes | Impact |
|------|---------|--------|
| `decisionTree.service.ts` | Add wasDocContext check for extraction | 2 F→B |
| `languageEnforcement.service.ts` | Add cross-language sanitizer | 8 queries |
| `kodaRetrievalEngineV3.service.ts` | Boost lastDocumentIds | 6 queries |
| `routingPriority.service.ts` | Tighten excel triggers | 1 D→B |
| `kodaAnswerEngineV3.service.ts` | Remove hedging patterns | 5 queries |
| `kodaFormattingPipelineV3.service.ts` | Enforce bullets/counts | 3 queries |
| `monthNormalization.service.ts` | Map column to month | 4 queries |
