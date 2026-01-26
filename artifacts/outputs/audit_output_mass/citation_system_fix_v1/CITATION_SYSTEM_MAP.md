# CITATION SYSTEM MAP

## End-to-End Flow: Retrieval → Citations → SSE → Frontend

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. RETRIEVAL (kodaRetrievalEngineV3.service.ts)                             │
│    KodaRetrievalEngineV3.retrieve()                                         │
│    → Returns: RetrievalResult { chunks: RetrievedChunk[], ... }             │
│    → Each chunk has:                                                        │
│       - documentId (or metadata.documentId)                                 │
│       - documentName (or metadata.filename)                                 │
│       - pageNumber (or metadata.pageNumber)                                 │
│       - content (text)                                                      │
│       - chunkId (format: ${documentId}-${chunkIndex})                       │
│       - similarity/score                                                    │
│       - metadata: { mimeType, fileType, folderPath, section, chunkIndex }   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. ORCHESTRATOR (kodaOrchestratorV3.service.ts)                             │
│    streamDocumentQnA()                                                      │
│                                                                             │
│    A) extractCitationsFromChunks(chunks) → citations[]                      │
│       - Deduplicates by documentId                                          │
│       - Returns: { documentId, documentName, pageNumber?, snippet?, chunkId }│
│       - Emits 'citation' event: yield { type: 'citation', citations }       │
│                                                                             │
│    B) buildSourcesFromChunks(chunks) → sources[]                            │
│       - Deduplicates by documentId                                          │
│       - Returns: { documentId, documentName, filename, location,            │
│                    mimeType, relevanceScore, folderPath, pageNumber,        │
│                    snippet }                                                │
│       - ⚠️ MISSING: No openUrl, viewUrl, or downloadUrl built              │
│                                                                             │
│    C) Done Event (line ~2284):                                              │
│       yield {                                                               │
│         type: 'done',                                                       │
│         fullAnswer: formattedAnswer,                                        │
│         formatted: formattedAnswer,                                         │
│         citations: [...],   // ✓ Included                                  │
│         sources: [...],     // ✓ Included                                  │
│         sourceDocumentIds: [...],                                           │
│         ...                                                                 │
│       }                                                                     │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. RAG CONTROLLER (rag.controller.ts)                                       │
│    queryWithRAGStreaming()                                                  │
│                                                                             │
│    A) Capture from done event (line ~409-424):                              │
│       streamResult = {                                                      │
│         citations: doneEvent.citations || citations,                        │
│         sources: doneEvent.sources || [],  // ✓ Captured                   │
│         sourceDocumentIds: doneEvent.sourceDocumentIds || [],               │
│         formatted: doneEvent.formatted,                                     │
│         attachments: doneEvent.attachments || [],                           │
│         ...                                                                 │
│       }                                                                     │
│                                                                             │
│    B) Final SSE done event (line ~508-531):                                 │
│       res.write(`data: ${JSON.stringify({                                   │
│         type: 'done',                                                       │
│         fullAnswer,                                                         │
│         formatted: streamResult.formatted || fullAnswer,                    │
│         citations: streamResult.citations || citations,  // ✓ Sent          │
│         sources: streamResult.sources || [],             // ✓ Sent          │
│         sourceDocumentIds: streamResult.sourceDocumentIds || [],            │
│         attachments: streamResult.attachments || [],                        │
│         actions: streamResult.actions || [],                                │
│         ...                                                                 │
│       })}\n\n`)                                                             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. FRONTEND - chatService.js                                                │
│    SSE Event Parser                                                         │
│                                                                             │
│    On 'done' event (line ~550):                                             │
│    onComplete(data)  // Calls the onComplete callback with done data        │
│                                                                             │
│    ✓ data.sources is available                                             │
│    ✓ data.citations is available                                           │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. FRONTEND - ChatInterface.jsx                                             │
│    onMessageComplete handler (line ~712)                                    │
│                                                                             │
│    A) Sources attachment (line ~718-728):                                   │
│       if (data.sources && data.sources.length > 0) {                        │
│         setMessages((prev) => {                                             │
│           const lastMessage = prev[prev.length - 1];                        │
│           if (lastMessage?.role === 'assistant') {                          │
│             return [...prev.slice(0,-1),                                    │
│               { ...lastMessage, ragSources: data.sources }                  │
│             ];                                                              │
│           }                                                                 │
│         });                                                                 │
│       }                                                                     │
│                                                                             │
│    ✓ sources → msg.ragSources mapping works                                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. FRONTEND - DocumentSources.jsx (line ~3382)                              │
│    Rendering Sources Panel                                                  │
│                                                                             │
│    {msg.ragSources && msg.ragSources.length > 0 && (                        │
│      <DocumentSources                                                       │
│        sources={msg.ragSources}                                             │
│        onDocumentClick={(doc) => {                                          │
│          setPreviewDocument({...})                                          │
│        }}                                                                   │
│      />                                                                     │
│    )}                                                                       │
│                                                                             │
│    DocumentSources maps each source to InlineDocumentButton:                │
│    <InlineDocumentButton                                                    │
│      document={{                                                            │
│        documentId: source.documentId || source.id,                          │
│        documentName: source.documentName || source.filename,                │
│        filename: source.filename,                                           │
│        mimeType: source.mimeType,                                           │
│        ...                                                                  │
│      }}                                                                     │
│      onClick={onDocumentClick}                                              │
│      variant="listing"                                                      │
│    />                                                                       │
│                                                                             │
│    ❌ CRITICAL BUG: InlineDocumentButton expects:                           │
│       { docId, docName, context, onClick, className }                       │
│    But DocumentSources passes:                                              │
│       { document, onClick, variant }                                        │
│    → PROP MISMATCH: Buttons may not render or function correctly!           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Source Object Shape (Orchestrator → SSE → Frontend)

### Backend builds (buildSourcesFromChunks):
```typescript
{
  documentId: string;
  documentName: string;
  filename: string;
  location: string;           // "Page 3" or "Section 1"
  mimeType?: string;
  relevanceScore?: number;    // 0-100
  folderPath?: string;
  pageNumber?: number;
  snippet?: string;           // First 500 chars of content
}
```

### Frontend expects (DocumentSources/InlineDocumentButton):
```javascript
{
  documentId: source.documentId || source.id,
  documentName: source.documentName || source.filename,
  filename: source.filename,
  mimeType: source.mimeType,
  fileSize: source.fileSize,
  folderPath: source.folderPath
}
```

### Missing Fields:
- **openUrl / viewUrl**: Not built by backend, not passed to frontend
- **downloadUrl**: Not built
- **fileSize**: Not included in buildSourcesFromChunks output

---

## Citation Object Shape

### Backend builds (extractCitationsFromChunks):
```typescript
{
  documentId: string;
  documentName: string;
  pageNumber?: number;
  snippet?: string;    // First 100 chars
  chunkId?: string;
}
```

### Usage:
- Sent as 'citation' event during streaming
- Included in 'done' event
- Frontend captures but **does not render inline citations**

---

## Key Findings

### ✅ Working Parts:
1. Retrieval returns chunks with documentId metadata
2. Orchestrator builds sources[] and citations[] from chunks
3. Controller captures and forwards in SSE done event
4. Frontend receives sources via data.sources
5. Frontend attaches to msg.ragSources
6. DocumentSources component attempts to render

### ❌ Bugs Found:

#### BUG 1: InlineDocumentButton Prop Mismatch
**Location:** `DocumentSources.jsx` → `InlineDocumentButton.jsx`
**Issue:** DocumentSources passes `{ document, onClick, variant }` but InlineDocumentButton expects `{ docId, docName, context, onClick, className }`
**Impact:** Source buttons may not display document name or handle clicks correctly

#### BUG 2: Missing openUrl/viewUrl
**Location:** `kodaOrchestratorV3.service.ts:buildSourcesFromChunks()`
**Issue:** No URL is built for opening documents
**Impact:** Frontend must derive URL from documentId, may not work for all routes

#### BUG 3: No fileSize in sources
**Location:** `kodaOrchestratorV3.service.ts:buildSourcesFromChunks()`
**Issue:** fileSize not included in source object
**Impact:** Minor - UI may show "unknown size"

---

## File References

| Component | File | Key Lines |
|-----------|------|-----------|
| Retrieval | `kodaRetrievalEngineV3.service.ts` | ~130-250 |
| Citation Builder | `kodaOrchestratorV3.service.ts` | 2314-2387 |
| Sources Builder | `kodaOrchestratorV3.service.ts` | 3330-3447 |
| Done Event | `kodaOrchestratorV3.service.ts` | 2284-2304 |
| SSE Controller | `rag.controller.ts` | 405-532 |
| SSE Parser | `chatService.js` | 545-552 |
| Message Handler | `ChatInterface.jsx` | 712-728 |
| Sources Panel | `DocumentSources.jsx` | 19-182 |
| Doc Button | `InlineDocumentButton.jsx` | 14-48 |

---

## Next Steps (Phase 2)

1. Verify prop mismatch is causing rendering failures
2. Check if citations are actually empty in test runs
3. Find evaluation results showing missing citations
4. Determine if sources exist but aren't rendered due to prop bug
