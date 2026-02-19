import cron from "node-cron";
import prisma from "../config/database";
import { Pinecone } from "@pinecone-database/pinecone";
import { UPLOAD_CONFIG } from "../config/upload.config";

/**
 * Orphan Cleanup Scheduler
 *
 * Automatically detects and cleans up orphaned data in:
 * 1. Pinecone vectors (documents deleted but vectors remain)
 * 2. Cloud storage files (documents deleted but files remain)
 * 3. PostgreSQL embeddings (documents deleted but embeddings remain via cascade failure)
 * 4. Stale upload sessions (documents stuck in 'uploading' status for too long)
 *
 * Runs weekly on Sundays at 3:00 AM to minimize impact on production
 * Stale upload cleanup runs daily at 4:00 AM
 */

interface CleanupReport {
  timestamp: Date;
  pinecone: {
    orphanedVectors: number;
    deletedVectors: number;
    errors: string[];
  };
  storage: {
    orphanedFiles: number;
    deletedFiles: number;
    errors: string[];
  };
  embeddings: {
    orphanedEmbeddings: number;
    deletedEmbeddings: number;
    errors: string[];
  };
  staleUploads: {
    foundStale: number;
    markedFailed: number;
    errors: string[];
  };
}

/**
 * Clean orphaned Pinecone vectors
 * Finds vectors where documentId doesn't exist in the database
 */
async function cleanOrphanedPineconeVectors(): Promise<
  CleanupReport["pinecone"]
> {
  const result = {
    orphanedVectors: 0,
    deletedVectors: 0,
    errors: [] as string[],
  };

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    console.log(
      "⚠️ [OrphanCleanup] Pinecone not configured, skipping vector cleanup",
    );
    return result;
  }

  try {
    console.log("🔍 [OrphanCleanup] Scanning Pinecone for orphaned vectors...");

    const pinecone = new Pinecone({ apiKey });
    const indexName = process.env.PINECONE_INDEX_NAME || "koda-openai";
    const index = pinecone.index(indexName);

    // Get all valid document IDs from database
    const validDocs = await prisma.document.findMany({
      select: { id: true },
    });
    const validDocIds = new Set(validDocs.map((d) => d.id));

    console.log(
      `📊 [OrphanCleanup] Found ${validDocIds.size} valid documents in database`,
    );

    // Query Pinecone for vectors (sample up to 10000)
    const dummyVector = new Array(1536).fill(0); // OpenAI dimensions
    const queryResponse = await index.query({
      vector: dummyVector,
      topK: 10000,
      includeMetadata: true,
    });

    // Find orphaned vectors
    const orphanedVectorIds: string[] = [];
    const orphanedDocIds = new Set<string>();

    for (const match of queryResponse.matches || []) {
      const docId = match.metadata?.documentId as string;
      if (docId && !validDocIds.has(docId)) {
        orphanedVectorIds.push(match.id);
        orphanedDocIds.add(docId);
      }
    }

    result.orphanedVectors = orphanedVectorIds.length;

    if (orphanedVectorIds.length > 0) {
      console.log(
        `⚠️ [OrphanCleanup] Found ${orphanedVectorIds.length} orphaned vectors from ${orphanedDocIds.size} deleted documents`,
      );

      // Delete in batches of 1000 (Pinecone limit)
      const BATCH_SIZE = 1000;
      for (let i = 0; i < orphanedVectorIds.length; i += BATCH_SIZE) {
        const batch = orphanedVectorIds.slice(
          i,
          Math.min(i + BATCH_SIZE, orphanedVectorIds.length),
        );
        try {
          await index.deleteMany(batch);
          result.deletedVectors += batch.length;
          console.log(
            `  ✅ Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} vectors`,
          );
        } catch (error: any) {
          result.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`,
          );
          console.error(`  ❌ Batch delete failed: ${error.message}`);
        }
      }
    } else {
      console.log("✅ [OrphanCleanup] No orphaned Pinecone vectors found");
    }
  } catch (error: any) {
    result.errors.push(`Pinecone cleanup failed: ${error.message}`);
    console.error("❌ [OrphanCleanup] Pinecone cleanup error:", error.message);
  }

  return result;
}

/**
 * Clean orphaned storage files
 * NOTE: File listing is not implemented in the current storage abstraction.
 * The deletion flow now properly deletes uploaded files during document/folder deletion,
 * so orphaned files should be rare. Implement listing only if historical orphan cleanup is required.
 */
async function cleanOrphanedStorageFiles(): Promise<CleanupReport["storage"]> {
  const result = {
    orphanedFiles: 0,
    deletedFiles: 0,
    errors: [] as string[],
  };

  // Storage file listing not implemented in current storage abstraction.
  // The critical fix is that document/folder deletion now properly deletes uploaded files.
  console.log(
    "ℹ️ [OrphanCleanup] Cloud storage file listing not implemented - skipping storage cleanup",
  );
  console.log(
    "   Note: Document/folder deletion now properly cleans up uploaded files",
  );

  return result;
}

/**
 * Clean orphaned PostgreSQL embeddings
 * This should rarely be needed due to cascade deletes, but handles edge cases
 */
async function cleanOrphanedEmbeddings(): Promise<CleanupReport["embeddings"]> {
  const result = {
    orphanedEmbeddings: 0,
    deletedEmbeddings: 0,
    errors: [] as string[],
  };

  try {
    console.log(
      "🔍 [OrphanCleanup] Scanning PostgreSQL for orphaned embeddings...",
    );

    // Find embeddings where documentId doesn't exist in documents table
    // Using raw SQL for efficiency with large tables
    const orphanedCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM document_embeddings de
      LEFT JOIN documents d ON de."documentId" = d.id
      WHERE d.id IS NULL
    `;

    const count = Number(orphanedCount[0]?.count || 0);
    result.orphanedEmbeddings = count;

    if (count > 0) {
      console.log(
        `⚠️ [OrphanCleanup] Found ${count} orphaned embeddings in PostgreSQL`,
      );

      // Delete orphaned embeddings
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM document_embeddings
        WHERE "documentId" NOT IN (SELECT id FROM documents)
      `;

      result.deletedEmbeddings = deleteResult;
      console.log(`  ✅ Deleted ${deleteResult} orphaned embeddings`);
    } else {
      console.log("✅ [OrphanCleanup] No orphaned PostgreSQL embeddings found");
    }
  } catch (error: any) {
    result.errors.push(`Embeddings cleanup failed: ${error.message}`);
    console.error(
      "❌ [OrphanCleanup] Embeddings cleanup error:",
      error.message,
    );
  }

  return result;
}

/**
 * Clean stale upload sessions
 * Finds documents stuck in 'uploading' status for longer than UPLOAD_SESSION_EXPIRATION_HOURS
 * Marks them as 'failed_timeout' so users know the upload didn't complete
 */
async function cleanStaleUploads(): Promise<CleanupReport["staleUploads"]> {
  const result = {
    foundStale: 0,
    markedFailed: 0,
    errors: [] as string[],
  };

  try {
    console.log("🔍 [OrphanCleanup] Scanning for stale upload sessions...");

    const expirationHours = UPLOAD_CONFIG.UPLOAD_SESSION_EXPIRATION_HOURS;
    const cutoffDate = new Date(Date.now() - expirationHours * 60 * 60 * 1000);

    // Find documents stuck in 'uploading' status past the expiration threshold
    const staleUploads = await prisma.document.findMany({
      where: {
        status: "uploading",
        createdAt: {
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        filename: true,
        createdAt: true,
        userId: true,
      },
    });

    result.foundStale = staleUploads.length;

    if (staleUploads.length > 0) {
      console.log(
        `⚠️ [OrphanCleanup] Found ${staleUploads.length} stale uploads older than ${expirationHours}h`,
      );

      // Log details for debugging
      for (const doc of staleUploads.slice(0, 10)) {
        const age = Math.round(
          (Date.now() - doc.createdAt.getTime()) / (1000 * 60 * 60),
        );
        console.log(
          `   - ${doc.filename} (${doc.id.slice(0, 8)}...) - ${age}h old`,
        );
      }
      if (staleUploads.length > 10) {
        console.log(`   ... and ${staleUploads.length - 10} more`);
      }

      // Update status to 'failed_timeout' in batches for safety
      const BATCH_SIZE = 100;
      const staleIds = staleUploads.map((d) => d.id);

      for (let i = 0; i < staleIds.length; i += BATCH_SIZE) {
        const batch = staleIds.slice(
          i,
          Math.min(i + BATCH_SIZE, staleIds.length),
        );
        try {
          const updateResult = await prisma.document.updateMany({
            where: {
              id: { in: batch },
              status: "uploading", // Double-check status hasn't changed
            },
            data: {
              status: "failed",
              // Store timeout info in metadata if the field exists
              updatedAt: new Date(),
            },
          });
          result.markedFailed += updateResult.count;
          console.log(
            `  ✅ Marked batch ${Math.floor(i / BATCH_SIZE) + 1}: ${updateResult.count} uploads as failed`,
          );
        } catch (error: any) {
          result.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`,
          );
          console.error(`  ❌ Batch update failed: ${error.message}`);
        }
      }

      console.log(
        `✅ [OrphanCleanup] Marked ${result.markedFailed}/${result.foundStale} stale uploads as failed`,
      );
    } else {
      console.log("✅ [OrphanCleanup] No stale upload sessions found");
    }
  } catch (error: any) {
    result.errors.push(`Stale upload cleanup failed: ${error.message}`);
    console.error(
      "❌ [OrphanCleanup] Stale upload cleanup error:",
      error.message,
    );
  }

  return result;
}

/**
 * Run stale upload cleanup only (runs daily)
 */
export async function runStaleUploadCleanup(): Promise<
  CleanupReport["staleUploads"]
> {
  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("🧹 [OrphanCleanup] Starting stale upload cleanup...");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const result = await cleanStaleUploads();

  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("📊 [OrphanCleanup] STALE UPLOAD CLEANUP REPORT");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`  - Found stale: ${result.foundStale}`);
  console.log(`  - Marked failed: ${result.markedFailed}`);
  console.log(`  - Errors: ${result.errors.length}`);
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  return result;
}

/**
 * Run full orphan cleanup
 * Cleans all external storage systems
 */
export async function runOrphanCleanup(): Promise<CleanupReport> {
  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("🧹 [OrphanCleanup] Starting automated orphan cleanup...");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const startTime = Date.now();

  const report: CleanupReport = {
    timestamp: new Date(),
    pinecone: await cleanOrphanedPineconeVectors(),
    storage: await cleanOrphanedStorageFiles(),
    embeddings: await cleanOrphanedEmbeddings(),
    staleUploads: await cleanStaleUploads(),
  };

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    "\n═══════════════════════════════════════════════════════════════",
  );
  console.log("📊 [OrphanCleanup] CLEANUP REPORT");
  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Duration: ${duration}s`);
  console.log("");
  console.log("Pinecone Vectors:");
  console.log(`  - Orphaned: ${report.pinecone.orphanedVectors}`);
  console.log(`  - Deleted: ${report.pinecone.deletedVectors}`);
  console.log(`  - Errors: ${report.pinecone.errors.length}`);
  console.log("");
  console.log("Storage Files:");
  console.log(`  - Orphaned: ${report.storage.orphanedFiles}`);
  console.log(`  - Deleted: ${report.storage.deletedFiles}`);
  console.log(`  - Errors: ${report.storage.errors.length}`);
  console.log("");
  console.log("PostgreSQL Embeddings:");
  console.log(`  - Orphaned: ${report.embeddings.orphanedEmbeddings}`);
  console.log(`  - Deleted: ${report.embeddings.deletedEmbeddings}`);
  console.log(`  - Errors: ${report.embeddings.errors.length}`);
  console.log("");
  console.log("Stale Uploads:");
  console.log(`  - Found stale: ${report.staleUploads.foundStale}`);
  console.log(`  - Marked failed: ${report.staleUploads.markedFailed}`);
  console.log(`  - Errors: ${report.staleUploads.errors.length}`);
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  // Log any errors
  const allErrors = [
    ...report.pinecone.errors,
    ...report.storage.errors,
    ...report.embeddings.errors,
    ...report.staleUploads.errors,
  ];

  if (allErrors.length > 0) {
    console.warn("⚠️ [OrphanCleanup] Errors encountered during cleanup:");
    allErrors.forEach((err, i) => console.warn(`  ${i + 1}. ${err}`));
  }

  return report;
}

/**
 * Initialize orphan cleanup scheduler
 * - Full cleanup: Runs every Sunday at 3:00 AM
 * - Stale upload cleanup: Runs daily at 4:00 AM
 */
export function startOrphanCleanupScheduler() {
  // Run full cleanup every Sunday at 3:00 AM (server time)
  cron.schedule("0 3 * * 0", async () => {
    console.log("🔔 [OrphanCleanup] Running scheduled weekly full cleanup...");
    await runOrphanCleanup();
  });

  // Run stale upload cleanup daily at 4:00 AM (server time)
  cron.schedule("0 4 * * *", async () => {
    console.log(
      "🔔 [OrphanCleanup] Running scheduled daily stale upload cleanup...",
    );
    await runStaleUploadCleanup();
  });

  console.log("✅ Orphan cleanup scheduler started:");
  console.log("   - Full cleanup: Sundays at 3:00 AM");
  console.log("   - Stale uploads: Daily at 4:00 AM");
}

/**
 * Run cleanup manually (for testing or immediate cleanup)
 */
export async function runManualCleanup(): Promise<CleanupReport> {
  console.log("🧹 [OrphanCleanup] Running manual cleanup...");
  return await runOrphanCleanup();
}
