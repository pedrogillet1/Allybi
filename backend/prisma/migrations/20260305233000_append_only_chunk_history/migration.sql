ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "indexing_operation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "document_chunks" dc
SET "indexing_operation_id" = COALESCE(
  dc."indexing_operation_id",
  d."indexing_operation_id",
  CONCAT('legacy_', dc."documentId")
)
FROM "documents" d
WHERE d."id" = dc."documentId"
  AND dc."indexing_operation_id" IS NULL;

DROP INDEX IF EXISTS "document_chunks_documentId_chunkIndex_key";

CREATE UNIQUE INDEX IF NOT EXISTS "document_chunks_documentId_indexing_operation_id_chunkIndex_key"
  ON "document_chunks"("documentId", "indexing_operation_id", "chunkIndex");

CREATE INDEX IF NOT EXISTS "document_chunks_documentId_is_active_idx"
  ON "document_chunks"("documentId", "is_active");

CREATE INDEX IF NOT EXISTS "document_chunks_documentId_indexing_operation_id_idx"
  ON "document_chunks"("documentId", "indexing_operation_id");

CREATE INDEX IF NOT EXISTS "document_chunks_documentId_is_active_chunkIndex_idx"
  ON "document_chunks"("documentId", "is_active", "chunkIndex");
