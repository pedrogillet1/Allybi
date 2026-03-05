-- Store full chunk metadata envelope encrypted at rest.
ALTER TABLE "document_chunks"
ADD COLUMN IF NOT EXISTS "metadata_encrypted" TEXT;
