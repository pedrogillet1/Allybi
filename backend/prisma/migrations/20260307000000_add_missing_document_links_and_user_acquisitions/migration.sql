-- Backfill schema tables that exist in schema.prisma but were never introduced via migrations.

CREATE TABLE IF NOT EXISTS "document_links" (
  "id" TEXT NOT NULL,
  "source_document_id" TEXT NOT NULL,
  "target_document_id" TEXT NOT NULL,
  "relationship_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_links_source_document_id_target_document_id_relationship_type_key"
  ON "document_links"("source_document_id", "target_document_id", "relationship_type");

CREATE INDEX IF NOT EXISTS "document_links_source_document_id_idx"
  ON "document_links"("source_document_id");

CREATE INDEX IF NOT EXISTS "document_links_target_document_id_idx"
  ON "document_links"("target_document_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_links_source_document_id_fkey'
  ) THEN
    ALTER TABLE "document_links"
      ADD CONSTRAINT "document_links_source_document_id_fkey"
      FOREIGN KEY ("source_document_id")
      REFERENCES "documents"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_links_target_document_id_fkey'
  ) THEN
    ALTER TABLE "document_links"
      ADD CONSTRAINT "document_links_target_document_id_fkey"
      FOREIGN KEY ("target_document_id")
      REFERENCES "documents"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user_acquisitions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" VARCHAR(50) NOT NULL,
  "campaign" VARCHAR(100),
  "medium" VARCHAR(50),
  "referrerUrl" VARCHAR(500),
  "landingPage" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_acquisitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_acquisitions_userId_key"
  ON "user_acquisitions"("userId");

CREATE INDEX IF NOT EXISTS "user_acquisitions_source_idx"
  ON "user_acquisitions"("source");

CREATE INDEX IF NOT EXISTS "user_acquisitions_createdAt_idx"
  ON "user_acquisitions"("createdAt");
