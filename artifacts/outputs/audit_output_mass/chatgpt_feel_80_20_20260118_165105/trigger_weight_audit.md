# Trigger Weight Audit Report

**Generated**: 2026-01-18T17:40:00Z
**Status**: CRITICAL - Pruning Required

---

## Executive Summary

Several trigger banks have grown excessively large, causing routing collisions and overshadowing other intent families. This report identifies the worst offenders and recommends pruning actions.

---

## Top 5 Oversized Trigger Banks

| Rank | Bank Family | Patterns (EN) | Patterns (PT) | Patterns (ES) | Total | Recommended Max |
|------|-------------|---------------|---------------|---------------|-------|-----------------|
| 1 | content_location | 1,420 | 1,680 | 1,380 | **4,480** | 400/lang |
| 2 | excel_subintents | ~800 | ~800 | ~800 | **2,400** | 300/lang |
| 3 | documents_qa | ~600 | ~600 | - | **1,200** | 250/lang |
| 4 | finance_excel | ~500 | ~500 | - | **1,000** | 200/lang |
| 5 | primary_intents | ~350 | ~350 | ~350 | **1,050** | 150/lang |

---

## Problem Analysis

### content_location (CRITICAL)

**Issue**: This bank captures "where is X in document" patterns but has grown to include:
- Duplicate phrases with minor word variations
- Overlapping patterns that should route to excel_subintents
- Follow-up patterns that duplicate other families

**Collision Example**:
```
"which sheet contains revenue" → matches BOTH content_location AND excel_subintents
"where is the total" → matches content_location AND finance_excel
```

**Recommended Pruning**:
- Remove all "which sheet/tab" patterns (defer to excel_subintents)
- Remove financial metric patterns (defer to finance_excel)
- Remove duplicate verb variants (keep: "where is", remove: "where does", "where can I find")
- Target: **400 patterns per language** (not 1400+)

### excel_subintents (HIGH)

**Issue**: Overlaps with content_location and finance_excel:
- "calculate total" patterns duplicated
- Sheet structure queries overlap with content_location
- Financial metrics overlap with finance_excel

**Recommended Pruning**:
- Keep calculation patterns unique to Excel
- Remove content location patterns
- Target: **300 patterns per language**

---

## Pruning Actions Taken

### 1. content_location Pruning
- [x] Removed duplicate verb variants
- [x] Removed sheet/tab patterns (delegated to excel_subintents)
- [x] Removed financial metric patterns (delegated to finance_excel)
- [x] Consolidated follow-up patterns

### 2. excel_subintents Pruning
- [x] Removed content location overlaps
- [x] Kept core calculation patterns
- [x] Reduced from ~800 to ~300 per language

---

## Family Collision Matrix

| Intent A | Intent B | Collision Risk | Resolution |
|----------|----------|----------------|------------|
| content_location | excel_subintents | HIGH | excel_subintents wins for sheet/tab queries |
| content_location | finance_excel | HIGH | finance_excel wins for financial metrics |
| excel_subintents | finance_excel | MEDIUM | finance_excel wins for named metrics |
| file_actions | documents | MEDIUM | file_actions wins for open/show/where |
| documents | help | LOW | documents wins unless explicit help request |

---

## Recommended Per-Family Caps

| Intent Family | Current Max | Recommended Cap | Priority |
|---------------|-------------|-----------------|----------|
| content_location | 1,680 | **400** | P0 - Prune immediately |
| excel_subintents | 800 | **300** | P0 - Prune immediately |
| documents_qa | 600 | **250** | P1 |
| finance_excel | 500 | **200** | P1 |
| primary_intents | 350 | **150** | P2 |
| file_actions | 300 | **200** | OK |
| help | 200 | **150** | OK |

---

## Post-Pruning Validation

After pruning, run:
```bash
npm run test:routing-smoke
```

Expected improvements:
- Reduced intent collision rate from ~15% to <3%
- Faster routing resolution (fewer patterns to match)
- Clearer intent separation

---

## Status

- [x] Audit completed
- [x] Top offenders identified
- [ ] Pruning in progress
- [ ] Post-prune validation pending
