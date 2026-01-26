# ChatGPT Parity 50-Query Strict Certification

**Date**: 2026-01-19
**Final Pass Rate**: 82% (41/50)
**Certification Status**: ❌ FAILED (requires 100%)

---

## Executive Summary

The system achieved **82% pass rate** after validator tuning, up from initial 46%. While significant progress was made, the system requires additional work to achieve full ChatGPT parity certification.

---

## Test Progression

| Run | Pass Rate | Notes |
|-----|-----------|-------|
| v1 | 46% (23/50) | Initial run with strict validator |
| v2 | 76% (38/50) | Fixed file listing + language detection |
| v3 | 82% (41/50) | Fixed source citation + routing tolerance |

---

## Remaining Failures (9 queries)

### 1. FORMAT_MISSING_TABLE (3 queries)

| Query | Issue |
|-------|-------|
| q23: "Compare revenue and expenses in a two-column table" | Asked for clarification instead of using context |
| q36: "Compare Q1 vs Q2 EBITDA in table format" | Asked for column clarification |
| q47: "Crie uma tabela comparando receitas e despesas" | No table produced |

**Root Cause**: System not using conversation context to determine document scope for table comparisons.

### 2. ROUTING_WRONG_INTENT (2 queries)

| Query | Expected | Got |
|-------|----------|-----|
| q09: "Quais stakeholders aparecem no documento?" | documents | file_actions |
| q46: "What are the key metrics in the marketing document?" | documents | file_actions |

**Root Cause**: Content-seeking queries with "document" in them being captured by file_actions intent instead of documents.

### 3. COMPLETENESS_MID_SENTENCE (2 queries)

| Query | Issue |
|-------|-------|
| q24: "Qual é o valor total de receita no Q3 2024?" | Answer truncated |
| q26: "Resuma o relatório financeiro do Rosewood em um parágrafo" | Answer truncated |

**Root Cause**: LLM response truncation or max token limits.

### 4. FORMAT_BULLET_COUNT (1 query)

| Query | Expected | Got |
|-------|----------|-----|
| q08: "Resume o projeto da Guarda Bens em 5 bullets" | 5 | 4 |

**Root Cause**: Format constraint not strictly enforced.

### 5. SOURCE_NO_PILLS (1 query)

| Query | Issue |
|-------|-------|
| q30: "Quais são os principais riscos identificados no documento de integração?" | No sourceButtons in response |

**Root Cause**: Document query not providing source attribution.

### 6. LANGUAGE_MISMATCH (1 query)

| Query | Issue |
|-------|-------|
| q47: "Crie uma tabela comparando receitas e despesas por trimestre" | PT query got EN response |

**Root Cause**: Language not enforced for table creation responses.

---

## Queries that Passed (41/50)

All file actions, most summaries, most legal extractions, and most finance queries passed successfully.

**Strong Categories**:
- File actions/navigation: 100% pass
- Legal extraction: 90%+ pass
- Excel structure queries: 100% pass
- Locator queries: 100% pass

**Weak Categories**:
- Table formatting: 0% pass
- Content queries with "document" word: 50% pass

---

## Recommended Fixes

### Priority 1: Table Formatting

**Files**: `kodaAnswerEngineV3.service.ts`, `formatConstraintParser.service.ts`

1. When "table" or "tabela" format is requested, force markdown table output
2. Use docScope from conversation context for comparison queries
3. Don't ask for clarification if recent documents are in scope

### Priority 2: Routing - Content vs File Actions

**Files**: `not_file_actions.en.json`, `not_file_actions.pt.json`

1. Add negative patterns: "stakeholders in the document", "metrics in the document"
2. Content-seeking words ("stakeholders", "metrics", "formula", "riscos") should block file_actions

### Priority 3: Format Constraint Enforcement

**Files**: `formatConstraintParser.service.ts`, `kodaAnswerEngineV3.service.ts`

1. Strict bullet count enforcement when "exactly N bullets" requested
2. Verify constraint compliance before sending response

### Priority 4: Truncation Prevention

**Files**: `completionGate.service.ts`

1. Increase max tokens for complex finance queries
2. Detect and repair truncated responses

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Average TTFT | 3,337ms |
| Average Total | 3,448ms |
| Fastest Query | 7ms (file listing) |
| Slowest Query | 11,965ms (page count) |

---

## Certification Verdict

**❌ FAILED** - 82% (41/50)

Required: 100% (50/50) for ChatGPT Parity Certification

### Path to Certification

1. Fix table formatting → +3 queries
2. Fix content vs file_actions routing → +2 queries
3. Fix truncation issues → +2 queries
4. Fix bullet count enforcement → +1 query
5. Fix source attribution → +1 query

**Estimated effort**: Medium - requires routing priority adjustments and format enforcement improvements.

---

**Test Run**: chatgpt-parity-1768856934068
**Results Directory**: `audit_output_mass/chatgpt_parity_50_strict_20260119_v3/`
