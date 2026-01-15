/**
 * ONE-TIME CLEANUP SCRIPT: Orphaned Uploads
 *
 * This script cleans up documents stuck in 'uploading' status for more than 1 hour.
 *
 * For each orphaned document:
 *   1. HEAD S3 to check if the file actually exists
 *   2. If S3 object exists → mark as 'available' (confirmed upload)
 *   3. If S3 object missing → mark as 'failed_incomplete'
 *
 * Usage:
 *   node cleanup-orphaned-uploads.js [--dry-run] [--hours=N]
 *
 * Options:
 *   --dry-run   Show what would be done without making changes
 *   --hours=N   Check documents older than N hours (default: 1)
 */

const { PrismaClient } = require('@prisma/client');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME;

/**
 * Check if S3 object exists
 */
async function checkS3Exists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    }));
    return { exists: true };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    // Transient error - assume exists to be safe
    console.warn(`  ⚠️ S3 check error for ${key}: ${error.message}`);
    return { exists: true, error: error.message };
  }
}

/**
 * Main cleanup function
 */
async function cleanupOrphanedUploads(options = {}) {
  const { dryRun = false, hours = 1 } = options;

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('ORPHANED UPLOADS CLEANUP SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log(`Looking for documents in 'uploading' status older than ${hours} hour(s)`);
  console.log('');

  // Calculate cutoff time
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  console.log(`Cutoff time: ${cutoffTime.toISOString()}`);

  // Find orphaned documents
  const orphanedDocs = await prisma.document.findMany({
    where: {
      status: 'uploading',
      createdAt: {
        lt: cutoffTime
      }
    },
    select: {
      id: true,
      filename: true,
      encryptedFilename: true,
      fileSize: true,
      createdAt: true,
      userId: true,
      uploadSessionId: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  console.log(`\nFound ${orphanedDocs.length} orphaned documents\n`);

  if (orphanedDocs.length === 0) {
    console.log('✅ No orphaned documents to clean up');
    await prisma.$disconnect();
    return { confirmed: 0, failed: 0, total: 0 };
  }

  // Process each document
  const results = {
    confirmed: [],      // S3 exists → mark available
    failedIncomplete: [], // S3 missing → mark failed_incomplete
    errors: []          // Errors during processing
  };

  const BATCH_SIZE = 20;

  for (let i = 0; i < orphanedDocs.length; i += BATCH_SIZE) {
    const batch = orphanedDocs.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(orphanedDocs.length / BATCH_SIZE)}...`);

    await Promise.all(batch.map(async (doc) => {
      try {
        const s3Result = await checkS3Exists(doc.encryptedFilename);
        const ageHours = ((Date.now() - new Date(doc.createdAt).getTime()) / (1000 * 60 * 60)).toFixed(1);

        if (s3Result.exists) {
          console.log(`  ✅ ${doc.filename} (${ageHours}h old) → S3 EXISTS → confirm`);
          results.confirmed.push(doc.id);
        } else {
          console.log(`  ❌ ${doc.filename} (${ageHours}h old) → S3 MISSING → failed_incomplete`);
          results.failedIncomplete.push(doc.id);
        }
      } catch (error) {
        console.error(`  ⚠️ Error processing ${doc.filename}: ${error.message}`);
        results.errors.push({ id: doc.id, error: error.message });
      }
    }));
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Total orphaned documents: ${orphanedDocs.length}`);
  console.log(`  → To confirm (S3 exists): ${results.confirmed.length}`);
  console.log(`  → To mark failed_incomplete: ${results.failedIncomplete.length}`);
  console.log(`  → Errors: ${results.errors.length}`);

  if (dryRun) {
    console.log('\n🔶 DRY RUN - No changes made');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('\nApplying changes...');

    // Update confirmed documents
    if (results.confirmed.length > 0) {
      const confirmResult = await prisma.document.updateMany({
        where: {
          id: { in: results.confirmed },
          status: 'uploading' // Only if still uploading
        },
        data: {
          status: 'available'
        }
      });
      console.log(`  ✅ Marked ${confirmResult.count} documents as 'available'`);
    }

    // Update failed_incomplete documents
    if (results.failedIncomplete.length > 0) {
      const failedResult = await prisma.document.updateMany({
        where: {
          id: { in: results.failedIncomplete },
          status: 'uploading' // Only if still uploading
        },
        data: {
          status: 'failed_incomplete'
        }
      });
      console.log(`  ❌ Marked ${failedResult.count} documents as 'failed_incomplete'`);
    }

    console.log('\n✅ Cleanup complete!');
  }

  await prisma.$disconnect();

  return {
    confirmed: results.confirmed.length,
    failed: results.failedIncomplete.length,
    total: orphanedDocs.length
  };
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');

  let hours = 1;
  const hoursArg = args.find(a => a.startsWith('--hours='));
  if (hoursArg) {
    hours = parseInt(hoursArg.split('=')[1], 10);
    if (isNaN(hours) || hours < 0) {
      console.error('Invalid --hours value. Must be a positive number.');
      process.exit(1);
    }
  }

  cleanupOrphanedUploads({ dryRun, hours })
    .then(results => {
      console.log('\nFinal results:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupOrphanedUploads };
