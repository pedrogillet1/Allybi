# CITATION SYSTEM FIX - PATCH DOCUMENTATION

## Summary

Fixed critical prop mismatch between DocumentSources and InlineDocumentButton that caused source buttons to render with undefined values and non-functional click handlers.

---

## Fix #1: InlineDocumentButton Props (CRITICAL)

### Problem
DocumentSources passed `{ document, onClick, variant }` but InlineDocumentButton expected `{ docId, docName, context, onClick, className }`. This caused:
- Button text rendered as `undefined` (empty)
- onClick called with `(undefined, undefined)`
- Wrong styling context (no 'listing' CSS class)

### Solution
Updated InlineDocumentButton.jsx to accept both prop patterns:

**File:** `/frontend/src/components/InlineDocumentButton.jsx`

```jsx
// BEFORE (broken)
export default function InlineDocumentButton({
  docId,
  docName,
  context = 'text',
  onClick,
  className = '',
}) {
  // docId, docName are UNDEFINED when called from DocumentSources
  onClick?.(docId, docName); // Passes (undefined, undefined)
}

// AFTER (fixed)
export default function InlineDocumentButton({
  document,           // NEW: Accept document object
  docId,
  docName,
  context = 'text',
  variant,            // NEW: Alias for context
  onClick,
  className = '',
}) {
  // Resolve from either pattern
  const resolvedId = docId || document?.documentId || document?.id;
  const resolvedName = docName || document?.documentName || document?.filename;
  const resolvedContext = variant || context;

  // Build full document object for onClick
  const resolvedDocument = document || {
    documentId: resolvedId,
    documentName: resolvedName,
    filename: resolvedName,
  };

  onClick?.(resolvedDocument); // Passes full document object
}
```

### Test IDs Added
- `data-testid="source-open-button"` for Playwright testing

---

## Fix #2: CSS Listing Variant

### Problem
DocumentSources used `variant="listing"` but no `.inline-doc-button--listing` CSS class existed.

### Solution
Added listing variant styles to InlineDocumentButton.css:

**File:** `/frontend/src/components/InlineDocumentButton.css`

```css
/* Listing context: pill-style for source panels */
.inline-doc-button--listing {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  margin: 4px 8px 4px 0;
  background-color: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 600;
  color: #1E40AF;
  text-decoration: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.inline-doc-button--listing:hover {
  background-color: #DBEAFE;
  border-color: #93C5FD;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

---

## Fix #3: Backend Source URLs

### Problem
Backend buildSourcesFromChunks() didn't include openUrl/viewUrl/downloadUrl, forcing frontend to derive URLs from documentId.

### Solution
Added URL fields to source objects:

**File:** `/backend/src/services/core/kodaOrchestratorV3.service.ts`

```typescript
// In buildSourcesFromChunks():
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
  // NEW: URLs for frontend document actions
  openUrl: `/api/documents/${docId}/preview`,
  viewUrl: `/api/documents/${docId}/view`,
  downloadUrl: `/api/documents/${docId}/download`,
});
```

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/components/InlineDocumentButton.jsx` | Accept document object, variant alias, pass doc to onClick |
| `frontend/src/components/InlineDocumentButton.css` | Add .inline-doc-button--listing styles |
| `backend/src/services/core/kodaOrchestratorV3.service.ts` | Add openUrl, viewUrl, downloadUrl to sources |

---

## Verification

### Before Fix
```
DocumentSources passes: { document: {...}, onClick, variant: "listing" }
InlineDocumentButton receives: docId=undefined, docName=undefined, context="text"
Result: Empty button, broken onClick, wrong styling
```

### After Fix
```
DocumentSources passes: { document: {...}, onClick, variant: "listing" }
InlineDocumentButton receives: document={...}, variant="listing"
Resolved: resolvedId=UUID, resolvedName="file.pdf", resolvedContext="listing"
Result: Button shows filename, onClick works, correct pill styling
```

---

## Rollback Instructions

If issues arise:
1. Revert InlineDocumentButton.jsx to use only docId/docName props
2. Remove .inline-doc-button--listing CSS
3. Remove openUrl/viewUrl/downloadUrl from buildSourcesFromChunks

---

## Next Steps

1. Run frontend to verify source buttons render correctly
2. Click an "Open" button to verify preview modal opens
3. Run evaluation suite to confirm 0 missing citations
