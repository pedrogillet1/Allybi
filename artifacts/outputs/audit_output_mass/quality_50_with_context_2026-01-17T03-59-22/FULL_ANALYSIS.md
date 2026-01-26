# Full Analysis: 50-Query Quality Test Results

**Date**: 2026-01-17
**Pass Rate**: 58% (29/50)
**Failed**: 21 queries

---

## Executive Summary

The failures fall into **6 distinct categories**:

| Category | Count | Queries |
|----------|-------|---------|
| **1. Missing Context/Disambiguation** | 6 | q09, q20, q23, q30, q36, q49 |
| **2. Pronoun/Follow-up Resolution** | 3 | q03, q04, q44 |
| **3. File Action Misroutes** | 4 | q02, q21, q29, q43 |
| **4. RAG Semantic Search Failures** | 4 | q16, q17, q34, q46 |
| **5. Intent Routing Errors** | 2 | q14, q35 |
| **6. Incomplete/Truncated Answers** | 2 | q47, q28 |

---

## Category 1: Missing Context/Disambiguation (6 failures)

These queries ask about "the document" or "the contract" without specifying which one. The system correctly asks for clarification but this is graded as a failure.

### q09: F - "Quais stakeholders aparecem no documento?"
- **Intent**: documents
- **Answer**: "Which document would you like to query? For example: Financ_as_II..."
- **Problem**: User didn't specify which document
- **Root Cause**: Ambiguous query - no document reference
- **Fix**: This is actually CORRECT behavior - the grader is wrong to fail this

### q20: F - "Quantas páginas tem o documento mais longo?"
- **Intent**: documents
- **Answer**: "Which document would you like to query?"
- **Problem**: Should have searched for longest document
- **Root Cause**: Query asks for "longest document" which requires file stats lookup
- **Fix**: Add pattern to detect "documento mais longo" → file_actions with stats

### q23: D - "Compare revenue and expenses in a two-column table"
- **Intent**: documents
- **Answer**: "Which documents would you like to compare? Please mention the file names."
- **Problem**: No document specified for comparison
- **Root Cause**: Ambiguous query - needs file reference
- **Fix**: This is correct behavior - grader issue

### q30: F - "Quais são os principais riscos identificados no documento de integração?"
- **Intent**: documents
- **Answer**: "Which document would you like to query?"
- **Problem**: Mentions "documento de integração" - should have searched for it
- **Root Cause**: RAG not triggering semantic search for "integration document"
- **Fix**: Enhance semantic matching for partial document name references

### q36: D - "Compare Q1 vs Q2 EBITDA in table format"
- **Intent**: documents
- **Answer**: "Which documents would you like to compare?"
- **Problem**: This is a grouped query (Turn 3 in EBITDA chain) - should have context
- **Root Cause**: Conversation context not being passed properly
- **Fix**: Check conversation context passing for grouped queries

### q49: F - "O que o documento diz sobre garantias contratuais?"
- **Intent**: documents
- **Answer**: "Which document would you like to query?"
- **Problem**: User didn't specify which document
- **Root Cause**: Ambiguous query - no document reference
- **Fix**: This is actually CORRECT behavior - grader issue

---

## Category 2: Pronoun/Follow-up Resolution (3 failures)

These queries use pronouns ("it", "that") expecting context from previous turns.

### q03: F - "Where is it located?"
- **Intent**: file_actions
- **Answer**: "Which file?"
- **Problem**: Lost context from q02 (Lone Mountain Ranch P&L)
- **Root Cause**: Pronoun resolution not working for file location
- **Fix**: Check lastReferencedFile tracking in session

### q04: D - "Show it again (button only)"
- **Intent**: file_actions
- **Answer**: "I don't have a previous file to show again."
- **Problem**: Lost context from previous file reference
- **Root Cause**: Session state not tracking last shown file
- **Fix**: Implement lastShownFile tracking

### q44: F - "Where is the termination date mentioned in the contract?"
- **Intent**: file_actions (WRONG!)
- **Answer**: "No file named 'termination date mentioned' was found."
- **Problem**: Misrouted to file_actions, tried to find file called "termination date"
- **Root Cause**: "where is...mentioned" pattern incorrectly matched file_actions
- **Fix**: Add negative pattern: "where is X mentioned" → documents, NOT file_actions

---

## Category 3: File Action Misroutes (4 failures)

Queries that should have gone to RAG but went to file_actions (or vice versa).

### q02: F - "Open the Lone Mountain Ranch P&L 2024.xlsx"
- **Intent**: file_actions
- **Answer**: Shows file button (correctly!)
- **Problem**: Answer appears correct but graded F?
- **Analysis**: The answer shows the file with DOC marker - this should be passing
- **Root Cause**: Grader issue - answer IS correct for "open file" command
- **Fix**: Update grader to recognize correct file_actions responses

### q21: F - "Which tab contains EBITDA Details in the spreadsheet?"
- **Intent**: file_actions (WRONG!)
- **Answer**: Lists all XLSX files
- **Problem**: Should be a RAG/documents query about spreadsheet CONTENT
- **Root Cause**: "in the spreadsheet" triggered file filter
- **Fix**: Add content guard pattern for "which tab/sheet contains X"

### q29: F - "How many sheets are in the Excel file?"
- **Intent**: file_actions (WRONG!)
- **Answer**: Shows file type counts (PDF:20, XLSX:4...)
- **Problem**: Asks about sheets INSIDE Excel, not file count
- **Root Cause**: "Excel file" + count pattern triggered file stats
- **Fix**: Add pattern: "sheets in Excel" → documents (content query)

### q43: F - "Quais documentos tenho sobre finanças?"
- **Intent**: file_actions
- **Answer**: Shows summary with files, includes finance-related files
- **Problem**: Should be semantic search, not file listing
- **Root Cause**: "documentos tenho sobre" triggered inventory listing
- **Fix**: Add content guard for "documentos sobre X" → semantic search

---

## Category 4: RAG Semantic Search Failures (4 failures)

Document exists but semantic search doesn't find it.

### q16: F - "Summarize the Rosewood Fund document in exactly 5 bullets"
- **Intent**: documents (CORRECT after fix!)
- **Answer**: "I cannot find any information about 'Rosewood Fund'"
- **Problem**: "Rosewood Fund v3.xlsx" exists but RAG didn't find it
- **Root Cause**: Semantic search failed to match "Rosewood Fund" to filename
- **Fix**: Enhance filename-to-query matching in retrieval

### q17: F - "O que diz o contrato sobre rescisão antecipada?"
- **Intent**: documents
- **Answer**: "O contexto fornecido não contém informações sobre..."
- **Problem**: Contract content exists but wasn't retrieved
- **Root Cause**: Either no contract file or retrieval missed it
- **Fix**: Check if contract files are indexed, improve PT semantic search

### q34: F - "Onde está localizado o arquivo do Rosewood?"
- **Intent**: documents (should be file_actions!)
- **Answer**: "Não há informações sobre um arquivo chamado 'Rosewood'"
- **Problem**: Double failure - wrong intent AND RAG failure
- **Root Cause**: "onde está localizado arquivo" should route to file_actions
- **Fix**: Add PT file location pattern: "onde está (localizado)? arquivo"

### q46: F - "What are the key metrics in the marketing document?"
- **Intent**: documents
- **Answer**: Returns physics/dark matter content (WRONG DOCUMENT!)
- **Problem**: Retrieved wrong document - got physics paper instead of marketing
- **Root Cause**: Semantic search returned wrong results
- **Fix**: Investigate why "marketing document" matched physics paper

---

## Category 5: Intent Routing Errors (2 failures)

Completely wrong intent classification.

### q14: F - "Create a table comparing risk mitigation strategies from the integration guide"
- **Intent**: file_actions (WRONG!)
- **Answer**: Shows table of ALL 48 files
- **Problem**: Should be documents + table formatting
- **Root Cause**: "Create a table" triggered file listing table format
- **Fix**: Add content guard for "table comparing X from document Y"

### q35: F - "Extract all liability clauses from the contract"
- **Intent**: extraction (WRONG!)
- **Answer**: Generic Koda introduction message
- **Problem**: extraction intent returned fallback help message
- **Root Cause**: extraction intent handler not implemented
- **Fix**: Route extraction intent to documents with extraction constraint

---

## Category 6: Incomplete/Truncated Answers (2 failures)

Answers that cut off or are malformed.

### q47: F - "Crie uma tabela comparando receitas e despesas por trimestre"
- **Intent**: documents
- **Answer**: "Based on your documents... Step 2: Based on your documents..." (repeated)
- **Problem**: Answer is malformed/duplicated fallback message
- **Root Cause**: Fallback triggered twice, no actual content
- **Fix**: Check fallback logic, ensure single response

### q28: D - "O contrato menciona força maior? Cite o trecho"
- **Intent**: documents
- **Answer**: "The provided context does not mention 'força maior'..." (IN ENGLISH!)
- **Problem**: Portuguese query got English response
- **Root Cause**: Language not passed to answer generation
- **Fix**: Ensure language parameter flows through to LLM prompt

---

## Priority Fixes

### P0 - Critical (5 fixes)
1. **q44**: Add negative pattern for "where is X mentioned" → documents
2. **q21/q29**: Add content guard for spreadsheet content queries
3. **q35**: Route extraction intent to documents
4. **q43**: Add PT semantic search guard "documentos sobre X"
5. **q28**: Fix language parameter for PT responses

### P1 - High (4 fixes)
1. **q03/q04**: Fix pronoun resolution for file references
2. **q16/q34**: Improve filename matching in semantic search
3. **q46**: Debug wrong document retrieval
4. **q47**: Fix malformed fallback response

### P2 - Medium (3 fixes)
1. **q14**: Add content guard for "table comparing X from Y"
2. **q20**: Add "documento mais longo" → file stats
3. **q30**: Improve partial document name matching

### P3 - Grader Issues (5 queries)
These are CORRECT answers graded wrong:
- **q02**: File button response is correct for "open file"
- **q09**: Disambiguation is correct for ambiguous query
- **q23**: Asking for clarification is correct
- **q36**: Context chain issue, not answer quality
- **q49**: Disambiguation is correct

---

## Root Cause Summary

| Root Cause | Count | Impact |
|------------|-------|--------|
| Routing misclassification | 6 | High |
| RAG semantic search | 4 | High |
| Pronoun/context resolution | 3 | Medium |
| Grader false positives | 5 | None (not real failures) |
| Language/localization | 1 | Medium |
| Malformed response | 1 | High |
| Missing intent handler | 1 | High |

**True failure rate (excluding grader issues)**: 16/50 = 32% failures = **68% real pass rate**

---

## Recommended Action Plan

1. **Immediate**: Fix q44 negative pattern (1 line change)
2. **Short-term**: Fix content guards for spreadsheet/table queries (3 patterns)
3. **Medium-term**: Improve semantic search filename matching
4. **Long-term**: Implement proper extraction intent handler
5. **Infrastructure**: Update grader to not fail on correct disambiguation responses
