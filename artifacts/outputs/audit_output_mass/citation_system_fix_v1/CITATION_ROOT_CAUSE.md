# CITATION ROOT CAUSE ANALYSIS

## Executive Summary

**Primary Bug:** InlineDocumentButton prop mismatch causes source buttons to render incorrectly.

The DocumentSources component passes a `document` object prop, but InlineDocumentButton expects individual `docId`, `docName` props. This causes:
- Document names not displaying
- Click handlers not receiving document IDs
- Source buttons appearing broken or non-functional

---

## Root Cause #1: InlineDocumentButton Prop Mismatch (CRITICAL)

### Evidence

**DocumentSources.jsx (line 123-135):**
```jsx
<InlineDocumentButton
  document={{
    documentId: source.documentId || source.id,
    documentName: source.documentName || source.filename || source.title,
    filename: source.filename || source.title,
    mimeType: source.mimeType || source.type,
    fileSize: source.fileSize || source.size,
    folderPath: source.folderPath
  }}
  onClick={onDocumentClick}
  variant="listing"
/>
```

**InlineDocumentButton.jsx (line 14-20):**
```jsx
export default function InlineDocumentButton({
  docId,      // ❌ DocumentSources passes 'document.documentId' not 'docId'
  docName,    // ❌ DocumentSources passes 'document.documentName' not 'docName'
  context = 'text',  // ❌ DocumentSources passes 'variant' not 'context'
  onClick,
  className = '',
})
```

### Impact

| Expected Prop | Passed By DocumentSources | Actual Value in InlineDocumentButton |
|---------------|---------------------------|--------------------------------------|
| `docId` | `document.documentId` | `undefined` |
| `docName` | `document.documentName` | `undefined` |
| `context` | `variant="listing"` | `'text'` (default) |

**Result:**
- Button text is empty (renders nothing, since `{docName}` is undefined)
- `onClick?.(docId, docName)` is called with `(undefined, undefined)`
- Styling uses wrong context ('text' instead of 'listing')

---

## Root Cause #2: Missing openUrl in Source Objects

### Evidence

**kodaOrchestratorV3.service.ts:buildSourcesFromChunks() (line 3421-3432):**
```typescript
sources.push({
  documentId: docId,
  documentName: filename,
  filename: filename,
  location: location,
  mimeType: chunk.metadata?.mimeType || chunk.metadata?.fileType,
  relevanceScore: relevanceScore,
  folderPath: chunk.metadata?.folderPath,
  pageNumber: pageNum,
  snippet: chunk.content?.substring(0, 500),
  // ❌ MISSING: openUrl, viewUrl, downloadUrl
});
```

### Impact

- Frontend must derive URL from documentId
- No direct link to preview route
- Inconsistent URL building between components

---

## Root Cause #3: onClick Signature Mismatch

### Evidence

**DocumentSources.jsx (line 133):**
```jsx
onClick={onDocumentClick}
```

**ChatInterface.jsx (line 3385-3392):**
```jsx
onDocumentClick={(doc) => {
  console.log('📂 [SOURCES] User clicked source document:', doc.filename || doc.documentName);
  setPreviewDocument({
    id: doc.documentId || doc.id,
    filename: doc.filename || doc.documentName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize
  });
}}
```

**InlineDocumentButton.jsx (line 21-25):**
```jsx
const handleClick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  onClick?.(docId, docName);  // Passes (undefined, undefined)
};
```

### Impact

- ChatInterface expects `onClick(doc)` where doc is an object
- InlineDocumentButton calls `onClick(docId, docName)` with individual values
- Since both are undefined, the preview modal won't open

---

## Data Flow Verification

### Backend → Controller → Frontend

| Stage | citations[] present | sources[] present | Issue |
|-------|---------------------|-------------------|-------|
| Orchestrator done event | ✅ Yes | ✅ Yes | None |
| Controller SSE output | ✅ Yes | ✅ Yes | None |
| chatService parse | ✅ Yes | ✅ Yes | None |
| msg.ragSources | ✅ Yes | ✅ Yes | None |
| DocumentSources render | ✅ Yes | ✅ Yes | None |
| InlineDocumentButton | ❌ Props undefined | ❌ Props undefined | **BROKEN HERE** |

---

## Fix Requirements

### Fix #1: Update InlineDocumentButton to accept document object

Either:
A) Modify InlineDocumentButton to accept `document` prop and extract fields, OR
B) Modify DocumentSources to pass individual props

**Recommended:** Option A - Update InlineDocumentButton to support both patterns

```jsx
export default function InlineDocumentButton({
  // New prop - document object (from DocumentSources)
  document,
  // Legacy props (direct values)
  docId,
  docName,
  context = 'text',
  variant,  // Alias for context
  onClick,
  className = '',
}) {
  // Resolve from either pattern
  const resolvedId = docId || document?.documentId || document?.id;
  const resolvedName = docName || document?.documentName || document?.filename;
  const resolvedContext = variant || context;

  // ...
}
```

### Fix #2: Add openUrl to source objects

In `buildSourcesFromChunks()`:
```typescript
sources.push({
  // ... existing fields
  openUrl: `/api/documents/${docId}/preview`,  // Or appropriate route
  viewUrl: `/api/documents/${docId}/view`,
  downloadUrl: `/api/documents/${docId}/download`,
});
```

### Fix #3: Align onClick signature

In InlineDocumentButton:
```jsx
const handleClick = (e) => {
  e.preventDefault();
  e.stopPropagation();
  // Call with full document object for compatibility
  onClick?.({
    documentId: resolvedId,
    documentName: resolvedName,
    filename: resolvedName,
    mimeType: document?.mimeType,
    fileSize: document?.fileSize,
  });
};
```

---

## Verification Needed

1. [ ] Run frontend with console logging to confirm props are undefined
2. [ ] Check if any source buttons are rendering document names currently
3. [ ] Test "Open" button click flow end-to-end

---

## Priority

| Fix | Priority | Impact |
|-----|----------|--------|
| #1 InlineDocumentButton props | P0 - CRITICAL | Source panel completely broken |
| #3 onClick signature | P0 - CRITICAL | Preview modal doesn't open |
| #2 openUrl | P1 - HIGH | URL building inconsistent |
