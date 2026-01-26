# Root Cause Matrix

Maps each failure mode from `FAILURE_MODE_CATALOG.md` to the core symptom, code location introducing the wrong behavior, and the best single fix location.

| ID | Symptom | Root Cause | Introduced | Fix | Files/Functions | Notes |
|----|---------|------------|------------|-----|-----------------|-------|
| A1 | "Where is it located" fails | location regex matches "it" literally before pronoun pattern | `kodaOrchestratorV3.service.ts:5688-5880` (detectFileActionQuery) | Reorder patterns or add negative lookahead | `routeAndExecute` locations | Entire class of follow-up pronoun questions fixed
| A2 | "Show me the contract summary" blocked | content guard matches "summary" before checking explicit file keywords | same file lines 5740-5755 | Narrow guard to require filename tokens | same | avoids misrouting inventory queries
| A3 | count queries routed to help | count detection after math detection and help guard | `routeAndExecute` lines 5580-5610 | Move count check earlier | `count` routine | ensures inventory counting queries go to correct handler
| A4 | multi-intent split | decision tree splits `show PDFs` into multi-intent without combining | `multiIntent.service.ts:149` | Add compound inventory rule | `decisionTree` guard | unified responses for combined requests
| A5 | help intercepts file questions | analytics pattern in `decisionTree` triggers before file keywords | `decisionTree:102` | boost file_actions when file verbs present | `decisionTree` pattern list | ensures "what files do I have" hits inventory
| A6 | PT inventory response mixes languages | incomplete Portuguese keywords | `fileSearch.service.ts:1300` | add comprehensive PT lexicon | `fileSearch` parseInventoryQuery | ensures PT phrasing yields PT replies
| A7 | extraction question returns summary | extraction patterns overlap with documents | `decisionTree:102` | strengthen extraction keywords (EBITDA, value lookup) | same | ensures financial queries go to extract path
| A8 | "What's in it" sees literal "it" | context not passed to RAG before file_action detection | `orchestrator:2020-2042` | Pass lastDocumentIds into retrieval and detection | `conversationMemory` + `kodaRetrievalEngine` | fix all context-based queries
| B1 | "Where is Rosewood Fund" not found | status filter limited to 'completed' | `fileSearch:141` | use `USABLE_STATUSES` set | `fileSearch`, `document.service.ts:24` | ensures available docs searchable
| B2 | partial names fail | fuzzy threshold high | `fileSearch:127-171` | lower threshold + normalization | `fuzzyMatchFiles` | all partial matches succeed
| B3 | "Show only spreadsheets" missing xls/csv | extension map only includes 'xlsx' | `fileSearch:1008` | map to multi-extension arrays | `extensionMap` | fixes filter queries
| B4 | case-sensitive search | inconsistent lowercasing | `fileSearch:151` | normalize both sides to lowercase | searchByName | fix uppercase queries
| B5 | special chars break | regex not escaping tokens | `fileSearch` patterns | escape special chars | searchByName | ensures P&L with '&' matches
| B6 | partial filenames not matched | `extractFilenameFromQuery` requires full match | `fileSearch` | add token-based partial match | searchByName | aids generic queries
| B7 | image filter misses formats | extension set incomplete | `fileSearch:1008` | add all image extensions | extension map | ensures image-only filter works
| C1 | context lost on restart | in-memory Map with no persistence | `orchestrator:275` caches | persist to Redis/DB | `conversationMemory`, `db` | no more context resets
| C2 | no TTL | caches never evict | same lines | add TTL logic | `conversationMemory` | prevents buildup
| C3 | lastDocumentIds unused | retrieval ignoring boost parameter | `kodaRetrievalEngine:200` | apply boosting/filter for lastDocumentIds | retrieval function | ensures follow-ups stay anchored
| C4 | leakage across conversations | key pattern may reuse same map entry if convId mismatched | `conversationMemory` key builder | enforce unique per user/conversation | same file | ensures isolation
| C5 | second-to-last file not tracked | only lastReferencedFile stored | `conversationMemory` lines 285-288 | store previous + current for compare queries | `lastReferenced` storage | enables dual comparisons
| D1 | no doc markers | answer pipeline missing injection | `kodaAnswerEngineV3:877` not injecting markers | add marker injection using sources | `markerUtils`, `responseContractEnforcer` | clickable sources appear
| D2 | metadata in bullet text | formatResultsAsMarkdown includes size/folder | `fileSearch:1326` | suppress metadata unless debug | same | cleans output
| D3 | numbering single source | formatting pipeline always numbers lists | `kodaFormattingPipeline` | skip numbering when sources=1 | pipeline | ensures natural prose
| D4 | missing "See all" | no load-more marker after truncating to 8 | `orchestrator:3278-3288` | append `createLoadMoreMarker()` | `markerUtils` | all large inventories get CTA
| D5 | folder grouping messy | group_by_folder formatting lacks separation | `orchestrator:4087-4130` | insert header lines and blank separators | same | improves UX
| D6 | table rendering issues | format not GFM | `kodaFormattingPipeline` | enforce GFM table via validator | pipeline + `StreamingMarkdown` | ensures tables render correctly
| E1 | missing citations | answer engine not injecting sources | `kodaAnswerEngineV3`, `responseContractEnforcer` | ensure citations appended to formatted text | `responseContractEnforcer` | clickable sources always appear
| E2 | missing page numbers | page info not stored/injected | `kodaRetrievalEngine` metadata lacks page attr | include page info when chunking | retrieval chunk builder | pages appear with citations
| E3 | multiple sources not grouped | SSE done payload lacking aggregated sources property | `rag.controller` | aggregate sources at done | `rag.controller`, frontend sources panel | multi-source answers show list
| E4 | streaming citations mid-answer | `rag.controller` emits citation events prematurely | buffer and emit only with `done` | `rag.controller` | smooth SSE
| F1 | slow inventory query | getUserDocuments fetches all docs without pagination | `fileSearch` | add pagination/caching | service + DB query | TTFT improves
| F2 | triple LLM calls | orchestrator makes separate intent → answer → format LLM hits | restructure to single prompt or reuse output | `kodaAnswerEngine` + formatting | reduces latency
| F3 | fuzzy search O(n) | loops over user docs | add indexed search/trigrams | `fuzzyMatchFiles` | faster search
| F4 | TTFT >10s filters | filter path hits heavy RAG pipeline | short-circuit to metadata-only chain | `fileSearch` + orchestrator | ensures TTFT <8s
| F5 | streaming holdback overhead | `StreamingMarkdown` holding 50 chars | reduce holdback boundary detection | frontend holdback logic | smoother stream
| G1 | no auto preview on open | frontend doesn't auto-issue click | `ChatInterface` | fire auto-open when OPEN_FILE returned | UI component | improves UX
| G2 | compare missing both files | compare patterns incomplete | `orchestrator:2894,6078` | ensure list includes both doc markers | `InlineDocumentButton` etc. | full compare view
| G3 | folder path missing | file actions omit folder metadata | `handleFileActions` | append folder path text to response | same | success for Q010/Q012
| G4 | move confirmation missing | action executes but no confirm text | `handleFileActions` move branch | add templated confirmation | same | P0-12 done
| H1 | no fallback on vector errors | retrieval hybrid lacks fallback chain | `kodaRetrievalEngine` | add explicit fallbacks | retrieval file | more resilient
| H2 | missing rate limit retries | answer engine not handling 429s | `kodaAnswerEngine` | add retry/backoff to LLM calls | same | prevents bursts
| H3 | marker recovery edge cases | streaming buffer doesn't handle broken markers | `markerUtils` | improve recovery logic | same | prevents truncated markers

