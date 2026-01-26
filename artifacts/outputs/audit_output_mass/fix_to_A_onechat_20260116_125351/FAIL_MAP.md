# FAIL_MAP - Analysis of B-Grade Blockers

## Summary
Current state: 50/50 B grades (no actual Claude evaluation - defaulted due to missing API key)

## Root Causes Identified

### 1. RETRIEVAL FAILURES - WRONG DOCUMENTS
**Queries affected**: q12, q14, q16, q36 (EBITDA/finance chain)
**Problem**: Queries ask about EBITDA monthly data, but retrieval returns:
- Academic PDFs about forecasting (BESS-a, BESS-b)
- LMR Improvement Plan (no EBITDA data)
- Generic documents instead of P&L spreadsheet

**Example Response**: "Os documentos não contêm dados de EBITDA por mês para 2024"
**Why Not A-Grade**: Doesn't directly answer the question - says "not found"

### 2. CORPUS/DATA MISMATCH
**Queries affected**: q01-q09 (Guarda Bens Self Storage)
**Problem**: Corpus expects "guarda bens self storage.pptx" but retrieval may not be finding it
**Impact**: Potential "not found" responses

### 3. NO CLAUDE EVALUATION
**Root cause**: Test runner ran without CLAUDE_API_KEY environment variable
**Impact**: All grades defaulted to 'B' regardless of answer quality
**Fix needed**: Ensure CLAUDE_API_KEY is passed to evaluation

### 4. FORMATTING NOT VERIFIED
**Concern**: No validation that responses match requested format (bullets, tables)
**Impact**: Responses may have "minor issues" → B instead of A

### 5. CITATION COMPLETENESS
**Concern**: Answers with "não encontrei" have no citations
**Impact**: Even valid responses may lack proper citation structure

## A-Grade Requirements (from rubric)
- **A: Excellent** - directly answers the question, well-formatted, no fluff
- **B: Good** - answers the question adequately, minor issues

## Blockers to Fix (Priority Order)

1. **Enable Claude Evaluation** - Run with CLAUDE_API_KEY set
2. **Fix Retrieval** - Ensure queries find the right documents
3. **One Conversation** - Modify test runner for single conversationId
4. **Format Enforcement** - Ensure exact bullet/table counts
5. **Citation Quality** - Ensure inline citations present

## Next Steps
1. Run evaluation WITH Claude API to get real grades
2. Analyze actual A/B/C/D/F distribution
3. Fix specific failure patterns
4. Run one-conversation test
