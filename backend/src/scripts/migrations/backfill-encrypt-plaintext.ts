/**
 * Backfill: encrypt existing plaintext fields in DocumentEmbedding.
 *
 * Prerequisites:
 * 1. Run 001-add-encrypted-columns.sql against the database first.
 * 2. Set KODA_MASTER_KEY_BASE64 in the environment.
 *
 * Run manually:
 *   npx ts-node src/scripts/migrations/backfill-encrypt-plaintext.ts
 *
 * This script:
 * - Reads DocumentEmbedding rows that have plaintext `content` but no `contentEncrypted`
 * - Encrypts the content/chunkText using FieldEncryptionService
 * - Writes the encrypted values and nulls out the plaintext
 * - Processes in batches to limit memory usage
 */

import prisma from "../../config/database";
import { getFieldEncryption } from "../../services/security/fieldEncryption.service";

interface EmbeddingRow {
  id: string;
  content: string;
  chunk_text: string | null;
  user_id: string | null;
  contentEncrypted: string | null;
}

async function main() {
  const fe = getFieldEncryption();
  const batchSize = 100;
  let processed = 0;
  let offset = 0;

  console.log("[backfill] Starting encryption backfill for DocumentEmbedding...");

  while (true) {
    // Use raw query because contentEncrypted is not in the Prisma schema
    const batch: EmbeddingRow[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "content", "chunk_text", "user_id", "contentEncrypted"
       FROM "document_embeddings"
       WHERE "content" IS NOT NULL
         AND "content" != ''
         AND "contentEncrypted" IS NULL
       ORDER BY "id"
       LIMIT $1 OFFSET $2`,
      batchSize,
      offset,
    );

    if (batch.length === 0) break;

    for (const rec of batch) {
      const userId = rec.user_id || "unknown";

      const encContent = fe.encryptField(rec.content, {
        userId,
        entityId: rec.id,
        field: "content",
      });

      const encChunkText = rec.chunk_text
        ? fe.encryptField(rec.chunk_text, {
            userId,
            entityId: rec.id,
            field: "chunkText",
          })
        : null;

      await prisma.$executeRawUnsafe(
        `UPDATE "document_embeddings"
         SET "contentEncrypted" = $1,
             "content" = '',
             "chunkTextEncrypted" = $2,
             "chunk_text" = NULL
         WHERE "id" = $3`,
        encContent,
        encChunkText,
        rec.id,
      );

      processed++;
    }

    offset += batchSize;
    console.log(`[backfill] Processed ${processed} embeddings...`);
  }

  console.log(`[backfill] Done. Total processed: ${processed}`);
}

main()
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
