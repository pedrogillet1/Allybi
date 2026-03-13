/**
 * Backfill: encrypt existing plaintext fields in DocumentEmbedding.
 *
 * Prerequisites:
 * 1. Run 001-add-encrypted-columns.sql against the database first.
 * 2. Set KODA_MASTER_KEY_BASE64 in the environment.
 *
 * Run manually:
 *   npx ts-node scripts/security/backfill-encrypt-plaintext.ts
 *
 * This script:
 * - Reads DocumentEmbedding rows that have plaintext `content` but no `contentEncrypted`
 * - Encrypts the content/chunkText using FieldEncryptionService
 * - Writes the encrypted values and nulls out the plaintext
 * - Processes in batches to limit memory usage
 */

import prisma from "../../src/config/database";
import { getFieldEncryption } from "../../src/services/security/fieldEncryption.service";

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

  // Phase 2: Encrypt DocumentMetadata fields
  console.log("\n--- Phase 2: DocumentMetadata ---");
  let metaOffset = 0;
  let metaProcessed = 0;

  interface MetadataRow {
    id: string;
    documentId: string;
    summary: string | null;
    markdownContent: string | null;
    slidesData: string | null;
    pptxMetadata: string | null;
  }

  while (true) {
    const batch: MetadataRow[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "documentId", "summary", "markdownContent", "slidesData", "pptxMetadata"
       FROM "document_metadata"
       WHERE "summary" IS NOT NULL
         AND "summaryEncrypted" IS NULL
       ORDER BY "id"
       LIMIT $1 OFFSET $2`,
      batchSize,
      metaOffset,
    );

    if (batch.length === 0) break;

    for (const rec of batch) {
      const setClauses: string[] = [];
      const params: (string | null)[] = [];
      let paramIdx = 1;

      for (const field of ["summary", "markdownContent", "slidesData", "pptxMetadata"] as const) {
        const value = rec[field];
        if (value && typeof value === "string") {
          const enc = fe.encryptField(value, {
            userId: "backfill",
            entityId: rec.id,
            field,
          });
          const encCol = `${field}Encrypted`;
          setClauses.push(`"${encCol}" = $${paramIdx}`);
          params.push(enc);
          paramIdx++;
          setClauses.push(`"${field}" = NULL`);
        }
      }

      if (setClauses.length > 0) {
        params.push(rec.id);
        await prisma.$executeRawUnsafe(
          `UPDATE "document_metadata"
           SET ${setClauses.join(", ")}
           WHERE "id" = $${paramIdx}`,
          ...params,
        );
        metaProcessed++;
      }
    }

    metaOffset += batchSize;
    console.log(`[backfill] Metadata: ${metaProcessed} processed...`);
  }

  console.log(`[backfill] Metadata done. Total: ${metaProcessed}`);
}

main()
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
