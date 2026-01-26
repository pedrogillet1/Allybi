# Error Section Map

Generates a coded taxonomy linking failure sections to failure modes (from FAILURE_MODE_CATALOG) and TODO items (from EXPANDED_TODO). Each section describes the systemic bug, root code area, and the "one fix" that resolves the entire class of failures.

## 1. Routing & Intent Scoring
- Failure Modes: A1 (pronoun order), A2 (content guard), A3 (count routing), A4 (multi-intent splitting), A5 (help overreach), A6 (language drift), A7 (extraction confusion), A8 (follow-up context loss)
- Related TODO: P0-1, P1-1, P1-3
- Mechanism: `kodaOrchestratorV3.service.ts:routeAndExecute()` orders regex tests for file_actions before scoped pronoun detection; content guard and multi-intent checks sit before count detection; language toss occurs in `decisionTree.service.ts:102`.
- Core fix: reorganize pattern order so follow-up pronouns and inventory count detection fire before broad location/help guards, and always consult `conversationMemory` before applying content filters.

## 2. File Action Intercept Ordering
- Failure Modes: A1, A2, A3, A4, G3
- Related TODO: P0-1, P0-8
- Mechanism: `detectFileActionQuery()` matches location patterns before pronoun patterns, so "Where is it" hits literal path (A1); similar reorder will ensure folder path is added (G3).
- One fix: Move pronoun-specific patterns (lines ~5740) above generic location patterns and include conversation memory data to resolve "it".

## 3. Filename Resolution & Fuzzy Search
- Failure Modes: B1-B7, F3
- Related TODO: P0-2, P0-3, P1-2
- Mechanism: `fileSearch.service.ts:searchByName()` filters to `status: 'completed'`; `fuzzyMatchFiles()` uses high threshold and lacks normalization; extension mapping limited to xlsx/ images.
- One fix: Normalize query/names to lowercase, use `USABLE_STATUSES`, lower fuzzy threshold (0.3), and expand extension mapping to actual sets (xlsx/xls/csv + all image formats), ensuring tokens like `Rosewood Fund` match even with special chars.

## 4. File Filtering by Type
- Failure Modes: B3, B5, B7, F4
- Related TODO: P0-3, P0-5, P1-5
- Mechanism: `parseInventoryQuery()` maps keywords like "spreadsheets" -> `['xlsx']`, ignoring xls/csv; filter path uses LLM path causing TTFT >10s when it should be metadata-only.
- One fix: Replace single-string extension map with multi-extension arrays and run filter logic entirely inside `fileSearch.service` without spinning through the full RAG pipeline.

## 5. Inventory Listing UX
- Failure Modes: D2, D4, D5, G3
- Related TODO: P0-6, P0-7, P1-4
- Mechanism: `formatResultsAsMarkdown()` emits size/folder metadata within bullet text; no load-more markers after truncation; folder grouping lacks blank-line separations.
- One fix: Clean newline formatting, suppress metadata unless requested, and add a `createLoadMoreMarker()` call after truncating to 8 items.

## 6. Conversation Memory & Follow-up Resolution
- Failure Modes: A8, C1-C5, P0-10, P1-6
- Related TODO: P0-10, P1-2, P1-6
- Mechanism: In-memory caches (`conversationFileContextCache` and `lastDocumentIds`) stored only in Maps (lines 275-295) get reset on restart and are not persisted; pronoun/resolution paths don't supply last doc IDs to retrieval.
- One fix: Persist lastDocumentIds/lastFile to Redis or DB (at minimum, register TTL), and ensure `routeAndExecute()` passes them to `kodaRetrievalEngineV3` and file_action detection.

## 7. Finance Retrieval Boosting
- Failure Modes: B1, B3, D1, E1 (indirect) 
- Related TODO: P0-4, P0-11
- Mechanism: financial queries fail because retrieval lacks spreadsheet metadata; `kodaRetrievalEngineV3` doesn't always boost xlsx docs, lastDocumentIds injection inconsistent.
- One fix: Add keywords (EBITDA, lucro líquido, net income) to alias bank and retrieval engine, boosting xlsx documents by 2x when these keywords appear and honoring lastDocumentIds.

## 8. Citations / Doc Marker Injection
- Failure Modes: D1, D3, E1-E4
- Related TODO: P0-4, P1-6
- Mechanism: Document answers bypass marker injection; formatting pipeline doesn't rewrite to include references; SSE done event lacks cite sections.
- One fix: After `generateAnswer()`, run an `injectDocMarkers()` that uses `sources` metadata to append DOC tokens (markerUtils), ensuring `InlineDocumentButton` has data for clickable refs.

## 9. Formatting Pipeline Enforcement
- Failure Modes: D6, D3, G2
- Related TODO: P1-6
- Mechanism: `kodaFormattingPipelineV3.service.ts` applies numbering even for single source; no table validation/enforcement; folder grouping looked at earlier.
- One fix: Implement `formatConstraints` parser and validators that enforce exact bullet counts and GFM tables, and skip numbering when only one source is cited.

## 10. SSE Contract + Frontend Rendering
- Failure Modes: E4, G1, G2, H3
- Related TODO: (implicit) streaming design in SUPER_SCAN
- Mechanism: `rag.controller.ts` uses SSE but citations are emitted mid-stream causing UI jitter; `StreamingMarkdownEnhanced.jsx` holdback disrupts DOC marker stream; `InlineDocumentButton` only available when markers present.
- One fix: Buffer citations to append only in `done` event, ensure front-end renderer uses `react-markdown` with `remark-gfm` and cleans holdback logic to avoid breaking marker boundaries.

## 11. Folder Ops & Confirmations
- Failure Modes: G4, P0-12
- Related TODO: P0-12
- Mechanism: Folder/move operations in `kodaOrchestratorV3:4281-4320` perform actions but don't add human confirmation text; no mention of destination path.
- One fix: After each action, append a confirmation sentence referencing the file/folder path.

## 12. Performance & TTFT
- Failure Modes: F1-F5, P0-9
- Related TODO: P0-9, F1, F4
- Mechanism: Inventory query hits entire DB (non-paginated), TTFT >10s on filters, answer generation uses multiple LLM calls.
- One fix: Add caching/pagination for file search, short-circuit filters to metadata path (no LLM), and track timed sections to ensure <8s TTFT.

