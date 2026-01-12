-- Migration: Add fileCount to User model
-- Purpose: Track the number of files per user for beta storage limits
-- Beta limits: 10 GB storage, 5,000 files, 100 MB max file size

-- Add fileCount column to users table with default value of 0
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fileCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill fileCount for existing users based on actual document count
UPDATE "users"
SET "fileCount" = (
    SELECT COUNT(*)
    FROM "documents"
    WHERE "documents"."userId" = "users"."id"
);

-- Create index for performance on fileCount queries
CREATE INDEX IF NOT EXISTS "users_fileCount_idx" ON "users"("fileCount");

-- Verification query (run manually to check):
-- SELECT id, email, "storageUsedBytes", "fileCount" FROM "users" LIMIT 10;
