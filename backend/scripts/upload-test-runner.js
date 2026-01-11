/**
 * UPLOAD TRUTH AUDIT - Automated Test Runner
 *
 * Runs upload tests through the API and generates truth reports.
 *
 * SECURITY: This script does NOT log secrets, auth tokens, or presigned URLs.
 *
 * Usage:
 *   node upload-test-runner.js <test_name> <auth_token> [options]
 *   node upload-test-runner.js --list
 *   node upload-test-runner.js --help
 */

const { PrismaClient } = require('@prisma/client');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:5000';
const TEST_DATA_DIR = '/tmp/upload-test-datasets';

// Test configurations
const TESTS = {
  'unicode': {
    folder: 'FolderC_Unicode',
    description: '17 files with unicode/emoji filenames',
    expectedFiles: 17
  },
  'nested': {
    folder: 'FolderA_Nested',
    description: '150 files in 3-level nested structure',
    expectedFiles: 150
  },
  'edge-cases': {
    folder: 'FolderD_EdgeCases',
    description: '9 files (4 valid, 5 hidden to filter)',
    expectedFiles: 4,
    hiddenCount: 5
  },
  'bulk': {
    folder: 'FolderB_Bulk',
    description: '600 files for load testing',
    expectedFiles: 600
  },
  'large-50mb': {
    folder: 'FolderF_Large50MB',
    description: 'Single 50MB file (resumable upload)',
    expectedFiles: 1,
    generator: () => generateLargeFile(50)
  },
  'large-200mb': {
    folder: 'FolderG_Large200MB',
    description: 'Single 200MB file (resumable upload)',
    expectedFiles: 1,
    generator: () => generateLargeFile(200)
  },
  'expired-url': {
    folder: 'FolderC_Unicode',
    description: 'Test with expired presigned URL (should fail gracefully)',
    expectedFiles: 0,
    specialTest: 'expiredUrl'
  },
  'duplicate-names': {
    folder: 'FolderH_Duplicates',
    description: 'Same filename in different folders',
    expectedFiles: 3,
    generator: generateDuplicateFiles
  },
  'network-interrupt': {
    folder: 'FolderC_Unicode',
    description: 'Simulate network interruption mid-upload',
    expectedFiles: 0,
    specialTest: 'networkInterrupt'
  }
};

// Generate session ID
function generateSessionId() {
  return Date.now() + '-' + crypto.randomBytes(3).toString('hex');
}

// Generate large test file
async function generateLargeFile(sizeMB) {
  const folder = path.join(TEST_DATA_DIR, 'FolderF_Large' + sizeMB + 'MB');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const filePath = path.join(folder, 'large_' + sizeMB + 'mb_test.txt');
  if (!fs.existsSync(filePath)) {
    console.log('   Generating ' + sizeMB + 'MB test file...');
    const fd = fs.openSync(filePath, 'w');
    const chunkSize = 1024 * 1024; // 1MB chunks
    const chunk = Buffer.alloc(chunkSize, 'A');

    for (let i = 0; i < sizeMB; i++) {
      fs.writeSync(fd, chunk);
      if ((i + 1) % 10 === 0) {
        process.stdout.write('   Progress: ' + (i + 1) + '/' + sizeMB + 'MB\r');
      }
    }
    fs.closeSync(fd);
    console.log('   Generated ' + sizeMB + 'MB file');
  }
  return folder;
}

// Generate duplicate filename test files
async function generateDuplicateFiles() {
  const baseFolder = path.join(TEST_DATA_DIR, 'FolderH_Duplicates');
  const subFolder1 = path.join(baseFolder, 'SubA');
  const subFolder2 = path.join(baseFolder, 'SubB');

  [baseFolder, subFolder1, subFolder2].forEach(f => {
    if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });
  });

  // Same filename in different locations
  fs.writeFileSync(path.join(baseFolder, 'report.txt'), 'Root report');
  fs.writeFileSync(path.join(subFolder1, 'report.txt'), 'SubA report');
  fs.writeFileSync(path.join(subFolder2, 'report.txt'), 'SubB report');

  return baseFolder;
}

// Count files in directory recursively
function countFilesInDir(dirPath, stats) {
  if (!stats) stats = { total: 0, hidden: 0, valid: 0 };
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      countFilesInDir(itemPath, stats);
    } else {
      stats.total++;
      const isHidden = item.startsWith('.') || item === 'Thumbs.db' || item === 'desktop.ini';
      if (isHidden) stats.hidden++;
      else stats.valid++;
    }
  }
  return stats;
}

// List files recursively
function listFiles(dirPath, basePath, files) {
  if (!basePath) basePath = '';
  if (!files) files = [];
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const relativePath = basePath ? path.join(basePath, item) : item;
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      listFiles(itemPath, relativePath, files);
    } else {
      const isHidden = item.startsWith('.') || item === 'Thumbs.db' || item === 'desktop.ini';
      if (!isHidden) {
        files.push({
          fileName: item,
          relativePath: relativePath.replace(/\\/g, '/'),
          filePath: itemPath,
          fileSize: stat.size,
          fileType: getMimeType(item)
        });
      }
    }
  }
  return files;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.jpg': 'image/jpeg',
    '.png': 'image/png'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Make API request (no token logging)
function makeApiRequest(endpoint, method, body, authToken, headers) {
  if (!headers) headers = {};
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + endpoint);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + authToken
      }, headers)
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Upload to S3 (no URL logging)
function uploadToS3(presignedUrl, content, contentType, options) {
  if (!options) options = {};
  return new Promise((resolve, reject) => {
    const url = new URL(presignedUrl);
    const client = url.protocol === 'https:' ? https : http;
    const timeout = options.timeout || 60000;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'x-amz-server-side-encryption': 'AES256'
      },
      timeout: timeout
    };

    const req = client.request(reqOptions, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ success: true });
      } else {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          reject(new Error('S3 upload failed: HTTP ' + res.statusCode));
        });
      }
    });

    req.on('error', err => reject(new Error('S3 upload error: ' + err.code)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('S3 upload timeout'));
    });

    // Simulate network interrupt if requested
    if (options.abortAfter) {
      setTimeout(() => {
        req.destroy();
        reject(new Error('Network interrupted (simulated)'));
      }, options.abortAfter);
    }

    req.write(content);
    req.end();
  });
}

// Main test runner
async function runTest(testName, authToken, options) {
  if (!options) options = {};
  const test = TESTS[testName];
  if (!test) {
    console.error('Unknown test: ' + testName);
    console.error('Available tests: ' + Object.keys(TESTS).join(', '));
    process.exit(1);
  }

  const sessionId = generateSessionId();

  console.log('\n========================================');
  console.log('UPLOAD TEST: ' + testName);
  console.log('========================================');
  console.log('Description: ' + test.description);
  console.log('Session ID: ' + sessionId);
  console.log('========================================\n');

  // Generate test data if needed
  let testFolder = path.join(TEST_DATA_DIR, test.folder);
  if (test.generator) {
    testFolder = await test.generator();
  }

  if (!fs.existsSync(testFolder)) {
    console.error('Test folder not found: ' + testFolder);
    console.error('Run: npm run upload-test:generate-data');
    process.exit(1);
  }

  const stats = countFilesInDir(testFolder);
  const files = listFiles(testFolder);

  console.log('Test folder: ' + test.folder);
  console.log('   Total files: ' + stats.total);
  console.log('   Valid files: ' + stats.valid);
  console.log('   Hidden (to skip): ' + stats.hidden);

  // Handle special tests
  if (test.specialTest === 'expiredUrl') {
    return runExpiredUrlTest(files.slice(0, 1), authToken, sessionId);
  }

  if (test.specialTest === 'networkInterrupt') {
    return runNetworkInterruptTest(files.slice(0, 5), authToken, sessionId);
  }

  // Standard upload test
  console.log('\nRequesting presigned URLs...');

  const presignedResponse = await makeApiRequest('/api/presigned-urls/bulk', 'POST', {
    files: files.map(f => ({
      fileName: f.fileName,
      fileType: f.fileType,
      fileSize: f.fileSize,
      relativePath: f.relativePath
    })),
    folderId: null,
    uploadSessionId: sessionId
  }, authToken, { 'X-Upload-Session-Id': sessionId });

  if (presignedResponse.status !== 200 || !presignedResponse.data.presignedUrls) {
    console.error('Failed to get presigned URLs');
    return { success: false, error: 'Failed to get presigned URLs' };
  }

  console.log('   Received ' + presignedResponse.data.presignedUrls.length + ' presigned URLs');

  // Upload files
  console.log('\nUploading files to S3...');
  const uploadResults = { succeeded: [], failed: [] };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const presignedUrl = presignedResponse.data.presignedUrls[i];
    const documentId = presignedResponse.data.documentIds[i];

    try {
      const fileContent = fs.readFileSync(file.filePath);
      await uploadToS3(presignedUrl, fileContent, file.fileType);

      await makeApiRequest('/api/presigned-urls/complete/' + documentId, 'POST', {
        fileSize: file.fileSize
      }, authToken);

      uploadResults.succeeded.push({ fileName: file.fileName, documentId: documentId });

      if ((i + 1) % 50 === 0) {
        console.log('   Progress: ' + (i + 1) + '/' + files.length);
      }
    } catch (error) {
      uploadResults.failed.push({ fileName: file.fileName, error: error.message });
    }
  }

  console.log('   Succeeded: ' + uploadResults.succeeded.length);
  console.log('   Failed: ' + uploadResults.failed.length);

  // Call reconciliation to ensure no orphaned 'uploading' records
  const allDocumentIds = presignedResponse.data.documentIds;
  console.log('\n   Calling reconciliation endpoint...');

  const reconcileResponse = await makeApiRequest('/api/presigned-urls/reconcile', 'POST', {
    documentIds: allDocumentIds,
    sessionId: sessionId
  }, authToken);

  if (reconcileResponse.status === 200) {
    const reconciliation = reconcileResponse.data;
    console.log('   Reconciliation: ' + reconciliation.orphanedCount + ' failed_incomplete, ' + reconciliation.verifiedCount + ' late-verified');
  }

  // Save UI results and run truth report
  const uiResults = {
    uploadSessionId: sessionId,
    discovered: stats.total,
    succeeded: uploadResults.succeeded,
    failed: uploadResults.failed,
    skipped: stats.hidden
  };

  const uiResultsPath = '/tmp/ui-result-' + sessionId + '.json';
  fs.writeFileSync(uiResultsPath, JSON.stringify(uiResults, null, 2));

  console.log('\nRunning truth report...');
  await new Promise(r => setTimeout(r, 2000));

  const { generateTruthReport } = require('./truth-report.js');
  const report = await generateTruthReport(sessionId, uiResultsPath, { quiet: options.quiet });

  const passed = uploadResults.succeeded.length === test.expectedFiles && report.verdict.allMatch;

  console.log('\n========================================');
  console.log('TEST RESULT: ' + (passed ? 'PASS' : 'FAIL'));
  console.log('========================================');
  console.log('Expected: ' + test.expectedFiles + ' files');
  console.log('Uploaded: ' + uploadResults.succeeded.length + ' files');

  await prisma.$disconnect();
  return { success: passed, sessionId: sessionId, report: report };
}

// Test expired presigned URL
async function runExpiredUrlTest(files, authToken, sessionId) {
  console.log('\nTesting expired presigned URL scenario...');

  const presignedResponse = await makeApiRequest('/api/presigned-urls/bulk', 'POST', {
    files: files.map(f => ({ fileName: f.fileName, fileType: f.fileType, fileSize: f.fileSize })),
    folderId: null
  }, authToken);

  if (!presignedResponse.data.presignedUrls) {
    return { success: false, error: 'Failed to get presigned URL' };
  }

  // Simulate expired URL by modifying the signature
  const expiredUrl = presignedResponse.data.presignedUrls[0].replace(/Signature=[^&]+/, 'Signature=invalid');

  try {
    const fileContent = fs.readFileSync(files[0].filePath);
    await uploadToS3(expiredUrl, fileContent, files[0].fileType);
    console.log('Upload should have failed with expired URL');
    return { success: false, error: 'Upload succeeded when it should have failed' };
  } catch (error) {
    console.log('Upload correctly failed with expired URL');
    console.log('   Error: ' + error.message);
    return { success: true, sessionId: sessionId, message: 'Expired URL correctly rejected' };
  }
}

// Test network interruption
async function runNetworkInterruptTest(files, authToken, sessionId) {
  console.log('\nTesting network interruption scenario...');

  const presignedResponse = await makeApiRequest('/api/presigned-urls/bulk', 'POST', {
    files: files.map(f => ({ fileName: f.fileName, fileType: f.fileType, fileSize: f.fileSize })),
    folderId: null,
    uploadSessionId: sessionId
  }, authToken, { 'X-Upload-Session-Id': sessionId });

  if (!presignedResponse.data.presignedUrls) {
    return { success: false, error: 'Failed to get presigned URLs' };
  }

  const results = { succeeded: [], failed: 0, interrupted: 0, interruptedDocId: null };
  const allDocumentIds = presignedResponse.data.documentIds;

  // Phase 1: Upload all files to S3 (no per-file completion calls)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const presignedUrl = presignedResponse.data.presignedUrls[i];
    const documentId = presignedResponse.data.documentIds[i];

    try {
      const fileContent = fs.readFileSync(file.filePath);

      // Interrupt the 3rd upload mid-stream
      if (i === 2) {
        results.interruptedDocId = documentId;
        await uploadToS3(presignedUrl, fileContent, file.fileType, { abortAfter: 100 });
      } else {
        await uploadToS3(presignedUrl, fileContent, file.fileType);
        results.succeeded.push(documentId);
      }
    } catch (error) {
      if (error.message.indexOf('interrupted') >= 0) {
        results.interrupted++;
        console.log('   File ' + (i + 1) + ': Interrupted (as expected)');
      } else {
        results.failed++;
        console.log('   File ' + (i + 1) + ': Failed - ' + error.message);
      }
    }
  }

  console.log('\n   S3 Upload Results:');
  console.log('   Succeeded: ' + results.succeeded.length);
  console.log('   Interrupted: ' + results.interrupted);
  console.log('   Failed: ' + results.failed);

  // Phase 2: Bulk completion for all successful uploads
  if (results.succeeded.length > 0) {
    console.log('\n   Calling bulk completion for ' + results.succeeded.length + ' successful uploads...');
    const bulkCompleteResponse = await makeApiRequest('/api/presigned-urls/complete-bulk', 'POST', {
      documentIds: results.succeeded,
      uploadSessionId: sessionId,
      skipS3Check: false
    }, authToken);

    if (bulkCompleteResponse.status === 200) {
      const bulkResult = bulkCompleteResponse.data;
      console.log('   Bulk completion: ' + (bulkResult.stats?.confirmed || 0) + ' confirmed, ' + (bulkResult.stats?.failed || 0) + ' failed');
    } else {
      console.error('   Bulk completion failed: HTTP ' + bulkCompleteResponse.status);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST-SESSION RECONCILIATION - Call the reconcile endpoint
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log('\n   Calling reconciliation endpoint...');

  const reconcileResponse = await makeApiRequest('/api/presigned-urls/reconcile', 'POST', {
    documentIds: allDocumentIds,
    sessionId: sessionId
  }, authToken);

  if (reconcileResponse.status !== 200) {
    console.error('   Reconciliation failed: HTTP ' + reconcileResponse.status);
    return { success: false, error: 'Reconciliation failed', results: results };
  }

  const reconciliation = reconcileResponse.data;
  console.log('   Reconciliation complete:');
  console.log('      Orphaned (failed_incomplete): ' + reconciliation.orphanedCount);
  console.log('      Verified (late completion): ' + reconciliation.verifiedCount);

  // ═══════════════════════════════════════════════════════════════════════════════
  // INVARIANT CHECK: Verify the interrupted file is now 'failed_incomplete'
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log('\n   Verifying invariant: interrupted file should be failed_incomplete...');

  // Query database directly to verify status
  const interruptedDoc = await prisma.document.findUnique({
    where: { id: results.interruptedDocId },
    select: { id: true, status: true, filename: true }
  });

  if (!interruptedDoc) {
    console.error('   ERROR: Interrupted document not found in database');
    return { success: false, error: 'Interrupted document not found', results: results };
  }

  console.log('   Interrupted document status: ' + interruptedDoc.status);

  const interruptedIsFailedIncomplete = interruptedDoc.status === 'failed_incomplete';

  if (!interruptedIsFailedIncomplete) {
    console.error('   INVARIANT VIOLATED: Expected status "failed_incomplete", got "' + interruptedDoc.status + '"');
  } else {
    console.log('   ✅ INVARIANT SATISFIED: Interrupted file is "failed_incomplete"');
  }

  // Check no documents remain in 'uploading' status
  const uploadingDocs = await prisma.document.findMany({
    where: {
      id: { in: allDocumentIds },
      status: 'uploading'
    }
  });

  const noOrphans = uploadingDocs.length === 0;
  console.log('   Documents still in "uploading" status: ' + uploadingDocs.length);

  if (!noOrphans) {
    console.error('   INVARIANT VIOLATED: ' + uploadingDocs.length + ' documents still in "uploading" status');
  } else {
    console.log('   ✅ INVARIANT SATISFIED: No orphaned "uploading" records');
  }

  // Final assessment
  const passed = results.succeeded.length >= files.length - 1 &&
                 results.interrupted >= 1 &&
                 interruptedIsFailedIncomplete &&
                 noOrphans;

  console.log('\n========================================');
  console.log('NETWORK INTERRUPT TEST RESULT: ' + (passed ? 'PASS' : 'FAIL'));
  console.log('========================================');
  console.log('   Other uploads completed: ' + (results.succeeded.length >= files.length - 1 ? 'YES' : 'NO'));
  console.log('   Interrupted file is failed_incomplete: ' + (interruptedIsFailedIncomplete ? 'YES' : 'NO'));
  console.log('   No orphaned uploading records: ' + (noOrphans ? 'YES' : 'NO'));

  return {
    success: passed,
    sessionId: sessionId,
    results: results,
    reconciliation: reconciliation,
    invariantCheck: {
      interruptedIsFailedIncomplete,
      noOrphans,
      interruptedDocStatus: interruptedDoc.status
    }
  };
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.indexOf('--help') >= 0 || args.indexOf('-h') >= 0) {
    console.log('\nUpload Truth Audit - Test Runner\n');
    console.log('Usage:');
    console.log('  node upload-test-runner.js <test_name> <auth_token> [options]');
    console.log('  node upload-test-runner.js --list');
    console.log('  node upload-test-runner.js --all <auth_token>\n');
    console.log('Test Names:');
    console.log('  unicode          - 17 files with unicode/emoji filenames');
    console.log('  nested           - 150 files in nested folders');
    console.log('  edge-cases       - Hidden file filtering test');
    console.log('  bulk             - 600 files load test');
    console.log('  large-50mb       - Single 50MB file (resumable upload)');
    console.log('  large-200mb      - Single 200MB file (resumable upload)');
    console.log('  expired-url      - Expired presigned URL handling');
    console.log('  duplicate-names  - Same filename in different folders');
    console.log('  network-interrupt - Network interruption resilience\n');
    console.log('Options:');
    console.log('  --quiet, -q    Minimal output');
    console.log('  --list         List available tests');
    console.log('  --all          Run all tests sequentially\n');
    console.log('Security:');
    console.log('  - Auth tokens are NOT logged');
    console.log('  - Presigned URLs are NOT logged');
    console.log('  - S3 keys are masked in output');
    process.exit(0);
  }

  if (args.indexOf('--list') >= 0) {
    console.log('\nAvailable Tests:\n');
    Object.keys(TESTS).forEach(name => {
      const test = TESTS[name];
      console.log('  ' + name.padEnd(18) + ' - ' + test.description);
    });
    process.exit(0);
  }

  let testName = null;
  let authToken = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-') && TESTS[arg]) {
      testName = arg;
    } else if (arg.length > 50 && !arg.startsWith('-')) {
      authToken = arg;
    }
  }

  const runAll = args.indexOf('--all') >= 0;

  if (runAll && authToken) {
    (async () => {
      const results = {};
      const testNames = Object.keys(TESTS);
      for (let i = 0; i < testNames.length; i++) {
        const name = testNames[i];
        try {
          results[name] = await runTest(name, authToken, { quiet: true });
        } catch (err) {
          results[name] = { success: false, error: err.message };
        }
      }

      console.log('\n========================================');
      console.log('ALL TESTS COMPLETE');
      console.log('========================================');
      Object.keys(results).forEach(name => {
        const result = results[name];
        console.log('  ' + name.padEnd(18) + ': ' + (result.success ? 'PASS' : 'FAIL'));
      });

      const allPassed = Object.keys(results).every(k => results[k].success);
      process.exit(allPassed ? 0 : 1);
    })();
  } else if (testName && authToken) {
    const quiet = args.indexOf('-q') >= 0 || args.indexOf('--quiet') >= 0;
    runTest(testName, authToken, { quiet: quiet })
      .then(result => process.exit(result.success ? 0 : 1))
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
      });
  } else {
    console.error('Usage: node upload-test-runner.js <test_name> <auth_token>');
    console.error('Run with --help for more information');
    process.exit(1);
  }
}

module.exports = { runTest: runTest, TESTS: TESTS };
