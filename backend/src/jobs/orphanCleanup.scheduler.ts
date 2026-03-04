import cron from "node-cron";
import prisma from "../config/database";
import { Pinecone } from "@pinecone-database/pinecone";
import { UPLOAD_CONFIG } from "../config/upload.config";
import { logger } from "../utils/logger";
import { GcsStorageService } from "../services/retrieval/gcsStorage.service";

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
    logger.warn("[OrphanCleanup] Pinecone not configured, skipping vector cleanup");
    return result;
  }

  try {
    logger.info("[OrphanCleanup] Scanning Pinecone for orphaned vectors");

    const pinecone = new Pinecone({ apiKey });
    const indexName = process.env.PINECONE_INDEX_NAME || "koda-openai";
    const index = pinecone.index(indexName);

    // Get all valid document IDs from database
    const validDocs = await prisma.document.findMany({
      select: { id: true },
    });
    const validDocIds = new Set(validDocs.map((d) => d.id));

    logger.info("[OrphanCleanup] Valid documents in database", {
      count: validDocIds.size,
    });

    // Enumerate ALL vector IDs via listPaginated (no 10k cap)
    const orphanedVectorIds: string[] = [];
    const orphanedDocIds = new Set<string>();

    try {
      let paginationToken: string | undefined;
      do {
        const page = await index.listPaginated(
          paginationToken ? { paginationToken } : {},
        );
        for (const vec of page.vectors || []) {
          if (!vec.id) continue;
          const docId = vec.id.split("#")[0];
          if (docId && !validDocIds.has(docId)) {
            orphanedVectorIds.push(vec.id);
            orphanedDocIds.add(docId);
          }
        }
        paginationToken = page.pagination?.next;
      } while (paginationToken);
    } catch (listErr: any) {
      // Fallback to zero-vector query for pod-based indexes without listPaginated
      logger.warn("[OrphanCleanup] listPaginated failed, falling back to zero-vector query", {
        error: listErr.message,
      });
      const dummyVector = new Array(1536).fill(0);
      const queryResponse = await index.query({
        vector: dummyVector,
        topK: 10000,
        includeMetadata: true,
      });
      for (const match of queryResponse.matches || []) {
        const docId = match.metadata?.documentId as string;
        if (docId && !validDocIds.has(docId)) {
          orphanedVectorIds.push(match.id);
          orphanedDocIds.add(docId);
        }
      }
    }

    result.orphanedVectors = orphanedVectorIds.length;

    if (orphanedVectorIds.length > 0) {
      logger.warn("[OrphanCleanup] Found orphaned vectors", {
        orphanedVectors: orphanedVectorIds.length,
        orphanedDocuments: orphanedDocIds.size,
      });

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
          logger.info("[OrphanCleanup] Deleted vector batch", {
            batch: Math.floor(i / BATCH_SIZE) + 1,
            count: batch.length,
          });
        } catch (error: any) {
          result.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`,
          );
          logger.error("[OrphanCleanup] Batch delete failed", {
            batch: Math.floor(i / BATCH_SIZE) + 1,
            error: error.message,
          });
        }
      }
    } else {
      logger.info("[OrphanCleanup] No orphaned Pinecone vectors found");
    }
  } catch (error: any) {
    result.errors.push(`Pinecone cleanup failed: ${error.message}`);
    logger.error("[OrphanCleanup] Pinecone cleanup error", {
      error: error.message,
    });
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

  const dryRun = process.env.ORPHAN_CLEANUP_DRY_RUN === "true";
  const MAX_DELETES_PER_RUN = 500;
  const MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  if (!process.env.GCS_BUCKET_NAME) {
    logger.info("[OrphanCleanup] GCS not configured, skipping storage cleanup");
    return result;
  }

  try {
    logger.info("[OrphanCleanup] Scanning GCS for orphaned files", { dryRun });

    const gcs = new GcsStorageService();

    // Get all valid encryptedFilenames from the database
    const validDocs = await prisma.document.findMany({
      select: { encryptedFilename: true },
    });
    const validFilenames = new Set(validDocs.map((d) => d.encryptedFilename));

    const orphanedFiles: string[] = [];
    let pageToken: string | undefined;
    const now = Date.now();

    // Paginate through all GCS files
    do {
      const page = await gcs.listFiles({ maxResults: 1000, pageToken });
      for (const file of page.files) {
        // Skip files younger than 24 hours (may be in-flight uploads)
        if (file.updated && now - file.updated.getTime() < MIN_AGE_MS) {
          continue;
        }
        if (!validFilenames.has(file.name)) {
          orphanedFiles.push(file.name);
        }
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    result.orphanedFiles = orphanedFiles.length;

    if (orphanedFiles.length > 0) {
      logger.warn("[OrphanCleanup] Found orphaned GCS files", {
        count: orphanedFiles.length,
        dryRun,
      });

      if (!dryRun) {
        const toDelete = orphanedFiles.slice(0, MAX_DELETES_PER_RUN);
        for (const filename of toDelete) {
          try {
            await gcs.deleteFile({ key: filename });
            result.deletedFiles++;
          } catch (err: any) {
            result.errors.push(`Delete ${filename}: ${err.message}`);
          }
        }
        if (orphanedFiles.length > MAX_DELETES_PER_RUN) {
          logger.info("[OrphanCleanup] Capped at max deletes per run", {
            remaining: orphanedFiles.length - MAX_DELETES_PER_RUN,
          });
        }
      }
    } else {
      logger.info("[OrphanCleanup] No orphaned GCS files found");
    }
  } catch (error: any) {
    result.errors.push(`Storage cleanup failed: ${error.message}`);
    logger.error("[OrphanCleanup] Storage cleanup error", {
      error: error.message,
    });
  }

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
    logger.info("[OrphanCleanup] Scanning PostgreSQL for orphaned embeddings");

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
      logger.warn("[OrphanCleanup] Found orphaned embeddings in PostgreSQL", {
        count,
      });

      // Delete orphaned embeddings
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM document_embeddings
        WHERE "documentId" NOT IN (SELECT id FROM documents)
      `;

      result.deletedEmbeddings = deleteResult;
      logger.info("[OrphanCleanup] Deleted orphaned embeddings", {
        deleted: deleteResult,
      });
    } else {
      logger.info("[OrphanCleanup] No orphaned PostgreSQL embeddings found");
    }
  } catch (error: any) {
    result.errors.push(`Embeddings cleanup failed: ${error.message}`);
    logger.error("[OrphanCleanup] Embeddings cleanup error", {
      error: error.message,
    });
  }

  return result;
}

/**
 * Clean stale upload sessions AND stuck enriching documents.
 * - Uploads stuck in 'uploading' for > UPLOAD_SESSION_EXPIRATION_HOURS
 * - Documents stuck in 'enriching' for > 30 minutes (worker crash recovery)
 */
async function cleanStaleUploads(): Promise<CleanupReport["staleUploads"]> {
  const result = {
    foundStale: 0,
    markedFailed: 0,
    errors: [] as string[],
  };

  try {
    logger.info("[OrphanCleanup] Scanning for stale uploads and stuck enriching docs");

    const expirationHours = UPLOAD_CONFIG.UPLOAD_SESSION_EXPIRATION_HOURS;
    const uploadCutoff = new Date(Date.now() - expirationHours * 60 * 60 * 1000);
    const enrichingCutoffMs = parseInt(process.env.ENRICHING_STALE_TIMEOUT_MS || "1800000", 10); // 30 min
    const enrichingCutoff = new Date(Date.now() - enrichingCutoffMs);

    // Find documents stuck in 'uploading' OR 'enriching' past their thresholds
    const staleUploads = await prisma.document.findMany({
      where: {
        OR: [
          { status: "uploading", createdAt: { lt: uploadCutoff } },
          { status: "enriching", updatedAt: { lt: enrichingCutoff } },
        ],
      },
      select: {
        id: true,
        filename: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
      },
    });

    result.foundStale = staleUploads.length;

    if (staleUploads.length > 0) {
      logger.warn("[OrphanCleanup] Found stale uploads", {
        count: staleUploads.length,
        expirationHours,
      });

      // Log details for debugging
      for (const doc of staleUploads.slice(0, 10)) {
        const age = Math.round(
          (Date.now() - doc.createdAt.getTime()) / (1000 * 60 * 60),
        );
        logger.debug("[OrphanCleanup] Stale upload detail", {
          filename: doc.filename,
          documentId: doc.id.slice(0, 8),
          ageHours: age,
        });
      }

      // Update status to 'failed' in batches for safety
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
              status: { in: ["uploading", "enriching"] },
            },
            data: {
              status: "failed",
              indexingState: "failed",
              indexingError: "Stale document timeout — marked failed by cleanup scheduler",
              updatedAt: new Date(),
            },
          });
          result.markedFailed += updateResult.count;
          logger.info("[OrphanCleanup] Marked stale uploads as failed", {
            batch: Math.floor(i / BATCH_SIZE) + 1,
            count: updateResult.count,
          });
        } catch (error: any) {
          result.errors.push(
            `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`,
          );
          logger.error("[OrphanCleanup] Batch update failed", {
            batch: Math.floor(i / BATCH_SIZE) + 1,
            error: error.message,
          });
        }
      }

      logger.info("[OrphanCleanup] Stale upload cleanup complete", {
        markedFailed: result.markedFailed,
        foundStale: result.foundStale,
      });
    } else {
      logger.info("[OrphanCleanup] No stale upload sessions found");
    }
  } catch (error: any) {
    result.errors.push(`Stale upload cleanup failed: ${error.message}`);
    logger.error("[OrphanCleanup] Stale upload cleanup error", {
      error: error.message,
    });
  }

  return result;
}

/**
 * Run stale upload cleanup only (runs daily)
 */
export async function runStaleUploadCleanup(): Promise<
  CleanupReport["staleUploads"]
> {
  logger.info("[OrphanCleanup] Starting stale upload cleanup");

  const result = await cleanStaleUploads();

  logger.info("[OrphanCleanup] Stale upload cleanup report", {
    foundStale: result.foundStale,
    markedFailed: result.markedFailed,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Run full orphan cleanup
 * Cleans all external storage systems
 */
export async function runOrphanCleanup(): Promise<CleanupReport> {
  logger.info("[OrphanCleanup] Starting automated orphan cleanup");

  const startTime = Date.now();

  const report: CleanupReport = {
    timestamp: new Date(),
    pinecone: await cleanOrphanedPineconeVectors(),
    storage: await cleanOrphanedStorageFiles(),
    embeddings: await cleanOrphanedEmbeddings(),
    staleUploads: await cleanStaleUploads(),
  };

  const durationSec = +((Date.now() - startTime) / 1000).toFixed(1);

  logger.info("[OrphanCleanup] Cleanup report", {
    timestamp: report.timestamp.toISOString(),
    durationSec,
    pinecone: {
      orphaned: report.pinecone.orphanedVectors,
      deleted: report.pinecone.deletedVectors,
      errors: report.pinecone.errors.length,
    },
    storage: {
      orphaned: report.storage.orphanedFiles,
      deleted: report.storage.deletedFiles,
      errors: report.storage.errors.length,
    },
    embeddings: {
      orphaned: report.embeddings.orphanedEmbeddings,
      deleted: report.embeddings.deletedEmbeddings,
      errors: report.embeddings.errors.length,
    },
    staleUploads: {
      foundStale: report.staleUploads.foundStale,
      markedFailed: report.staleUploads.markedFailed,
      errors: report.staleUploads.errors.length,
    },
  });

  // Log any errors
  const allErrors = [
    ...report.pinecone.errors,
    ...report.storage.errors,
    ...report.embeddings.errors,
    ...report.staleUploads.errors,
  ];

  if (allErrors.length > 0) {
    logger.warn("[OrphanCleanup] Errors encountered during cleanup", {
      errors: allErrors,
    });
  }

  return report;
}

/**
 * Initialize orphan cleanup scheduler
 * - Full cleanup: Runs every Sunday at 3:00 AM
 * - Stale upload cleanup: Runs daily at 4:00 AM
 */
export function startOrphanCleanupScheduler() {
  // Run full cleanup daily at 3:00 AM (server time)
  // Includes Pinecone orphan sweep, storage cleanup, and stale upload recovery
  cron.schedule("0 3 * * *", async () => {
    logger.info("[OrphanCleanup] Running scheduled daily full cleanup");
    await runOrphanCleanup();
  });

  // Run stale upload + stuck enriching cleanup daily at 4:00 AM (server time)
  cron.schedule("0 4 * * *", async () => {
    logger.info("[OrphanCleanup] Running scheduled daily stale upload cleanup");
    await runStaleUploadCleanup();
  });

  logger.info("[OrphanCleanup] Scheduler started", {
    fullCleanup: "Daily at 3:00 AM",
    staleUploads: "Daily at 4:00 AM",
  });
}

/**
 * Run cleanup manually (for testing or immediate cleanup)
 */
export async function runManualCleanup(): Promise<CleanupReport> {
  logger.info("[OrphanCleanup] Running manual cleanup");
  return await runOrphanCleanup();
}
