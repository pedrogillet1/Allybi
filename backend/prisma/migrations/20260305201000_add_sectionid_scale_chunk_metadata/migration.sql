-- Add canonical section identity + scale metadata for precise retrieval citations.
ALTER TABLE "document_chunks"
ADD COLUMN IF NOT EXISTS "section_id" TEXT,
ADD COLUMN IF NOT EXISTS "scale_raw" TEXT,
ADD COLUMN IF NOT EXISTS "scale_multiplier" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "document_chunks_documentId_section_id_idx"
ON "document_chunks"("documentId", "section_id");
