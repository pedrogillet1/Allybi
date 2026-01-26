# Koda Certification Testing Framework - Final Report

**Date:** 2026-01-18
**Framework Version:** 1.0
**Pass Rate Achieved:** 40% (4/10 preflight queries)

---

## Executive Summary

This report documents the implementation of a ChatGPT-like certification testing framework for Koda. The framework enables automated quality verification through SSE done event instrumentation.

### Key Achievements

1. **Instrumentation Pipeline Complete** - All done events now include:
   - `operator` (list, filter, extract, summarize, open, where, etc.)
   - `templateId` (routing path identifier)
   - `languageDetected` / `languageLocked`
   - `docScope` (single_doc, multi_doc, unknown)
   - `anchorTypes` (pdf_page, xlsx_cell, etc.)
   - `attachmentsTypes` (source_buttons, file_list, etc.)
   - `truncationRepairApplied`
   - `fileList` for inventory queries
   - `composedBy` stamp

2. **Test Corpus Created**
   - `corpus_preflight_10.jsonl` - 10 basic queries for sanity check
   - `corpus_cert_30.jsonl` - 30-turn multi-block certification

3. **Validation Framework Built**
   - Instrumentation field presence checks
   - Output contract validation (operator, docScope)
   - Wording quality checks (preamble detection, bullet count)
   - Language lock verification

---

## Preflight Test Results (10 queries, single conversation)

| Query ID | Query | Status | Issue |
|----------|-------|--------|-------|
| preflight-001 | List my files | FAIL | Preamble "here are" |
| preflight-002 | Show only PDFs | **PASS** | operator=filter, lang=en |
| preflight-003 | Show only spreadsheets | **PASS** | operator=filter, lang=en |
| preflight-004 | Open "Lone Mountain Ranch..." | **PASS** | operator=open, lang=en |
| preflight-005 | Where is it located? | **PASS** | operator=where, lang=en |
| preflight-006 | What is the revenue in July? | FAIL | docScope=unknown (expected single_doc) |
| preflight-007 | Summarize the Rosewood Fund... | FAIL | operator=extract (expected summarize), preamble |
| preflight-008 | Show documents about "guarda" | FAIL | operator=list (expected filter), preamble |
| preflight-009 | Liste os arquivos... (PT) | FAIL | operator=list (expected filter) |
| preflight-010 | What is the EBITDA? | FAIL | Preamble "i found" |

---

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `src/types/streaming.types.ts` | Added instrumentation fields to DoneEvent interface |
| `src/controllers/rag.controller.ts` | Capture and forward instrumentation + fileList fields |
| `src/services/core/kodaOrchestratorV3.service.ts` | Added operator to metadata, fileList passthrough |

### Test Artifacts

| File | Description |
|------|-------------|
| `corpus_preflight_10.jsonl` | 10 preflight queries with expected fields |
| `corpus_cert_30.jsonl` | 30-turn certification corpus (6 blocks) |
| `scoring_rubric.md` | Detailed grading criteria |
| `run_conversation_cert.ts` | Test runner with SSE parsing |

---

## Remaining Work

### Priority 1: Operator Mapping

Current issue: "Show documents about X" queries map to `list` instead of `filter`.

**Fix Required:** In `tryInventoryQuery()`, detect content-based filters (about, containing, mentioning) and map to `filter_content` type.

### Priority 2: Summarize Operator

Current issue: Summarize queries get `extract` operator instead of `summarize`.

**Fix Required:** In `mapIntentToOperator()`, detect summarization-specific patterns.

### Priority 3: docScope Detection

Current issue: Extraction queries return `docScope: unknown` instead of `single_doc`.

**Fix Required:** In scope decision logic, propagate scope type to done event.

### Priority 4: Preamble Removal

Current issue: Answers start with "Here are", "I found", "Here is".

**Fix Required:** AnswerComposer needs to strip/replace LLM-generated preambles.

---

## Certification Criteria (for reference)

### Hard Fail Conditions
- Missing `composedBy` stamp
- Missing `operator` field
- Missing `languageLocked` field
- Preamble in answer (for button-only responses)
- Wrong language in response

### Pass Thresholds
- Preflight (10 queries): **100% required**
- Certification (30 queries): **95% required**
- Soak (100+ queries): **90% required**

---

## Conclusion

The instrumentation pipeline is functional and passing data correctly through SSE. The 40% pass rate demonstrates the framework works and identifies real quality issues in the system.

The remaining 60% failures represent legitimate areas for improvement:
1. Operator classification needs refinement for edge cases
2. Answer composition needs preamble suppression
3. Scope tracking needs explicit propagation

These are not framework bugs but actual system behaviors that need correction.

---

## Next Steps

1. Implement content-filter detection in inventory query parser
2. Add summarize operator mapping
3. Propagate docScope from scope decision to done event
4. Implement preamble stripping in AnswerComposer
5. Re-run certification tests to achieve 100% preflight pass rate
