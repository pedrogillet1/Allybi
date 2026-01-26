# Routing 500 Test Results

**Date**: 2026-01-21
**Verdict**: FAIL

## Summary

| Metric | Value |
|--------|-------|
| Total Queries | 500 |
| Passed | 22 |
| Failed | 478 |
| Errors | 464 |
| Pass Rate | 4.40% |

## By Intent Family

| Family | Total | Passed | Rate |
|--------|-------|--------|------|
| file_actions | 150 | 22 | 14.7% |
| documents | 249 | 0 | 0.0% |
| doc_stats | 50 | 0 | 0.0% |
| help | 50 | 0 | 0.0% |

## Critical Issues Identified

### 1. Language Detection Failing
- Portuguese queries detected as English
- Example: "ordenar por nome" → language=en (should be pt)

### 2. Document Intent Family Completely Broken
- 0% pass rate for document queries
- All document queries routing to extract operator

### 3. File Actions Misrouted
- "list all my uploaded files" → documents/extract (should be file_actions/list)
- "mostrar apenas planilhas" → documents/extract (should be file_actions/filter)

### 4. Help and Doc Stats Not Working
- 0% pass rate for both
- Not being recognized at all

## Root Cause Analysis

The routing system appears to have fundamental issues:

1. **Intent Engine Defaulting**: Most queries defaulting to documents/extract
2. **Bank Patterns Not Matching**: File action patterns not triggering correctly
3. **Language Detection Bug**: Portuguese not being detected

## Required Fixes Before Deploy

1. Fix language detection service
2. Debug intent engine pattern matching
3. Verify bank patterns are loaded correctly
4. Add debug logging to understand routing decisions

## Pass Criteria (NOT MET)

- [ ] ≥99% overall (actual: 4.4%)
- [ ] ≥99.7% on collision suites
- [ ] PT ≥98.5% (actual: ~0%)
- [ ] unknown ≤0.5% (actual: likely high)
