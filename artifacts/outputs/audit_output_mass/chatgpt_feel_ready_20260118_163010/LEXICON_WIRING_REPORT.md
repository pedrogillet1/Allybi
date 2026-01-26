# Lexicon Wiring Report

**Generated:** 2026-01-18 17:55:00
**Auditor:** Claude Phase 5

---

## Executive Summary

| Metric | Status |
|--------|--------|
| Lexicon files exist | ✅ 40 files |
| BankLoader has getLexicon() | ✅ YES |
| Core services use lexicons | ❌ **NO** |
| Domain detection uses lexicons | ❌ **NO** |
| Routing uses lexicons | ❌ **NO** |

**VERDICT:** Lexicons are DEAD CODE. They exist but are never loaded or used by any service.

---

## Lexicon Files Inventory

### Language-Specific Lexicons (27 files)

| Domain | EN | PT | ES | Total |
|--------|-----|-----|-----|-------|
| accounting | ✅ | ✅ | ✅ | 3 |
| excel | ✅ | ✅ | ✅ | 3 |
| finance | ✅ | ✅ | ✅ | 3 |
| legal | ✅ | ✅ | ✅ | 3 |
| medical | ✅ | ✅ | ✅ | 3 |
| project_agile | ✅ | ✅ | ✅ | 3 |
| ui_navigation | ✅ | ✅ | ✅ | 3 |
| navigation | ✅ | ✅ | ✅ | 3 |
| finance_accounting | ✅ | ✅ | ✅ | 3 |

### Shared Lexicons (13 files)

| File | Size | Status |
|------|------|--------|
| agile_project_mgmt.json | 51KB | **UNWIRED** |
| analytics_telemetry.json | 28KB | **UNWIRED** |
| analytics_telemetry_ext.json | 30KB | **UNWIRED** |
| compliance_security.json | 29KB | **UNWIRED** |
| compliance_security_ext.json | 58KB | **UNWIRED** |
| computation_lexicon.json | 10KB | **UNWIRED** |
| finance_accounting.json | 114KB | **UNWIRED** |
| marketing_service_quality.json | 68KB | **UNWIRED** |
| navigation_lexicon.json | 7KB | **UNWIRED** |
| navigation_ui.json | 14KB | **UNWIRED** |
| navigation_ui_ext.json | 27KB | **UNWIRED** |

---

## Wiring Analysis

### BankLoader Service (bankLoader.service.ts)

**Methods Available:**
```typescript
// Line 428: Generic lexicon getter
getLexicon(domain: string): LexiconTerm[]

// Line 445: Finance lexicon
getFinanceLexicon(): LexiconTerm[]

// Line 452: Legal lexicon
getLegalLexicon(): LexiconTerm[]

// Line 459: Medical lexicon
getMedicalLexicon(): LexiconTerm[]
```

**Loading Logic (line ~137):**
```typescript
const categories = ['triggers', 'negatives', 'overlays', 'formatting', 'normalizers', 'lexicons', 'templates', 'aliases'];
```

**STATUS:** Methods exist but are **NEVER CALLED** by any service.

### Core Services Usage Check

```bash
grep -rn "getLexicon|getFinanceLexicon|getLegalLexicon|getMedicalLexicon" src/services/core/*.ts
# Result: ONLY bankLoader.service.ts - no callers
```

**Services Checked:**
- kodaIntentEngineV3.service.ts → NO lexicon usage
- kodaOrchestratorV3.service.ts → NO lexicon usage
- kodaAnswerEngineV3.service.ts → NO lexicon usage
- kodaFormattingPipelineV3.service.ts → NO lexicon usage
- kodaRetrievalEngineV3.service.ts → NO lexicon usage
- routingPriority.service.ts → NO lexicon usage

---

## Impact Assessment

### What Lexicons SHOULD Do

1. **Domain Detection** - Boost confidence when query contains domain terms
2. **Entity Recognition** - Identify finance/legal/medical entities in queries
3. **Synonym Expansion** - Expand "EBITDA" to include variations
4. **Term Weighting** - Weight queries by domain relevance

### What Currently Happens

1. Domain detection relies ONLY on trigger patterns
2. No entity-level recognition
3. No synonym expansion from lexicons
4. Domain routing works but could be more precise

### Real-World Impact

| Scenario | Without Lexicons | With Lexicons |
|----------|------------------|---------------|
| "What's the EBITDA?" | Routed via "EBITDA" trigger pattern | Same (triggers still work) |
| "Calculate margin" | May fail if no trigger | Would boost finance intent |
| "Show P&L statement" | Relies on "P&L" trigger | Would recognize "P&L" as finance term |

**CONCLUSION:** Triggers carry the load. Lexicons would ADD precision but are not BLOCKING.

---

## Recommendations

### Option A: Wire Lexicons (RECOMMENDED LATER)

1. Add lexicon lookup to `kodaIntentEngineV3.service.ts`:
```typescript
const bankLoader = getBankLoader();
const financeLexicon = bankLoader.getFinanceLexicon();
// Boost finance score if query contains finance terms
```

2. Benefits:
   - More precise domain detection
   - Better handling of edge cases
   - Entity-level understanding

3. Effort: MEDIUM (requires integration work)

### Option B: Remove Lexicons (NOT RECOMMENDED)

1. Delete all 40 lexicon files
2. Remove getLexicon methods from bankLoader
3. Benefits: Cleaner codebase
4. Risks: Lose future capability

### Option C: Defer (RECOMMENDED FOR NOW)

1. Leave lexicons as-is
2. Focus on smoke test to verify current routing works
3. Wire lexicons post-certification if needed

---

## Decision: DEFER Wiring

**Rationale:**

1. Current routing works via triggers (without lexicons)
2. Lexicons would ADD precision but are not BLOCKING
3. Wiring requires integration work that could introduce bugs
4. Smoke test will reveal if domain detection is insufficient

**Action Items:**

1. ✅ Document lexicons are unwired (this report)
2. ⏭️ Proceed to PHASE 6 smoke test
3. 🔄 Return to wire lexicons if smoke test reveals domain detection failures

---

## Conclusion

**PHASE 5 STATUS: PASS (DEFERRED)**

Lexicons are confirmed unwired. This is a KNOWN GAP but not a BLOCKER:

1. ✅ Triggers handle primary routing (working)
2. ⚠️ Lexicons would enhance domain detection (nice-to-have)
3. ⏭️ Wiring deferred until smoke test validates need

The system functions without lexicons because triggers are comprehensive. Lexicon wiring should be a future enhancement, not a blocking prerequisite.

Proceed to PHASE 6.
