# Pareto Summary - Path to A=50/50

**Current State:** 5 A-grades, 45 non-A grades
**Target:** 50 A-grades
**Gap:** 45 queries need upgrade

---

## Top 10 Recurring Failure Reasons

| Rank | Failure Reason | Count | Queries Affected | % of Non-A |
|------|----------------|-------|------------------|------------|
| 1 | **Incomplete/hedging answers** | 18 | q07, q11-13, q15, q17, q19, q22, q26, q31, q35-36, q40, q43, q46-47, q50 | 40% |
| 2 | **Language mixing (PT in EN)** | 8 | q23, q28, q29, q35, q37, q41, q49, (q33 implicit) | 18% |
| 3 | **Formatting violations** | 8 | q01, q03, q31, q44, q50, (others minor) | 18% |
| 4 | **Follow-up memory failure** | 6 | q14, q16, q19, q22, q36, q40 | 13% |
| 5 | **Help template on doc query** | 3 | q04, q14, q16 | 7% |
| 6 | **Wrong docs retrieved** | 5 | q12, q19, q36, q40, q22 | 11% |
| 7 | **Spreadsheet month semantics** | 5 | q11, q15, q26, q43 | 11% |
| 8 | **Instant template (no RAG)** | 3 | q04, q14, q16 | 7% |
| 9 | **Citation verbosity** | 3 | q02, q05, (others) | 7% |
| 10 | **Too verbose/formal** | 3 | q31, q35, q50 | 7% |

---

## Pareto Analysis: Fixes by Impact

### Tier 1: High Impact (fixes 20+ queries to A)

| Fix | Queries Upgraded | Effort | File/Function |
|-----|------------------|--------|---------------|
| **Answer completeness** | ~18 | Medium | `kodaAnswerEngineV3.ts` - remove hedging, increase depth |
| **Language enforcement** | ~8 | Low | `languageEnforcement.service.ts` - sanitize source fragments |

### Tier 2: Medium Impact (fixes 5-10 queries)

| Fix | Queries Upgraded | Effort | File/Function |
|-----|------------------|--------|---------------|
| **Follow-up memory** | 6 | Medium | `kodaRetrievalEngineV3.ts` - use lastDocumentIds boost |
| **Formatting pipeline** | 8 | Low | `kodaFormattingPipelineV3.ts` - enforce bullet/count |
| **Month normalization** | 5 | Medium | `monthNormalization.service.ts` - map month columns |

### Tier 3: Critical (blocks F→A)

| Fix | Queries Upgraded | Effort | File/Function |
|-----|------------------|--------|---------------|
| **Extraction intent routing** | 2 (q14, q16) | Low | `decisionTree.service.ts:294` - add wasDocContext check |
| **Excel intent routing** | 1 (q04) | Low | `routingPriority.service.ts` - boost excel confidence |
| **Language sanitization** | 1 (q28) | Low | `languageEnforcement.service.ts` - remove raw PT |

---

## Fastest Path to A=50/50

### Phase 1: Fix F-grades (3 queries → A)

**Time:** 30 minutes
**Impact:** F→A for q14, q16, q28

1. **Fix extraction intent routing** (`decisionTree.service.ts:294`)
   ```typescript
   case 'extraction':
     if (wasDocContext && hasDocs && !hasExplicitHelpKeyword) {
       return 'documents';  // ADD THIS
     }
     return 'extraction';
   ```
   **Upgrades:** q14, q16 from F to at least C

2. **Fix language sanitization** (`languageEnforcement.service.ts`)
   - Add post-generation sanitization to translate/quote PT fragments in EN answers
   **Upgrades:** q28 from F to B

### Phase 2: Fix D-grades (2 queries → A)

**Time:** 45 minutes
**Impact:** D→A for q04, q40

1. **Fix excel routing** (`routingPriority.service.ts`)
   - Boost excel intent when previous answer mentioned data from same doc
   **Upgrades:** q04 from D to B

2. **Fix lastDocumentIds retrieval boost** (`kodaRetrievalEngineV3.ts`)
   - Apply score boost to chunks from lastDocumentIds
   **Upgrades:** q40 from D to B

### Phase 3: Fix C-grades (16 queries → A)

**Time:** 2-3 hours
**Impact:** C→A for 16 queries

1. **Remove hedging patterns** (`kodaAnswerEngineV3.ts`)
   - Remove "Não vejo", "I don't see" when data exists
   - Increase answer depth for C-grade queries
   **Upgrades:** q07, q11-13, q15, q17, q46-47

2. **Fix month column mapping** (`monthNormalization.service.ts`)
   - Map spreadsheet column indices to month names
   **Upgrades:** q11, q15, q26, q43

3. **Fix follow-up retrieval** (`kodaRetrievalEngineV3.ts`)
   - Ensure lastDocumentIds boosts correct documents
   **Upgrades:** q19, q22, q36

### Phase 4: Fix B-grades (24 queries → A)

**Time:** 2-3 hours
**Impact:** B→A for 24 queries

1. **Language lock enforcement** (`languageEnforcement.service.ts`)
   - Quote or translate PT terms in EN answers
   **Upgrades:** q23, q29, q37, q41, q49

2. **Formatting enforcement** (`kodaFormattingPipelineV3.ts`)
   - Enforce bullet lists when implied
   - Enforce line counts ("6 linhas")
   **Upgrades:** q01, q03, q44

3. **Answer style tuning** (`answer_styles.json`)
   - Reduce verbosity for summary-style requests
   **Upgrades:** q09, q10, q31, q50

---

## ROI Analysis

| Fix Category | Queries Fixed | Lines of Code | ROI Score |
|--------------|---------------|---------------|-----------|
| Extraction routing | 2 | ~5 | **HIGH** |
| Language sanitization | 8 | ~30 | **HIGH** |
| lastDocIds boost | 6 | ~20 | **HIGH** |
| Hedging removal | 10 | ~15 | **MEDIUM** |
| Month mapping | 5 | ~50 | **MEDIUM** |
| Format enforcement | 8 | ~40 | **MEDIUM** |

---

## Recommended Fix Order

1. `decisionTree.service.ts:294` - extraction wasDocContext (2 F→B)
2. `languageEnforcement.service.ts` - sanitize PT fragments (8 queries)
3. `kodaRetrievalEngineV3.ts` - lastDocumentIds boost (6 queries)
4. `kodaAnswerEngineV3.ts` - remove hedging (10 queries)
5. `monthNormalization.service.ts` - month column mapping (5 queries)
6. `kodaFormattingPipelineV3.ts` - bullet/count enforcement (8 queries)

**With fixes 1-3:** All F/D grades eliminated, pass rate → 95%+
**With fixes 1-6:** All queries potentially A-grade, pass rate → 100%

---

## Key Code Locations Summary

| Issue | File | Function/Line |
|-------|------|---------------|
| Extraction routing | `src/services/core/decisionTree.service.ts` | `determineFamily()` line 294 |
| Follow-up intent | `src/services/core/conversationMemory.service.ts` | `getContext()` |
| lastDocIds save | `src/services/core/kodaOrchestratorV3.service.ts` | lines 826-832 |
| lastDocIds use | `src/services/core/kodaRetrievalEngineV3.service.ts` | `retrieveWithMetadata()` |
| Language lock | `src/services/core/languageEnforcement.service.ts` | `sanitize()` |
| Formatting | `src/services/core/kodaFormattingPipelineV3.service.ts` | `formatSimple()` |
| Month mapping | `src/services/core/monthNormalization.service.ts` | `normalizeMonth()` |
| Answer depth | `src/services/core/kodaAnswerEngineV3.service.ts` | `generateAnswer()` |
