# Phase 1: Schema & Migrations — Indexing & Storage A+ Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all Prisma schema defects — soft-delete, version chain integrity, cross-doc linking, table consolidation, dead columns, missing constraints — so Phase 2-4 have a solid foundation.

**Architecture:** Four migrations executed sequentially: (1) soft-delete + version chain safety, (2) merge DocumentEmbedding into DocumentChunk, (3) cross-doc linking tables + audit trail, (4) cleanup dead columns/indexes. Each migration is atomic and rollback-safe.

**Tech Stack:** Prisma, PostgreSQL, raw SQL migrations

---

## Pre-Requisites

- Database backup taken before running any migration
- All workers/queues paused during migration (to avoid writes to tables being altered)

---

### Task 1: Add Soft-Delete to Document Model

**Files:**
- Modify: `backend/prisma/schema.prisma:179-247` (Document model)
- Create: `backend/prisma/migrations/20260305000000_add_document_soft_delete/migration.sql`

**Step 1: Write the migration SQL**

```sql
-- Add soft-delete fields to documents
ALTER TABLE "documents" ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "documents" ADD COLUMN "deleted_at" TIMESTAMPTZ;

-- Index for soft-delete queries (most queries will filter is_deleted=false)
CREATE INDEX "documents_is_deleted_idx" ON "documents"("is_deleted") WHERE "is_deleted" = false;
CREATE INDEX "documents_user_id_is_deleted_idx" ON "documents"("userId", "is_deleted");

-- Backfill: all existing documents are not deleted
-- (Default handles this, but be explicit for safety)
UPDATE "documents" SET "is_deleted" = false WHERE "is_deleted" IS NULL;
```

**Step 2: Update schema.prisma Document model — add after `error` field (line 212)**

```prisma
isDeleted                  Boolean                    @default(false) @map("is_deleted")
deletedAt                  DateTime?                  @map("deleted_at")
```

**Step 3: Run migration**

Run: `cd backend && npx prisma migrate dev --name add_document_soft_delete`
Expected: Migration applied successfully

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260305000000_add_document_soft_delete/
git commit -m "schema: add soft-delete (isDeleted, deletedAt) to Document model"
```

---

### Task 2: Fix Version Chain — Add onDelete SetNull + Circular Reference Check

**Files:**
- Modify: `backend/prisma/schema.prisma:222` (parentVersion relation)
- Create: `backend/prisma/migrations/20260305000100_fix_version_chain_integrity/migration.sql`

**Step 1: Write the migration SQL**

```sql
-- Fix: parentVersionId should SetNull on delete, not leave dangling references
-- First drop the existing FK if it exists, then re-add with ON DELETE SET NULL
DO $$
BEGIN
  -- Drop existing FK constraint on parentVersionId
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%parentVersionId%'
    AND table_name = 'documents'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE "documents" DROP CONSTRAINT "' || constraint_name || '"'
      FROM information_schema.table_constraints
      WHERE constraint_name LIKE '%parentVersionId%'
      AND table_name = 'documents'
      LIMIT 1
    );
  END IF;
END $$;

-- Re-add with ON DELETE SET NULL
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_parentVersionId_fkey"
  FOREIGN KEY ("parentVersionId") REFERENCES "documents"("id")
  ON DELETE SET NULL;

-- Add CHECK constraint to prevent self-referential parentVersionId
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_no_self_version"
  CHECK ("parentVersionId" IS NULL OR "parentVersionId" != "id");
```

**Step 2: Update schema.prisma — change line 222**

From:
```prisma
parentVersion              Document?                  @relation("DocumentVersions", fields: [parentVersionId], references: [id])
```
To:
```prisma
parentVersion              Document?                  @relation("DocumentVersions", fields: [parentVersionId], references: [id], onDelete: SetNull)
```

**Step 3: Run migration**

Run: `cd backend && npx prisma migrate dev --name fix_version_chain_integrity`
Expected: Migration applied successfully

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260305000100_fix_version_chain_integrity/
git commit -m "schema: fix version chain — onDelete SetNull, prevent self-reference cycles"
```

---

### Task 3: Merge DocumentEmbedding Into DocumentChunk

This is the biggest migration. We add the fields DocumentChunk is missing from DocumentEmbedding, migrate data, then drop DocumentEmbedding.

**Files:**
- Modify: `backend/prisma/schema.prisma:297-333` (DocumentChunk model)
- Modify: `backend/prisma/schema.prisma:456-487` (remove DocumentEmbedding model)
- Modify: `backend/prisma/schema.prisma:218` (remove `embeddings` relation from Document)
- Create: `backend/prisma/migrations/20260305000200_merge_embedding_into_chunk/migration.sql`

**Step 1: Write the migration SQL**

```sql
-- Phase 1: Add missing columns from DocumentEmbedding to DocumentChunk
ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "content_tsv" tsvector,
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector,
  ADD COLUMN IF NOT EXISTS "user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "micro_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "chunk_type" TEXT,
  ADD COLUMN IF NOT EXISTS "pinecone_namespace" TEXT,
  ADD COLUMN IF NOT EXISTS "embedding_model" TEXT,
  ADD COLUMN IF NOT EXISTS "embedding_json" TEXT;

-- Phase 2: Migrate data from document_embeddings to document_chunks
-- Update DocumentChunk rows with data from matching DocumentEmbedding rows
UPDATE "document_chunks" dc
SET
  "user_id" = de."user_id",
  "micro_summary" = de."micro_summary",
  "chunk_type" = COALESCE(dc."chunk_type", de."chunk_type"),
  "pinecone_namespace" = de."pinecone_namespace",
  "embedding_model" = de."embedding_model",
  "search_vector" = de."search_vector",
  "content_tsv" = de."contentTsv",
  "embedding_json" = de."embedding"
FROM "document_embeddings" de
WHERE dc."documentId" = de."documentId"
  AND dc."chunkIndex" = de."chunkIndex";

-- Phase 3: Backfill user_id from documents where missing
UPDATE "document_chunks" dc
SET "user_id" = d."userId"
FROM "documents" d
WHERE dc."documentId" = d."id"
  AND dc."user_id" IS NULL;

-- Phase 4: Create indexes on new columns
CREATE INDEX IF NOT EXISTS "document_chunks_user_id_idx"
  ON "document_chunks"("user_id");
CREATE INDEX IF NOT EXISTS "document_chunks_chunk_type_idx"
  ON "document_chunks"("chunk_type");
CREATE INDEX IF NOT EXISTS "document_chunks_user_id_document_id_idx"
  ON "document_chunks"("user_id", "documentId");

-- Phase 5: Create GIN index for full-text search on search_vector
CREATE INDEX IF NOT EXISTS "document_chunks_search_vector_idx"
  ON "document_chunks" USING GIN ("search_vector");

-- Phase 6: Drop the document_embeddings table
DROP TABLE IF EXISTS "document_embeddings";
```

**Step 2: Update schema.prisma**

Remove the entire `DocumentEmbedding` model (lines 456-487).

Update `DocumentChunk` model (lines 297-333) to add new fields:

```prisma
model DocumentChunk {
  id              String                   @id @default(uuid())
  documentId      String
  chunkIndex      Int
  text            String?
  textEncrypted   String?
  page            Int?
  startChar       Int?
  endChar         Int?
  embedding       Bytes?
  embeddingJson   String?                  @map("embedding_json")
  sectionName     String?                  @map("section_name")
  sheetName       String?                  @map("sheet_name")
  tableChunkForm  String?                  @map("table_chunk_form")
  tableId         String?                  @map("table_id")
  rowIndex        Int?                     @map("row_index")
  columnIndex     Int?                     @map("column_index")
  rowLabel        String?                  @map("row_label")
  colHeader       String?                  @map("col_header")
  valueRaw        String?                  @map("value_raw")
  unitRaw         String?                  @map("unit_raw")
  unitNormalized  String?                  @map("unit_normalized")
  numericValue    Float?                   @map("numeric_value")
  metadata        Json?
  userId          String?                  @map("user_id")
  microSummary    String?                  @map("micro_summary")
  chunkType       String?                  @map("chunk_type")
  pineconeNamespace String?                @map("pinecone_namespace")
  embeddingModel  String?                  @map("embedding_model")
  contentTsv      Unsupported("tsvector")? @map("content_tsv")
  searchVector    Unsupported("tsvector")? @map("search_vector")
  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt
  document        Document                 @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([documentId, chunkIndex])
  @@index([documentId, page])
  @@index([documentId, sectionName])
  @@index([documentId, sheetName])
  @@index([documentId, tableChunkForm])
  @@index([documentId, rowLabel, colHeader])
  @@index([userId])
  @@index([chunkType])
  @@index([userId, documentId])
  @@unique([documentId, chunkIndex])
  @@map("document_chunks")
}
```

Remove `embeddings DocumentEmbedding[]` from Document model (line 218).

**Step 3: Run migration**

Run: `cd backend && npx prisma migrate dev --name merge_embedding_into_chunk`
Expected: Migration applied, DocumentEmbedding table dropped

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260305000200_merge_embedding_into_chunk/
git commit -m "schema: merge DocumentEmbedding into DocumentChunk, drop redundant table"
```

---

### Task 4: Create Cross-Document Linking Tables

**Files:**
- Modify: `backend/prisma/schema.prisma` (add 3 new models)
- Create: `backend/prisma/migrations/20260305000300_add_cross_document_linking/migration.sql`

**Step 1: Write the migration SQL**

```sql
-- DocumentAmendment: tracks "this document amends/supersedes that document"
CREATE TABLE "document_amendments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "source_document_id" TEXT NOT NULL,
  "amended_document_id" TEXT NOT NULL,
  "amendment_type" TEXT NOT NULL DEFAULT 'amends',
  "description" TEXT,
  "effective_date" TIMESTAMPTZ,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "document_amendments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_amendments_source_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "document_amendments_amended_fkey" FOREIGN KEY ("amended_document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "document_amendments_no_self" CHECK ("source_document_id" != "amended_document_id")
);

CREATE INDEX "document_amendments_source_idx" ON "document_amendments"("source_document_id");
CREATE INDEX "document_amendments_amended_idx" ON "document_amendments"("amended_document_id");
CREATE UNIQUE INDEX "document_amendments_unique_pair" ON "document_amendments"("source_document_id", "amended_document_id");

-- DocumentAttachment: tracks "this attachment belongs to that parent document"
CREATE TABLE "document_attachments" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "parent_document_id" TEXT NOT NULL,
  "attachment_document_id" TEXT NOT NULL,
  "attachment_type" TEXT NOT NULL DEFAULT 'attachment',
  "label" TEXT,
  "sort_order" INT NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_attachments_parent_fkey" FOREIGN KEY ("parent_document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "document_attachments_attachment_fkey" FOREIGN KEY ("attachment_document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "document_attachments_no_self" CHECK ("parent_document_id" != "attachment_document_id")
);

CREATE INDEX "document_attachments_parent_idx" ON "document_attachments"("parent_document_id");
CREATE INDEX "document_attachments_attachment_idx" ON "document_attachments"("attachment_document_id");
CREATE UNIQUE INDEX "document_attachments_unique_pair" ON "document_attachments"("parent_document_id", "attachment_document_id");

-- RelatedDocument: general-purpose bidirectional link
CREATE TABLE "related_documents" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "document_id_a" TEXT NOT NULL,
  "document_id_b" TEXT NOT NULL,
  "relation_type" TEXT NOT NULL DEFAULT 'related',
  "confidence" DOUBLE PRECISION,
  "description" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "related_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "related_documents_a_fkey" FOREIGN KEY ("document_id_a") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "related_documents_b_fkey" FOREIGN KEY ("document_id_b") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "related_documents_no_self" CHECK ("document_id_a" != "document_id_b"),
  CONSTRAINT "related_documents_ordered" CHECK ("document_id_a" < "document_id_b")
);

CREATE INDEX "related_documents_a_idx" ON "related_documents"("document_id_a");
CREATE INDEX "related_documents_b_idx" ON "related_documents"("document_id_b");
CREATE UNIQUE INDEX "related_documents_unique_pair" ON "related_documents"("document_id_a", "document_id_b", "relation_type");
```

**Step 2: Add Prisma models to schema.prisma (after DocumentChunk model)**

```prisma
model DocumentAmendment {
  id                 String    @id @default(uuid())
  sourceDocumentId   String    @map("source_document_id")
  amendedDocumentId  String    @map("amended_document_id")
  amendmentType      String    @default("amends") @map("amendment_type")
  description        String?
  effectiveDate      DateTime? @map("effective_date")
  createdBy          String?   @map("created_by")
  createdAt          DateTime  @default(now()) @map("created_at")
  sourceDocument     Document  @relation("AmendmentSource", fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  amendedDocument    Document  @relation("AmendmentTarget", fields: [amendedDocumentId], references: [id], onDelete: Cascade)

  @@index([sourceDocumentId])
  @@index([amendedDocumentId])
  @@unique([sourceDocumentId, amendedDocumentId])
  @@map("document_amendments")
}

model DocumentAttachment {
  id                    String   @id @default(uuid())
  parentDocumentId      String   @map("parent_document_id")
  attachmentDocumentId  String   @map("attachment_document_id")
  attachmentType        String   @default("attachment") @map("attachment_type")
  label                 String?
  sortOrder             Int      @default(0) @map("sort_order")
  createdBy             String?  @map("created_by")
  createdAt             DateTime @default(now()) @map("created_at")
  parentDocument        Document @relation("AttachmentParent", fields: [parentDocumentId], references: [id], onDelete: Cascade)
  attachmentDocument    Document @relation("AttachmentChild", fields: [attachmentDocumentId], references: [id], onDelete: Cascade)

  @@index([parentDocumentId])
  @@index([attachmentDocumentId])
  @@unique([parentDocumentId, attachmentDocumentId])
  @@map("document_attachments")
}

model RelatedDocument {
  id            String   @id @default(uuid())
  documentIdA   String   @map("document_id_a")
  documentIdB   String   @map("document_id_b")
  relationType  String   @default("related") @map("relation_type")
  confidence    Float?
  description   String?
  createdBy     String?  @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")
  documentA     Document @relation("RelatedA", fields: [documentIdA], references: [id], onDelete: Cascade)
  documentB     Document @relation("RelatedB", fields: [documentIdB], references: [id], onDelete: Cascade)

  @@index([documentIdA])
  @@index([documentIdB])
  @@unique([documentIdA, documentIdB, relationType])
  @@map("related_documents")
}
```

Add corresponding relation arrays to Document model:

```prisma
  amendmentsAsSource   DocumentAmendment[]  @relation("AmendmentSource")
  amendmentsAsTarget   DocumentAmendment[]  @relation("AmendmentTarget")
  attachmentsAsParent  DocumentAttachment[] @relation("AttachmentParent")
  attachmentsAsChild   DocumentAttachment[] @relation("AttachmentChild")
  relatedAsA           RelatedDocument[]    @relation("RelatedA")
  relatedAsB           RelatedDocument[]    @relation("RelatedB")
```

**Step 3: Run migration**

Run: `cd backend && npx prisma migrate dev --name add_cross_document_linking`
Expected: 3 new tables created

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260305000300_add_cross_document_linking/
git commit -m "schema: add DocumentAmendment, DocumentAttachment, RelatedDocument tables"
```

---

### Task 5: Add Document Audit Trail

**Files:**
- Modify: `backend/prisma/schema.prisma` (add DocumentAuditEvent model)
- Create: `backend/prisma/migrations/20260305000400_add_document_audit_trail/migration.sql`

**Step 1: Write the migration SQL**

```sql
CREATE TABLE "document_audit_events" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "document_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "ip_address" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "document_audit_events_pkey" PRIMARY KEY ("id")
);

-- No FK to documents — audit must survive document deletion
-- No FK to users — audit must survive user deletion
CREATE INDEX "document_audit_events_document_id_idx" ON "document_audit_events"("document_id");
CREATE INDEX "document_audit_events_user_id_idx" ON "document_audit_events"("user_id");
CREATE INDEX "document_audit_events_action_idx" ON "document_audit_events"("action");
CREATE INDEX "document_audit_events_created_at_idx" ON "document_audit_events"("created_at");
CREATE INDEX "document_audit_events_document_action_idx" ON "document_audit_events"("document_id", "action");
```

**Step 2: Add Prisma model**

```prisma
model DocumentAuditEvent {
  id          String   @id @default(uuid())
  documentId  String   @map("document_id")
  userId      String   @map("user_id")
  action      String
  details     Json?
  ipAddress   String?  @map("ip_address")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([documentId])
  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@index([documentId, action])
  @@map("document_audit_events")
}
```

**Step 3: Run migration**

Run: `cd backend && npx prisma migrate dev --name add_document_audit_trail`
Expected: Table created

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260305000400_add_document_audit_trail/
git commit -m "schema: add DocumentAuditEvent table for document lifecycle audit trail"
```

---

### Task 6: Cleanup — Remove Dead Enum Values, Fix Nullable Fields, Prune Redundant Indexes

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260305000500_schema_cleanup/migration.sql`

**Step 1: Write the migration SQL**

```sql
-- 1. Remove redundant indexes (subsumed by compound indexes)
DROP INDEX IF EXISTS "documents_userId_idx";
DROP INDEX IF EXISTS "documents_folderId_idx";
DROP INDEX IF EXISTS "documents_status_idx";
DROP INDEX IF EXISTS "documents_language_idx";
DROP INDEX IF EXISTS "documents_sweep_reset_count_idx";

-- 2. Make chunksCount non-nullable (always written by pipeline)
ALTER TABLE "documents" ALTER COLUMN "chunksCount" SET NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "chunksCount" SET DEFAULT 0;

-- 3. Add "deleted" to DocumentStatus enum
ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'deleted';

-- 4. Add "skipped" to DocumentIndexingState enum (separate from "failed")
ALTER TYPE "DocumentIndexingState" ADD VALUE IF NOT EXISTS 'skipped';
```

**Step 2: Update schema.prisma**

Remove these indexes from Document model:
```
@@index([userId])          -- subsumed by [userId, status], [userId, createdAt], etc.
@@index([status])          -- subsumed by [userId, status], [folderId, status]
@@index([folderId])        -- subsumed by [folderId, status]
@@index([language])        -- subsumed by [userId, language]
@@index([sweepResetCount]) -- low cardinality, nearly useless
```

Change `chunksCount` from `Int?` to `Int`:
```prisma
chunksCount                Int                        @default(0)
```

Add `deleted` to DocumentStatus enum:
```prisma
enum DocumentStatus {
  uploading
  uploaded
  available
  enriching
  indexed
  ready
  failed
  skipped
  completed
  deleted
}
```

Add `skipped` to DocumentIndexingState:
```prisma
enum DocumentIndexingState {
  pending
  running
  indexed
  failed
  skipped
}
```

**Step 3: Run migration**

Run: `cd backend && npx prisma migrate dev --name schema_cleanup`
Expected: Indexes dropped, column altered, enums updated

**Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260305000500_schema_cleanup/
git commit -m "schema: prune 5 redundant indexes, fix nullable chunksCount, add deleted/skipped states"
```

---

### Task 7: Generate Prisma Client + Verify

**Step 1: Regenerate Prisma client**

Run: `cd backend && npx prisma generate`
Expected: Client generated successfully

**Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -50`
Expected: Compilation errors related to DocumentEmbedding references (expected — these will be fixed in Phase 3)

**Step 3: Commit**

```bash
git add backend/prisma/
git commit -m "chore: regenerate Prisma client after schema migrations"
```

---

## Acceptance Criteria

- [ ] `Document` model has `isDeleted` + `deletedAt` fields
- [ ] `parentVersionId` has `onDelete: SetNull` + self-reference CHECK constraint
- [ ] `DocumentEmbedding` table is dropped; all needed fields migrated to `DocumentChunk`
- [ ] `DocumentAmendment`, `DocumentAttachment`, `RelatedDocument` tables exist with proper FKs and unique constraints
- [ ] `DocumentAuditEvent` table exists (no FK to documents — survives deletion)
- [ ] `DocumentStatus` enum has `deleted` value
- [ ] `DocumentIndexingState` enum has `skipped` value
- [ ] 5 redundant indexes removed from `documents` table
- [ ] `chunksCount` is non-nullable
- [ ] All migrations apply cleanly on a fresh database
- [ ] `npx prisma generate` succeeds
