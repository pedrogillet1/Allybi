# Grade A Fix Plan - 50/50 Certification

## Objective
Achieve 50/50 Grade A on Koda 50-query certification test.

## Baseline
- **Starting Pass Rate**: 62% (31/50)
- **Grade Distribution**: A:1, B:14, C:16, D:7, F:12
- **Target**: 100% Grade A

---

## Fix Schedule

### FIX 1 — doc_stats Wiring
**Queries**: q50
**Problem**: "Give me an overview of all my files with their types" returns empty despite documentsUsed=48
**Root Cause**: doc_stats intent not properly wired in orchestrator
**Solution**:
- Add doc_stats to intent registry
- Implement stats handler returning: total count, counts by type, total size, counts by folder
- Wire AnswerComposer to render doc_stats content
**Acceptance**: q50 returns non-empty with correct file type breakdown

### FIX 2 — File open/show/where + Pronoun Followups
**Queries**: q02, q03, q04
**Problem**: "Open the Lone Mountain Ranch P&L" shows button but no auto-open; followups "where is it?" return empty
**Root Cause**:
- open action not distinguished from show
- lastReferencedFileId not preserved across turns
**Solution**:
- Add action=open vs action=show distinction
- Persist lastReferencedFileId in conversation context
- Handle pronouns "it", "that file" in followups
**Acceptance**: q02 shows button+location; q03/q04 resolve pronoun

### FIX 3 — Filter-topic Operator
**Queries**: q13, q43
**Problem**: "What documents do I have about contracts?" returns file_actions with empty list
**Root Cause**: "about X" topic queries not parsing as semantic search
**Solution**:
- Add filter-topic operator to fileSearch.service
- Detect "about X", "related to X", "concerning X" patterns
- Route to semantic search against document content
**Acceptance**: q13 returns contract-related docs; q43 returns project docs

### FIX 4 — Global locate_content Fallback
**Queries**: q21, q45
**Problem**: "Which tab contains EBITDA Details?" returns empty; content location fails
**Root Cause**: locate_content intent not reaching RAG retrieval
**Solution**:
- Add locate_content as documents subintent
- Ensure RAG retrieval for content location queries
- Return specific location (tab name, page number, section)
**Acceptance**: q21 finds tab name; q45 finds specific location

### FIX 5 — XLSX Month Semantics + Deterministic Compute
**Queries**: q05, q06, q22, q24
**Problem**: "What was EBITDA for July 2024?" returns varying/wrong values
**Root Cause**:
- Month column mapping not standardized
- Computation path non-deterministic
**Solution**:
- Standardize month→column mapping in XLSX parser
- Add deterministic value extraction for specific cells
- Cache computed values per (doc, query) pair
**Acceptance**: Same query returns identical value every run

---

### RERUN 1: After Fixes 1-5
Expected improvement: +10-15 queries

---

### FIX 6 — Table Enforcement + SSE Duplication
**Queries**: q14, q23, q47
**Problem**: "Create a table comparing X" returns prose or broken markdown
**Root Cause**:
- Table format constraint not enforced
- SSE streaming duplicates content
**Solution**:
- Add table format validator in FormattingPipeline
- Enforce markdown table structure
- Fix SSE content deduplication
**Acceptance**: Table queries return valid markdown tables

### FIX 7 — Find-mentions Engine
**Queries**: q48
**Problem**: "Find all mentions of force majeure" returns generic summary
**Root Cause**: "find mentions" not routed to extraction
**Solution**:
- Add find-mentions intent pattern
- Extract all occurrences with context
- Return bulleted list of quotes
**Acceptance**: q48 returns specific quotes with page/section refs

### FIX 8 — Wrong Intent Routing
**Queries**: q09, q38
**Problem**: "What stakeholders appear?" routes to file_actions; "Top 5 expenses" routes wrong
**Root Cause**: Keyword overlap causing misrouting
**Solution**:
- Add negative patterns for extraction queries
- Boost extraction intent for analytical queries
- Add expense/stakeholder patterns to documents intent
**Acceptance**: q09/q38 route to documents, return extracted data

### FIX 9 — Remove Meta-language + Qualifiers
**Queries**: q42, q46, q25
**Problem**: Responses include "Based on the document..." preambles
**Root Cause**: LLM prompt includes meta-language templates
**Solution**:
- Strip meta-language from system prompt
- Add post-processor to remove qualifiers
- Enforce direct answer style
**Acceptance**: No "Based on", "According to", "The document states" preambles

### FIX 10 — Newest/Sort Correctness + Duplicates
**Queries**: q12, q27, q31
**Problem**: "newest file" returns wrong file; lists have duplicates
**Root Cause**:
- Sort by createdAt not applied correctly
- Deduplication not working
**Solution**:
- Fix sort direction for newest/oldest
- Add unique constraint on file list
- Validate sort order in tests
**Acceptance**: q12 returns actually newest file; no duplicates

---

### RERUN 2: Final Test
Target: 50/50 Grade A

---

## File Impact Matrix

| File | Fixes |
|------|-------|
| kodaOrchestratorV3.service.ts | 1,2,3,4,7 |
| fileSearch.service.ts | 2,3,10 |
| intentConfig.service.ts | 1,4,8 |
| answerComposer.service.ts | 1,6 |
| kodaFormattingPipelineV3.service.ts | 6,9 |
| decisionTree.service.ts | 4,7,8 |
| intent_patterns.runtime.json | 1,4,7,8 |
