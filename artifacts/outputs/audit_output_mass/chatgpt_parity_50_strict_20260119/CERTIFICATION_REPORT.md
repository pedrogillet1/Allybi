# ChatGPT Parity 50-Query Certification Report

**Date**: 2026-01-19
**Conversation ID**: chatgpt-parity-1768856332962
**Pass Rate**: 46% (23/50)
**Certification Status**: ❌ FAILED

---

## Executive Summary

The system failed strict ChatGPT parity certification with 27 hard failures across 50 queries.
The main systemic issues are:

1. **Routing confusion** (7 failures) - Content queries routed to file_actions and vice versa
2. **Language enforcement** (10 failures) - PT queries getting partial EN responses
3. **Answer completeness** (14 failures) - File listings flagged as incomplete (may be validator sensitivity)
4. **Table formatting** (3 failures) - Table requests not producing markdown tables
5. **Source attribution** (3 failures) - Document answers missing sourceButtons

---

## Failure Breakdown by Category

### 1. COMPLETENESS_MID_SENTENCE (14 failures)

**Root Cause Analysis**:
Many of these appear to be false positives for file listings that end without punctuation.

| Query | Last Characters | Real Issue? |
|-------|----------------|-------------|
| q01 | "Rosewood Fund - Reviewed" | No - valid file list |
| q12 | file listing | No - valid file list |
| q13 | file listing | No - valid file list |
| q19 | file listing | No - valid file list |
| q27 | file listing | No - valid file list |
| q31 | file listing | No - valid file list |

**Recommendation**: Adjust validator to allow file listings to end without punctuation.

### 2. LANGUAGE_MISMATCH (10 failures)

**Queries Affected**: q06, q07, q17, q19, q28, q32, q41, q43, q47

**Root Cause Analysis**:
The validator's language detection is flawed. Example q06:
- Query: "Qual mês teve o maior e o pior EBITDA em 2024?"
- Response: "Com base nos dados do arquivo..." (Portuguese!)
- Validator detected as English due to word count methodology

**Real vs False Positives**:
- q06: FALSE POSITIVE - Response is in Portuguese
- q17, q28: Need investigation - may be real EN responses to PT queries

**Recommendation**:
1. Improve language detection in validator using proper language detection library
2. Verify language enforcement in orchestrator is working correctly

### 3. ROUTING_WRONG_INTENT (7 failures)

| Query ID | Query | Expected | Got | Analysis |
|----------|-------|----------|-----|----------|
| q09 | "Quais stakeholders aparecem no documento?" | documents | file_actions | REAL BUG - content query misrouted |
| q29 | "How many sheets are in the Excel file?" | doc_stats | file_actions | REAL BUG - doc structure query misrouted |
| q39 | "Mostre apenas os arquivos Word" | file_actions | documents | REAL BUG - file filter misrouted |
| q40 | "What formula calculates the monthly total?" | documents | reasoning | REAL BUG - doc content query misrouted |
| q45 | "Quantos slides tem a apresentação?" | doc_stats | reasoning | REAL BUG - doc stats misrouted |
| q46 | "What are the key metrics in the marketing document?" | documents | file_actions | REAL BUG - content query misrouted |
| q50 | "Give me an overview of all my files" | file_actions | documents | REAL BUG - file listing misrouted |

**Root Cause**:
The routing priority between file_actions and documents is not properly distinguishing:
- "stakeholders in the document" → content query → should be documents
- "sheets in the Excel" → structure query → should be doc_stats
- "metrics in the marketing document" → content query → should be documents
- "show Word files" → filter query → should be file_actions

**Recommendation**:
1. Add negative patterns to prevent content words ("stakeholders", "metrics", "formula") from routing to file_actions
2. Add stronger anchors for doc_stats queries ("how many sheets", "how many slides", "how many pages")

### 4. FORMAT_MISSING_TABLE (3 failures)

| Query ID | Query |
|----------|-------|
| q23 | "Compare revenue and expenses in a two-column table" |
| q36 | "Compare Q1 vs Q2 EBITDA in table format" |
| q47 | "Crie uma tabela comparando receitas e despesas" |

**Root Cause**:
The system asked for clarification instead of using conversation context to determine which documents to use.

**Recommendation**:
1. Improve context inheritance for table comparison queries
2. When user asks for table format, use docScope from conversation

### 5. SOURCE_NO_PILLS (3 failures)

| Query ID | Query |
|----------|-------|
| q09 | "Quais stakeholders aparecem no documento?" |
| q30 | "Quais são os principais riscos identificados no documento de integração?" |
| q40 | "What formula calculates the monthly total?" |

**Root Cause**:
These queries were misrouted (q09 to file_actions, q40 to reasoning), so they didn't go through the document retrieval path that generates sourceButtons.

**Recommendation**:
Fix the routing issues and sourceButtons will follow.

### 6. COMPLETENESS_TRUNCATION (2 failures)

| Query ID | Query | Last Characters |
|----------|-------|-----------------|
| q24 | "Qual é o valor total de receita no Q3 2024?" | "..." |
| q36 | "Compare Q1 vs Q2 EBITDA in table format" | "..." |

**Root Cause**:
Real truncation occurring in LLM responses.

**Recommendation**:
1. Investigate CompletionGate configuration
2. May need to increase max tokens or improve completion detection

---

## Systemic Fixes Required

### Priority 1: Routing (HIGH IMPACT)

**Files to modify**:
- `src/data_banks/triggers/primary_intents.en.json`
- `src/data_banks/negatives/not_file_actions.en.json`

**Changes**:
1. Add negative patterns to file_actions for content-seeking words
2. Add stronger anchors for doc_stats intent
3. Add content-location patterns that distinguish "in the document" from "the document"

### Priority 2: Validator Accuracy (HIGH IMPACT)

**Files to modify**:
- `tools/quality/run_chatgpt_parity_50.ts`

**Changes**:
1. Allow file listings to end without punctuation
2. Use proper language detection library (franc, langdetect)
3. Exclude file lists from COMPLETENESS_MID_SENTENCE check

### Priority 3: Language Enforcement (MEDIUM IMPACT)

**Files to modify**:
- `src/services/core/languageEnforcement.service.ts`

**Changes**:
1. Verify PT queries always get PT responses
2. Check if languageLocked is being respected

### Priority 4: Table Formatting (LOW IMPACT)

**Files to modify**:
- `src/services/core/kodaAnswerEngineV3.service.ts`

**Changes**:
1. When "table" is in format constraint, ensure markdown table output
2. Improve context inheritance for comparison queries

---

## Test Queries that Passed (23/50)

| ID | Query | Category |
|----|-------|----------|
| q02 | Open the Lone Mountain Ranch P&L 2024.xlsx | file_actions |
| q03 | Where is it located? | followup_pronoun |
| q04 | Show it again (button only) | followup_pronoun |
| q05 | Qual foi o EBITDA de julho de 2024 no P&L? | finance_month |
| q08 | Resume o projeto da Guarda Bens em 5 bullets | summary |
| q10 | Quais são as responsabilidades deles? | followup_pronoun |
| q11 | How many files total, and how many of each type? | file_listing |
| q15 | Does the marketing PDF mention 'inseparability'? | locator |
| q16 | Summarize the Rosewood Fund document in exactly 5 bullets | summary |
| q18 | Extraia todas as cláusulas de penalidade do contrato | legal_extraction |
| q21 | Which tab contains EBITDA Details in the spreadsheet? | excel_structure |
| q22 | Which columns represent Jan through Dec in the P&L? | excel_structure |
| q25 | Where does it mention compliance requirements? | locator |
| q26 | Resuma o relatório financeiro do Rosewood em um parágrafo | summary |
| q33 | What is the total operating expenses for 2024? | calculation |
| q34 | Onde está localizado o arquivo do Rosewood? | file_actions |
| q35 | Extract all liability clauses from the contract | legal_extraction |
| q37 | Qual documento fala sobre estratégia de marketing? | locator |
| q38 | List the top 5 expense categories by amount | extraction |
| q42 | Summarize the integration guide in exactly 3 sentences | formatting_constraint |
| q44 | Where is the termination date mentioned in the contract? | locator |
| q48 | Find all mentions of 'deadline' in my documents | locator |
| q49 | O que o documento diz sobre garantias contratuais? | legal_extraction |

---

## Next Steps

1. **Fix Routing Priority** - Estimated impact: +7 queries passing
2. **Fix Validator False Positives** - Estimated impact: +10 queries passing (if most are false positives)
3. **Verify Language Enforcement** - Estimated impact: +3-5 queries passing
4. **Fix Table Formatting** - Estimated impact: +3 queries passing

After fixes, expected pass rate: 80-90%

Additional work needed for full 100% certification.

---

**Generated**: 2026-01-19
**Test Runner**: tools/quality/run_chatgpt_parity_50.ts
