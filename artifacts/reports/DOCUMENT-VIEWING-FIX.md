# Document Viewing & Processing Fixes

## Issues Discovered

### 1. NOT an Encryption Key Problem ❌
**Initial Hypothesis**: Files were encrypted with an old encryption key.
**Reality**: Testing showed that:
- The current key (`dev-32-char-encryption-key-chg`) CAN successfully decrypt documents
- "Capitulo 8 (Framework Scrum).pdf" (marked as completed) decrypts perfectly
- Many "failed" documents are marked as `isEncrypted: false` and should NOT be decrypted

### 2. REAL Problem: Document Viewing System 🎯
**Root Cause**: The `/api/documents/:id/stream` endpoint was returning signed URLs to ENCRYPTED files in GCS. When the frontend downloaded these files, it received encrypted binary data and tried to render it directly as PDF/DOCX, which obviously failed.

## Fixes Implemented

### ✅ Fix 1: Server-Side Decryption for Viewing
**File**: `backend/src/services/document.service.ts`

**Changed**: `streamDocument` function (lines 1080-1115)
- **Before**: Generated signed URL → Frontend downloads encrypted file → 💥 Cannot view
- **After**: Downloads encrypted file → Decrypts server-side → Returns decrypted buffer → ✅ Frontend can view

```typescript
export const streamDocument = async (documentId: string, userId: string) => {
  // ... validation ...

  // Download file from GCS
  const encryptedBuffer = await downloadFile(document.encryptedFilename);

  // Decrypt if encrypted
  let fileBuffer: Buffer;
  if (document.isEncrypted) {
    fileBuffer = encryptionService.decryptFile(
      encryptedBuffer,
      `document-${document.userId}`
    );
  } else {
    fileBuffer = encryptedBuffer;
  }

  return {
    buffer: fileBuffer,  // Return decrypted buffer, not URL
    filename: document.filename,
    mimeType: document.mimeType,
  };
};
```

### ✅ Fix 2: Updated Controller to Handle Decrypted Buffer
**File**: `backend/src/controllers/document.controller.ts`

**Changed**: `streamDocument` controller (lines 250-280)
- **Before**: Fetched from signed URL → Proxied encrypted data → 💥 Frontend cannot view
- **After**: Receives decrypted buffer → Streams to frontend → ✅ Frontend can view

```typescript
export const streamDocument = async (req: Request, res: Response): Promise<void> => {
  // Get decrypted file buffer from service
  const { buffer, filename, mimeType } = await documentService.streamDocument(id, req.user.id);

  // Set proper headers
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Content-Length', buffer.length.toString());
  // ... more headers ...

  // Stream decrypted buffer
  if (mimeType === 'application/pdf') {
    res.end(buffer, 'binary');
  } else {
    res.send(buffer);
  }
};
```

### ✅ Fix 3: Added Encryption Service Import
**File**: `backend/src/services/document.service.ts` (line 12)

Added missing import:
```typescript
import encryptionService from './encryption.service';
```

### ✅ Fix 4: Background Worker Already Fixed (Previous Session)
**File**: `backend/src/server.ts`

Already fixed in previous work:
- Added `import prisma from './config/database';` (line 11)
- Added encryption check in background worker (lines 296-307)
- Only decrypts if `doc.isEncrypted === true`

## Expected Results

### ✅ Documents Marked as "Completed" Should Now Be Viewable
- **User**: spottedibmecers@gmail.com
- **Document**: "Capitulo 8 (Framework Scrum).pdf"
- **Status**: Completed
- **Expected**: Should now load and display in frontend PDF viewer

### ✅ All Encrypted Documents with Status "Completed"
- Should decrypt server-side
- Should render properly in frontend
- PDFs should load in PDF viewer
- DOCX should convert to markdown/preview

### ✅ Non-Encrypted Documents
- Should pass through without decryption attempt
- Should render properly

## Testing Instructions

1. **Restart Backend Server** (if not already restarted by nodemon):
   ```bash
   # Nodemon should auto-restart, but if not:
   cd backend
   npm run dev
   ```

2. **Test Viewing a Completed PDF**:
   - Log in as spottedibmecers@gmail.com
   - Navigate to "Capitulo 8 (Framework Scrum).pdf"
   - Click to view/preview
   - **Expected**: PDF loads and displays correctly
   - **Before Fix**: "InvalidPDFException: Invalid PDF structure"

3. **Test Viewing a DOCX**:
   - Try viewing any completed DOCX file
   - **Expected**: Renders as markdown or shows preview
   - **Before Fix**: "Failed to load DOCX preview. The document is still being processed."

4. **Check Background Worker Processing**:
   - Upload a new document
   - Should process within 30 seconds (background worker polls every 30s)
   - Should handle both encrypted and non-encrypted files correctly

## Files Changed

1. ✅ `backend/src/services/document.service.ts` - Added server-side decryption
2. ✅ `backend/src/controllers/document.controller.ts` - Updated to handle decrypted buffers
3. ✅ `backend/src/server.ts` - Background worker encryption checks (done previously)

## Remaining Issues (If Any)

### Documents Marked as "Failed" with `isEncrypted: false`
**Examples**:
- "Burnout CDS 2023 Casa do Saber.docx"
- "Education BHRC 2021.pdf"

**Status**: These failed during upload/processing, not due to encryption issues
**Action**: May need separate investigation if viewing them is critical
**Note**: The background worker will now correctly skip decryption for these

## Summary

The core issue was that encrypted documents were being served to the frontend WITHOUT decryption. The fix implements server-side decryption before streaming to the frontend, ensuring users can view their documents properly.

The encryption key was NEVER the problem - the current key works fine. The issue was WHERE the decryption was happening (nowhere vs server-side).

**Status**: ✅ READY FOR TESTING
