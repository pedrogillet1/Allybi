# PHASE 0.3: UI Attachment Rendering Contract Verification

**Generated**: 2026-01-19

---

## ✅ Backend → Frontend Contract

### Done Event Fields (rag.controller.ts:535-577)

| Field | Type | Purpose |
|-------|------|---------|
| `attachments` | `Array<{id, name, mimeType}>` | File attachment objects |
| `actions` | `Array<{type, label, payload}>` | File operation actions |
| `referencedFileIds` | `string[]` | Referenced document IDs |
| `sourceButtons` | `SourceButtonsAttachment` | ChatGPT-like source pills |
| `fileList` | `FileListAttachment` | Full file list for inventory |
| `attachmentsTypes` | `string[]` | Types of attachments emitted |

---

## ✅ TypeScript Contract (streaming.types.ts)

```typescript
/** File attachments for deterministic button rendering */
attachments?: Array<{
  id: string;
  name: string;
  mimeType: string;
}>;

/** Structured actions for file operations */
actions?: Array<{
  type: string;
  label: string;
  payload: any;
}>;

sourceButtons?: SourceButtonsAttachment;
fileList?: FileListAttachment;
```

---

## ✅ Frontend Rendering (ChatInterface.jsx)

### SourceButtons Rendering (lines 3464-3584)

```jsx
{msg.sourceButtons && msg.sourceButtons.buttons && msg.sourceButtons.buttons.length > 0 && (
  <div className="source-buttons-container">
    {msg.sourceButtons.buttons.map((btn, idx) => (
      // Render clickable source pill
    ))}
    {msg.sourceButtons.seeAll && (
      // "See all" link for overflow
    )}
  </div>
)}
```

### Fallback Rendering (lines 3585-3601)

```jsx
{/* Legacy Document Sources - Fallback when sourceButtons not available */}
{!msg.sourceButtons && msg.ragSources && msg.ragSources.length > 0 && (
  <DocumentSources sources={msg.ragSources} />
)}

{/* Attachments fallback when sourceButtons not present */}
{msg.attachments && msg.attachments.length > 0 && !msg.sourceButtons && (
  // Render attachment buttons
)}
```

---

## ✅ Contract Verification Matrix

| Backend Field | Frontend Field | Rendering | Status |
|---------------|----------------|-----------|--------|
| `sourceButtons` | `msg.sourceButtons` | Line 3464 | ✅ |
| `sourceButtons.buttons[]` | `msg.sourceButtons.buttons` | Line 3475 map() | ✅ |
| `sourceButtons.seeAll` | `msg.sourceButtons.seeAll` | Line 3551 | ✅ |
| `attachments[]` | `msg.attachments` | Line 3601 | ✅ |
| `fileList` | `msg.fileList` | Line 2560 | ✅ |
| `actions[]` | `msg.actions` | Line 1466, 2524 | ✅ |

---

## ✅ Null Safety Checks

Frontend properly guards against nulls:

| Check | Location |
|-------|----------|
| `msg.sourceButtons?.buttons?.length > 0` | Line 3031 |
| `msg.sourceButtons && msg.sourceButtons.buttons && msg.sourceButtons.buttons.length > 0` | Line 3464 |
| `!msg.sourceButtons && msg.ragSources` | Line 3585 |
| `msg.attachments && msg.attachments.length > 0 && !msg.sourceButtons` | Line 3601 |

---

## ✅ Dev Assertions (ChatInterface.jsx)

Lines 1042-1043 include dev assertion for empty sourceButtons:

```jsx
if (assistantMessageWithMetadata.sourceButtons && sourceButtons === 0) {
  console.warn('🚨 [DEV ASSERTION] sourceButtons exists but has no buttons!');
}
```

---

## PHASE 0.3 VERDICT

| Check | Status |
|-------|--------|
| Backend contract defined | ✅ streaming.types.ts |
| Controller sends all fields | ✅ Lines 554-574 |
| Frontend renders sourceButtons | ✅ Lines 3464-3584 |
| Fallback rendering works | ✅ Lines 3585-3601 |
| Null safety guards | ✅ All fields guarded |
| Dev assertions | ✅ Empty array detection |

**Overall**: ✅ PASS

UI attachment rendering contract is fully implemented and verified.
