-- 001-add-encrypted-columns.sql
--
-- Add encrypted counterpart columns to DocumentEmbedding and DocumentMetadata.
-- Run manually against the production database before enabling KODA_ENCRYPT_FIELDS=true.
--
-- These columns store JSON-serialized AES-256-GCM encrypted payloads.
-- Once the backfill is complete the corresponding plaintext columns can be nulled.

-- DocumentEmbedding encrypted counterparts
ALTER TABLE "DocumentEmbedding" ADD COLUMN IF NOT EXISTS "contentEncrypted" TEXT;
ALTER TABLE "DocumentEmbedding" ADD COLUMN IF NOT EXISTS "chunkTextEncrypted" TEXT;
ALTER TABLE "DocumentEmbedding" ADD COLUMN IF NOT EXISTS "microSummaryEncrypted" TEXT;

-- DocumentMetadata encrypted counterparts
ALTER TABLE "DocumentMetadata" ADD COLUMN IF NOT EXISTS "summaryEncrypted" TEXT;
ALTER TABLE "DocumentMetadata" ADD COLUMN IF NOT EXISTS "markdownContentEncrypted" TEXT;
ALTER TABLE "DocumentMetadata" ADD COLUMN IF NOT EXISTS "slidesDataEncrypted" TEXT;
ALTER TABLE "DocumentMetadata" ADD COLUMN IF NOT EXISTS "pptxMetadataEncrypted" TEXT;
