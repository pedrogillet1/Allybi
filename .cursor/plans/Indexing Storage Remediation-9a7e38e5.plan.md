<!-- 9a7e38e5-e87e-4d79-afd4-9fc51bf55280 -->
---
todos:
  - id: "p0-strip-blobs"
    content: "Phase 1A: Strip sensitive fields from Pinecone metadata, DocumentEmbedding.metadata JSON, DocumentChunk.metadata JSON, and unitRaw/unitNormalized columns when isEncrypted in vectorEmbedding.service.ts"
    status: pending
  - id: "p0-decrypt-methods"
    content: "Phase 1B: Add decryptChunkMetadataBatch and decryptEmbeddingContentBatch to ChunkCryptoService"
    status: pending
  - id: "p0-wire-retrieval"
    content: "Phase 1C: Wire decryption into prismaRetrievalAdapters (resolveChunkTexts, runEmbeddingBackedChunkSearch, buildTablePayloadFromChunkRow)"
    status: pending
  - id: "nonp0-chunk-ceiling"
    content: "Phase 2A: Apply enforceChunkCeiling to splitTextIntoChunksWithOffsets with offset-aware force-split"
    status: pending
  - id: "nonp0-sectionid"
    content: "Phase 2B: Fix PDF sectionId to not include page; carry-forward heading; add XLSX sectionId"
    status: pending
  - id: "nonp0-row-aggregate"
    content: "Phase 2C: Emit row_aggregate chunks for non-XLSX tables in emitCellFactChunks"
    status: pending
  - id: "nonp0-lock-callers"
    content: "Phase 2D: Wire optimistic lock params into slidesStudio.routes.ts and editOrchestrator.service.ts; add env to .env.example"
    status: pending
  - id: "nonp0-amendment-n1"
    content: "Phase 2E: Replace getAmendmentChain N+1 loop with batch query or CTE"
    status: pending
  - id: "verify"
    content: "Phase 3: Run tsc --noEmit, existing tests, and new encryption round-trip tests"
    status: pending
isProject: false
---

# Indexing & Storage Audit -- Phase 2 Remediation Plan

## Audit Findings Cross-Referenced to Root Causes

### P0-R1: Plaintext leak in JSON metadata blobs (Encryption, -5)

**Root cause:** `vectorEmbedding.service.ts` lines 353-354 and 424-427 spread `c.metadata` (which includes `rowLabel`, `colHeader`, `valueRaw`, `unitRaw`, `unitNormalized`) into:

1. **Pinecone metadata** (line 354: `...(c.metadata || {})`) -- sent to Pinecone in plaintext even when `isEncrypted`.
2. **DocumentEmbedding.metadata** (line 424: `JSON.stringify({...(c.metadata || {})})`) -- stored as a plaintext JSON string in Postgres.
3. **DocumentChunk.metadata** (line 509: `metadata: metadataJson`) -- stored as a plaintext JSON column in Postgres.

Additionally, `unitRaw` and `unitNormalized` (lines 492-493) are always written in plaintext to dedicated columns, even when `isEncrypted` is true.

**Severity:** Critical. Column-level encryption is completely undermined.

**Files:**
- `backend/src/services/retrieval/vectorEmbedding.service.ts` (lines 349-362, 395-434, 437-511)

### P0-R2: Write-only encrypted columns -- no decryption on read (Encryption, -5)

**Root cause:** `ChunkCryptoService` (`chunkCrypto.service.ts`) only decrypts `DocumentChunk.textEncrypted`. It has no methods for:
- `DocumentChunk.metadataEncrypted`
- `DocumentEmbedding.contentEncrypted`
- `DocumentEmbedding.chunkTextEncrypted`

`prismaRetrievalAdapters.service.ts`:
- `resolveChunkTexts` (line 1340) only decrypts `textEncrypted`; skips `metadataEncrypted`.
- `runEmbeddingBackedChunkSearch` (line 955) reads `row.content` and `row.chunkText` which are empty/null when encrypted -- encrypted rows are effectively invisible to search.
- `buildTablePayloadFromChunkRow` (line 1320) reads plaintext `rowLabel`/`colHeader`/`valueRaw` from `ChunkRow` but those are `null` when encrypted; never falls back to decrypting `metadataEncrypted`.

**Severity:** Critical. Encrypted documents lose all table cell metadata and embedding search capability.

**Files:**
- `backend/src/services/retrieval/chunkCrypto.service.ts`
- `backend/src/services/core/retrieval/prismaRetrievalAdapters.service.ts` (lines 1010-1076, 1320-1338, 1340-1385)

### Non-P0-1: enforceChunkCeiling not applied to offset-aware splitter (Chunking, -3)

**Root cause:** `splitTextIntoChunksWithOffsets` (line 192 of `chunking.service.ts`) returns chunks at line 260 without calling `enforceChunkCeiling`. Only `splitTextIntoChunks` (line 180) calls it. PDF, DOCX, and PPTX all use the offset-aware splitter, so they bypass the ceiling.

**Files:**
- `backend/src/services/ingestion/chunking.service.ts` (lines 192-261)

### Non-P0-2: PDF sectionId fragmented per-page; sectionName often undefined; no XLSX sectionId (Metadata, -4)

**Root cause:** 
- PDF: `generateSectionId("pdf", p.page, sectionName, undefined)` -- the `page` number is part of the hash, so a section spanning pages 2-3 gets two different sectionIds.
- PDF: `inferPageHeading` returns `undefined` for pages starting with body text, so `sectionName` is `undefined`.
- XLSX: The XLSX branch in `chunkAssembly.service.ts` never calls `generateSectionId`.

**Files:**
- `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts` (lines 79-92, 211-256, 414-439, 468)

### Non-P0-3: No row_aggregate chunks for non-XLSX tables (Table Indexing, -3)

**Root cause:** `emitCellFactChunks` emits `cell_fact` and `table_summary` chunks but not `row_aggregate`. The XLSX path has its own `bySheetRow` loop that emits `row_aggregate` chunks, but PDF/DOCX/PPTX tables don't get this treatment.

**Files:**
- `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts` (lines 102-188)

### Non-P0-4: Optimistic lock params unused by callers (Versioning, -3)

**Root cause:**
- `storeEditedBuffer` has `expectedDocumentFileHash?: string` as optional. Its only caller (`slidesStudio.routes.ts` line 1256) does not pass it.
- `undoToRevision` has `expectedFileHash?: string` as optional. Its caller (`editOrchestrator.service.ts` line 892) does not pass it.
- `KODA_EDITING_KEEP_UNDO_HISTORY` is not in `.env.example`, making it an undocumented config.

**Files:**
- `backend/src/routes/slidesStudio.routes.ts` (line 1256)
- `backend/src/services/editing/editOrchestrator.service.ts` (line 892)
- `backend/.env.example`

### Non-P0-5: getAmendmentChain N+1 queries; attachment type unused (Cross-doc, -2)

**Root cause:**
- `getAmendmentChain` (line 179 of `documentLink.service.ts`) does one `findMany` per depth level -- classic N+1.
- `attachment` relationship type is defined at line 10 but no code path ever creates a link with `relationshipType: "attachment"`.

**Files:**
- `backend/src/services/documents/documentLink.service.ts` (lines 179-206)

---

## Implementation Phases

### Phase 1: P0 -- Fix encryption leaks + add decryption paths (HIGH risk, HIGH impact)

**Constraints:** Must not break existing unencrypted mode. All changes behind `isEncrypted` / `encryptionMode` guards.

#### Task 1A: Strip sensitive fields from JSON blobs when encrypted

In `vectorEmbedding.service.ts`:

- **Pinecone metadata** (line 353-354): When `isEncrypted`, strip `rowLabel`, `colHeader`, `valueRaw`, `unitRaw`, `unitNormalized` from `c.metadata` before spreading.
- **DocumentEmbedding.metadata** (line 424): When `isEncrypted`, strip the same fields from the JSON string.
- **DocumentChunk.metadata** (line 509): When `isEncrypted`, set `metadata: null` instead of the full `metadataJson`, or strip sensitive keys.
- **unitRaw / unitNormalized columns** (lines 492-493): Null them out when `isEncrypted`, and include them in `metadataEncrypted`.

#### Task 1B: Add decryption methods to ChunkCryptoService

In `chunkCrypto.service.ts`, add:

- `decryptChunkMetadataBatch(userId, documentId, chunkIds)` -- fetches `metadataEncrypted` from `DocumentChunk`, decrypts, returns `Map<chunkId, {rowLabel, colHeader, valueRaw, unitRaw, unitNormalized}>`.
- `decryptEmbeddingContentBatch(userId, documentId, chunkIds)` -- fetches `contentEncrypted` and `chunkTextEncrypted` from `DocumentEmbedding`, decrypts, returns `Map<chunkId, {content, chunkText}>`.

#### Task 1C: Wire decryption into retrieval adapters

In `prismaRetrievalAdapters.service.ts`:

- **resolveChunkTexts**: After decrypting `textEncrypted`, also collect chunk IDs with `metadataEncrypted` and call `decryptChunkMetadataBatch`. Merge decrypted metadata into `ChunkRow` before `buildTablePayloadFromChunkRow`.
- **runEmbeddingBackedChunkSearch**: After fetching `DocumentEmbedding` rows where `content` is empty, fall back to decrypting `contentEncrypted`/`chunkTextEncrypted` via `decryptEmbeddingContentBatch` to produce snippets.

**Rollback:** Revert file changes; encrypted columns remain write-only (current state). No data loss.

**Validation tests:**
- Unit test: encrypt a chunk record with sensitive metadata, verify JSON blob has no plaintext fields.
- Unit test: encrypt + decrypt round-trip for `metadataEncrypted` and `contentEncrypted`.
- Integration test: ingestion pipeline with `INDEXING_ENCRYPTED_CHUNKS_ONLY=true`, verify retrieval returns decrypted snippets and table metadata.

### Phase 2: Non-P0 improvements (MEDIUM risk, MEDIUM impact)

#### Task 2A: Apply enforceChunkCeiling to offset-aware splitter

In `chunking.service.ts`, add ceiling enforcement to `splitTextIntoChunksWithOffsets` (line 260). Must preserve `startChar`/`endChar` accuracy -- force-split oversized chunks while adjusting offsets.

**Validation:** Existing `chunking.service.test.ts` plus new test: a 10,000-char page with no natural boundaries produces no chunk exceeding `2 * targetChars`.

#### Task 2B: Fix PDF sectionId fragmentation + add XLSX sectionId

In `chunkAssembly.service.ts`:
- **PDF**: Remove `p.page` from `generateSectionId` call; instead use `sectionName` + `sectionPath` only. If `sectionName` is undefined, carry forward the last non-undefined heading from prior pages.
- **XLSX**: Call `generateSectionId("xlsx", sheetIdx + 1, sheetName, undefined)` for each sheet and assign to all chunks from that sheet.

**Validation:** Test that a 3-page PDF section produces one sectionId; test that XLSX chunks include sectionId.

#### Task 2C: Emit row_aggregate chunks for non-XLSX tables

In `emitCellFactChunks`, after emitting cell_facts for each table, group cells by `rowIndex` and emit a `row_aggregate` chunk per data row, matching the XLSX pattern: `tableChunkForm: "row_aggregate"`, `rowLabel`, and concatenated cell values.

**Validation:** Test that a PDF table with 3 rows emits 3 `row_aggregate` chunks.

#### Task 2D: Wire optimistic lock params into callers

- `slidesStudio.routes.ts` line 1256: Read `doc.fileHash` from the fetched document and pass as `expectedDocumentFileHash`.
- `editOrchestrator.service.ts` line 892: Pass `doc.fileHash` as `expectedFileHash`.
- Add `KODA_EDITING_KEEP_UNDO_HISTORY=true` to `.env.example`.

**Validation:** Existing `documentRevisionStore.overwrite.test.ts` already tests the lock logic; add assertion that callers pass the hash.

#### Task 2E: Fix getAmendmentChain N+1

Replace the loop-per-depth approach with a single recursive CTE query or a batch-prefetch of all "amends" links for the document family, then walk in-memory.

**Validation:** Test that a chain of depth 5 produces at most 2 DB queries.

### Phase 3: Test + type-check

- Run `tsc --noEmit` to verify no new type errors.
- Run the 5 existing invariant tests.
- Run `chunking.service.test.ts`, `chunkAssembly.service.test.ts`, `documentRevisionStore.overwrite.test.ts`, `revision.service.test.ts`.

---

## Effort Estimates

- Phase 1 (P0 encryption): ~3-4 hours
- Phase 2A (chunking ceiling): ~30 min
- Phase 2B (sectionId fix): ~1 hour
- Phase 2C (row_aggregate parity): ~45 min
- Phase 2D (optimistic lock callers): ~30 min
- Phase 2E (N+1 fix): ~30 min
- Phase 3 (test + verify): ~1 hour

**Total: ~7-8 hours**

## Acceptance Criteria

- No plaintext `rowLabel`/`colHeader`/`valueRaw`/`unitRaw`/`unitNormalized` in any Postgres JSON blob or Pinecone metadata when `INDEXING_ENCRYPTED_CHUNKS_ONLY=true`.
- Encrypted documents return decrypted snippets and table metadata through all 3 search paths (Pinecone semantic, DB embedding-backed, DB chunk-backed).
- No chunk in PDF/DOCX/PPTX exceeds `2 * targetChars`.
- PDF sections spanning multiple pages get a single sectionId. XLSX chunks have sectionId.
- Non-XLSX tables emit `row_aggregate` chunks.
- All optimistic lock callers pass the current file hash.
- `getAmendmentChain` uses at most O(1) queries (batch or CTE).
- `tsc --noEmit` passes with no new errors. All existing + new tests pass.
