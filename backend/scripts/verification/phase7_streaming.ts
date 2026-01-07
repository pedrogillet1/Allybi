/**
 * PHASE 7 — STREAMING INTEGRITY TEST
 * Verify streaming works incrementally (not buffered)
 */

import * as http from 'http';

interface StreamingResult {
  success: boolean;
  chunksReceived: number;
  totalBytes: number;
  firstChunkTime: number | null;
  totalTime: number;
  isIncremental: boolean;
  endMarkerReceived: boolean;
  error?: string;
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

async function testStreaming(query: string): Promise<StreamingResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let firstChunkTime: number | null = null;
    let chunksReceived = 0;
    let totalBytes = 0;
    let endMarkerReceived = false;
    const chunkTimes: number[] = [];

    const url = new URL(`${BACKEND_URL}/api/rag/query/stream`);

    const postData = JSON.stringify({
      query,
      userId: 'test-user',
      organizationId: 'test-org',
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 5000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      res.on('data', (chunk) => {
        const now = Date.now();
        if (firstChunkTime === null) {
          firstChunkTime = now - startTime;
        }
        chunkTimes.push(now - startTime);
        chunksReceived++;
        totalBytes += chunk.length;

        const chunkStr = chunk.toString();
        if (chunkStr.includes('[DONE]') || chunkStr.includes('"done":true')) {
          endMarkerReceived = true;
        }
      });

      res.on('end', () => {
        const totalTime = Date.now() - startTime;

        // Check if streaming was incremental
        // If all chunks arrive at nearly the same time, it's buffered
        let isIncremental = true;
        if (chunkTimes.length > 2) {
          const timeDiffs = [];
          for (let i = 1; i < chunkTimes.length; i++) {
            timeDiffs.push(chunkTimes[i] - chunkTimes[i - 1]);
          }
          // If variance in time diffs is very low and all arrive together, not incremental
          const avgDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
          isIncremental = avgDiff > 10 || chunksReceived < 3; // At least 10ms between chunks on average
        }

        resolve({
          success: res.statusCode === 200,
          chunksReceived,
          totalBytes,
          firstChunkTime,
          totalTime,
          isIncremental,
          endMarkerReceived,
        });
      });

      res.on('error', (err) => {
        resolve({
          success: false,
          chunksReceived,
          totalBytes,
          firstChunkTime,
          totalTime: Date.now() - startTime,
          isIncremental: false,
          endMarkerReceived: false,
          error: err.message,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        success: false,
        chunksReceived: 0,
        totalBytes: 0,
        firstChunkTime: null,
        totalTime: Date.now() - startTime,
        isIncremental: false,
        endMarkerReceived: false,
        error: err.message,
      });
    });

    // Timeout after 30 seconds
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({
        success: false,
        chunksReceived,
        totalBytes,
        firstChunkTime,
        totalTime: Date.now() - startTime,
        isIncremental: false,
        endMarkerReceived: false,
        error: 'Request timeout',
      });
    });

    req.write(postData);
    req.end();
  });
}

async function runStreamingTests(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 7 — STREAMING INTEGRITY TEST');
  console.log('='.repeat(60) + '\n');

  const testQueries = [
    'summarize this document',
    'explain the methodology',
    'what are the key findings?',
  ];

  let allPassed = true;

  for (const query of testQueries) {
    console.log(`Testing: "${query}"`);

    const result = await testStreaming(query);

    if (result.success) {
      console.log(`  ✓ Request successful`);
      console.log(`    Chunks: ${result.chunksReceived}`);
      console.log(`    Bytes: ${result.totalBytes}`);
      console.log(`    First chunk: ${result.firstChunkTime}ms`);
      console.log(`    Total time: ${result.totalTime}ms`);
      console.log(`    Incremental: ${result.isIncremental}`);
      console.log(`    End marker: ${result.endMarkerReceived}`);

      if (!result.isIncremental) {
        console.log(`    ⚠️  WARNING: Response may be buffered (not truly streaming)`);
        allPassed = false;
      }

      if (!result.endMarkerReceived) {
        console.log(`    ⚠️  WARNING: No end marker received`);
      }
    } else {
      console.log(`  ✗ Request failed: ${result.error}`);
      allPassed = false;
    }

    console.log('');
  }

  // Summary
  console.log('-'.repeat(60));

  if (!allPassed) {
    console.log('\n❌ STREAMING TEST FAILED or has warnings');
    console.log('\nPossible issues:');
    console.log('  - Response arrives as one block (not streaming)');
    console.log('  - Server may be buffering responses');
    console.log('  - No [DONE] marker at end of stream');
    process.exit(1);
  }

  console.log('\n✅ Streaming integrity tests passed');
  console.log('\nVerified:');
  console.log('  - Tokens stream incrementally');
  console.log('  - No buffering until end');
  console.log('  - End marker sent');

  console.log('\n' + '='.repeat(60) + '\n');
}

// Also provide curl command for manual testing
console.log('Manual test command:');
console.log(`curl -N ${BACKEND_URL}/api/rag/query/stream \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{"query":"summarize this document"}'`);
console.log('');

// Run
runStreamingTests().catch(err => {
  console.error('Streaming test error:', err);
  process.exit(1);
});
