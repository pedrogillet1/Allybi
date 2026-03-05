-- Remove unmanaged legacy fileCount drift introduced outside Prisma migration folders.
DROP INDEX IF EXISTS "users_fileCount_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "fileCount";
