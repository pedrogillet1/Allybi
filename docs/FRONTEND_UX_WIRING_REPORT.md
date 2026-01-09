# Frontend UX Wiring Report

## Overview

This document maps the frontend chat rendering pipeline for the Koda webapp, identifying key files, data flow, and areas requiring fixes for ChatGPT-like UX.

---

## 1. Frontend Chat Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INPUT                                          │
│  ChatInterface.jsx → handleSendMessage() → message state                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SSE REQUEST                                         │
│  chatService.js → sendAdaptiveMessageStreaming()                            │
│  fetch() to /api/chat/conversations/:id/messages/adaptive/stream            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SSE EVENT PROCESSING                                │
│  Event Types:                                                                │
│  ├─ connected: Connection confirmed                                         │
│  ├─ intent: Intent classification (for debug overlay)                       │
│  ├─ content: Token chunk → onChunk(data.content)                           │
│  ├─ action: File actions (show_file_modal, file_action)                    │
│  ├─ done: Complete message with metadata → onComplete(data)                │
│  └─ error: Error handling                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STATE UPDATES                                       │
│  ChatInterface.jsx:                                                          │
│  ├─ setStreamingMessage(streamedContent)  → Live streaming display          │
│  ├─ setMessages([...prev, assistantMsg])  → Final message commit           │
│  └─ pendingMessageRef.current = {...}     → Queue for animation completion │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MESSAGE RENDERING                                   │
│                                                                              │
│  STREAMING (live):                                                           │
│  └─ StreamingMarkdown.jsx                                                   │
│      ├─ ReactMarkdown with streaming cursor                                 │
│      ├─ Marker parsing (DOC, CITE, LOAD_MORE)                              │
│      └─ Document name → ID matching via documentMap                        │
│                                                                              │
│  STORED MESSAGES:                                                            │
│  └─ ChatInterface.jsx inline rendering                                      │
│      ├─ ReactMarkdown (remarkGfm, rehypeRaw)                               │
│      ├─ stripDocumentSources() removes text-based sources                  │
│      ├─ DocumentSources.jsx for ragSources                                 │
│      ├─ FileActionCard.jsx for file action buttons                         │
│      └─ MessageActions.jsx for copy/regenerate                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Files and Functions

### 2.1 SSE Client Implementation

**File:** `frontend/src/services/chatService.js`

| Function | Purpose |
|----------|---------|
| `sendAdaptiveMessageStreaming()` | Main SSE streaming function (lines 446-579) |
| `onChunk` callback | Receives content tokens |
| `onComplete` callback | Receives done event with metadata |
| `onAction` callback | Receives action events (file modals) |
| `onIntent` callback | Receives intent for debug overlay |

### 2.2 Message Rendering Components

**File:** `frontend/src/components/ChatInterface.jsx`

| Location | Purpose |
|----------|---------|
| Line ~2855 | `data-testid="assistant-message-content"` container |
| Line ~3743 | `<MessageActions>` rendered OUTSIDE content |
| Line ~3289 | `<DocumentSources>` for citations |
| Line ~3271 | `<FileActionCard>` for file action buttons |
| Line ~3936 | Streaming message container |

**File:** `frontend/src/components/StreamingMarkdown.jsx`
- Real-time markdown parsing during streaming
- Marker parsing: DOC, CITE, LOAD_MORE
- Document name → ID matching via `documentMap`
- Blinking cursor for streaming indication

### 2.3 Citations/Sources Rendering

**File:** `frontend/src/components/DocumentSources.jsx`
- Renders `msg.ragSources` as clickable file buttons
- Uses `InlineDocumentButton` with `variant="listing"`
- Deduplicates sources by documentId
- "See all X files" toggle for large lists

**File:** `frontend/src/components/SourcesList.jsx`
- Alternative sources component (less used)
- Shows relevance scores, view/download buttons

### 2.4 Attachments/File Buttons

**File:** `frontend/src/components/InlineDocumentButton.jsx`
- Already has `data-file-id` attribute (line 72)
- Already has `file-button` class (line 69)
- Supports two prop signatures (simple and DocumentSources)

**File:** `frontend/src/components/FileActionCard.jsx`
- File action buttons for navigation queries
- Has `data-file-id` on buttons (line 132)
- Supports SHOW_FILE, OPEN_FILE, SELECT_FILE, LIST_FOLDER

### 2.5 Message Actions

**File:** `frontend/src/components/MessageActions.jsx`
- Copy, Regenerate, Feedback buttons
- Returns `null` for non-assistant messages
- Currently rendered OUTSIDE content node (correct)

### 2.6 Marker Parsers

**File:** `frontend/src/utils/kodaMarkerParserV3.js`
- Parses unified marker format: `{{DOC::id=...::name="..."::ctx=...}}`
- Streaming-safe with holdback for incomplete markers

**File:** `frontend/src/utils/inlineDocumentParser.js`
- Legacy marker parsing
- `parseInlineDocuments`, `parseSimpleDocMarkers`
- `stripAllDocumentMarkers`, `hasMarkers`

---

## 3. Backend SSE Contract

**File:** `backend/src/types/streaming.types.ts`

### Event Types

| Type | Purpose | Key Fields |
|------|---------|------------|
| `content` | Token chunk | `content: string` |
| `done` | Final message | `fullAnswer`, `formatted`, `citations`, `attachments`, `sources` |
| `action` | File actions | `actionType`, `document`, `files` |
| `intent` | Debug info | `intent`, `confidence`, `domain` |
| `error` | Error | `error`, `code` |

### Done Event Schema (`backend/src/types/streaming.schema.ts`)

```typescript
DoneEvent {
  type: 'done';
  messageId?: string;
  assistantMessageId?: string;
  fullAnswer?: string;
  formatted?: string;           // Content with {{DOC::...}} markers
  citations?: Citation[];       // Structured citation data
  sources?: Source[];           // For DocumentSources component
  attachments?: Attachment[];   // File buttons
  actions?: FileAction[];       // File operations
  intent?: string;
  confidence?: number;
}

Citation {
  documentId: string;
  documentName: string;
  pageNumber?: number;
  chunkId?: string;
  snippet?: string;
}

Attachment {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  folderPath?: string | null;
  purpose?: 'open' | 'preview' | 'compare';
}
```

---

## 4. Current DOM Structure

### Assistant Message (Stored)

```html
<div class="assistant-message" data-testid="msg-assistant">
  <img src="sphere.svg" alt="Koda" />
  <div class="message-content" data-testid="assistant-message-content">
    <!-- Markdown content -->
    <div class="markdown-preview-container">
      <!-- ReactMarkdown output -->
    </div>

    <!-- File Preview Button (if show_file action) -->
    <!-- FileActionCard (if file_action metadata) -->
    <!-- DocumentSources (if ragSources exist) -->
    <!-- Confidence Badge -->
  </div>

  <!-- MessageActions (OUTSIDE content) -->
  <div class="message-actions">
    <!-- Feedback, Regenerate, Copy buttons -->
  </div>
</div>
```

### Streaming Message

```html
<div class="assistant-message streaming-message" data-testid="msg-streaming">
  <div>
    <StreamingMarkdown content={displayedText} isStreaming={true} />
  </div>
</div>
```

---

## 5. Identified Mismatches and Issues

### 5.1 Missing Test IDs

| Required | Current Status |
|----------|----------------|
| `data-testid="assistant-message-content"` | EXISTS (line ~2855) |
| `data-testid="assistant-message-actions"` | MISSING on MessageActions |
| `data-testid="assistant-citations"` | MISSING on DocumentSources |
| `data-testid="assistant-attachments"` | MISSING on FileActionCard |

### 5.2 DOM Structure Issues

- **MessageActions Position**: Already OUTSIDE content node (CORRECT)
- **Citations Position**: Inside content node but after text (ACCEPTABLE)
- **Streaming Container**: Missing consistent testids

### 5.3 SSE Contract Mismatches

| Backend Field | Frontend Handling |
|---------------|-------------------|
| `formatted` | Used correctly for DOC markers |
| `citations` | Mapped to `ragSources` |
| `attachments` | Mapped to `metadata.files` for FileActionCard |
| `sources` | Mapped to `ragSources` |

### 5.4 Streaming Behavior

- Incremental updates: `setStreamingMessage(streamedContent)` called on each chunk
- Animation: `useStreamingAnimation` hook adds character-by-character animation
- Holdback: Incomplete markers held back during streaming

### 5.5 Constraints Handling

- **buttonsOnly**: Not explicitly handled (content always rendered)
- **jsonOnly/csvOnly**: Not explicitly handled (no code block enforcement)
- **exactBullets**: Not explicitly handled (markdown may modify)
- **maxChars**: Not explicitly handled (no truncation)

---

## 6. Required Fixes

### Phase 2: DOM Structure & TestIDs
1. Add `data-testid="assistant-message-actions"` to MessageActions container
2. Add `data-testid="assistant-citations"` to DocumentSources container
3. Add `data-testid="assistant-attachments"` to FileActionCard container
4. Add `data-testid="msg-streaming"` to streaming message (already exists)

### Phase 3: Streaming Rendering
- Verify incremental DOM updates (already working via React state)
- Ensure streaming cursor visible during generation

### Phase 4: Citations Rendering
- Citations already rendered from `msg.ragSources`
- Ensure consistent rendering from `metadata.citations` if ragSources empty

### Phase 5: Attachments Rendering
- Already has `data-file-id` on buttons
- Ensure consistent rendering from `metadata.attachments`

### Phase 6: Constraints Handling
1. Add `buttonsOnly` check: if true, hide text content div
2. Add `jsonOnly/csvOnly` check: wrap in code block
3. Preserve `exactBullets`: use preformatted rendering
4. Add `maxChars` check: truncate if exceeded

---

## 7. File Change Summary

| File | Changes Required |
|------|------------------|
| `MessageActions.jsx` | Add `data-testid="assistant-message-actions"` |
| `DocumentSources.jsx` | Add `data-testid="assistant-citations"` |
| `FileActionCard.jsx` | Add `data-testid="assistant-attachments"` |
| `ChatInterface.jsx` | Add constraints handling in message rendering |

---

## 8. Verification Checklist (10 Test Queries)

### How to Run Tests

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm start`
3. Open browser DevTools (F12) → Elements tab
4. Run each query and verify the expected DOM structure

### Test Queries

#### 1. Basic RAG Query with Citations
**Query:** "What is in my documents about project planning?"
**Expected:**
- `[data-testid="assistant-message-content"]` contains markdown response
- `[data-testid="assistant-citations"]` appears if sources found
- `[data-file-id]` attributes on citation buttons
- `[data-testid="assistant-message-actions"]` visible below content

#### 2. Streaming Response Verification
**Query:** "Give me a detailed summary of my uploaded files"
**Expected:**
- `[data-testid="msg-streaming"]` appears during generation
- Text appears incrementally (multiple DOM updates)
- Blinking cursor visible during streaming
- Final message replaces streaming container

#### 3. File Navigation Query
**Query:** "Where is my resume.pdf?"
**Expected:**
- `[data-testid="assistant-attachments"]` appears if file found
- `[data-file-id]` attribute on file button
- Click opens file preview modal

#### 4. Multiple File Response
**Query:** "Show me all my PDF files"
**Expected:**
- Document list format OR multiple file buttons
- Each file has `[data-file-id]` attribute
- `[data-testid="assistant-citations"]` if shown as sources

#### 5. Copy Functionality
**Steps:**
1. Ask any question that gets a response
2. Click Copy button in `[data-testid="assistant-message-actions"]`
**Expected:**
- Response text copied to clipboard
- Copy button shows feedback (icon change or tooltip)

#### 6. Regenerate Functionality
**Steps:**
1. Ask a question
2. Click Regenerate in `[data-testid="assistant-message-actions"]`
**Expected:**
- Loading indicator appears
- New streaming response
- Previous response replaced

#### 7. Multi-turn Conversation
**Query 1:** "What documents do I have?"
**Query 2:** "Tell me more about the first one"
**Expected:**
- Both messages render correctly
- Second response maintains context
- All testids present on both assistant messages

#### 8. Table Rendering
**Query:** "List my files in a table format"
**Expected:**
- Table renders correctly (if backend returns table)
- Table has `.markdown-table` class
- No broken formatting

#### 9. Code/JSON Response
**Query:** "Show me the metadata in JSON format"
**Expected:**
- If `constraints.jsonOnly` set: renders as `<pre><code>`
- Monospace font, syntax preserved
- No markdown interpretation

#### 10. Empty/No Documents Response
**Query:** "Tell me about the quantum physics paper" (non-existent)
**Expected:**
- Clean assistant message (no broken UI)
- No empty citation containers
- Appropriate "not found" messaging

### DOM Verification Commands

Open browser console and run these commands to verify testids:

```javascript
// Verify assistant message content
document.querySelectorAll('[data-testid="assistant-message-content"]').length

// Verify message actions
document.querySelectorAll('[data-testid="assistant-message-actions"]').length

// Verify citations (may be 0 if no sources)
document.querySelectorAll('[data-testid="assistant-citations"]').length

// Verify file buttons
document.querySelectorAll('[data-file-id]').length

// Verify attachments container (may be 0 if no file actions)
document.querySelectorAll('[data-testid="assistant-attachments"]').length

// Verify streaming message (only during generation)
document.querySelectorAll('[data-testid="msg-streaming"]').length
```

### Expected Test Results Summary

| Test | Critical Elements | Pass Criteria |
|------|-------------------|---------------|
| 1 | Citations | `[data-testid="assistant-citations"]` with file buttons |
| 2 | Streaming | Incremental DOM updates visible |
| 3 | File nav | `[data-testid="assistant-attachments"]` with `[data-file-id]` |
| 4 | Multi-file | Multiple `[data-file-id]` buttons |
| 5 | Copy | Clipboard contains message text |
| 6 | Regenerate | New response replaces old |
| 7 | Multi-turn | All messages have proper testids |
| 8 | Tables | `.markdown-table` renders correctly |
| 9 | Code/JSON | `<pre><code>` preserves formatting |
| 10 | Empty | No broken UI elements |

---

## 9. Changes Made

### Files Modified

| File | Change |
|------|--------|
| `MessageActions.jsx` | Added `data-testid="assistant-message-actions"` |
| `DocumentSources.jsx` | Added `data-testid="assistant-citations"` |
| `FileActionCard.jsx` | Added `data-testid="assistant-attachments"` |
| `ChatInterface.jsx` | Added constraints handling (buttonsOnly, jsonOnly, csvOnly) |

### Files Already Correct

| File | Status |
|------|--------|
| `InlineDocumentButton.jsx` | Already has `data-file-id` attribute |
| `chatService.js` | SSE streaming already working correctly |
| Streaming message container | Already has `data-testid="msg-streaming"` |
| Content container | Already has `data-testid="assistant-message-content"` |

---

## 10. Backend Contract Notes

### Currently Implemented
- `content` events for streaming tokens
- `done` event with `fullAnswer`, `formatted`, `sources`, `attachments`
- `action` events for file modals

### Not Currently Implemented (Prepared in Frontend)
- `constraints.buttonsOnly` - Frontend ready to hide text if set
- `constraints.jsonOnly` - Frontend ready to render as code block
- `constraints.csvOnly` - Frontend ready to render as code block
- `constraints.tableOnly` - Standard markdown table rendering
- `constraints.exactBullets` - Would need backend support
- `constraints.maxChars` - Backend responsibility

### Recommendation
If strict formatting constraints are required, add them to the `DoneEvent` schema in `backend/src/types/streaming.schema.ts`:

```typescript
constraints?: {
  buttonsOnly?: boolean;
  jsonOnly?: boolean;
  csvOnly?: boolean;
  tableOnly?: boolean;
  exactBullets?: boolean;
  maxChars?: number;
};
```
