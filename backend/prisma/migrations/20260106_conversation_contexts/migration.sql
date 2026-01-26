-- CreateTable: conversation_contexts
-- Single source of truth for conversation state

CREATE TABLE IF NOT EXISTS "conversation_contexts" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    -- File reference tracking (for "it", "that one", "the other one")
    "lastReferencedFileId" TEXT,
    "lastReferencedFileName" TEXT,
    "last2ReferencedFileIds" TEXT NOT NULL DEFAULT '[]',

    -- Document state tracking
    "workspaceDocCount" INTEGER NOT NULL DEFAULT 0,
    "workspaceDocVersion" TEXT NOT NULL DEFAULT '',

    -- Message tracking
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Timestamps
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_contexts_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on conversationId
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_contexts_conversationId_key" ON "conversation_contexts"("conversationId");

-- Index for userId lookups
CREATE INDEX IF NOT EXISTS "conversation_contexts_userId_idx" ON "conversation_contexts"("userId");

-- Index for lastMessageAt (for cleanup queries)
CREATE INDEX IF NOT EXISTS "conversation_contexts_lastMessageAt_idx" ON "conversation_contexts"("lastMessageAt");

-- Verify documents table has required metadata fields
-- These are needed for metadata queries (largest file, folder path, etc.)

-- Add size column if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'size'
    ) THEN
        ALTER TABLE "documents" ADD COLUMN "size" INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add folderId column if missing (for folder path)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'folderId'
    ) THEN
        ALTER TABLE "documents" ADD COLUMN "folderId" TEXT;
    END IF;
END $$;

-- Add extension column if missing (for type filtering)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'extension'
    ) THEN
        ALTER TABLE "documents" ADD COLUMN "extension" TEXT;
        -- Populate from filename
        UPDATE "documents" SET "extension" = LOWER(SUBSTRING("filename" FROM '\.([^.]+)$'));
    END IF;
END $$;

-- Ensure mimeType exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'mimeType'
    ) THEN
        ALTER TABLE "documents" ADD COLUMN "mimeType" TEXT DEFAULT 'application/octet-stream';
    END IF;
END $$;

-- Create index on documents for common queries
CREATE INDEX IF NOT EXISTS "documents_userId_status_idx" ON "documents"("userId", "status");
CREATE INDEX IF NOT EXISTS "documents_userId_mimeType_idx" ON "documents"("userId", "mimeType");
CREATE INDEX IF NOT EXISTS "documents_userId_size_idx" ON "documents"("userId", "size" DESC);
CREATE INDEX IF NOT EXISTS "documents_folderId_idx" ON "documents"("folderId");
