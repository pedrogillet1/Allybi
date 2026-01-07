# SSE Contract Verification

## Field Mapping Status

### ✅ CORRECT - Backend → Frontend

| Backend Field | Frontend Mapping | Component | Status |
|---------------|------------------|-----------|--------|
| `sources` | `ragSources` | DocumentSources | ✅ Working |
| `attachments` | `metadata.files` | FileActionCard | ✅ Working |
| `formatted` | `content` (with DOC markers) | StreamingMarkdown | ✅ Working |
| `citations` | Stored but not rendered separately | - | ⚠️ Redundant with sources |
| `fullAnswer` | Fallback if no `formatted` | - | ✅ Working |

### ✅ UPDATED - Backend Now Sends Constraints

| Field | Frontend Ready? | Backend Status |
|-------|-----------------|----------------|
| `constraints.buttonsOnly` | ✅ Yes | ✅ Sent for file_actions |
| `constraints.jsonOnly` | ✅ Yes | ⚠️ Not yet implemented |
| `constraints.csvOnly` | ✅ Yes | ⚠️ Not yet implemented |
| `constraints.tableOnly` | ✅ Yes | ⚠️ Not yet implemented |
| `constraints.exactBullets` | ❌ No | ❌ Not sent |
| `constraints.maxChars` | N/A (backend job) | ❌ Not sent |

---

## Done Event Payload (Actual)

From `backend/src/controllers/rag.controller.ts` lines 494-515:

```typescript
{
  type: 'done',
  messageId: string,
  assistantMessageId: string,
  conversationId: string,
  fullAnswer: string,
  formatted: string,           // ← Used by frontend
  intent: string,
  confidence: number,
  processingTime: number,
  documentsUsed: number,
  tokensUsed: number,
  wasTruncated: boolean,
  citations: Citation[],
  sources: Source[],           // ← Used by DocumentSources
  sourceDocumentIds: string[],
  attachments: Attachment[],   // ← Used by FileActionCard
  actions: FileAction[],
  referencedFileIds: string[],
  // constraints: NOT SENT
}
```

---

## Sanity Check Test Plan

### Test A: Citations Visible

**Query:** "According to my documents, what is the termination notice? Quote the line."

**Verification:**
```javascript
// In browser console:
document.querySelectorAll('[data-testid="assistant-citations"]').length > 0
document.querySelectorAll('[data-file-id]').length > 0
```

**Pass if:**
- `[data-testid="assistant-citations"]` exists
- At least 1 file button with `data-file-id`

**If fails:**
- Check console for `📚 Sources received:` log
- If sources empty: backend retrieval issue
- If sources present but not rendered: frontend mapping issue

---

### Test B: Buttons Only (Will Fail Until Backend Sends Constraints)

**Query:** "Show my newest PDF — buttons only."

**Current behavior:** Text + buttons both render (constraints not enforced)

**Expected after backend fix:**
- `[data-testid="assistant-message-content"]` has no text
- File buttons render

**To fix:** Backend must send `constraints: { buttonsOnly: true }` in done event

---

### Test C: JSON Only (Will Fail Until Backend Sends Constraints)

**Query:** "Show me the metadata in JSON only."

**Current behavior:** JSON rendered as markdown (may have formatting issues)

**Expected after backend fix:**
- Content renders as `<pre><code>` block
- JSON is parseable

**To fix:** Backend must send `constraints: { jsonOnly: true }` in done event

---

### Test D: Streaming Feel

**Query:** "Summarize the longest document in detail."

**Verification:**
```javascript
// During streaming:
document.querySelectorAll('[data-testid="msg-streaming"]').length > 0

// Watch for incremental updates:
// Open DevTools → Elements → find msg-streaming → watch text grow
```

**Pass if:**
- Text updates incrementally (not just final dump)
- Blinking cursor visible during generation

---

## Recommended Backend Changes

To enable constraints enforcement, add to `rag.controller.ts` done event:

```typescript
res.write(
  `data: ${JSON.stringify({
    type: 'done',
    // ... existing fields ...
    constraints: {
      buttonsOnly: streamResult.constraints?.buttonsOnly || false,
      jsonOnly: streamResult.constraints?.jsonOnly || false,
      csvOnly: streamResult.constraints?.csvOnly || false,
      tableOnly: streamResult.constraints?.tableOnly || false,
    },
  })}\n\n`
);
```

And propagate `constraints` from the orchestrator/response composer.

---

## Quick Console Test Commands

```javascript
// After any assistant message:

// 1. Check content container
const content = document.querySelector('[data-testid="assistant-message-content"]');
console.log('Content exists:', !!content);
console.log('Content text length:', content?.innerText?.length);

// 2. Check citations
const citations = document.querySelector('[data-testid="assistant-citations"]');
console.log('Citations exists:', !!citations);
console.log('File buttons:', document.querySelectorAll('[data-file-id]').length);

// 3. Check attachments (file action cards)
const attachments = document.querySelector('[data-testid="assistant-attachments"]');
console.log('Attachments exists:', !!attachments);

// 4. Check actions (copy/regenerate)
const actions = document.querySelector('[data-testid="assistant-message-actions"]');
console.log('Actions exists:', !!actions);
```
