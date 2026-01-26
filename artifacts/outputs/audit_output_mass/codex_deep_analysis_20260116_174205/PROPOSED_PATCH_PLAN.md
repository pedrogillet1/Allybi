# Proposed Patch Plan

This plan is grouped by priority sections and references the systemic components identified in SYSTEM_CALLGRAPH.md and ERROR_SECTION_MAP.md. Each step outlines the concrete change, files/functions, and non-regression guidance.

## P0 - Critical fixes (apply first, block readiness)

### 1. Pronoun resolution & context routing (Pronoun Pattern Order + Follow-ups)
- Files: `backend/src/services/core/kodaOrchestratorV3.service.ts` lines 5688-5880, 2020-2042; `conversationMemory.service.ts`
- Change: Move pronoun-agnostic location regex after pronoun-specific ones; add context lookup that retrieves `lastReferencedFile` before pattern matching; reuse that doc for location/comparison intents.
- Fix all: prevents A1, A8, P0-1, P0-10 failures. Makes every "it"/"that" follow-up resolve.
- Testing (when allowed): run existing file-action locale/regression suite (GUARD test 1.1). Ensure Q012/Q013 now show contract.

### 2. File search filtering and extension mapping
- Files: `backend/src/services/fileSearch.service.ts` (lines 61-171, 1008-1050, 1326-1400) and `document.service.ts` status list definitions.
- Change: use `status: { in: USABLE_STATUSES }`, lower `fuzzyMatchFiles` threshold (0.3), normalize filenames to lowercase, expand `extensionMap` to include xls/csv and full image list.
- Fixes: B1-B7, F4, P0-2, P0-3, P0-5. Ensures "Rosewood" search works, filters return correct types.
- Testing: Add GUARD tests 2.1-2.3 verifying status, fuzzy, extension; ensure Q004/Q005 show only requested types quickly.

### 3. Inventory formatting / metadata leakage / load more
- Files: `kodaOrchestratorV3.service.ts` lines 3248-3288, 4087-4130; `fileSearch.service.ts:1326-1400`; `markerUtils.ts` load-more helper.
- Change: After truncating to 8 items, call `createLoadMoreMarker()` and append; remove file size/folder info from Markdown output; when grouping by folder insert header separator lines.
- Fix: D2, D4, D5, P0-6, P1-4; prevents metadata leaks, missing load-more, messy grouping.

### 4. Folder path & confirmations
- Files: `kodaOrchestratorV3.service.ts` (handleFileActions move/list branches), `folderNavigation.service.ts` (path builders).
- Change: After successful search/move, append text `**📁 Location:** {folderPath}` and templated confirmations ("Moved X to Y"). Use `buildFolderPath()` to get human path string. 
- Fix: G3 (folder path), G4 (move confirmation), P0-8, P0-12.

### 5. Formatting DOC markers and citations
- Files: `kodaAnswerEngineV3.service.ts`, `responseContractEnforcer.service.ts`, `markerUtils.ts`, `kodaFormattingPipelineV3.service.ts`
- Change: After generation, call helper `injectDocMarkers({ sources })` that uses `markerUtils` to add `{{DOC::...}}` tokens to formatted text; ensure citations array included in SSE `done` event.
- Fix: D1, E1-E4, ensures clickable references for all RAG answers.

### 6. Memory persistence & retrieval boost
- Files: `conversationMemory.service.ts`, `kodaRetrievalEngineV3.service.ts`, `kodaOrchestratorV3.service.ts` (context passing), `markerUtils` (if needed for last docs)
- Change: Persist context map in Redis/DB or at least add TTL; ensure `lastDocumentIds` passed to retrieval and used to boost/filter (2x weighting). Document memory state to not leak across convs.
- Fix: C1-C5, ensures all follow-up queries reference previous docs.

## P1 - High priority fixes

### 7. Format constraint enforcement
- Files: `kodaFormattingPipelineV3.service.ts`, `formattingPipeline` call sites.
- Change: Implement `parseFormatConstraints(query)` returning { wantsBullets, bulletCount, wantsTable }. Add validators that enforce exact counts (truncate/expand) and GFM tables, skip numbering for single sources, ensure tables given requested columns.
- Fix: D3, D6, G2. Guarantees bullet/table compliance for all current queries.

### 8. Navigation UX (load more, folder headers, languages)
- Files: `fileSearch.service.ts`, `kodaOrchestratorV3.service.ts`, `StreamingMarkdownEnhanced.jsx`
- Change: Add language-specific templates for PT queries, ensure `InlineDocumentButton` receives proper `folderPath`, `docId`; prevent streaming holdback from breaking markers.
- Fix: A6, G1, ensures UI displays folder path + clickable buttons.

### 9. Format isolation (metadata + numbering)
- Files: `fileSearch.service.ts`, `kodaFormattingPipelineV3.service.ts`
- Change: Ensure metadata optional flag hides size/folder; skip numbering when one source; ensure button markers inserted alongside.
- Fix: D2, D3.

## P2 - Medium priority

### 10. Performance optimizations
- Files: `fileSearch.service.ts`, `kodaAnswerEngineV3.service.ts`, `rag.controller.ts`
- Change: Introduce pagination/caching for inventory queries, reduce LLM calls by reusing formatting result, buffer SSE citations to reduce holdback delays.
- Fixes: F1-F5; ensures TTFT <8s and prevents 194s Q29.

### 11. Directory operations reliability
- Files: any folder ops (create/move/list) plus `conversationMemory` for storing folder context.
- Change: Add proper success clauses, cohesive error messaging, ensure `lastFolderScope` accessible for follow-ups.
- Fix: G4, P1-1.

### 12. Error handling/resilience
- Files: `kodaRetrievalEngineV3.service.ts`, `kodaAnswerEngineV3.service.ts`
- Change: Add fallback paths (BM25) when vector fails, handle rate-limit retries; clean up marker recovery in `markerUtils`.
- Fix: H1-H3.

## Non-regression guidance (for later testing)
- Use `GUARD_TEST_PLAN` suites to validate pronoun logic, filtering, counts, grouping.
- Verify `results.done.jsonl` includes `sources` array and `has_folder_path` flag for location queries.
- Ensure `Frontend` components render InlineDocumentButton when markers exist (test via manual inspection or unit tests). 

