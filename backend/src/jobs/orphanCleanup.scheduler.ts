import cron from 'node-cron';
import prisma from '../config/database';
import { Pinecone } from '@pinecone-database/pinecone';

/**
 * Orphan Cleanup Scheduler
 *
 * Automatically detects and cleans up orphaned data in:
 * 1. Pinecone vectors (documents deleted but vectors remain)
 * 2. GCS/S3 files (documents deleted but files remain)
 * 3. PostgreSQL embeddings (documents deleted but embeddings remain via cascade failure)
 *
 * Runs weekly on Sundays at 3:00 AM to minimize impact on production
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
}

/**
 * Clean orphaned Pinecone vectors
 * Finds vectors where documentId doesn't exist in the database
 */
async function cleanOrphanedPineconeVectors(): Promise<CleanupReport['pinecone']> {
  const result = {
    orphanedVectors: 0,
    deletedVectors: 0,
    errors: [] as string[],
  };

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    console.log('⚠️ [OrphanCleanup] Pinecone not configured, skipping vector cleanup');
    return result;
  }

  try {
    console.log('🔍 [OrphanCleanup] Scanning Pinecone for orphaned vectors...');

    const pinecone = new Pinecone({ apiKey });
    const indexName = process.env.PINECONE_INDEX_NAME || 'koda-openai';
    const index = pinecone.index(indexName);

    // Get all valid document IDs from database
    const validDocs = await prisma.document.findMany({
      select: { id: true },
    });
    const validDocIds = new Set(validDocs.map(d => d.id));

    console.log(`📊 [OrphanCleanup] Found ${validDocIds.size} valid documents in database`);

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
      console.log(`⚠️ [OrphanCleanup] Found ${orphanedVectorIds.length} orphaned vectors from ${orphanedDocIds.size} deleted documents`);

      // Delete in batches of 1000 (Pinecone limit)
      const BATCH_SIZE = 1000;
      for (let i = 0; i < orphanedVectorIds.length; i += BATCH_SIZE) {
        const batch = orphanedVectorIds.slice(i, Math.min(i + BATCH_SIZE, orphanedVectorIds.length));
        try {
          await index.deleteMany(batch);
          result.deletedVectors += batch.length;
          console.log(`  ✅ Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} vectors`);
        } catch (error: any) {
          result.errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
          console.error(`  ❌ Batch delete failed: ${error.message}`);
        }
      }
    } else {
      console.log('✅ [OrphanCleanup] No orphaned Pinecone vectors found');
    }
  } catch (error: any) {
    result.errors.push(`Pinecone cleanup failed: ${error.message}`);
    console.error('❌ [OrphanCleanup] Pinecone cleanup error:', error.message);
  }

  return result;
}

/**
 * Clean orphaned S3 files
 * NOTE: S3 file listing is not implemented in the current storage abstraction.
 * The deletion flow now properly deletes S3 files during document/folder deletion,
 * so orphaned S3 files should be rare. This can be implemented with AWS S3 ListObjectsV2
 * if needed for historical orphan cleanup.
 */
async function cleanOrphanedStorageFiles(): Promise<CleanupReport['storage']> {
  const result = {
    orphanedFiles: 0,
    deletedFiles: 0,
    errors: [] as string[],
  };

  // S3 file listing not implemented in current storage abstraction
  // The critical fix is that document/folder deletion now properly deletes S3 files
  // If historical orphan cleanup is needed, implement with AWS SDK ListObjectsV2
  console.log('ℹ️ [OrphanCleanup] S3 file listing not implemented - skipping storage cleanup');
  console.log('   Note: Document/folder deletion now properly cleans up S3 files');

  return result;
}

/**
 * Clean orphaned PostgreSQL embeddings
 * This should rarely be needed due to cascade deletes, but handles edge cases
 */
async function cleanOrphanedEmbeddings(): Promise<CleanupReport['embeddings']> {
  const result = {
    orphanedEmbeddings: 0,
    deletedEmbeddings: 0,
    errors: [] as string[],
  };

  try {
    console.log('🔍 [OrphanCleanup] Scanning PostgreSQL for orphaned embeddings...');

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
      console.log(`⚠️ [OrphanCleanup] Found ${count} orphaned embeddings in PostgreSQL`);

      // Delete orphaned embeddings
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM document_embeddings
        WHERE "documentId" NOT IN (SELECT id FROM documents)
      `;

      result.deletedEmbeddings = deleteResult;
      console.log(`  ✅ Deleted ${deleteResult} orphaned embeddings`);
    } else {
      console.log('✅ [OrphanCleanup] No orphaned PostgreSQL embeddings found');
    }
  } catch (error: any) {
    result.errors.push(`Embeddings cleanup failed: ${error.message}`);
    console.error('❌ [OrphanCleanup] Embeddings cleanup error:', error.message);
  }

  return result;
}

/**
 * Run full orphan cleanup
 * Cleans all external storage systems
 */
export async function runOrphanCleanup(): Promise<CleanupReport> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧹 [OrphanCleanup] Starting automated orphan cleanup...');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();

  const report: CleanupReport = {
    timestamp: new Date(),
    pinecone: await cleanOrphanedPineconeVectors(),
    storage: await cleanOrphanedStorageFiles(),
    embeddings: await cleanOrphanedEmbeddings(),
  };

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 [OrphanCleanup] CLEANUP REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Duration: ${duration}s`);
  console.log('');
  console.log('Pinecone Vectors:');
  console.log(`  - Orphaned: ${report.pinecone.orphanedVectors}`);
  console.log(`  - Deleted: ${report.pinecone.deletedVectors}`);
  console.log(`  - Errors: ${report.pinecone.errors.length}`);
  console.log('');
  console.log('Storage Files:');
  console.log(`  - Orphaned: ${report.storage.orphanedFiles}`);
  console.log(`  - Deleted: ${report.storage.deletedFiles}`);
  console.log(`  - Errors: ${report.storage.errors.length}`);
  console.log('');
  console.log('PostgreSQL Embeddings:');
  console.log(`  - Orphaned: ${report.embeddings.orphanedEmbeddings}`);
  console.log(`  - Deleted: ${report.embeddings.deletedEmbeddings}`);
  console.log(`  - Errors: ${report.embeddings.errors.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Log any errors
  const allErrors = [
    ...report.pinecone.errors,
    ...report.storage.errors,
    ...report.embeddings.errors,
  ];

  if (allErrors.length > 0) {
    console.warn('⚠️ [OrphanCleanup] Errors encountered during cleanup:');
    allErrors.forEach((err, i) => console.warn(`  ${i + 1}. ${err}`));
  }

  return report;
}

/**
 * Initialize orphan cleanup scheduler
 * Runs every Sunday at 3:00 AM
 */
export function startOrphanCleanupScheduler() {
  // Run every Sunday at 3:00 AM (server time)
  cron.schedule('0 3 * * 0', async () => {
    console.log('🔔 [OrphanCleanup] Running scheduled weekly cleanup...');
    await runOrphanCleanup();
  });

  console.log('✅ Orphan cleanup scheduler started (runs every Sunday at 3:00 AM)');
}

/**
 * Run cleanup manually (for testing or immediate cleanup)
 */
export async function runManualCleanup(): Promise<CleanupReport> {
  console.log('🧹 [OrphanCleanup] Running manual cleanup...');
  return await runOrphanCleanup();
}
