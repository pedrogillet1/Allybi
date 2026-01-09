/**
 * UPLOAD TRUTH AUDIT - Truth Report Generator
 * 
 * Queries database and S3 to verify upload results match UI reports.
 * 
 * SECURITY: This script does NOT log secrets or presigned URLs.
 * 
 * Usage:
 *   node truth-report.js <upload_session_id> [ui_json_file]
 *   node truth-report.js --help
 */

const { PrismaClient } = require('@prisma/client');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Load environment (no logging of secrets)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'koda-documents';

// Mask S3 keys in output for security
function maskS3Key(key) {
  if (!key || key.length < 20) return key;
  return key.substring(0, 10) + '...' + key.substring(key.length - 10);
}

async function generateTruthReport(sessionId, uiResultsPath = null, options = {}) {
  const { quiet = false, json = false } = options;
  
  if (!quiet) {
    console.log('\n========================================');
    console.log('UPLOAD TRUTH AUDIT REPORT');
    console.log('========================================');
    console.log('Session ID: ' + (sessionId || 'REQUIRED'));
    console.log('Timestamp: ' + new Date().toISOString());
    console.log('========================================\n');
  }
  
  // Session ID is required for precise matching
  if (!sessionId) {
    console.error('ERROR: Session ID is required.');
    console.error('Usage: node truth-report.js <upload_session_id> [ui_json_file]');
    process.exit(1);
  }

  // 1. Load UI results if provided
  let uiResults = null;
  let documentIds = [];
  
  if (uiResultsPath && fs.existsSync(uiResultsPath)) {
    uiResults = JSON.parse(fs.readFileSync(uiResultsPath, 'utf8'));
    if (!quiet) {
      console.log('UI REPORTED RESULTS:');
      console.log('   Discovered: ' + (uiResults.discovered || 'N/A'));
      console.log('   Succeeded: ' + (uiResults.succeeded?.length || uiResults.successCount || 'N/A'));
      console.log('   Failed: ' + (uiResults.failed?.length || uiResults.failureCount || 0));
      console.log('   Skipped: ' + (uiResults.skipped?.length || 0));
      console.log('');
    }
    
    // Extract document IDs from UI results for precise matching
    if (uiResults.succeeded && Array.isArray(uiResults.succeeded)) {
      documentIds = uiResults.succeeded.map(s => s.documentId).filter(Boolean);
    }
  }

  // 2. Query database for documents - ONLY by document IDs (no timestamp guessing)
  if (!quiet) console.log('DATABASE QUERY RESULTS:');

  let documents = [];
  
  if (documentIds.length > 0) {
    // Primary method: Use exact document IDs from UI results
    if (!quiet) console.log('   Filtering by document IDs (exact match)...');
    documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds }
      },
      select: {
        id: true,
        filename: true,
        status: true,
        fileSize: true,
        encryptedFilename: true,
        createdAt: true,
        userId: true,
        folderId: true
      },
      orderBy: { createdAt: 'desc' }
    });
  } else {
    // Fallback: Parse timestamp from session ID (format: timestamp-random)
    const sessionTimestamp = parseInt(sessionId.split('-')[0]);
    if (isNaN(sessionTimestamp)) {
      console.error('ERROR: Invalid session ID format. Expected: timestamp-random (e.g., 1704825600000-abc123)');
      process.exit(1);
    }
    
    if (!quiet) console.log('   Filtering by session timestamp (±2 minutes)...');
    documents = await prisma.document.findMany({
      where: {
        createdAt: {
          gte: new Date(sessionTimestamp - 5000),   // 5 seconds before
          lte: new Date(sessionTimestamp + 120000)  // 2 minutes after
        }
      },
      select: {
        id: true,
        filename: true,
        status: true,
        fileSize: true,
        encryptedFilename: true,
        createdAt: true,
        userId: true,
        folderId: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  const dbStats = {
    total: documents.length,
    byStatus: {},
    withS3Key: 0,
    withoutS3Key: 0
  };

  documents.forEach(doc => {
    dbStats.byStatus[doc.status] = (dbStats.byStatus[doc.status] || 0) + 1;
    if (doc.encryptedFilename) dbStats.withS3Key++;
    else dbStats.withoutS3Key++;
  });

  if (!quiet) {
    console.log('   Total Documents: ' + dbStats.total);
    console.log('   By Status: ' + JSON.stringify(dbStats.byStatus));
    console.log('   With S3 Key: ' + dbStats.withS3Key);
    console.log('   Missing S3 Key: ' + dbStats.withoutS3Key);
    console.log('');
  }

  // 3. Verify S3 objects exist
  if (!quiet) console.log('S3 VERIFICATION:');
  let s3Verified = 0;
  let s3Missing = [];
  let s3SizeMismatch = [];

  for (const doc of documents.filter(d => d.encryptedFilename)) {
    try {
      const command = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: doc.encryptedFilename
      });
      const response = await s3Client.send(command);

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
          s3Key: maskS3Key(doc.encryptedFilename)
        });
      }
    }
  }

  if (!quiet) {
    console.log('   S3 Objects Verified: ' + s3Verified);
    console.log('   S3 Objects Missing: ' + s3Missing.length);
    console.log('   Size Mismatches: ' + s3SizeMismatch.length);

    if (s3Missing.length > 0) {
      console.log('\n   MISSING S3 OBJECTS:');
      s3Missing.slice(0, 5).forEach(m => {
        console.log('      - ' + m.filename + ' (' + m.id.substring(0, 8) + '...)');
      });
      if (s3Missing.length > 5) {
        console.log('      ... and ' + (s3Missing.length - 5) + ' more');
      }
    }

    if (s3SizeMismatch.length > 0) {
      console.log('\n   SIZE MISMATCHES:');
      s3SizeMismatch.slice(0, 5).forEach(m => {
        console.log('      - ' + m.filename + ': DB=' + m.dbSize + ', S3=' + m.s3Size);
      });
    }
  }

  // 4. Compare UI vs DB vs S3
  if (!quiet) {
    console.log('\n========================================');
    console.log('TRUTH COMPARISON');
    console.log('========================================');
  }

  const uiSucceeded = uiResults?.succeeded?.length || uiResults?.successCount || documentIds.length || 0;
  const dbCompleted = dbStats.byStatus['completed'] || 0;
  const dbProcessing = dbStats.byStatus['processing'] || 0;
  const dbUploading = dbStats.byStatus['uploading'] || 0;
  const dbUploaded = dbStats.byStatus['uploaded'] || 0;
  const dbTotal = dbCompleted + dbProcessing + dbUploading + dbUploaded;

  if (!quiet) {
    console.log('\n   UI Reported Success: ' + uiSucceeded);
    console.log('   DB Total (all statuses): ' + dbTotal);
    console.log('   S3 Verified: ' + s3Verified);
  }

  const uiDbMatch = uiSucceeded === dbTotal;
  const dbS3Match = dbStats.withS3Key === s3Verified;

  const verdict = {
    uiDbMatch,
    dbS3Match,
    allMatch: uiDbMatch && dbS3Match,
    uiCount: uiSucceeded,
    dbCount: dbTotal,
    s3Count: s3Verified
  };

  if (!quiet) {
    console.log('\n   VERDICT:');
    console.log('   UI <-> DB: ' + (uiDbMatch ? '✅ MATCH' : '❌ MISMATCH'));
    console.log('   DB <-> S3: ' + (dbS3Match ? '✅ MATCH' : '❌ MISMATCH'));
    console.log('   Overall: ' + (verdict.allMatch ? '✅ PASS' : '❌ FAIL'));

    if (!verdict.allMatch) {
      console.log('\n   ⚠️  INVESTIGATION REQUIRED');
      if (!uiDbMatch) {
        console.log('      UI shows ' + uiSucceeded + ' but DB has ' + dbTotal + ' documents');
      }
      if (!dbS3Match) {
        console.log('      DB has ' + dbStats.withS3Key + ' S3 keys but only ' + s3Verified + ' verified');
      }
    }
  }

  // 5. Generate report object
  const report = {
    timestamp: new Date().toISOString(),
    sessionId,
    verdict,
    ui: uiResults ? {
      discovered: uiResults.discovered,
      succeeded: uiResults.succeeded?.length || uiResults.successCount,
      failed: uiResults.failed?.length || uiResults.failureCount,
      skipped: uiResults.skipped?.length || 0
    } : null,
    database: {
      total: dbStats.total,
      byStatus: dbStats.byStatus,
      withS3Key: dbStats.withS3Key,
      missingS3Key: dbStats.withoutS3Key
    },
    s3: {
      verified: s3Verified,
      missingCount: s3Missing.length,
      sizeMismatchCount: s3SizeMismatch.length
    }
  };

  // Save report
  const reportPath = '/tmp/truth-report-' + sessionId + '.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  if (!quiet) console.log('\n📄 Report saved to: ' + reportPath);
  
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  }

  await prisma.$disconnect();
  return report;
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Upload Truth Audit - Truth Report Generator

Usage:
  node truth-report.js <session_id> [ui_json_file] [options]

Arguments:
  session_id     Upload session ID (format: timestamp-random, e.g., 1704825600000-abc123)
  ui_json_file   Optional path to UI results JSON file

Options:
  --quiet, -q    Minimal output
  --json, -j     Output report as JSON
  --help, -h     Show this help

Examples:
  node truth-report.js 1704825600000-abc123
  node truth-report.js 1704825600000-abc123 /tmp/ui-result.json
  node truth-report.js 1704825600000-abc123 /tmp/ui-result.json --json
`);
    process.exit(0);
  }
  
  const sessionId = args.find(a => !a.startsWith('-') && !a.endsWith('.json'));
  const uiResultsPath = args.find(a => a.endsWith('.json'));
  const options = {
    quiet: args.includes('--quiet') || args.includes('-q'),
    json: args.includes('--json') || args.includes('-j')
  };

  generateTruthReport(sessionId, uiResultsPath, options)
    .then(report => {
      process.exit(report.verdict.allMatch ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = { generateTruthReport };
