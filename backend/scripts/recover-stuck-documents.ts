/**
 * Recover Stuck Documents Script
 *
 * Finds documents stuck in "processing" state and requeues them
 *
 * Usage: npx ts-node src/scripts/recover-stuck-documents.ts
 */

import prisma from '../config/database';
import { addDocumentProcessingJob } from '../queues/document.queue';

async function recoverStuckDocuments() {
  console.log('🔍 Finding stuck documents...\n');

  // Find documents in "processing" state for more than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const stuckDocuments = await prisma.document.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: oneHourAgo,
      },
    },
    select: {
      id: true,
      userId: true,
      encryptedFilename: true,
      mimeType: true,
      filename: true,
      updatedAt: true,
      fileSize: true,
    },
  });

  console.log(`📊 Found ${stuckDocuments.length} stuck documents\n`);

  if (stuckDocuments.length === 0) {
    console.log('✅ No stuck documents found');
    return;
  }

  // Show summary
  console.log('⚠️  This will:');
  console.log('  1. Reset status to "processing" (will be picked up by queue)');
  console.log('  2. Clear error messages');
  console.log('  3. Requeue for processing\n');
  console.log('Documents to recover:');

  stuckDocuments.slice(0, 10).forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc.filename} (${doc.id.substring(0, 8)}...) - stuck since ${doc.updatedAt.toISOString()}`);
  });

  if (stuckDocuments.length > 10) {
    console.log(`  ... and ${stuckDocuments.length - 10} more`);
  }

  console.log('\n🔄 Starting recovery...\n');

  let recovered = 0;
  let failed = 0;

  for (const doc of stuckDocuments) {
    try {
      // Reset document error (keep status as processing for now)
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          error: null,
          updatedAt: new Date(), // Reset updatedAt so it won't be picked up again immediately
        },
      });

      // Requeue for processing
      const job = await addDocumentProcessingJob({
        documentId: doc.id,
        userId: doc.userId,
        encryptedFilename: doc.encryptedFilename,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize || 0,
      });

      if (job) {
        recovered++;
        console.log(`✅ [${recovered}/${stuckDocuments.length}] Recovered: ${doc.filename}`);
      } else {
        // Queue not available, mark as failed
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            status: 'failed',
            error: 'Queue not available for reprocessing',
          },
        });
        failed++;
        console.log(`⚠️  [${recovered + failed}/${stuckDocuments.length}] Queue unavailable, marked failed: ${doc.filename}`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Failed to recover ${doc.filename}:`, error);
    }
  }

  console.log('\n📊 Recovery Summary:');
  console.log(`  ✅ Recovered: ${recovered}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📝 Total: ${stuckDocuments.length}`);

  await prisma.$disconnect();
}

// Also add function to reset failed documents
async function resetFailedDocuments() {
  console.log('\n🔍 Finding failed documents without error messages...\n');

  const failedNoError = await prisma.document.findMany({
    where: {
      status: 'failed',
      error: null,
    },
    select: {
      id: true,
      userId: true,
      encryptedFilename: true,
      mimeType: true,
      filename: true,
      fileSize: true,
    },
  });

  console.log(`📊 Found ${failedNoError.length} failed documents without error messages\n`);

  if (failedNoError.length === 0) {
    console.log('✅ No failed documents without errors found');
    return;
  }

  let recovered = 0;
  let failed = 0;

  for (const doc of failedNoError) {
    try {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          status: 'processing',
          error: null,
        },
      });

      const job = await addDocumentProcessingJob({
        documentId: doc.id,
        userId: doc.userId,
        encryptedFilename: doc.encryptedFilename,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize || 0,
      });

      if (job) {
        recovered++;
        console.log(`✅ [${recovered}/${failedNoError.length}] Requeued: ${doc.filename}`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Failed to requeue ${doc.filename}:`, error);
    }
  }

  console.log('\n📊 Failed Documents Recovery Summary:');
  console.log(`  ✅ Requeued: ${recovered}`);
  console.log(`  ❌ Failed: ${failed}`);
}

// Run the script
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('          DOCUMENT RECOVERY SCRIPT');
  console.log('═══════════════════════════════════════════════════════════\n');

  await recoverStuckDocuments();
  await resetFailedDocuments();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Recovery complete');
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Recovery failed:', error);
    process.exit(1);
  });
