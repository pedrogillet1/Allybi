# Frontend Parity Checklist

Comprehensive checklist for ChatGPT-like parity across all surfaces.

## Chat UI Parity

### Streaming Behavior
- [ ] Streaming appears chunk-by-chunk smoothly (no duplicated chunks)
- [ ] "Stop generating" stops instantly and doesn't save partial text as final
- [ ] No {{DOC:: or [[DOC_ markers flash during streaming
- [ ] Cursor/indicator appears during streaming, disappears when done

### Message Spacing
- [ ] Koda→Koda messages: 12px gap
- [ ] User→Koda messages: 24px gap
- [ ] Consistent spacing regardless of message content type

### Markdown Rendering
- [ ] Code blocks render with syntax highlighting
- [ ] Raw HTML tags do NOT render (XSS prevention)
- [ ] Tables render correctly, scrollable on mobile
- [ ] Bullet lists render as proper `<ul><li>`
- [ ] Numbered lists render as proper `<ol><li>`
- [ ] Headings have proper hierarchy and spacing
- [ ] No raw markdown visible (no `**bold**` or `# heading`)

### Typography
- [ ] Single font size (15.5px) for all answer text
- [ ] Consistent font family (Plus Jakarta Sans)
- [ ] Line height: 1.6 for body text

---

## Sources Parity

### Source Pills
- [ ] "Sources:" label followed by clickable pills
- [ ] Pills appear AFTER the answer, never inline
- [ ] Max 5 pills for document answers
- [ ] Max 10 pills only for file_action responses
- [ ] Pills are uniform height and padding
- [ ] Pills show file icon + truncated filename
- [ ] "See all (+N)" pill when more sources exist

### Source Pill Layout
- [ ] Pills do not wrap into giant tall rows on mobile
- [ ] Horizontal scroll if needed on narrow screens
- [ ] No duplicate pills (dedupe by documentId)
- [ ] No duplicate pills (dedupe by normalized title)

### Source Pill Clicks
- [ ] Clicking pill opens DocumentPreviewModal
- [ ] Preview loads correctly for PDF, DOCX, images
- [ ] documentId is passed correctly (check console logs)

---

## Document Preview Modal

### Loading States
- [ ] "Loading preview..." shown while fetching
- [ ] Preview renders for: PDF, DOCX, images, video, audio
- [ ] "Preview not available" only for truly unsupported types
- [ ] Cached previews load instantly (<50ms)

### PDF Preview
- [ ] All pages render (scroll through document)
- [ ] Page numbers shown correctly
- [ ] Zoom controls work
- [ ] Text layer is selectable

### DOCX Preview
- [ ] Converts to PDF for preview
- [ ] Timeout after 60s if conversion fails
- [ ] Falls back gracefully on error

### Preview Actions
- [ ] Download button works
- [ ] Close button (X) works
- [ ] Escape key closes modal
- [ ] Click outside closes modal (if enabled)

---

## Documents Page (/documents)

### Document List
- [ ] Documents load with correct sorting
- [ ] Filtering by type works (PDF, DOCX, XLSX, etc.)
- [ ] Search/filter by filename works
- [ ] Pagination or infinite scroll works

### Document Actions
- [ ] Preview opens from file list
- [ ] Download works from file list
- [ ] Delete works (with confirmation)
- [ ] Folder navigation works

### Upload
- [ ] Drag-and-drop upload works
- [ ] Click-to-upload works
- [ ] Progress indicator shown during upload
- [ ] New document appears in list after upload
- [ ] Supported file types: PDF, DOCX, XLSX, PPTX, TXT, images

---

## Chat Upload (Inline)

### Upload from Chat
- [ ] Attachment icon visible in chat input
- [ ] File picker opens on click
- [ ] Selected file shows as attachment chip
- [ ] Attachment chip has remove (X) button
- [ ] Message sends with attachment

### Attachment Display
- [ ] Attached files visible in user message bubble
- [ ] File icon shown for each attachment
- [ ] Click opens preview (same as source pills)

---

## Account Page (/account)

### Settings
- [ ] Profile settings load correctly
- [ ] Language preference persists
- [ ] Theme preference (if applicable) persists
- [ ] Settings changes don't break auth token

### Auth
- [ ] Logout clears cached conversation data
- [ ] Logout clears encryption password (if applicable)
- [ ] Re-login restores session correctly
- [ ] Socket reconnection works after settings change

---

## Mobile Parity

### Responsive Layout
- [ ] Chat works on 375px width (iPhone SE)
- [ ] Chat works on 390px width (iPhone 14)
- [ ] Pills use horizontal scroll, not wrap
- [ ] Modal fits screen without overflow
- [ ] Touch interactions work (tap, swipe)

### Mobile-Specific
- [ ] Virtual keyboard doesn't break layout
- [ ] Input stays visible when keyboard open
- [ ] No horizontal scroll on main container

---

## Error Handling

### Network Errors
- [ ] Timeout shows user-friendly message
- [ ] Network disconnect shows reconnection status
- [ ] Failed message shows retry option

### API Errors
- [ ] 401 redirects to login
- [ ] 404 shows "not found" appropriately
- [ ] 500 shows generic error, not stack trace

---

## Performance

### Load Times
- [ ] Initial page load < 3s
- [ ] Chat response starts streaming < 2s
- [ ] Document preview loads < 5s (first time)
- [ ] Cached preview loads < 100ms

### Memory
- [ ] No memory leak on long conversations
- [ ] Blob URLs revoked on modal close
- [ ] Old messages don't cause performance degradation

---

## Automated Test Coverage

| Area | Test File | Status |
|------|-----------|--------|
| DOM Structure | chatgpt-parity-rendering.spec.ts | ✅ |
| Computed Styles | chatgpt-parity-rendering.spec.ts | ✅ |
| Streaming | chatgpt-parity-rendering.spec.ts | ✅ |
| Button-Only | chatgpt-parity-rendering.spec.ts | ✅ |
| Golden Snapshots | chatgpt-parity-rendering.spec.ts | ✅ |
| Display Parity | frontend-display-parity.spec.ts | ✅ |
| Sources Row | **TODO** | ❌ |
| Preview Modal | **TODO** | ❌ |
| Documents Page | **TODO** | ❌ |
| Account Page | **TODO** | ❌ |
| Mobile Parity | **TODO** | ❌ |

---

## Manual QA Script

Run these in order for full coverage:

1. **Fresh Login**: Clear cookies, login, verify session
2. **Upload Test**: Upload each file type (PDF, DOCX, XLSX)
3. **Chat Test**: Run 10 queries from file-specific-grounding-queries.json
4. **Source Pills**: Click 3 different source pills, verify preview opens
5. **Documents Page**: Navigate, filter, search, preview from list
6. **Mobile Test**: Resize to 375px, repeat steps 3-5
7. **Logout Test**: Logout, verify data cleared, re-login
