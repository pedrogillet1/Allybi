# Preflight Verification Checklist

Generated: 2026-01-16 19:44

## P0 — UI CONTRACT & SSE

### P0.1 Frontend maps done.fullAnswer → message.content ✅ PASS

**Evidence:**
- `frontend/src/services/chatService.js:550-552`: SSE done event parsed and passed to onComplete callback
- `frontend/src/components/ChatInterface.jsx:2443-2446`: `data.type === 'done'` stores `metadata = data`
- `frontend/src/components/ChatInterface.jsx:2481`: `const finalContent = metadata.formatted || metadata.fullAnswer || streamedContent`
- `frontend/src/components/ChatInterface.jsx:2498`: `content: finalContent` overwrites message content

**Verdict:** Frontend correctly maps `done.fullAnswer` (or `done.formatted`) to `message.content` and replaces (not appends).

### P0.2 SSE request association / no stream mixing ✅ PASS

**Evidence:**
- `ChatInterface.jsx:2463-2477`: Uses `metadata.userMessageId` and `metadata.assistantMessage.id` from done event
- `ChatInterface.jsx:2496-2510`: Assistant message created with unique `id` from `metadata.assistantMessage.id`
- Streaming chunks update `streamedContent` variable locally, not mixed with other requests

**Verdict:** Each send creates unique message IDs, stream events correctly associated.

### P0.3 Sources are NOT injected into message body ✅ PASS

**Evidence:**
- `ChatInterface.jsx:335-376`: `stripDocumentSources()` function explicitly removes Sources/Fontes sections from content
- `ChatInterface.jsx:2499-2500`: `ragSources: metadata.sources || []` stored separately, not in content
- No `appendSourcesToContent` logic found

**Verdict:** Sources rendered via `ragSources` array, not concatenated into content.

### P0.4 Bold clickable titles open preview modal ✅ PASS

**Evidence:**
- `frontend/src/components/InlineDocumentButton.jsx`: Renders document as clickable button
- `frontend/src/components/DocumentSources.jsx`: Renders sources with click handlers
- `ChatInterface.jsx:174`: `previewDocument` state for modal
- `ChatInterface.jsx:2280+`: Uses `InlineDocumentButton`, `InlineFolderButton`, `InlineDocumentList`

**Verdict:** Document titles rendered as buttons with onClick opening preview modal.

### P0.5 Inline citation chip + "See all" chip components exist ✅ PASS

**Evidence:**
- `frontend/src/components/LoadMoreButton.jsx`: Renders "See all (N)" chip
- `frontend/src/utils/inlineDocumentParser.js`: `parseSeeAllMarkers()`, `parseLoadMoreMarkers()`
- `ChatInterface.jsx:45`: Import of `LoadMoreButton`

**Verdict:** Citation markers and See All chips implemented.

---

## P0 — BACKEND RESPONSE CONTRACT

### P0.6 SSE done payload includes required fields ✅ PASS

**Evidence:**
- `backend/src/controllers/rag.controller.ts:520-532`:
  ```typescript
  fullAnswer,
  formatted: streamResult.formatted || fullAnswer,
  citations: streamResult.citations || citations,
  sources: streamResult.sources || [],
  attachments: streamResult.attachments || [],
  ```

**Verdict:** SSE done event includes fullAnswer, sources[], citations[], attachments[].

### P0.7 Doc markers produced for BOTH file_actions and RAG ✅ PASS

**Evidence:**
- `kodaOrchestratorV3.service.ts:914,970,1079`: RAG path uses `{{DOC::...}}` markers
- `kodaOrchestratorV3.service.ts:3308,4899,5076,6748,6753`: file_actions uses `{{DOC::...}}` markers
- `kodaFormattingPipelineV3.service.ts:5,414,1101`: Handles DOC markers in formatting

**Verdict:** Both file_actions and RAG use {{DOC::...}} marker format.

### P0.8 No metadata leaks in file listing ⚠️ NEEDS VERIFICATION

**Evidence:**
- `fileSearch.service.ts`: No explicit `hideMetadata` parameter found
- Need to verify formatResultsAsMarkdown does not expose internal paths

**Verdict:** Static inspection inconclusive - requires runtime verification.

### P0.9 List cap 10 + LOAD_MORE marker ✅ FIXED

**Evidence:**
- `kodaOrchestratorV3.service.ts:3346-3358`:
  ```typescript
  // Truncate to first 10 DOC markers if too long (P0.9 requirement)
  if (markers.length > 10) {
    const keptMarkers = markers.slice(0, 10).join('\n');
    ...
    shown: 10,
    remaining: markers.length - 10,
  ```

**Status:** Fixed on 2026-01-16 - changed list cap from 8 to 10.

### P0.10 Filename resolver works with renames (semantic/fuzzy) ✅ PASS

**Evidence:**
- `fileSearch.service.ts:15`: `const USABLE_STATUSES = ['available', 'enriching', 'ready', 'completed'];`
- `fileSearch.service.ts:60`: `{ limit = 10, exactMatch = false }` - fuzzy by default
- `fileSearch.service.ts:80,96,115,155...`: Multiple search methods use USABLE_STATUSES

**Verdict:** Uses USABLE_STATUSES (not only completed), supports fuzzy matching.

### P0.11 Pronoun resolver runs BEFORE filename extraction ✅ PASS

**Evidence:**
- `kodaOrchestratorV3.service.ts:268-288`: `lastReferencedFile` tracking in cache
- `kodaOrchestratorV3.service.ts:2075-2078`: Check `fileContext?.lastReferencedFile` before filename extraction
- `kodaOrchestratorV3.service.ts:6611-6612`: Uses `lastReferencedFile` for follow-up context

**Verdict:** Pronoun resolution (lastReferencedFile) checked before filename parsing.

### P0.12 Folder operations are implemented and routed ✅ PASS

**Evidence:**
- `kodaOrchestratorV3.service.ts:4363-4374`: `createFolderPatterns` detected and `folderService.createFolder()` called
- `kodaOrchestratorV3.service.ts:1084,4140,4728...`: `listFolderContents()` used throughout
- `fileSearch.service.ts`: `listFolderContents()` method exists

**Verdict:** Create folder, list folders, list folder contents implemented.

---

## P0 — MEMORY & FOLLOWUPS

### P0.13 Conversation memory persistence & fields ✅ PASS

**Evidence:**
- `kodaOrchestratorV3.service.ts:48,314,375`: `ConversationMemoryService` injected
- `kodaOrchestratorV3.service.ts:838-845`:
  ```typescript
  await this.conversationMemory.updateMetadata(request.conversationId, {
    lastIntent: finalIntent.primaryIntent,
    lastDocumentIds: response.metadata.sourceDocumentIds,
  });
  ```
- `kodaOrchestratorV3.service.ts:262-270`: Context includes `lastDocumentIds`, `lastReferencedFile`, `lastReferencedFolder`

**Verdict:** Memory stores lastIntent, lastDocumentIds, lastReferencedFile.

### P0.14 Follow-up inheritance applied to routing and retrieval ✅ PASS

**Evidence:**
- `kodaOrchestratorV3.service.ts:666-678`: Fetches `previousIntent`, `lastDocumentIds` for follow-ups
- `kodaOrchestratorV3.service.ts:791-792`: Passes `lastDocumentIds` for retrieval continuity boost

**Verdict:** Follow-up inheritance passed to routing and retrieval.

---

## P0 — BANKS: PARITY, DEDUPE, COLLISIONS

### P0.15 Single source of truth for banks ⚠️ PARTIAL

**Evidence:**
- `dataBankRegistry.ts:78-79`: Registers `intent_patterns_runtime`
- `dataBankLoader.ts:344`: `getBank('intent_patterns_runtime')` accessor
- `intentConfig.service.ts:50`: Direct load from `intent_patterns.runtime.json`
- `brainDataLoader.service.ts:182`: Direct load from `intent_patterns.json`

**Issue:** Multiple loaders exist - not fully consolidated to registry/loader pattern.

### P0.16 EN/PT parity ✅ PASS

**Evidence:**
- Bank generation produced equal EN/PT bank pairs
- 136 banks written (68 EN, 68 PT)
- All paired banks have matching item counts (within tolerance)

**Verdict:** EN/PT parity verified.

### P0.17 No duplicates and no critical collisions ✅ PASS

**Evidence:**
- `COLLISION_REPORT.md`:
  - Critical Collisions: 0
  - Warning Collisions: 0
  - Overly Broad Patterns: 0
  - Pattern Collisions: 0

**Verdict:** Zero collisions detected across 22,646 patterns.

---

## Summary

| Check | Status |
|-------|--------|
| P0.1 | ✅ PASS |
| P0.2 | ✅ PASS |
| P0.3 | ✅ PASS |
| P0.4 | ✅ PASS |
| P0.5 | ✅ PASS |
| P0.6 | ✅ PASS |
| P0.7 | ✅ PASS |
| P0.8 | ⚠️ NEEDS VERIFICATION |
| P0.9 | ✅ FIXED (changed to 10) |
| P0.10 | ✅ PASS |
| P0.11 | ✅ PASS |
| P0.12 | ✅ PASS |
| P0.13 | ✅ PASS |
| P0.14 | ✅ PASS |
| P0.15 | ⚠️ PARTIAL |
| P0.16 | ✅ PASS |
| P0.17 | ✅ PASS |

**Critical Findings:** 0 FAIL (P0.9 fixed)
