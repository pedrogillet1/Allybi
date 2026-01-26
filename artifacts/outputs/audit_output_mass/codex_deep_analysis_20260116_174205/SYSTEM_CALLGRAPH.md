# System Call Graphs (Document QA & File Actions)

Generated using the super scan call graphs as starting point.

## A. Document QA (RAG) Path

```
User Query → ChatInterface.jsx:handleSendMessage() (frontend/src/components/ChatInterface.jsx:1720-1830)
         ↓ (POST with SSE headers)
chatService.sendMessageStream() (frontend/src/services/chatService.js:90-160) → POST /api/rag/query/stream
         ↓
rag.controller.ts:queryStream(req, res) (backend/src/controllers/rag.controller.ts:260-330)
         • extracts conversationId, auth headers, SSE stream
         ↓
kodaOrchestratorV3.service.ts:routeAndExecute() (line 686, 1887)
         • builds requestContext: { conversationId, userId, intentBias, lastDocumentIds }
         • calls intentEngine.classifyIntent(intentPatterns)
         ↓
kodaOrchestratorV3.service.ts:handleDocumentQuery() (line 2835)
         • applies conversationMemory.getLastDocumentIds()
         ※ passes { renderMode, formatConstraints, lastDocumentIds }
         ↓
kodaRetrievalEngineV3.service.ts:retrieve({ query, namespace, filters, lastDocumentIds }) (lines 120-360)
         • runs hybrid search (vector + bm25)
         • boosts docs in lastDocumentIds (line ~200)
         • boosts finance xlsx when keywords match (line ~250)
         ↓
kodaAnswerEngineV3.service.ts:generateAnswer({ query, chunks, metadata }) (lines 850-930)
         • prepends system prompt + user prompt
         • sends combined prompt to LLM (maxTokens: 2000)
         ↓
kodaFormattingPipelineV3.service.ts:format({ rawResponse, formatConstraints }) (lines 1-220)
         • enforces bullet/table structure when formatConstraints set
         • should be the central point for list count / table validation
         ↓
responseContractEnforcer.service.ts:sanitize({ formattedAnswer, sources })
         • attaches citations, ensures doc markers present (markerUtils.createDocMarker)
         ↓
rag.controller.ts emits SSE `event: message` and `event: done` (lines 351-440)
         • done payload: { fullAnswer, formatted, sources, citations, chunksReturned }
         ↓
Frontend EventSource → ChatInterface.jsx:onMessage (line 2440)
         • appends to message state, associates requestId
         ↓
StreamingMarkdownEnhanced.jsx (lines 29-120)
         • renders markdown, highlighting \n bullet/table, parsing DOC token with InlineDocumentButton.jsx
```

Key data structures: conversationId, requestId, lastDocumentIds, formatConstraints, sources[], citations[], DOC markers.

## B. File Actions / Inventory Path

```
User Query → ChatInterface.jsx.captureFileActionIntent() (similar handler)
         ↓
kodaOrchestratorV3.service.ts:detectFileActionQuery() (line 5688)
         • regex order: file actions > reroute → prevents RAG
         • usa conversation memory lookups for pronouns
         • matches patterns (location, open, show, list)
         ↓
tryInventoryQuery() (line 3568) OR fileSearchService.search() (line 787)
         • parseInventoryQuery() (fileSearch.service.ts:823) ─ extracts filters (extension, folder, count)
         • searchByName() (fileSearch.service.ts:61-160) ─ case-insensitive, status filter
         ↓
fuzzyMatchFiles() (line 127-171) → returns metadata (filename, folderPath, mimeType)
         ↓
formatResultsAsMarkdown() (line 1326) → builds bullet list with folder headers, metadata
         ↓
createDocMarker() (markerUtils.ts:74-77) for each result
         ↓
kodaOrchestratorV3.service.ts:handleFileActions() (line 5549)
         • truncates markers to 8 (line 3274)
         • ensures guard rails (max length 500 chars line 3278)
         ↓
SSE write in rag.controller.ts: event `message` + `done`
         ↓
Frontend EventSource handles `message` → ChatInterface.jsx renders InlineDocumentButton for each DOC marker
```

Important metadata flows: folderPath, mimeType, size, hasFolderPath flag (needed for Q010/Q012). File filtering relies on extension mapping defined in fileSearch.service.js.

