# Strict Certification Report

**Date**: 2026-01-17T15:33:49
**Conversation ID**: strict-cert-1768675142072 (single conversation)
**Total Queries**: 50

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Pass Rate** | 42.0% (21/50) |
| **Hard Failures** | 29 |
| **Avg TTFT** | ~2500ms |
| **Avg Total Time** | ~3200ms |

### Critical Issues (Blocking Production)
1. **Portuguese Language Support**: 15 failures - PT queries get EN responses
2. **Intent Routing**: 13 failures - File/doc intent confusion
3. **Truncation**: 5 failures - Answers cut mid-sentence

---

## Pass/Fail by Category

| Category | Total | Passed | Failed | Pass Rate |
|----------|-------|--------|--------|-----------|
| inventory | 3 | 2 | 1 | 67% |
| inventory_filter | 6 | 4 | 2 | 67% |
| file_action | 6 | 5 | 1 | 83% |
| file_action_followup | 2 | 1 | 1 | 50% |
| qa_constrained | 15 | 3 | 12 | 20% |
| qa | 7 | 5 | 2 | 71% |
| qa_followup | 3 | 1 | 2 | 33% |
| locator | 5 | 2 | 3 | 40% |
| finance | 1 | 0 | 1 | 0% |
| finance_followup | 2 | 1 | 1 | 50% |

### Analysis
- **Worst performer**: qa_constrained (20% pass) - formatting constraints not enforced
- **Best performer**: file_action (83% pass) - EN file actions working well
- **Finance queries**: High failure rate due to language + truncation

---

## Failure Breakdown by Rule

| Rule | Count | % of Failures |
|------|-------|---------------|
| LANGUAGE_MISMATCH | 15 | 36% |
| ROUTING_WRONG_INTENT | 13 | 31% |
| COMPLETENESS_TRUNCATION | 5 | 12% |
| COMPLETENESS_PARAGRAPH_COUNT | 2 | 5% |
| COMPLETENESS_NUMBERED_COUNT | 2 | 5% |
| COMPLETENESS_MID_SENTENCE | 2 | 5% |
| COMPLETENESS_MISSING_TABLE | 2 | 5% |
| COMPLETENESS_BULLET_COUNT | 1 | 2% |
| COMPLETENESS_BUTTON_ONLY | 1 | 2% |
| MISSING_INFO_REQUIRED_TERM | 1 | 2% |
| UI_NO_SEE_ALL | 1 | 2% |
| DRIFT_NO_SOURCES | 1 | 2% |

---

## Top 10 Failing Queries (Detailed)

### 1. q07: "Liste todos os meus documentos" (PT inventory)
- **Expected**: file_actions with sourceButtons + seeAll
- **Got**: documents intent, EN response, truncated
- **Failures**: 4 (truncation, language, routing, UI)
- **Root Cause**: PT file action keywords missing + no language lock

### 2. q09: "Abra ele" (PT follow-up open)
- **Expected**: file_actions, button-only
- **Got**: documents, full content in EN
- **Failures**: 3 (button-only violation, language, routing)
- **Root Cause**: PT "abra" not in file_actions patterns

### 3. q14: "Summarize the Koda Integration Guide in a table"
- **Expected**: documents intent, table format
- **Got**: file_actions, no content
- **Failures**: 2 (routing, mid-sentence)
- **Root Cause**: "Guide" filename triggered file_actions despite "Summarize"

### 4. q24: "Compare the topics... in a table"
- **Expected**: documents, table format
- **Got**: file_actions, no table
- **Failures**: 2 (routing, missing table)
- **Root Cause**: "Presentation" filename triggered file_actions

### 5. q37: "Liste os principais conceitos em exatamente 5 itens numerados"
- **Expected**: 5 numbered items, PT response
- **Got**: 1 item, EN response
- **Failures**: 2 (numbered count, language)
- **Root Cause**: Constraint not enforced + language lock missing

### 6. q41: "Summarize it as a table with Topic and Details"
- **Expected**: table, sources
- **Got**: no table, no sources
- **Failures**: 3 (mid-sentence, missing table, no sources)
- **Root Cause**: Follow-up context lost, format not enforced

### 7. q45: "List the test questions... in exactly 10 bullets"
- **Expected**: 10 bullets
- **Got**: 4 bullets
- **Failures**: 1 (bullet count)
- **Root Cause**: Constraint not enforced

### 8. q46: "Onde estão os arquivos sobre pensões?"
- **Expected**: file_actions, PT
- **Got**: documents, EN
- **Failures**: 2 (routing, language)
- **Root Cause**: PT "onde estão" not triggering file_actions

### 9. q50: "Summarize Interview 1 in exactly 3 bullets"
- **Expected**: documents
- **Got**: engineering
- **Failures**: 1 (routing)
- **Root Cause**: "Interview" may have triggered engineering domain

### 10. q10: "Resuma o documento... em exatamente 3 parágrafos"
- **Expected**: 3 paragraphs, PT
- **Got**: 1 paragraph, EN
- **Failures**: 2 (paragraph count, language)
- **Root Cause**: Constraint + language not enforced

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Avg TTFT (all) | 2581ms |
| Avg TTFT (fast <100ms) | 32ms |
| Avg TTFT (slow >3000ms) | 4523ms |
| Avg Total Time | 3156ms |
| Max Total Time | 10226ms (q45) |

### Observations
- File actions are FAST: 10-50ms TTFT
- Document queries are SLOW: 2-6s TTFT (LLM generation)
- Some queries hit ~10s (complex retrieval + generation)

---

## If We Fix These 5 Areas, We Reach 100%

1. **Language Lock** (fix in kodaAnswerEngineV3.service.ts)
   - Add explicit language instruction to LLM prompt
   - Impact: +15 queries → 72%

2. **PT File Action Keywords** (fix in intent_patterns.runtime.json)
   - Add "liste", "onde está", "mostre", "abra" patterns
   - Impact: +5 queries → 82%

3. **Content Verb Routing** (fix in routingPriority.service.ts)
   - Detect "summarize/explain" + filename → boost documents
   - Impact: +4 queries → 90%

4. **Truncation Repair** (fix in kodaFormattingPipelineV3.service.ts)
   - Detect and repair "..." endings
   - Impact: +5 queries → 96%

5. **Constraint Enforcement** (fix in kodaAnswerEngineV3.service.ts)
   - Emphasize exact count requirements in prompt
   - Impact: +2 queries → 100%

---

## Artifacts Generated

| File | Description |
|------|-------------|
| `corpus.jsonl` | 50 test queries with constraints |
| `sse_raw_events.jsonl` | 376 raw SSE events |
| `results.jsonl` | 50 query results with full payloads |
| `validation_results.jsonl` | 50 validation outcomes |
| `SUMMARY.json` | Aggregated statistics |
| `ROOT_CAUSE_MAP.md` | Detailed failure analysis |
| `QUICK_FIXES.md` | Prioritized fix recommendations |
| `STRICT_REPORT.md` | This report |

---

## Audit Folder
```
/Users/pg/Desktop/koda-webapp/backend/audit_output_mass/strict_certification_20260117T153349/
```

---

## ⚠️ CRITICAL ISSUES FOUND IN MANUAL REVIEW

The automated validator **MISSED** several critical failures. True pass rate is likely **<30%**.

### 1. HALLUCINATION - Fake File Names (q07)

The PT inventory query "Liste todos os meus documentos" returned a list of **44 FAKE files** that don't exist in the user's corpus:

```
5. 2024-01-01_2024-03-31_P&L.pdf   ← FAKE
6. 2023-10-01_2023-12-31_P&L.pdf   ← FAKE
...
48. 2013-04-01_2013-06-30_P&L.pdf  ← FAKE
```

**Only 4 of 48 listed files are real.** The LLM fabricated quarterly P&L filenames.

**Root Cause**: The `documents` intent (misrouted) generated content from LLM instead of using actual file list from database.

### 2. FORMAT VIOLATION - Sentences vs Bullets (q11)

Query: "Answer in exactly 2 sentences"
Response: Got **bullets** starting with "-" instead of prose sentences.

### 3. MALFORMED CONTENT - Broken Bullets (q05)

The response has bullets split across lines:
```
- The document is a **Profit and Loss
- Detail** statement.
```
This is ONE broken bullet counted as TWO by the validator.

### 4. DEBUG MESSAGES LEAKED (q41)

Response contains internal error messages:
```
Intent not implemented: excel
```

### Revised Assessment

| Original | After Manual Review |
|----------|---------------------|
| 42% pass | **<30% pass** |
| 21 passed | ~15 actually correct |

### Additional Validation Rules Needed

1. **HALLUCINATION_FILE_LIST**: Compare listed files against actual user documents
2. **FORMAT_SENTENCES_VS_BULLETS**: Detect bullets when sentences requested
3. **MALFORMED_BULLETS**: Check bullets are complete sentences
4. **DEBUG_MESSAGE_LEAK**: Detect internal error strings in response
