# Phase 3: Encryption & Storage — Indexing & Storage A+ Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all plaintext leaks — DocumentEmbedding is gone (Phase 1), now fix Pinecone content, DocumentChunk metadata columns, Document.rawText/previewText, key management race conditions, and GCS encryption.

**Architecture:** (1) Fix key generation race, (2) strip Pinecone content → store hash only, (3) encrypt sensitive DocumentChunk metadata columns, (4) null plaintext residue fields, (5) fix singleton/cache issues, (6) update retrieval to work without plaintext.

**Tech Stack:** TypeScript, AES-256-GCM, Prisma, Pinecone SDK, Jest

**Depends on:** Phase 1 (DocumentEmbedding merged into DocumentChunk) and Phase 2 (metadata type changes).

---

### Task 1: Fix DocumentKey TOCTOU Race Condition

**Files:**
- Modify: `backend/src/services/documents/documentKey.service.ts:34-47`
- Test: `backend/src/services/documents/documentKey.service.test.ts` (create if missing)

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, jest } from "@jest/globals";

describe("DocumentKeyService", () => {
  test("concurrent getDocumentKey calls produce the same key", async () => {
    // Mock prisma to simulate race: first findUnique returns no key,
    // both calls try to generate
    const mockPrisma = {
      document: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: "doc1", userId: "user1", dataKeyEncrypted: null, dataKeyMeta: null })
          .mockResolvedValueOnce({ id: "doc1", userId: "user1", dataKeyEncrypted: null, dataKeyMeta: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    };
    // Both calls should use updateMany with conditional where, not unconditional update
    // The second call should re-fetch and find the key already set
  });
});
```

**Step 2: Run test, verify failure**

**Step 3: Fix — use conditional `updateMany` like TenantKeyService**

In `documentKey.service.ts`, replace the unconditional `update` (line 40-44) with:

```typescript
async getDocumentKey(userId: string, documentId: string): Promise<Buffer> {
  const doc = await this.prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, userId: true, dataKeyEncrypted: true, dataKeyMeta: true },
  });

  if (!doc) throw new Error(`Document not found: ${documentId}`);
  if (doc.userId !== userId) throw new Error("User mismatch");

  // If key exists, unwrap and return
  if (doc.dataKeyEncrypted) {
    const tk = await this.tenantKeys.getOrCreateTenantKey(userId);
    return this.envelopes.unwrapRecordKey(doc.dataKeyEncrypted, tk, `wrap:document:${documentId}`);
  }

  // Generate new key
  const dk = this.enc.randomKey32();
  const tk = await this.tenantKeys.getOrCreateTenantKey(userId);
  const wrapped = this.envelopes.wrapRecordKey(dk, tk, `wrap:document:${documentId}`);

  // Conditional update: only set if still null (CAS)
  const result = await this.prisma.document.updateMany({
    where: { id: documentId, dataKeyEncrypted: null },
    data: { dataKeyEncrypted: wrapped, dataKeyMeta: { v: 1 } },
  });

  if (result.count === 0) {
    // Another request already set the key — re-fetch and unwrap that one
    const refreshed = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { dataKeyEncrypted: true },
    });
    if (!refreshed?.dataKeyEncrypted) {
      throw new Error(`Failed to generate or retrieve key for document ${documentId}`);
    }
    return this.envelopes.unwrapRecordKey(refreshed.dataKeyEncrypted, tk, `wrap:document:${documentId}`);
  }

  return dk;
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "fix: document key generation TOCTOU race — use conditional updateMany CAS"
```

---

### Task 2: Strip Plaintext Content from Pinecone — Store SHA-256 Hash Only

**Files:**
- Modify: `backend/src/services/retrieval/pinecone.service.ts:196-248` (upsertDocumentEmbeddings)
- Modify: `backend/src/services/retrieval/vectorEmbedding.service.ts:350-358` (pineconeChunks)
- Test: `backend/src/services/retrieval/pinecone.service.test.ts`

**Step 1: Write failing test**

```typescript
test("upsert does NOT include plaintext content in Pinecone metadata", async () => {
  const chunks = [{ chunkIndex: 0, content: "sensitive text", embedding: validEmbedding, metadata: {} }];
  await pineconeService.upsertDocumentEmbeddings("doc1", "user1", docMeta, chunks);

  const upsertCall = mockIndex.upsert.mock.calls[0][0];
  for (const vector of upsertCall) {
    // Should have contentHash, NOT content
    expect(vector.metadata.content).toBeUndefined();
    expect(vector.metadata.contentHash).toBeDefined();
    expect(vector.metadata.contentHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256
  }
});
```

**Step 2: Run test, verify failure (content is still sent as plaintext)**

**Step 3: Implement — replace content with contentHash**

In `pinecone.service.ts`, `upsertDocumentEmbeddings` method (around line 205):

```typescript
import { createHash } from "crypto";

// Replace:
//   const content = (c.content || "").slice(0, 5000);
// With:
const contentHash = createHash("sha256")
  .update(c.content || "")
  .digest("hex");
```

In the metadata object, replace `content` with `contentHash`:

```typescript
const meta = this.sanitizeMetadata({
  // scoping
  userId,
  documentId,
  // doc metadata (keep as-is)
  filename: document.filename,
  // ...
  // chunk metadata — hash only, no plaintext
  chunkIndex: c.chunkIndex,
  contentHash,                  // SHA-256 hash, NOT plaintext
  contentLength: (c.content || "").length,
  // ...
});
```

Also update `vectorEmbedding.service.ts` — the `pineconeChunks` mapping (lines 350-358) should NOT include `content`:

```typescript
const pineconeChunks = usableChunks.map((c) => ({
  chunkIndex: c.chunkIndex,
  content: c.content,           // Still needed for hash computation in pinecone.service
  embedding: c.embedding || [],
  metadata: {
    ...(c.metadata || {}),
    ...sharedIndexingMetadata,
  },
}));
```

The content is passed to `upsertDocumentEmbeddings` for hash computation but is NOT stored in Pinecone metadata.

**Step 4: Update retrieval to hydrate from Postgres instead of Pinecone content**

In `prismaRetrievalAdapters.service.ts`, the Pinecone search path (around line 1208-1210):

```typescript
// Before:
// const snippet = toSnippet(hit.content || String(md.content || "") || hydrated?.text || "");

// After: Always hydrate from DB (hit.content is no longer available)
const snippet = toSnippet(hydrated?.text || "");
```

This requires the `hydration` step (fetching chunk text from Postgres + decrypting) to always run for Pinecone results. It already does — see `resolveChunkTexts`.

**Step 5: Run tests, verify pass**

**Step 6: Commit**

```bash
git commit -m "fix: strip plaintext from Pinecone metadata, store contentHash only"
```

---

### Task 3: Encrypt Sensitive DocumentChunk Metadata Columns

**Files:**
- Create: `backend/prisma/migrations/20260305100000_add_chunk_metadata_encryption/migration.sql`
- Modify: `backend/prisma/schema.prisma` (DocumentChunk — add encrypted columns)
- Modify: `backend/src/services/retrieval/vectorEmbedding.service.ts:407-454` (chunk record creation)
- Modify: `backend/src/services/documents/documentCrypto.service.ts` (add chunk metadata encryption)

**Step 1: Migration — add encrypted counterpart columns**

```sql
ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "value_raw_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "row_label_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "col_header_encrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata_encrypted" TEXT;
```

**Step 2: Update schema.prisma DocumentChunk model — add encrypted fields**

```prisma
valueRawEncrypted   String? @map("value_raw_encrypted")
rowLabelEncrypted   String? @map("row_label_encrypted")
colHeaderEncrypted  String? @map("col_header_encrypted")
metadataEncrypted   String? @map("metadata_encrypted")
```

**Step 3: Update `documentCrypto.service.ts` — add `encryptChunkMetadata` method**

```typescript
encryptChunkMetadata(
  userId: string,
  documentId: string,
  chunkId: string,
  field: string,
  value: string,
  dk: Buffer,
): string {
  const key = this.keyFor(dk, "chunkMeta");
  return this.enc.encryptStringToJson(
    value,
    key,
    `doc:${userId}:${documentId}:chunk:${chunkId}:${field}`,
  );
}
```

**Step 4: Update vectorEmbedding.service.ts chunk record creation**

In the `chunkRecords` mapping (lines 407-454), when `encryptionMode === "encrypted_only"`:

```typescript
valueRaw: encryptionMode === "encrypted_only" ? null : metadata.valueRaw || null,
valueRawEncrypted: encryptionMode === "encrypted_only" && metadata.valueRaw
  ? chunkEncryptors!.docCrypto.encryptChunkMetadata(
      document.userId, documentId, id, "valueRaw", metadata.valueRaw, documentKey!)
  : null,
rowLabel: encryptionMode === "encrypted_only" ? null : metadata.rowLabel || null,
rowLabelEncrypted: encryptionMode === "encrypted_only" && metadata.rowLabel
  ? chunkEncryptors!.docCrypto.encryptChunkMetadata(
      document.userId, documentId, id, "rowLabel", metadata.rowLabel, documentKey!)
  : null,
colHeader: encryptionMode === "encrypted_only" ? null : metadata.colHeader || null,
colHeaderEncrypted: encryptionMode === "encrypted_only" && metadata.colHeader
  ? chunkEncryptors!.docCrypto.encryptChunkMetadata(
      document.userId, documentId, id, "colHeader", metadata.colHeader, documentKey!)
  : null,
metadata: encryptionMode === "encrypted_only" ? null : metadataJson,
metadataEncrypted: encryptionMode === "encrypted_only"
  ? chunkEncryptors!.docCrypto.encryptChunkMetadata(
      document.userId, documentId, id, "metadata", JSON.stringify(metadata || {}), documentKey!)
  : null,
```

**Note:** `numericValue`, `unitRaw`, `unitNormalized`, `sectionName`, `sheetName`, `tableChunkForm`, `tableId`, `rowIndex`, `columnIndex` remain plaintext. These are structural/numeric fields needed for query filtering and don't contain document content. The sensitive content fields (`valueRaw`, `rowLabel`, `colHeader`, `metadata` JSON) are the ones encrypted.

**Step 5: Update chunkCrypto.service.ts — add metadata decryption**

```typescript
async decryptChunkMetadata(
  userId: string,
  documentId: string,
  chunkId: string,
  field: string,
  encrypted: string,
): Promise<string> {
  const dk = await this.docKeys.getDocumentKey(userId, documentId);
  const key = this.docCrypto.keyFor(dk, "chunkMeta");
  return this.enc.decryptStringFromJson(
    encrypted,
    key,
    `doc:${userId}:${documentId}:chunk:${chunkId}:${field}`,
  );
}
```

**Step 6: Run tests, verify pass**

**Step 7: Commit**

```bash
git commit -m "feat: encrypt sensitive DocumentChunk metadata columns in encrypted-only mode"
```

---

### Task 4: Null Document.rawText/previewText in Encryption Step

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/encryptionStep.service.ts:60-67`

**Step 1: Write failing test**

```typescript
test("encryption step nulls rawText and previewText", async () => {
  await runEncryptionStep({ userId: "u1", documentId: "d1", fullText: "content", filename: "file.pdf" });
  // Verify prisma.document.update was called with rawText: null, previewText: null
  expect(mockPrismaUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        rawText: null,
        previewText: null,
      }),
    })
  );
});
```

**Step 2: Fix — add rawText/previewText cleanup to encryption step**

After the existing `Promise.all` for encrypted text + filename (line 60-67), add:

```typescript
// Null out plaintext residue fields
await prisma.document.update({
  where: { id: documentId },
  data: {
    rawText: null,
    previewText: null,
  },
});
```

**Step 3: Also fix the silent skip when master key is missing**

Replace line 36:

```typescript
// Before: silently returns
if (!hasEncryptionKey || (!fullText && !filename)) return;

// After: throw in encrypted-only mode
if (!hasEncryptionKey) {
  const encryptedOnly = String(process.env.INDEXING_ENCRYPTED_CHUNKS_ONLY || "")
    .trim().toLowerCase() === "true";
  if (encryptedOnly) {
    throw new Error("KODA_MASTER_KEY_BASE64 not set but INDEXING_ENCRYPTED_CHUNKS_ONLY=true");
  }
  logger.warn("[Pipeline] Encryption skipped — no master key configured", { documentId });
  return;
}
if (!fullText && !filename) return;
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "fix: null rawText/previewText after encryption, throw when master key missing in encrypted-only mode"
```

---

### Task 5: Fix Encryption Singleton Permanent-Disable + TenantKey Cache Bounds

**Files:**
- Modify: `backend/src/services/retrieval/vectorEmbedding.service.ts:75-99` (singleton)
- Modify: `backend/src/services/security/tenantKey.service.ts` (cache bounds)

**Step 1: Fix singleton — don't permanently cache failure**

Replace the singleton pattern:

```typescript
function getChunkEncryptionServicesSafe(): ChunkEncryptionServices | null {
  // DO NOT cache failures — retry on next call
  try {
    const encryption = new EncryptionService();
    const envelope = new EnvelopeService(encryption);
    const tenantKeys = new TenantKeyService(prisma as any, encryption);
    const docKeys = new DocumentKeyService(prisma as any, encryption, tenantKeys, envelope);
    const docCrypto = new DocumentCryptoService(encryption);
    return { docKeys, docCrypto };
  } catch (err: any) {
    logger.error("[vectorEmbedding] Chunk encryption services initialization failed", {
      error: err?.message || String(err),
    });
    return null;
  }
}
```

Remove the module-level `chunkEncryptionServicesSingleton` variable entirely. For performance, cache at the call-site level within `storeDocumentEmbeddings` (one init per pipeline run, not per chunk).

**Step 2: Fix TenantKey cache — add LRU bounds**

In `tenantKey.service.ts`, add max size and cleanup:

```typescript
private readonly MAX_CACHE_SIZE = 10000;

private cleanExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of this.cache) {
    if (entry.expiresAt <= now) {
      this.cache.delete(key);
    }
  }
}

// In getOrCreateTenantKey, before caching:
if (this.cache.size >= this.MAX_CACHE_SIZE) {
  this.cleanExpiredEntries();
  // If still over limit after cleanup, evict oldest
  if (this.cache.size >= this.MAX_CACHE_SIZE) {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) this.cache.delete(firstKey);
  }
}
```

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git commit -m "fix: remove permanent-disable singleton pattern, add LRU bounds to tenant key cache"
```

---

### Task 6: Update vectorEmbedding.service.ts — Remove DocumentEmbedding Writes

**Files:**
- Modify: `backend/src/services/retrieval/vectorEmbedding.service.ts`

Since Phase 1 dropped the `DocumentEmbedding` table, this file must stop writing to it.

**Step 1: Remove all `DocumentEmbedding` / `documentEmbedding` references**

1. Remove `embeddingRecords` construction (lines 372-389) — this entire block is deleted
2. Remove `tx.documentEmbedding.deleteMany` (line 487)
3. Remove `tx.documentEmbedding.createMany` (lines 492-498 loop)
4. Remove `dbEmbeddingCount` verification (lines 535-536)
5. Update logging to reference only `DocumentChunk`

**Step 2: Add `searchVector` tsvector update to chunk records**

When creating chunk records, generate tsvector for full-text search:

```typescript
// After inserting chunks, update search vectors
await tx.$executeRaw`
  UPDATE "document_chunks"
  SET "search_vector" = to_tsvector('english', COALESCE("text", ''))
  WHERE "documentId" = ${documentId}
    AND "search_vector" IS NULL
    AND "text" IS NOT NULL
`;
```

**Step 3: Write chunk metadata (userId, chunkType, embeddingModel) into DocumentChunk**

These were previously only in DocumentEmbedding. Now they go into DocumentChunk:

```typescript
return {
  id,
  documentId,
  chunkIndex: c.chunkIndex,
  text: encryptionMode === "encrypted_only" ? null : plaintext,
  textEncrypted,
  // ... existing fields ...
  userId: document.userId,                    // NEW — was only in DocumentEmbedding
  chunkType: metadata.chunkType || null,      // NEW
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",  // NEW
  embeddingJson: JSON.stringify(c.embedding || []),  // NEW — replaces DocumentEmbedding.embedding
};
```

**Step 4: Run tests**

Run: `cd backend && npx jest vectorEmbedding.service.test.ts --verbose`
Expected: Tests need updating (mock DocumentEmbedding references removed)

**Step 5: Update test file — remove all DocumentEmbedding mock expectations**

**Step 6: Commit**

```bash
git commit -m "refactor: remove DocumentEmbedding writes, write all data to DocumentChunk only"
```

---

### Task 7: Update Retrieval Adapters — Read from DocumentChunk Instead of DocumentEmbedding

**Files:**
- Modify: `backend/src/services/core/retrieval/prismaRetrievalAdapters.service.ts`

This is the biggest code change in Phase 3. Every query that reads `DocumentEmbedding` must now read `DocumentChunk`.

**Step 1: Replace `prisma.documentEmbedding.findMany` → `prisma.documentChunk.findMany`**

Search and replace all occurrences. Key changes:

1. **Lexical search** (was reading `content` field on DocumentEmbedding):
   - Replace with `text` field on DocumentChunk (if plaintext mode)
   - OR use `searchVector` tsvector for FTS (if encrypted-only mode)
   - The `searchVector` GIN index enables `@@` tsquery matching without plaintext

2. **Snippet generation**:
   - Was: `toSnippet(row.content)`
   - Now: Use `resolveChunkTexts()` which already handles text/textEncrypted fallback

3. **WHERE clauses**:
   - Was: `content: { not: "" }` on DocumentEmbedding
   - Now: `OR: [{ text: { not: null } }, { textEncrypted: { not: null } }]` on DocumentChunk

**Step 2: Update tsvector-based lexical search**

For encrypted-only mode, use the `searchVector` tsvector column:

```typescript
// Encrypted-only lexical search using tsvector
const tsquery = tokens.map(t => `${t}:*`).join(" & ");
const rows = await prisma.$queryRaw`
  SELECT dc.*, d."filename", d."mimeType", d."status", d."folderId"
  FROM "document_chunks" dc
  JOIN "documents" d ON dc."documentId" = d."id"
  WHERE dc."search_vector" @@ to_tsquery('english', ${tsquery})
    AND d."userId" = ${this.userId}
    AND d."status" IN (${Prisma.join(READY_DOCUMENT_STATUSES)})
    AND d."is_deleted" = false
  ORDER BY ts_rank(dc."search_vector", to_tsquery('english', ${tsquery})) DESC
  LIMIT ${Math.max(opts.k * 8, 80)}
`;
```

**Step 3: Run tests**

Run: `cd backend && npx jest prismaRetrievalAdapters --verbose`
Expected: Tests need updating

**Step 4: Commit**

```bash
git commit -m "refactor: retrieval reads DocumentChunk instead of DocumentEmbedding, uses tsvector for encrypted FTS"
```

---

### Task 8: Add GCS Client-Side Encryption (CMEK)

**Files:**
- Modify: `backend/src/services/retrieval/gcsStorage.service.ts:109-128`

**Step 1: Add encryption option to uploadFile**

```typescript
async uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  opts?: { kmsKeyName?: string },
): Promise<void> {
  const file = this.bucket.file(key);
  const options: any = {
    contentType,
    resumable: false,
  };

  // Use CMEK if configured
  const kmsKey = opts?.kmsKeyName || process.env.GCS_KMS_KEY_NAME;
  if (kmsKey) {
    options.kmsKeyName = kmsKey;
  }

  await file.save(buffer, options);
}
```

**Step 2: Add content integrity verification to downloadFile**

```typescript
async downloadFile(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const file = this.bucket.file(key);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();

  // Verify MD5 integrity if available
  if (metadata.md5Hash) {
    const computed = createHash("md5").update(buffer).digest("base64");
    if (computed !== metadata.md5Hash) {
      throw new Error(`GCS integrity check failed for ${key}: expected ${metadata.md5Hash}, got ${computed}`);
    }
  }

  return { buffer, contentType: metadata.contentType || "application/octet-stream" };
}
```

**Step 3: Commit**

```bash
git commit -m "feat: add GCS CMEK encryption support and download integrity verification"
```

---

## Acceptance Criteria

- [ ] DocumentKey generation uses conditional CAS — no TOCTOU race
- [ ] Pinecone metadata contains `contentHash` (SHA-256), NOT plaintext `content`
- [ ] `DocumentChunk.valueRaw`, `rowLabel`, `colHeader`, `metadata` are encrypted in encrypted-only mode
- [ ] `Document.rawText` and `previewText` nulled by encryption step
- [ ] Master key missing in encrypted-only mode throws (not silently skips)
- [ ] Singleton pattern retries on failure (doesn't permanently disable)
- [ ] TenantKey cache has max size (10,000) with LRU eviction
- [ ] All DocumentEmbedding writes removed from vectorEmbedding.service
- [ ] Retrieval uses DocumentChunk + tsvector for all search paths
- [ ] GCS supports CMEK encryption option
- [ ] GCS download verifies content integrity
- [ ] All existing retrieval tests pass after migration
