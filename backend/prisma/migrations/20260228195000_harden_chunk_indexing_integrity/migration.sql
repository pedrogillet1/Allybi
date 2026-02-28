-- Harden chunk/index integrity: deterministic dedupe + indexing state + uniqueness

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "indexing_state" TEXT,
  ADD COLUMN IF NOT EXISTS "indexing_operation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "indexing_error" TEXT,
  ADD COLUMN IF NOT EXISTS "indexing_updated_at" TIMESTAMP(3);

UPDATE "documents"
SET
  "indexing_state" = CASE
    WHEN "status" IN ('indexed', 'ready', 'available', 'completed') THEN 'indexed'
    WHEN "status" IN ('failed', 'error') THEN 'failed'
    WHEN "status" IN ('enriching', 'processing', 'indexing') THEN 'running'
    ELSE 'pending'
  END,
  "indexing_error" = CASE
    WHEN "status" IN ('failed', 'error') THEN COALESCE("error", 'indexing_failed')
    ELSE NULL
  END,
  "indexing_updated_at" = COALESCE("indexing_updated_at", NOW())
WHERE "indexing_state" IS NULL;

-- Keep newest row for duplicate chunk indexes.
WITH ranked_chunks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "documentId", "chunkIndex"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
    ) AS rn
  FROM "document_chunks"
)
DELETE FROM "document_chunks" dc
USING ranked_chunks rc
WHERE dc.id = rc.id
  AND rc.rn > 1;

-- Keep newest row for duplicate embedding chunk indexes.
WITH ranked_embeddings AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "documentId", "chunkIndex"
      ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC, id DESC
    ) AS rn
  FROM "document_embeddings"
)
DELETE FROM "document_embeddings" de
USING ranked_embeddings re
WHERE de.id = re.id
  AND re.rn > 1;

DROP INDEX IF EXISTS "document_chunks_documentId_chunkIndex_idx";
DROP INDEX IF EXISTS "document_embeddings_documentId_chunkIndex_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "document_chunks_documentId_chunkIndex_key"
  ON "document_chunks"("documentId", "chunkIndex");

CREATE UNIQUE INDEX IF NOT EXISTS "document_embeddings_documentId_chunkIndex_key"
  ON "document_embeddings"("documentId", "chunkIndex");

CREATE INDEX IF NOT EXISTS "documents_indexing_state_idx"
  ON "documents"("indexing_state");

CREATE INDEX IF NOT EXISTS "documents_userId_indexing_state_idx"
  ON "documents"("userId", "indexing_state");
