# Security Phase 1: Eliminate Plaintext Copies — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every piece of document content exists in exactly ONE form — encrypted. Zero plaintext copies in any persistent or semi-persistent store (DB, Pinecone, GCS, Redis, in-memory cache).

**Architecture:** Extend the existing envelope encryption system (Master Key → Tenant Key → Document DEK) to cover all remaining plaintext surfaces. Migrate existing data via background jobs. Schema migrations add encrypted columns, then a backfill job encrypts+nulls the plaintext.

**Tech Stack:** TypeScript, Prisma migrations, AES-256-GCM, Pinecone API, GCS client, BullMQ, NodeCache

**Estimated Effort:** ~10 working days

**Dependencies:** Phase 0 must be complete (HKDF salt needed for new encrypted fields, AAD must be required)

**Findings Addressed:** F-001, F-002, F-003, F-004, F-009, F-010, F-024

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/prisma/schema.prisma` | Modify | Add encrypted columns for DocumentEmbedding, DocumentMetadata |
| `backend/prisma/migrations/YYYYMMDD_encrypt_remaining_fields/` | Create | Schema migration |
| `backend/src/services/security/fieldEncryption.service.ts` | Create | Reusable field encrypt/decrypt with document DEK + AAD |
| `backend/src/services/security/fieldEncryption.service.test.ts` | Create | Unit tests |
| `backend/src/services/retrieval/vectorEmbedding.service.ts` | Modify | Stop writing plaintext to DocumentEmbedding, encrypt content |
| `backend/src/services/retrieval/pinecone/pinecone.service.ts` | Modify | Remove content/filename from Pinecone metadata |
| `backend/src/services/retrieval/pinecone/pinecone.mappers.ts` | Modify | Read content from DB instead of Pinecone metadata |
| `backend/src/services/cache.service.ts` | Modify | Encrypt cached content with document DEK |
| `backend/src/services/retrieval/gcsStorage.service.ts` | Modify | Client-side encrypt before upload, decrypt on download |
| `backend/src/services/ingestion/pipeline/encryptionStep.service.ts` | Modify | Encrypt summary, markdownContent, slidesData fields |
| `backend/src/queues/queueConfig.ts` | Modify | Encrypt sensitive BullMQ job fields |
| `backend/src/queues/workers/jobHelpers.service.ts` | Modify | Encrypt/decrypt job payloads |
| `backend/src/scripts/migrations/backfill-encrypt-plaintext.ts` | Create | Background migration script |
| `backend/src/tests/security/no-plaintext-sensitive-fields.test.ts` | Create | DB query tests verifying no plaintext |

---

## Task 1: Create fieldEncryption.service.ts (T-1.1 prerequisite)

**Context:** Multiple tasks need to encrypt/decrypt individual fields using the document's DEK with proper AAD binding. Create a reusable service that handles this pattern.

**Files:**
- Create: `backend/src/services/security/fieldEncryption.service.ts`
- Create: `backend/src/services/security/fieldEncryption.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/services/security/fieldEncryption.service.test.ts
import crypto from "crypto";
import { describe, expect, test } from "@jest/globals";
import { FieldEncryptionService } from "./fieldEncryption.service";
import { EncryptionService } from "./encryption.service";

const enc = new EncryptionService();
const fieldEnc = new FieldEncryptionService(enc);

describe("FieldEncryptionService", () => {
  const key = crypto.randomBytes(32);
  const userId = "user-123";
  const docId = "doc-456";

  test("encrypt and decrypt a text field roundtrip", () => {
    const plaintext = "This is sensitive document content";
    const encrypted = fieldEnc.encryptField(plaintext, key, userId, docId, "extractedText");
    expect(encrypted).not.toContain(plaintext);
    const decrypted = fieldEnc.decryptField(encrypted, key, userId, docId, "extractedText");
    expect(decrypted).toBe(plaintext);
  });

  test("AAD mismatch throws", () => {
    const encrypted = fieldEnc.encryptField("secret", key, userId, docId, "extractedText");
    expect(() =>
      fieldEnc.decryptField(encrypted, key, userId, "wrong-doc", "extractedText"),
    ).toThrow();
  });

  test("different fields produce different ciphertext", () => {
    const text = "same content";
    const a = fieldEnc.encryptField(text, key, userId, docId, "summary");
    const b = fieldEnc.encryptField(text, key, userId, docId, "extractedText");
    expect(a).not.toBe(b);
  });

  test("null input returns null", () => {
    expect(fieldEnc.encryptField(null as any, key, userId, docId, "f")).toBeNull();
    expect(fieldEnc.decryptField(null as any, key, userId, docId, "f")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pg/Desktop/koda-webapp/backend && npx jest src/services/security/fieldEncryption.service.test.ts --no-coverage -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fieldEncryption.service.ts**

```typescript
// backend/src/services/security/fieldEncryption.service.ts
import { EncryptionService } from "./encryption.service";

/**
 * Reusable field-level encryption using document DEK + AAD binding.
 *
 * AAD format: "doc:{userId}:{documentId}:{fieldName}"
 * This binds each encrypted field to a specific user, document, and field name,
 * preventing ciphertext from being moved between contexts.
 */
export class FieldEncryptionService {
  constructor(private enc: EncryptionService) {}

  private buildAad(userId: string, documentId: string, fieldName: string): string {
    return `doc:${userId}:${documentId}:${fieldName}`;
  }

  encryptField(
    plaintext: string | null | undefined,
    key: Buffer,
    userId: string,
    documentId: string,
    fieldName: string,
  ): string | null {
    if (plaintext == null || plaintext === "") return null;
    const aad = this.buildAad(userId, documentId, fieldName);
    return this.enc.encryptStringToJson(plaintext, key, aad);
  }

  decryptField(
    encryptedJson: string | null | undefined,
    key: Buffer,
    userId: string,
    documentId: string,
    fieldName: string,
  ): string | null {
    if (encryptedJson == null || encryptedJson === "") return null;
    const aad = this.buildAad(userId, documentId, fieldName);
    return this.enc.decryptStringFromJson(encryptedJson, key, aad);
  }

  /**
   * Encrypt a Buffer (e.g., file bytes) returning a JSON envelope string.
   */
  encryptBuffer(
    buffer: Buffer,
    key: Buffer,
    userId: string,
    documentId: string,
    fieldName: string,
  ): string {
    const aad = this.buildAad(userId, documentId, fieldName);
    const payload = this.enc.encryptBuffer(buffer, key, aad);
    return JSON.stringify(payload);
  }

  /**
   * Decrypt a JSON envelope string back to a Buffer.
   */
  decryptBuffer(
    encryptedJson: string,
    key: Buffer,
    userId: string,
    documentId: string,
    fieldName: string,
  ): Buffer {
    const aad = this.buildAad(userId, documentId, fieldName);
    const payload = JSON.parse(encryptedJson);
    return this.enc.decryptBuffer(payload, key, aad);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pg/Desktop/koda-webapp/backend && npx jest src/services/security/fieldEncryption.service.test.ts --no-coverage -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/security/fieldEncryption.service.ts backend/src/services/security/fieldEncryption.service.test.ts
git commit -m "$(cat <<'EOF'
feat(security): add FieldEncryptionService for per-field document encryption

Reusable service for encrypting/decrypting individual fields using
document DEK with AAD binding (doc:{userId}:{docId}:{fieldName}).
Prerequisite for eliminating all remaining plaintext copies.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Encrypt DocumentEmbedding Content Fields (T-1.1, Finding F-001)

**Context:** `DocumentEmbedding` stores `content`, `chunkText`, and `microSummary` as plaintext. Add encrypted counterparts in schema, modify `vectorEmbedding.service.ts` to write encrypted + null plaintext.

**Files:**
- Modify: `backend/prisma/schema.prisma` (DocumentEmbedding model)
- Create: Prisma migration
- Modify: `backend/src/services/retrieval/vectorEmbedding.service.ts`

- [ ] **Step 1: Add encrypted columns to DocumentEmbedding in schema.prisma**

Find the `DocumentEmbedding` model and add:

```prisma
model DocumentEmbedding {
  id                    String    @id @default(uuid())
  documentId            String
  chunkIndex            Int
  content               String?   // Change from String to String? (nullable now)
  contentEncrypted      String?   // NEW: AES-256-GCM encrypted content
  embedding             String
  metadata              String
  chunkText             String?
  chunkTextEncrypted    String?   // NEW: encrypted chunkText
  microSummary          String?
  microSummaryEncrypted String?   // NEW: encrypted microSummary
  contentTsv            Unsupported("tsvector")?
  searchVector          Unsupported("tsvector")?
  // ... rest of existing fields
}
```

**IMPORTANT:** The `content` field must change from `String` (required) to `String?` (nullable) so it can be nulled after encryption.

- [ ] **Step 2: Generate and run Prisma migration**

Run:
```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx prisma migrate dev --name encrypt_embedding_fields --create-only
```

Review the generated SQL. It should:
1. Add `contentEncrypted`, `chunkTextEncrypted`, `microSummaryEncrypted` columns (nullable text)
2. Make `content` column nullable (ALTER COLUMN content DROP NOT NULL)

Then apply:
```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx prisma migrate dev
```

- [ ] **Step 3: Modify vectorEmbedding.service.ts to encrypt content before storage**

In `vectorEmbedding.service.ts`, in the `embeddingRecords` mapping (~line 372-389), modify to:

```typescript
const embeddingRecords = usableChunks.map((c) => {
  // Encrypt content for storage
  const contentEncrypted = encryptionMode === "encrypted_only" && fieldEncSvc
    ? fieldEncSvc.encryptField(c.content, documentKey!, userId, documentId, "embeddingContent")
    : null;
  const chunkTextEncrypted = encryptionMode === "encrypted_only" && fieldEncSvc
    ? fieldEncSvc.encryptField(c.content.slice(0, 4000), documentKey!, userId, documentId, "embeddingChunkText")
    : null;

  return {
    documentId,
    chunkIndex: c.chunkIndex,
    content: encryptionMode === "encrypted_only" ? null : c.content,
    contentEncrypted,
    embedding: JSON.stringify(c.embedding || []),
    userId: document.userId,
    pageNumber: c.pageNumber ?? c.metadata?.pageNumber ?? null,
    chunkText: encryptionMode === "encrypted_only" ? null : c.content.slice(0, 4000),
    chunkTextEncrypted,
    metadata: JSON.stringify({ ...(c.metadata || {}), ...sharedIndexingMetadata }),
  };
});
```

**Note:** You'll need to inject `FieldEncryptionService` and `DocumentKeyService` into this function, or obtain the document key from the existing encryption context that's already available in the function.

- [ ] **Step 4: Run tests**

Run: `cd /Users/pg/Desktop/koda-webapp/backend && npx jest --no-coverage 2>&1 | tail -20`
Expected: No new failures

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/services/retrieval/vectorEmbedding.service.ts
git commit -m "$(cat <<'EOF'
feat(security): encrypt DocumentEmbedding content fields (F-001)

Add contentEncrypted, chunkTextEncrypted, microSummaryEncrypted columns.
In encrypted_only mode, plaintext content/chunkText are nulled.
Schema migration makes content column nullable.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Remove Content from Pinecone Metadata (T-1.2, Finding F-002)

**Context:** Pinecone vector metadata includes `content` and `filename` in plaintext. Fix: store only `documentId`, `chunkIndex`, `userId` in Pinecone. On retrieval, look up content from the DB (which is now encrypted).

**Files:**
- Modify: `backend/src/services/retrieval/pinecone.service.ts` (upsert method — remove content from metadata)
- Modify: `backend/src/services/retrieval/pinecone/pinecone.mappers.ts` (mapper — don't expect content in metadata)
- Modify: retrieval code that uses Pinecone content (do DB lookup instead)

- [ ] **Step 1: Modify Pinecone upsert to exclude sensitive metadata**

In `pinecone.service.ts`, in the upsert method where metadata is built (~line 205-242), remove `content` and `filename` from the metadata object:

```typescript
// BEFORE:
const meta = {
  documentId,
  userId,
  chunkIndex: c.chunkIndex,
  content: (c.content || "").slice(0, 5000),  // REMOVE THIS
  filename: documentMetadata.filename || "",   // REMOVE THIS
  mimeType: documentMetadata.mimeType || "",
  // ...
};

// AFTER:
const meta = {
  documentId,
  userId,
  chunkIndex: c.chunkIndex,
  mimeType: documentMetadata.mimeType || "",
  status: "active",
  createdAt: new Date().toISOString(),
  // Only non-sensitive identifiers — no content, no filename
};
```

- [ ] **Step 2: Update pinecone.mappers.ts to not read content from metadata**

```typescript
// BEFORE:
content: String(metadata.content || ""),

// AFTER:
content: "",  // Content now retrieved from DB, not Pinecone metadata
```

And remove `filename` from the document object construction:

```typescript
// BEFORE:
filename: String(metadata.filename || ""),

// AFTER:
filename: "",  // Filename retrieved from DB, not Pinecone metadata
```

- [ ] **Step 3: Update retrieval code to fetch content from DB after Pinecone query**

After getting Pinecone results (which now only have `documentId` + `chunkIndex`), add a DB lookup step:

```typescript
// After Pinecone query returns hits with documentId + chunkIndex:
// Look up the actual content from DocumentEmbedding or DocumentChunk table
// If encrypted, decrypt using document DEK
```

This is the most complex part. Find the retrieval function that consumes Pinecone results and add the DB join step.

- [ ] **Step 4: Test retrieval still works**

Run the existing chat/retrieval tests:
```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx jest --testPathPattern="chat|retrieval" --no-coverage 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/retrieval/pinecone.service.ts backend/src/services/retrieval/pinecone/pinecone.mappers.ts
git commit -m "$(cat <<'EOF'
fix(security): remove plaintext content from Pinecone metadata (F-002)

Pinecone vectors now store only documentId, chunkIndex, userId, mimeType.
Content is retrieved from the database (encrypted) after vector search.
No plaintext document content in external vector store.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Encrypt Cache Entries (T-1.3, Finding F-003)

**Context:** `cache.service.ts` stores document content, search results, answers, and file buffers in plaintext in NodeCache (in-process memory). While in-memory is lower risk than persistent storage, a memory dump would expose all cached content.

**Files:**
- Modify: `backend/src/services/cache.service.ts`

- [ ] **Step 1: Add encryption wrapper to cache get/set operations**

Create a cache encryption key derived from the master key:

```typescript
import { hkdf32 } from "./security/hkdf.service";
import { EncryptionService } from "./security/encryption.service";

const enc = new EncryptionService();

function getCacheKey(): Buffer | null {
  const masterKeyB64 = process.env.KODA_MASTER_KEY_BASE64;
  if (!masterKeyB64) return null;
  const masterKey = Buffer.from(masterKeyB64, "base64");
  return hkdf32(masterKey, "cache-encryption-key");
}
```

- [ ] **Step 2: Wrap cache set/get with encrypt/decrypt for sensitive content**

For `cacheDocumentBuffer`, `cacheSearchResults`, `cacheAnswer`, and `cacheQueryResponse`:

```typescript
// BEFORE (example for cacheDocumentBuffer):
cache.set(key, buffer, ttl);

// AFTER:
const cacheKey = getCacheKey();
if (cacheKey) {
  const encrypted = enc.encryptBuffer(buffer, cacheKey, `cache:docbuf:${documentId}`);
  cache.set(key, JSON.stringify(encrypted), ttl);
} else {
  cache.set(key, buffer, ttl);  // Fallback for dev without master key
}
```

And matching get:

```typescript
// BEFORE:
return cache.get<Buffer>(key);

// AFTER:
const raw = cache.get<string>(key);
if (!raw) return undefined;
const cacheKey = getCacheKey();
if (cacheKey && typeof raw === "string" && raw.startsWith("{")) {
  const payload = JSON.parse(raw);
  return enc.decryptBuffer(payload, cacheKey, `cache:docbuf:${documentId}`);
}
return raw as unknown as Buffer;
```

- [ ] **Step 3: Apply same pattern to all sensitive cache methods**

Repeat for: `cacheSearchResults`/`getCachedSearchResults`, `cacheAnswer`/`getCachedAnswer`, `cacheQueryResponse`/`getCachedQueryResponse`, `cacheEmbedding`/`getCachedEmbedding`.

- [ ] **Step 4: Run tests**

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx jest --no-coverage 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/cache.service.ts
git commit -m "$(cat <<'EOF'
fix(security): encrypt sensitive cache entries with derived key (F-003)

Document buffers, search results, answers, and embeddings in NodeCache
are now encrypted with AES-256-GCM using a key derived from the master
key via HKDF. Memory dumps no longer expose plaintext content.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Client-Side Encrypt Before GCS Upload (T-1.4, Finding F-004)

**Context:** `gcsStorage.service.ts` uploads raw file bytes to GCS. While GCS provides server-side encryption (SSE), the file is accessible in plaintext to anyone with bucket access. Fix: encrypt with document DEK before upload, decrypt on download.

**Files:**
- Modify: `backend/src/services/retrieval/gcsStorage.service.ts`

- [ ] **Step 1: Add encryption to uploadFile**

```typescript
// In uploadFile method, before file.save():
// Encrypt the buffer with document DEK if available
async uploadFile(params: {
  key: string;
  buffer: Buffer;
  mimeType: string;
  encryptionKey?: Buffer;  // NEW: optional document DEK
  userId?: string;         // NEW: for AAD
  documentId?: string;     // NEW: for AAD
}): Promise<{ key: string }> {
  const file = this.bucket().file(params.key);

  let dataToStore = params.buffer;
  if (params.encryptionKey && params.userId && params.documentId) {
    const fieldEnc = new FieldEncryptionService(new EncryptionService());
    const encryptedJson = fieldEnc.encryptBuffer(
      params.buffer,
      params.encryptionKey,
      params.userId,
      params.documentId,
      "gcsFile",
    );
    dataToStore = Buffer.from(encryptedJson, "utf8");
  }

  await file.save(dataToStore, {
    contentType: params.encryptionKey ? "application/octet-stream" : params.mimeType,
    resumable: false,
    metadata: {
      metadata: {
        clientEncrypted: params.encryptionKey ? "true" : "false",
        originalMimeType: params.mimeType,
      },
    },
  });
  return { key: params.key };
}
```

- [ ] **Step 2: Add decryption to downloadFile**

```typescript
async downloadFile(params: {
  key: string;
  decryptionKey?: Buffer;
  userId?: string;
  documentId?: string;
}): Promise<{ buffer: Buffer; mimeType: string }> {
  const file = this.bucket().file(params.key);
  const [meta] = await file.getMetadata();
  const [buf] = await file.download();

  const isClientEncrypted = meta.metadata?.clientEncrypted === "true";
  const originalMimeType = meta.metadata?.originalMimeType || meta.contentType || "application/octet-stream";

  if (isClientEncrypted && params.decryptionKey && params.userId && params.documentId) {
    const fieldEnc = new FieldEncryptionService(new EncryptionService());
    const decrypted = fieldEnc.decryptBuffer(
      buf.toString("utf8"),
      params.decryptionKey,
      params.userId,
      params.documentId,
      "gcsFile",
    );
    return { buffer: decrypted, mimeType: originalMimeType };
  }

  return { buffer: buf, mimeType: originalMimeType as string };
}
```

- [ ] **Step 3: Update all callers of uploadFile/downloadFile to pass encryption params**

Search for all call sites:
```bash
grep -rn "uploadFile\|downloadFile" backend/src/ --include="*.ts" | grep -v "test\|\.d\.ts"
```

Update each caller to pass `encryptionKey`, `userId`, `documentId` from the current context.

- [ ] **Step 4: Test file upload/download still works**

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx jest --testPathPattern="gcs\|storage\|upload" --no-coverage 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/retrieval/gcsStorage.service.ts
git commit -m "$(cat <<'EOF'
feat(security): client-side encrypt files before GCS upload (F-004)

Files are now AES-256-GCM encrypted with document DEK before upload
to GCS. Download decrypts using the same key. GCS metadata tracks
whether a file is client-encrypted and its original MIME type.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Null Plaintext Fields When Encrypted Counterpart Populated (T-1.5, Finding F-009)

**Context:** `DocumentMetadata`, `DocumentChunk`, and `Document` have dual columns (e.g., `extractedText` + `extractedTextEncrypted`). When the encrypted field is populated, the plaintext field should be nulled.

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/encryptionStep.service.ts`
- Create: migration script to backfill existing rows

- [ ] **Step 1: Modify encryptionStep.service.ts to null plaintext after encrypting**

After writing the encrypted field, add a step that nulls the plaintext:

```typescript
// After storing encrypted text, null the plaintext copies:
await prisma.documentMetadata.updateMany({
  where: { documentId, extractedTextEncrypted: { not: null } },
  data: { extractedText: null, entities: null, classification: null },
});

await prisma.documentChunk.updateMany({
  where: { documentId, textEncrypted: { not: null } },
  data: { text: null },
});
```

- [ ] **Step 2: Create backfill migration script**

```typescript
// backend/src/scripts/migrations/backfill-null-plaintext.ts
// Finds all rows where both plaintext AND encrypted are populated, nulls the plaintext
```

- [ ] **Step 3: Test and commit**

```bash
git add backend/src/services/ingestion/pipeline/encryptionStep.service.ts backend/src/scripts/migrations/
git commit -m "$(cat <<'EOF'
fix(security): null plaintext fields when encrypted counterpart exists (F-009)

Encryption step now nulls extractedText, entities, classification, and
chunk text after storing encrypted versions. Backfill script included
for existing data.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Encrypt Sensitive BullMQ Job Fields (T-1.6, Finding F-010)

**Context:** `ProcessDocumentJobData` includes `plaintextForEmbeddings` which goes into Redis verbatim via BullMQ.

**Files:**
- Modify: `backend/src/queues/queueConfig.ts`
- Modify: `backend/src/queues/workers/jobHelpers.service.ts`
- Modify: worker that reads `plaintextForEmbeddings`

- [ ] **Step 1: Encrypt the field before enqueuing**

In `jobHelpers.service.ts`, before `documentQueue.add()`:

```typescript
export async function addDocumentJob(data: ProcessDocumentJobData) {
  const sanitized = { ...data };
  if (sanitized.plaintextForEmbeddings) {
    const masterKeyB64 = process.env.KODA_MASTER_KEY_BASE64;
    if (masterKeyB64) {
      const enc = new EncryptionService();
      const jobKey = hkdf32(Buffer.from(masterKeyB64, "base64"), "bullmq-job-encryption");
      sanitized.encryptedForEmbeddings = enc.encryptStringToJson(
        sanitized.plaintextForEmbeddings,
        jobKey,
        `job:${data.documentId}:embeddings`,
      );
      delete sanitized.plaintextForEmbeddings;
    }
  }
  return documentQueue.add("process-document", sanitized, {
    jobId: `doc-${data.documentId}`,
  });
}
```

- [ ] **Step 2: Decrypt in the worker before processing**

In the worker that reads `plaintextForEmbeddings`, add decryption:

```typescript
if (data.encryptedForEmbeddings && !data.plaintextForEmbeddings) {
  const masterKeyB64 = process.env.KODA_MASTER_KEY_BASE64;
  if (masterKeyB64) {
    const enc = new EncryptionService();
    const jobKey = hkdf32(Buffer.from(masterKeyB64, "base64"), "bullmq-job-encryption");
    data.plaintextForEmbeddings = enc.decryptStringFromJson(
      data.encryptedForEmbeddings,
      jobKey,
      `job:${data.documentId}:embeddings`,
    );
  }
}
```

- [ ] **Step 3: Update the interface**

In `queueConfig.ts`, update:

```typescript
export interface ProcessDocumentJobData {
  // ... existing fields ...
  plaintextForEmbeddings?: string;     // DEPRECATED: use encryptedForEmbeddings
  encryptedForEmbeddings?: string;     // NEW: encrypted content for embeddings
}
```

- [ ] **Step 4: Test and commit**

```bash
git add backend/src/queues/queueConfig.ts backend/src/queues/workers/jobHelpers.service.ts
git commit -m "$(cat <<'EOF'
fix(security): encrypt sensitive BullMQ job fields in Redis (F-010)

plaintextForEmbeddings is now encrypted before enqueuing and decrypted
in the worker. Redis no longer stores raw document content. Uses HKDF
derived key from master key with job-specific AAD.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add Encrypted Counterparts for Remaining Metadata Fields (T-1.7, Finding F-024)

**Context:** `DocumentMetadata.summary`, `markdownContent`, `slidesData`, `pptxMetadata` have no encrypted counterparts. Also `Document.displayTitle`, `rawText`, `previewText`, `renderableContent`.

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: Prisma migration
- Modify: `backend/src/services/ingestion/pipeline/encryptionStep.service.ts`

- [ ] **Step 1: Add encrypted columns to schema**

```prisma
// In DocumentMetadata model:
summaryEncrypted          String?
markdownContentEncrypted  String?
slidesDataEncrypted       String?
pptxMetadataEncrypted     String?
```

- [ ] **Step 2: Generate migration**

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx prisma migrate dev --name encrypt_metadata_fields
```

- [ ] **Step 3: Modify encryption step to encrypt these fields**

Add to `encryptionStep.service.ts`:

```typescript
// Encrypt summary, markdownContent, slidesData, pptxMetadata
const metadata = await prisma.documentMetadata.findUnique({ where: { documentId } });
if (metadata) {
  const updates: any = {};
  for (const field of ["summary", "markdownContent", "slidesData", "pptxMetadata"]) {
    if (metadata[field]) {
      updates[`${field}Encrypted`] = fieldEnc.encryptField(
        metadata[field], documentKey, userId, documentId, field,
      );
      updates[field] = null;  // Null the plaintext
    }
  }
  if (Object.keys(updates).length > 0) {
    await prisma.documentMetadata.update({ where: { documentId }, data: updates });
  }
}
```

- [ ] **Step 4: Test and commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/services/ingestion/pipeline/encryptionStep.service.ts
git commit -m "$(cat <<'EOF'
feat(security): add encrypted counterparts for remaining metadata (F-024)

Schema adds summaryEncrypted, markdownContentEncrypted, slidesDataEncrypted,
pptxMetadataEncrypted. Encryption step now encrypts these fields and
nulls plaintext versions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create Backfill Migration Script

**Context:** Existing documents have plaintext data that needs to be encrypted and then nulled.

**Files:**
- Create: `backend/src/scripts/migrations/backfill-encrypt-plaintext.ts`

- [ ] **Step 1: Write the migration script**

```typescript
/**
 * Backfill migration: Encrypt existing plaintext fields and null originals.
 *
 * Run: npx ts-node src/scripts/migrations/backfill-encrypt-plaintext.ts
 *
 * Strategy:
 * 1. Iterate all documents in batches of 50
 * 2. For each document, get/create document DEK
 * 3. Encrypt all plaintext fields → write encrypted → null plaintext
 * 4. Track progress with console output
 * 5. Idempotent: skips rows where encrypted field is already populated
 */
```

- [ ] **Step 2: Test on a small dataset, then commit**

```bash
git add backend/src/scripts/migrations/backfill-encrypt-plaintext.ts
git commit -m "$(cat <<'EOF'
feat(security): add plaintext→encrypted backfill migration script

Iterates all documents, encrypts remaining plaintext fields using
document DEK, nulls plaintext. Idempotent and batched.
Run: npx ts-node src/scripts/migrations/backfill-encrypt-plaintext.ts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Create No-Plaintext Verification Test

- [ ] **Step 1: Write the verification test**

```typescript
// backend/src/tests/security/no-plaintext-sensitive-fields.test.ts
// Queries DB for non-null plaintext in fields that should be encrypted
// Fails if any found
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/tests/security/no-plaintext-sensitive-fields.test.ts
git commit -m "$(cat <<'EOF'
test(security): add no-plaintext verification test suite

Queries DB for non-null plaintext in encrypted-counterpart fields.
Fails if any plaintext copies remain after migration.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Do Not Break Checklist

After Phase 1, verify:
- [ ] Existing encrypted documents still decrypt
- [ ] Chat pipeline latency increase < 200ms (cache encryption adds overhead)
- [ ] File upload flow works for all file types (GCS encryption)
- [ ] Pinecone retrieval still returns relevant results (content now from DB)
- [ ] BullMQ workers process jobs without interruption
- [ ] Document deletion cascade still cleans up all stores
