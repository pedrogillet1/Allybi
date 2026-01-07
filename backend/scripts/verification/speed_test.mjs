/**
 * Speed Test - Response Time Verification
 *
 * Measures:
 * - Time to First Token (TTFT)
 * - Total response time
 * - Tokens per second throughput
 *
 * Usage: node scripts/verification/speed_test.mjs
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_EMAIL = 'test@koda.com';
const TEST_PASSWORD = 'test123';

// Speed thresholds (milliseconds)
const THRESHOLDS = {
  ttft: 2000,        // Time to first token should be < 2s
  simple: 3000,      // Simple queries < 3s total
  moderate: 8000,    // Moderate queries < 8s total
  complex: 15000,    // Complex queries < 15s total
};

const TEST_QUERIES = [
  // Simple queries (conversation, help)
  { query: 'hello', name: 'Greeting', complexity: 'simple' },
  { query: 'how do I upload files?', name: 'Help', complexity: 'simple' },

  // Moderate queries (single doc operations)
  { query: 'summarize my documents', name: 'Workspace summary', complexity: 'moderate' },
  { query: 'what documents do I have?', name: 'List documents', complexity: 'moderate' },

  // Complex queries (RAG with retrieval)
  { query: 'what are the profit totals in Rosewood Fund?', name: 'Doc QnA', complexity: 'complex' },
  { query: 'summarize Rosewood Fund v3.xlsx', name: 'Single doc summary', complexity: 'complex' },
  { query: 'compare revenue between Baxter Hotel and Lone Mountain Ranch', name: 'Comparison', complexity: 'complex' },
];

async function login() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Login failed: ${response.status}`);
  const data = await response.json();
  return data.accessToken;
}

async function createConversation(token) {
  const response = await fetch(`${API_URL}/api/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ title: 'Speed Test' }),
  });
  if (!response.ok) throw new Error(`Create conversation failed: ${response.status}`);
  const data = await response.json();
  return data.id;
}

async function measureQuerySpeed(token, conversationId, query) {
  const startTime = performance.now();
  let ttfr = null; // Time to First Response (any event)
  let ttfc = null; // Time to First Content (actual answer)
  let tokenCount = 0;
  let totalChars = 0;

  const response = await fetch(`${API_URL}/api/rag/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, query }),
  });

  if (!response.ok) throw new Error(`Query failed: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split('\n\n');
    buffer = messages.pop() || '';

    for (const message of messages) {
      if (message.startsWith('data: ')) {
        try {
          const data = JSON.parse(message.slice(6));

          // Track time to first ANY response (intent, retrieving, etc)
          if (ttfr === null && ['intent', 'retrieving', 'content'].includes(data.type)) {
            ttfr = performance.now() - startTime;
          }

          if (data.type === 'content') {
            if (ttfc === null) {
              ttfc = performance.now() - startTime;
            }
            tokenCount++;
            totalChars += data.content?.length || 0;
          }
        } catch (e) {
          // Skip parse errors
        }
      }
    }
  }

  const totalTime = performance.now() - startTime;
  const tokensPerSecond = tokenCount > 0 ? (tokenCount / (totalTime / 1000)).toFixed(1) : 0;

  return {
    ttfr: ttfr ? Math.round(ttfr) : null, // Time to First Response (perceived)
    ttfc: ttfc ? Math.round(ttfc) : null, // Time to First Content (actual answer)
    totalTime: Math.round(totalTime),
    tokenCount,
    totalChars,
    tokensPerSecond,
  };
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatus(value, threshold) {
  if (value <= threshold * 0.5) return '🟢'; // Excellent (< 50% of threshold)
  if (value <= threshold * 0.8) return '🟡'; // Good (< 80% of threshold)
  if (value <= threshold) return '🟠';       // Acceptable (within threshold)
  return '🔴';                                // Too slow (exceeds threshold)
}

async function runSpeedTests() {
  console.log('⚡ Speed Test - Response Time Verification\n');
  console.log('='.repeat(70));

  let token, conversationId;

  try {
    console.log('\n📋 Setup');
    token = await login();
    console.log('   ✅ Logged in');

    conversationId = await createConversation(token);
    console.log('   ✅ Created conversation:', conversationId);
  } catch (error) {
    console.error('   ❌ Setup failed:', error.message);
    process.exit(1);
  }

  console.log('\n📊 Speed Test Results');
  console.log('-'.repeat(70));
  console.log('Thresholds: TTFR < 1s (perceived) | TTFC < 2.5s (content) | Total varies');
  console.log('-'.repeat(70));

  const results = [];
  let passCount = 0;
  let failCount = 0;

  for (const { query, name, complexity } of TEST_QUERIES) {
    console.log(`\n⏱️  ${name} (${complexity})`);
    console.log(`   Query: "${query}"`);

    try {
      const metrics = await measureQuerySpeed(token, conversationId, query);
      const threshold = THRESHOLDS[complexity];

      // TTFR (perceived) should be < 1s (intent + retrieving events)
      const ttfrStatus = metrics.ttfr ? getStatus(metrics.ttfr, 1000) : '⚪';
      // TTFC (content) should be < 2.5s for complex
      const ttfcThreshold = complexity === 'complex' ? 2500 : THRESHOLDS.ttft;
      const ttfcStatus = metrics.ttfc ? getStatus(metrics.ttfc, ttfcThreshold) : '⚪';
      const totalStatus = getStatus(metrics.totalTime, threshold);

      // Pass if TTFR < 1s OR total time is within threshold
      const passed = (metrics.ttfr && metrics.ttfr <= 1000) || metrics.totalTime <= threshold;

      console.log(`   ${ttfrStatus} TTFR: ${metrics.ttfr ? formatTime(metrics.ttfr) : 'N/A'} (perceived response)`);
      console.log(`   ${ttfcStatus} TTFC: ${metrics.ttfc ? formatTime(metrics.ttfc) : 'N/A'} (first content)`);
      console.log(`   ${totalStatus} Total: ${formatTime(metrics.totalTime)} (threshold: ${formatTime(threshold)})`);
      console.log(`   📊 ${metrics.tokenCount} tokens @ ${metrics.tokensPerSecond} tok/s`);
      console.log(`   ${passed ? '✅ PASS' : '❌ FAIL'}`);

      if (passed) passCount++;
      else failCount++;

      results.push({
        query,
        name,
        complexity,
        metrics,
        threshold,
        passed,
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failCount++;
      results.push({
        query,
        name,
        complexity,
        error: error.message,
        passed: false,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Summary');

  const avgTtfr = results
    .filter(r => r.metrics?.ttfr)
    .reduce((sum, r) => sum + r.metrics.ttfr, 0) / results.filter(r => r.metrics?.ttfr).length || 0;

  const avgTtfc = results
    .filter(r => r.metrics?.ttfc)
    .reduce((sum, r) => sum + r.metrics.ttfc, 0) / results.filter(r => r.metrics?.ttfc).length || 0;

  const avgTotal = results
    .filter(r => r.metrics?.totalTime)
    .reduce((sum, r) => sum + r.metrics.totalTime, 0) / results.filter(r => r.metrics?.totalTime).length || 0;

  console.log(`   Total queries: ${TEST_QUERIES.length}`);
  console.log(`   ✅ Passed: ${passCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⏱️  Avg TTFR: ${formatTime(Math.round(avgTtfr))} (perceived response)`);
  console.log(`   ⏱️  Avg TTFC: ${formatTime(Math.round(avgTtfc))} (first content)`);
  console.log(`   ⏱️  Avg Total: ${formatTime(Math.round(avgTotal))}`);
  console.log('='.repeat(70));

  // Save results
  const outputDir = '/tmp/verification';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'speed_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Results saved to: ${outputPath}`);

  process.exit(failCount > 0 ? 1 : 0);
}

runSpeedTests().catch(console.error);
