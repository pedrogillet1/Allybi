# Benchmark Plan V1 — Audit Review

**Reviewed**: 2026-03-12
**Plan file**: `/Users/pg/.claude/plans/curious-launching-horizon.md`
**Benchmark score at review time**: 51.4/100 (FAIL)

---

## 1. What V1 Got Right

| Item | Assessment |
|------|-----------|
| RC2 (XLS cell fact gating) identified as CRITICAL | Correct — `if (financial \|\| temporal)` at xlsxExtractor:321 is the exact root cause for Non-Profit section F grade |
| RC4 (sentence boundary recovery threshold) identified | Correct — 0.3 threshold at CentralizedChatRuntimeDelegate:3906 confirmed too aggressive for short outputs |
| RC5 (quality gate severity) identified | Correct — `structural_completeness` is warn-only, not in `DEFAULT_BLOCKING_QUALITY_GATES` |
| Fix 1 approach (widen XLS cell fact extraction) | Correct direction — removing the financial/temporal gate is the right fix |
| Fix 2 approach (make structural_completeness blocking) | Correct — needs to be in both data bank `gateSeverityByName` and `DEFAULT_BLOCKING_QUALITY_GATES` |

## 2. What V1 Got Wrong or Missed

### 2a. Incorrect Assumptions

| Issue | Details |
|-------|---------|
| **RC1 (PDF OCR) overstated as CRITICAL** | Plan assumes Cadastro PDF has image-based tables needing OCR. Evidence is only PLAUSIBLE — the text layer may simply lack structured table data even after OCR. No proof that Vision OCR would extract IBGE-format tables. The char-count threshold (100) may not be the bottleneck. |
| **Fix 5 heuristic is fragile** | The `hasTableMarkers && numericValues.length < 3` heuristic catches a narrow case. If the PDF text layer has >3 numeric values but they're TOC page numbers, this fires incorrectly. No test coverage proposed. |
| **Score impact estimates are aspirational** | "Non-Profit 27→55+" assumes cell facts alone fix retrieval. But cell facts must also embed correctly and rank above the existing wrong-context table_summary chunks. No validation of this assumption. |

### 2b. Missing Root Causes

| RC | Status | Description |
|----|--------|-------------|
| **RC-EVIDENCE-STARVE** | PLAUSIBLE | Evidence packaging (`maxEvidenceHard=36`, `maxPerDocHard=10`) may starve single-doc answers when large docs produce many low-relevance candidates that fill slots |
| **RC-SNIPPET-CLIP** | PLAUSIBLE | `toSnippet()` at 3200 chars clips mid-sentence, producing evidence the LLM can't complete coherently |
| **RC-TOKEN-BUDGET** | PARTIAL-PROVEN | Static output budgets (`doc_grounded_single=4800`) are shared across thinking + answer. For complex legal questions, the LLM exhausts budget on context reproduction before reaching the answer |
| **RC-FINISH-REASON** | PLAUSIBLE | Missing `finishReason` propagation from LLM response — when model stops due to max_tokens, the runtime doesn't know it was truncated vs. naturally completed |
| **RC-TOC-CAP** | PROVEN | No cap on TOC candidates in evidence selection — a 400-page legal doc can fill all evidence slots with TOC entries |

### 2c. Structural Plan Issues

| Issue | Details |
|-------|---------|
| **No Phase 0 (governance)** | Plan jumps straight to code fixes without establishing benchmark reproducibility, run metadata, or grading methodology |
| **No rollback steps** | None of the 6 fixes includes a rollback procedure |
| **No acceptance criteria** | "Expected impact" is stated as a range but no pass/fail threshold defined per fix |
| **No dependency ordering** | Fix 6 (re-ingest) depends on Fix 1 and Fix 5 but this isn't formalized |
| **No validation commands** | Only the verification section at the bottom has commands, not per-fix |
| **Score estimates lack methodology** | How were "+28 points" and "+24 points" computed? No formula or per-query prediction |

## 3. Risk Assessment of V1 Fixes

| Fix | Risk Level | Blast Radius | Concern |
|-----|-----------|-------------|---------|
| Fix 1 (XLS cell facts) | LOW | Ingestion pipeline only | Safe — widens extraction, doesn't narrow it. Requires re-ingestion. |
| Fix 2 (Blocking gate) | MEDIUM | All chat responses | If gate has false positives, it blocks valid answers. Need to verify false-positive rate against passing queries first. |
| Fix 3 (Sentence recovery) | LOW | Post-processing only | Threshold change is local. Could over-trim in edge cases. |
| Fix 4 (TOC penalty) | MEDIUM | All retrieval | Lowering from 0.35→0.20 may over-penalize legitimate TOC references. No analysis of how many currently-passing queries use TOC chunks as valid evidence. |
| Fix 5 (PDF OCR) | HIGH | All PDF ingestion | Heuristic may trigger unnecessary OCR, increasing latency and cost. No test data for IBGE PDF OCR quality. |
| Fix 6 (Re-ingest) | LOW | Targeted docs only | Standard operation, no code risk |

## 4. Verdict

**V1 is a reasonable first draft but not production-ready.** It correctly identifies 3 of the top root causes but misses 4 others, lacks governance infrastructure, has no rollback procedures, and makes unvalidated score impact claims. The PDF OCR fix (Fix 5) carries the highest risk with the least certainty of payoff.

**Recommendation**: Rewrite as V2 with phased execution, per-task validation, and conservative score estimates.
