# KODA Fixes - Rollback Procedure

## Overview

This document provides rollback instructions for the KODA fixes implemented on December 4, 2024.

## Backup Location

All original files are backed up in:
```
C:\Users\pedro\OneDrive\Área de Trabalho\web\koda-webapp\backend\src_backup_20241204\
```

## Files Modified

### Phase 1: Critical Fixes

1. **rag.service.ts** (lines 8047-8223)
   - Added debug logging and validation to `generateAnswer` function
   - Rollback: Copy from `src_backup_20241204/rag.service.ts`

2. **responseValidation.service.ts** (NEW FILE)
   - New validation service
   - Rollback: Delete file `src/services/responseValidation.service.ts`

3. **rag.controller.ts** (multiple locations)
   - Added import for responseValidation service
   - Added validation before saving messages
   - Rollback: Copy from `src_backup_20241204/rag.controller.ts`

### Phase 2: High Priority Improvements

4. **unifiedIntent.service.ts** (NEW FILE)
   - Consolidated intent detection
   - Rollback: Delete file `src/services/unifiedIntent.service.ts`

5. **prisma/schema.prisma**
   - Added DocumentChunk model for BM25
   - Rollback: Remove the DocumentChunk model and `chunks` relation from Document

6. **bm25-retrieval.service.ts** (line 165)
   - Fixed `document_metadata` to `metadata`
   - Rollback: Change `metadata` back to `document_metadata`

7. **BM25 Setup Scripts** (NEW FILES)
   - `src/scripts/setup-bm25.ts`
   - `src/scripts/populate-bm25-chunks.ts`
   - Rollback: Delete both files

## Quick Rollback Commands

### Full Rollback (All Changes)

```bash
cd C:\Users\pedro\OneDrive\Área de Trabalho\web\koda-webapp\backend

# Restore rag.service.ts
cp src_backup_20241204/rag.service.ts src/services/rag.service.ts

# Restore rag.controller.ts
cp src_backup_20241204/rag.controller.ts src/controllers/rag.controller.ts

# Remove new files
rm src/services/responseValidation.service.ts
rm src/services/unifiedIntent.service.ts
rm src/scripts/setup-bm25.ts
rm src/scripts/populate-bm25-chunks.ts

# Restart backend
npm run dev
```

### Partial Rollback (Keep Working Features)

If you want to keep some fixes but rollback others:

#### Rollback Only Response Validation
```bash
# Remove validation import from rag.controller.ts (line 23)
# Remove validation logic (lines 1185-1239 for non-streaming)
# Remove validation logic (lines 2465-2569 for streaming)
rm src/services/responseValidation.service.ts
```

#### Rollback Only generateAnswer Debug Logging
```bash
# Replace generateAnswer function in rag.service.ts with backup version
# Lines 8047-8223
```

#### Rollback BM25 Schema Change
```bash
# Remove DocumentChunk model from prisma/schema.prisma
# Remove "chunks DocumentChunk[]" line from Document model
npx prisma generate
```

## Verification After Rollback

1. **Check TypeScript Compilation**
   ```bash
   npx tsc --noEmit --skipLibCheck
   ```

2. **Restart Backend**
   ```bash
   npm run dev
   ```

3. **Test Query Endpoint**
   ```bash
   curl -X POST http://localhost:5000/api/rag/query-streaming \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"query": "test query", "conversationId": "test-id"}'
   ```

## Contact

If you encounter issues during rollback, check the logs for specific errors:
```bash
tail -f logs/backend.log
```

## Notes

- The BM25 schema change requires `npx prisma db push` to apply
- If you've already run the migration, you may need to drop the `document_chunks` table
- Always test in a development environment before production rollback
