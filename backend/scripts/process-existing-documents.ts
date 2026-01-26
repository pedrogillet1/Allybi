/**
 * Process Existing Documents - ULTRA-FAST
 *
 * Processes all documents without embeddings
 * Expected time for 100 documents: ~30-60 seconds (with 20 concurrent workers)
 *
 * Usage:
 *   npx ts-node src/scripts/process-existing-documents.ts
 *
 * Or add to package.json:
 *   "process-docs": "ts-node src/scripts/process-existing-documents.ts"
 */

import dotenv from 'dotenv';
dotenv.config();

import prisma from '../config/database';
import { addDocumentJob, getQueueStats } from '../queues/document.queue';

async function processExistingDocuments() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 Finding documents without embeddings...');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  try {
    // Find all documents without embeddings using raw SQL to avoid Prisma client type issues
    const documents: any[] = await prisma.$queryRaw`
      SELECT id, "userId", filename, "encryptedFilename", "mimeType", "fileSize", status,
             "embeddingsGenerated", "chunksCount"
      FROM documents
      WHERE ("embeddingsGenerated" = false OR "embeddingsGenerated" IS NULL
             OR "chunksCount" = 0 OR "chunksCount" IS NULL)
        AND status IN ('completed', 'processing', 'processing_failed')
      ORDER BY "createdAt" DESC
    `;

    console.log(`📊 Found ${documents.length} documents without embeddings`);
    console.log('');

    if (documents.length === 0) {
      console.log('✅ All documents have embeddings!');
      console.log('');
      await prisma.$disconnect();
      return;
    }

    // Show sample of documents
    console.log('📝 Sample documents to process:');
    documents.slice(0, 5).forEach((doc, i) => {
      console.log(`  ${i + 1}. ${doc.filename} (${doc.mimeType})`);
    });
    if (documents.length > 5) {
      console.log(`  ... and ${documents.length - 5} more`);
    }
    console.log('');

    // Calculate expected time
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '20', 10);
    const expectedTimeMin = Math.ceil((documents.length / concurrency) * 2);
    const expectedTimeMax = Math.ceil((documents.length / concurrency) * 4);

    console.log(`⚡ Expected processing time: ${expectedTimeMin}-${expectedTimeMax} seconds`);
    console.log(`   (Processing ${concurrency} documents concurrently)`);
    console.log('');

    // Update status to "processing"
    console.log('📝 Updating document status to processing...');
    const docIds = documents.map((d) => d.id);
    if (docIds.length > 0) {
      // Use text array and cast in SQL to handle UUID comparison
      await prisma.$executeRaw`
        UPDATE documents
        SET status = 'processing'
        WHERE id::text = ANY(${docIds}::text[])
      `;
    }

    // Queue all documents
    console.log('📤 Queueing documents for processing...');
    console.log('');

    let queued = 0;
    let failed = 0;

    const startTime = Date.now();

    for (const doc of documents) {
      try {
        await addDocumentJob({
          documentId: doc.id,
          userId: doc.userId,
          filename: doc.filename,
          mimeType: doc.mimeType,
        });

        queued++;

        if (queued % 10 === 0 || queued === documents.length) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  ✅ Queued ${queued}/${documents.length} documents (${elapsed}s)`);
        }
      } catch (error: any) {
        console.error(`  ❌ Failed to queue ${doc.filename}:`, error.message);
        failed++;
      }
    }

    const queueTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 Summary:');
    console.log(`  Total documents: ${documents.length}`);
    console.log(`  Queued: ${queued}`);
    console.log(`  Failed to queue: ${failed}`);
    console.log(`  Queue time: ${queueTime}s`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    // Get queue stats
    try {
      const stats = await getQueueStats();
      console.log('📊 Queue Status:');
      console.log(`  Waiting: ${stats.waiting}`);
      console.log(`  Active: ${stats.active}`);
      console.log(`  Completed: ${stats.completed}`);
      console.log(`  Failed: ${stats.failed}`);
      console.log('');
    } catch (e) {
      console.log('⚠️  Could not get queue stats (is Redis connected?)');
      console.log('');
    }

    console.log('✅ Documents queued successfully!');
    console.log('');
    console.log('⚡ Processing will start when worker is running');
    console.log(`   Expected completion: ${expectedTimeMin}-${expectedTimeMax} seconds`);
    console.log('');
    console.log('📊 Monitor progress:');
    console.log('   - Run worker: npm run worker');
    console.log('   - Watch worker terminal for real-time logs');
    console.log('   - Check database for embeddingsGenerated = true');
    console.log('');
  } catch (error: any) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
processExistingDocuments()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
