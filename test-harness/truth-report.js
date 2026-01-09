/**
 * UPLOAD TRUTH AUDIT - Truth Report Generator
 *
 * Queries database and S3 to verify upload results match UI reports.
 * Run with: node truth-report.js <upload_session_id> <ui_json_file>
 */

const { PrismaClient } = require('@prisma/client');
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'koda-documents';

async function generateTruthReport(sessionId, uiResultsPath = null) {
  console.log('\n========================================');
  console.log('UPLOAD TRUTH AUDIT REPORT');
  console.log('========================================');
  console.log('Session ID: ' + (sessionId || 'ALL RECENT'));
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('========================================\n');

  // 1. Load UI results if provided
  let uiResults = null;
  if (uiResultsPath && fs.existsSync(uiResultsPath)) {
    uiResults = JSON.parse(fs.readFileSync(uiResultsPath, 'utf8'));
    console.log('UI REPORTED RESULTS:');
    console.log('   Discovered: ' + (uiResults.discovered || 'N/A'));
    console.log('   Succeeded: ' + (uiResults.succeeded || uiResults.successCount || 'N/A'));
    console.log('   Failed: ' + (uiResults.failed?.length || uiResults.failureCount || 0));
    console.log('   Skipped: ' + (uiResults.skipped?.length || uiResults.skippedFiles || 0));
    console.log('');
  }

  // 2. Query database for documents
  console.log('DATABASE QUERY RESULTS:');

  let dbQuery = {};
  if (sessionId) {
    // If session ID provided, filter by metadata or creation time
    const sessionTime = new Date(parseInt(sessionId.split('-')[0]) || Date.now() - 3600000);
    dbQuery = {
      createdAt: {
        gte: new Date(sessionTime.getTime() - 60000), // 1 minute before
        lte: new Date(sessionTime.getTime() + 300000)  // 5 minutes after
      }
    };
  } else {
    // Last hour
    dbQuery = {
      createdAt: {
        gte: new Date(Date.now() - 3600000)
      }
    };
  }

  const documents = await prisma.document.findMany({
    where: dbQuery,
    select: {
      id: true,
      filename: true,
      status: true,
      fileSize: true,
      s3Key: true,
      createdAt: true,
      userId: true,
      folderId: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const dbStats = {
    total: documents.length,
    byStatus: {},
    withS3Key: 0,
    withoutS3Key: 0,
    byFolder: {}
  };

  documents.forEach(doc => {
    dbStats.byStatus[doc.status] = (dbStats.byStatus[doc.status] || 0) + 1;
    if (doc.s3Key) dbStats.withS3Key++;
    else dbStats.withoutS3Key++;
    const folderId = doc.folderId || 'root';
    dbStats.byFolder[folderId] = (dbStats.byFolder[folderId] || 0) + 1;
  });

  console.log('   Total Documents: ' + dbStats.total);
  console.log('   By Status: ' + JSON.stringify(dbStats.byStatus));
  console.log('   With S3 Key: ' + dbStats.withS3Key);
  console.log('   Missing S3 Key: ' + dbStats.withoutS3Key);
  console.log('');

  // 3. Verify S3 objects exist
  console.log('S3 VERIFICATION:');
  let s3Verified = 0;
  let s3Missing = [];
  let s3SizeMismatch = [];

  for (const doc of documents.filter(d => d.s3Key)) {
    try {
      const command = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: doc.s3Key
      });
      const response = await s3Client.send(command);

      // Verify size matches
      if (doc.fileSize && response.ContentLength !== doc.fileSize) {
        s3SizeMismatch.push({
          id: doc.id,
          filename: doc.filename,
          dbSize: doc.fileSize,
          s3Size: response.ContentLength
        });
      }
      s3Verified++;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        s3Missing.push({
          id: doc.id,
          filename: doc.filename,
          s3Key: doc.s3Key
        });
      }
    }
  }

  console.log('   S3 Objects Verified: ' + s3Verified);
  console.log('   S3 Objects Missing: ' + s3Missing.length);
  console.log('   Size Mismatches: ' + s3SizeMismatch.length);

  if (s3Missing.length > 0) {
    console.log('\n   MISSING S3 OBJECTS:');
    s3Missing.slice(0, 10).forEach(m => {
      console.log('      - ' + m.filename + ' (' + m.id + '): ' + m.s3Key);
    });
    if (s3Missing.length > 10) {
      console.log('      ... and ' + (s3Missing.length - 10) + ' more');
    }
  }

  if (s3SizeMismatch.length > 0) {
    console.log('\n   SIZE MISMATCHES:');
    s3SizeMismatch.forEach(m => {
      console.log('      - ' + m.filename + ': DB=' + m.dbSize + ', S3=' + m.s3Size);
    });
  }

  // 4. Compare UI vs DB
  console.log('\n========================================');
  console.log('TRUTH COMPARISON');
  console.log('========================================');

  if (uiResults) {
    const uiSucceeded = uiResults.succeeded || uiResults.successCount || 0;
    const dbCompleted = dbStats.byStatus['completed'] || 0;
    const dbProcessing = dbStats.byStatus['processing'] || 0;
    const dbUploading = dbStats.byStatus['uploading'] || 0;
    const dbTotal = dbCompleted + dbProcessing + dbUploading;

    console.log('\n   UI Reported Success: ' + uiSucceeded);
    console.log('   DB Confirmed (completed): ' + dbCompleted);
    console.log('   DB Processing: ' + dbProcessing);
    console.log('   DB Uploading: ' + dbUploading);
    console.log('   S3 Verified: ' + s3Verified);

    const uiDbMatch = uiSucceeded === dbTotal;
    const dbS3Match = dbStats.withS3Key === s3Verified;

    console.log('\n   VERDICT:');
    console.log('   UI <-> DB: ' + (uiDbMatch ? 'MATCH' : 'MISMATCH'));
    console.log('   DB <-> S3: ' + (dbS3Match ? 'MATCH' : 'MISMATCH'));

    if (!uiDbMatch || !dbS3Match) {
      console.log('\n   INVESTIGATION REQUIRED');
      if (!uiDbMatch) {
        console.log('      UI shows ' + uiSucceeded + ' but DB has ' + dbTotal + ' documents');
      }
      if (!dbS3Match) {
        console.log('      DB has ' + dbStats.withS3Key + ' S3 keys but only ' + s3Verified + ' verified');
      }
    }
  } else {
    console.log('\n   (No UI results provided for comparison)');
    console.log('   DB Total: ' + dbStats.total);
    console.log('   S3 Verified: ' + s3Verified);
  }

  // 5. Generate detailed report
  const report = {
    timestamp: new Date().toISOString(),
    sessionId,
    ui: uiResults,
    database: {
      total: dbStats.total,
      byStatus: dbStats.byStatus,
      withS3Key: dbStats.withS3Key,
      missingS3Key: dbStats.withoutS3Key
    },
    s3: {
      verified: s3Verified,
      missing: s3Missing,
      sizeMismatch: s3SizeMismatch
    },
    documents: documents.map(d => ({
      id: d.id,
      filename: d.filename,
      status: d.status,
      hasS3Key: !!d.s3Key
    }))
  };

  // Save report
  const reportPath = '/tmp/truth-report-' + Date.now() + '.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nFull report saved to: ' + reportPath);

  await prisma.$disconnect();
  return report;
}

// Run if called directly
if (require.main === module) {
  const sessionId = process.argv[2];
  const uiResultsPath = process.argv[3];

  generateTruthReport(sessionId, uiResultsPath)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { generateTruthReport };
