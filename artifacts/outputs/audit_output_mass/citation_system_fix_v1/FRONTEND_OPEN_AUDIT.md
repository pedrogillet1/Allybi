# FRONTEND OPEN BUTTON AUDIT

## Summary

The "Open" button click flow has been audited and fixed. After applying the InlineDocumentButton prop fix, the complete click-to-preview flow is verified functional.

---

## Click Flow Trace

### 1. User clicks source button
```
InlineDocumentButton (source-open-button)
    ↓ handleClick()
    ↓ onClick?.(resolvedDocument)
```

### 2. DocumentSources passes to ChatInterface
```jsx
// DocumentSources.jsx:133
onClick={onDocumentClick}

// ChatInterface.jsx:3385-3392
onDocumentClick={(doc) => {
    console.log('📂 [SOURCES] User clicked source document:', doc.filename || doc.documentName);
    setPreviewDocument({
        id: doc.id || doc.documentId,  // ✅ doc.documentId now available
        filename: doc.filename || doc.documentName,  // ✅ Both fields available
        mimeType: doc.mimeType,
        fileSize: doc.fileSize
    });
}}
```

### 3. DocumentPreviewModal opens
```jsx
// ChatInterface.jsx:4681-4712
<DocumentPreviewModal
    isOpen={!!previewDocument}  // ✅ Truthy when setPreviewDocument called
    document={previewDocument}
    onClose={(documentToAttach) => {
        setPreviewDocument(null);
        ...
    }}
/>
```

### 4. Preview loads document
```jsx
// DocumentPreviewModal.jsx:121-174
const loadPreview = async () => {
    // Uses document.id to fetch:
    // - /api/documents/${document.id}/preview
    // - /api/documents/${document.id}/preview-pdf
    // - /api/documents/${document.id}/stream
};
```

---

## Before/After Comparison

### BEFORE (Broken)
```
InlineDocumentButton receives:
  - docId = undefined
  - docName = undefined
  - context = 'text' (wrong)

onClick called with:
  onClick(undefined, undefined)

ChatInterface receives:
  doc = undefined (first arg) or doc.documentId = undefined

setPreviewDocument:
  { id: undefined, filename: undefined, ... }

Result: ❌ Modal opens but can't load document (no id)
```

### AFTER (Fixed)
```
InlineDocumentButton receives:
  - document = { documentId: "uuid", documentName: "file.pdf", ... }
  - variant = "listing"

onClick called with:
  onClick({ documentId: "uuid", documentName: "file.pdf", ... })

ChatInterface receives:
  doc = { documentId: "uuid", documentName: "file.pdf", ... }

setPreviewDocument:
  { id: "uuid", filename: "file.pdf", mimeType: "application/pdf", ... }

Result: ✅ Modal opens and loads document correctly
```

---

## Test IDs for E2E Testing

| Component | Test ID | Purpose |
|-----------|---------|---------|
| Source button | `source-open-button` | Click to open preview |
| Sources container | `assistant-citations` | Verify citations panel exists |

### Playwright Test Example
```typescript
// Test source button clickability
await expect(page.getByTestId('assistant-citations')).toBeVisible();
const firstSourceButton = page.getByTestId('source-open-button').first();
await expect(firstSourceButton).toBeVisible();
await expect(firstSourceButton).toHaveText(/.+/); // Has document name

// Click and verify modal opens
await firstSourceButton.click();
await expect(page.locator('.document-preview-modal')).toBeVisible();
```

---

## Verification Steps

1. **Visual Check**: Source buttons display document names (not empty)
2. **Click Test**: Clicking button opens DocumentPreviewModal
3. **Preview Load**: Document content loads in modal
4. **Close Test**: Clicking X closes modal and returns to chat

---

## Files Verified

| File | Status | Notes |
|------|--------|-------|
| `InlineDocumentButton.jsx` | ✅ Fixed | Accepts document object, passes full doc to onClick |
| `InlineDocumentButton.css` | ✅ Fixed | Added .inline-doc-button--listing styles |
| `DocumentSources.jsx` | ✅ OK | Passes document object (no changes needed) |
| `ChatInterface.jsx` | ✅ OK | onClick handler uses doc.documentId fallback |
| `DocumentPreviewModal.jsx` | ✅ OK | Uses document.id for API calls |

---

## Open Button State: FUNCTIONAL

After applying the fixes in CITATION_PATCH.md:
- [x] Button displays document name
- [x] Button is clickable
- [x] Click triggers correct handler
- [x] Preview modal opens
- [x] Document loads in preview
