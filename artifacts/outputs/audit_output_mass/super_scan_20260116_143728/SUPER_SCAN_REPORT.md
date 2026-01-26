# SUPER SCAN REPORT - Call Graph Analysis

**Date**: 2026-01-16
**Scan Duration**: ~15 minutes
**Files Analyzed**: 47 backend TS files, 12 frontend JSX files

---

## 1. DOC QA FLOW (RAG)

### Call Graph

```
User Query → ChatInterface.jsx:handleSendMessage()
         ↓
    chatService.sendMessageStream() → POST /api/rag/query/stream
         ↓
    rag.controller.ts:queryStream (line 301)
         ↓
    orchestratorService.processQueryStreaming()
         ↓
    kodaOrchestratorV3.service.ts:routeAndExecute() (line 686)
         ↓
    intentEngine.classifyIntent() → intentV3.types.ts
         ↓
    routeDecision() (line 1887)
         ├── documents intent → handleDocumentQuery() (line 2835)
         │         ↓
         │   retrievalEngine.retrieve() (line 2919)
         │         ↓
         │   answerEngine.generateAnswer() (line 877) [maxTokens: 2000]
         │         ↓
         │   formattingPipeline.format()
         │         ↓
         │   [NO DOC MARKERS INJECTED HERE] ← ISSUE P0-4
         │
         └── file_actions intent → handleFileActions() (line 5549)
                   ↓
             tryInventoryQuery() (line 3568) OR detectFileActionQuery() (line 5688)
                   ↓
             fileSearchService.search() → createDocMarker() (markerUtils.ts:74)
                   ↓
             DOC markers injected (orchestrator:3248-3276)
         ↓
    StreamEvent emitted via res.write() (rag.controller:401-440)
         ↓
    Frontend: EventSource → ChatInterface:1794 (content), :2443 (done)
         ↓
    StreamingMarkdownEnhanced.jsx → parseWithHoldback()
         ↓
    InlineDocumentButton.jsx renders {{DOC::...}} markers
```

### Critical Files

| File | Key Lines | Purpose |
|------|-----------|---------|
| `kodaOrchestratorV3.service.ts` | 686, 1887, 2835, 5549, 5688 | Central routing |
| `kodaAnswerEngineV3.service.ts` | 877 | LLM generation (maxTokens: 2000) |
| `kodaRetrievalEngineV3.service.ts` | 127-350 | Vector + BM25 retrieval |
| `rag.controller.ts` | 301, 351, 401-440 | SSE streaming |
| `markerUtils.ts` | 74-77 | DOC marker creation |
| `StreamingMarkdownEnhanced.jsx` | 29, 59-68 | Marker rendering |

---

## 2. FILE ACTIONS FLOW

### Call Graph

```
User Query: "where is contract.pdf"
         ↓
    kodaOrchestratorV3.service.ts:detectFileActionQuery() (line 5688)
         ↓
    Pattern matching:
      - location patterns: /where\s+(is|are)/ (line 5707)
      - open patterns: /\bopen\s+(the\s+)?/ (line 5720)
      - pronoun patterns: /\b(open|show|preview)\s+it\b/ (line 5754) ← ORDER ISSUE
      - content guard: /summarize|explain|what.*in/ (line 5746)
         ↓
    fileSearchService.searchByName() (fileSearch.service.ts:61)
         ↓
    Prisma query with status='completed' (line 141) ← BUG: should use USABLE_STATUSES
         ↓
    fuzzyMatchFiles() (line 127-171)
         ↓
    createDocMarker() for results (orchestrator:3252-3270)
         ↓
    TRUNCATE to 8 markers (line 3278) ← Missing "See all" chip
         ↓
    Return via SSE → Frontend renders InlineDocumentButton
```

### Critical Files

| File | Key Lines | Purpose |
|------|-----------|---------|
| `kodaOrchestratorV3.service.ts` | 5688-5880 | File action detection |
| `fileSearch.service.ts` | 61, 127, 141, 787, 823 | Search + parse |
| `InlineDocumentButton.jsx` | 16-80 | Button rendering |

---

## 3. MEMORY / CONTEXT FLOW

### Call Graph

```
Query processed → orchestrator saves context
         ↓
    conversationFileContextCache.set() (line 275-295) ← IN-MEMORY MAP
         ↓
    lastReferencedFileCache.set() (line 278-295)
         ↓
    Next query: getFileContext(userId, conversationId) (line 667)
         ↓
    Check lastReferencedFile for pronoun resolution (line 2025-2028)
         ↓
    Pass lastDocumentIds to retrieval (line 792, 2042)
```

### Memory Storage (ALL IN-MEMORY - LOST ON RESTART)

| Cache | Location | Persistence |
|-------|----------|-------------|
| `conversationFileContextCache` | orchestrator:275 | None (Map) |
| `lastReferencedFileCache` | orchestrator:278 | None (wrapper) |
| `conversationIntentCache` | orchestrator:858 | None (Map) |

---

## 4. INVENTORY FLOW

### Call Graph

```
Query: "show only spreadsheets"
         ↓
    parseInventoryQuery() (fileSearch.service.ts:823)
         ↓
    Regex detection:
      - FILTER: /show\s+only\s+(.+)/ (line 960)
      - COUNT: /how many|count/ (line 1107)
      - GROUP: /group.*folder|by.*folder/ (line 1050)
         ↓
    Extension mapping (line 1008):
      'spreadsheet': 'xlsx' ← Only xlsx, missing xls
      'spreadsheets': 'xlsx'
         ↓
    getUserDocuments() with extension filter
         ↓
    formatResultsAsMarkdown() (line 1326)
         ↓
    Includes metadata: "(size | folder)" ← LEAK
```

---

## 5. SSE STREAMING FLOW

### Event Types

| Event | Source | Frontend Handler |
|-------|--------|------------------|
| `content` | rag.controller:401 | ChatInterface:1794, 2393 |
| `citation` | rag.controller:405 | ChatInterface:2401 |
| `done` | rag.controller:409 | ChatInterface:1813, 2443 |
| `error` | rag.controller:447 | ChatInterface:1820 |

### Streaming Buffer

```typescript
// Backend: rag.controller.ts:384-440
fullAnswer += event.content; // Accumulate for done event

// Frontend: ChatInterface.jsx:1794
setStreamingMessages(prev => ({
  ...prev,
  [messageId]: { content: prev[messageId]?.content + data.content }
}));

// Frontend: StreamingMarkdownEnhanced.jsx:29-37
const { parts, heldBack } = parseWithHoldback(content, isStreaming ? 50 : 0);
```

---

## 6. DOC MARKER FORMAT

### Contract

```
{{DOC::id=<uuid>::name="<filename>"::ctx=<list|text>}}
{{CITE::id=<uuid>::doc="<filename>"::page=<n>::chunk=<chunkId>}}
{{LOAD_MORE::total=<n>::shown=<n>::remaining=<n>}}
```

### Generation Points

| Intent | Location | Markers Generated |
|--------|----------|-------------------|
| file_actions | orchestrator:3248-3276 | YES - DOC markers |
| documents (RAG) | answerEngine:877 | NO - Plain text only |
| extraction | orchestrator:2044 | NO - Plain text only |

---

## 7. CRITICAL PATH METRICS

### Token Budgets

| Component | Limit | Location |
|-----------|-------|----------|
| Answer generation | 2000 tokens | answerEngine:877 |
| Context window | 8000 tokens | retrievalEngine:250 |
| Streaming buffer | 50 chars holdback | StreamingMarkdownEnhanced:32 |

### Performance Hot Paths

1. **Full DB scan**: `getUserDocuments()` with no pagination
2. **Multiple LLM calls**: intent → answer → format (3 calls minimum)
3. **Fuzzy search**: O(n) loop over all documents (fileSearch:127-171)

