/**
 * All Intents Orchestrator - Generate CONVERSATION, DOCUMENTS, and HELP
 * Uses Google Cloud Run with distributed rate limiting
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { generateAllJobs as generateConversationJobs, calculateTotals as calcConversationTotals } from './conversationSchema.mjs';
import { generateAllJobs as generateHelpJobs, calculateTotals as calcHelpTotals } from './helpSchema.mjs';
import { generateAllJobs as generateDocumentsJobs, calculateTotals as calcDocumentsTotals } from './documentsSchema.mjs';
import { Redis } from '@upstash/redis';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SELECTED_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL || 'http://localhost:8080';

const MODEL_CONFIGS = {
  'claude-haiku-4-5-20251001': {
    requestsPerMinute: 4000,
    outputTokensPerMinute: 800000,
    recommendedConcurrency: 100,
    safetyMargin: 0.95
  }
};

const MODEL_CONFIG = MODEL_CONFIGS[SELECTED_MODEL] || MODEL_CONFIGS['claude-haiku-4-5-20251001'];
const ESTIMATED_OUTPUT_TOKENS = 1500;
const SAFE_RPM = Math.floor(MODEL_CONFIG.requestsPerMinute * MODEL_CONFIG.safetyMargin);
const SAFE_OUTPUT_TPM = Math.floor(MODEL_CONFIG.outputTokensPerMinute * MODEL_CONFIG.safetyMargin);
const MAX_JOBS_PER_MINUTE = Math.min(SAFE_RPM, Math.floor(SAFE_OUTPUT_TPM / ESTIMATED_OUTPUT_TOKENS));
const WORKERS = 100;
const MAX_INFLIGHT_CALLS = 100;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000;
const INITIAL_STAGGER_MS = 50;

// Redis keys
const KEYS = {
  requestCount: 'claude:ratelimit:requests:min',
  outputTokenCount: 'claude:ratelimit:output_tokens:min',
  inflightSet: 'claude:ratelimit:inflight',
  windowStart: 'claude:ratelimit:window_start'
};

// Output directories
const OUTPUT_DIRS = {
  conversation: './output/conversation',
  help: './output/help',
  documents: './output/documents'
};

// =============================================================================
// SETUP
// =============================================================================

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  });
} catch (error) {
  console.error('Redis initialization failed:', error.message);
  process.exit(1);
}

// Create output directories
Object.values(OUTPUT_DIRS).forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// =============================================================================
// RATE LIMITING
// =============================================================================

async function acquireRateLimit(jobId, estimatedOutputTokens = ESTIMATED_OUTPUT_TOKENS) {
  const now = Date.now();
  const windowStartTime = await redis.get(KEYS.windowStart);
  const windowStart = windowStartTime ? parseInt(windowStartTime) : now;
  const windowAge = now - windowStart;

  if (windowAge >= 60000) {
    await redis.set(KEYS.windowStart, now.toString());
    await redis.set(KEYS.requestCount, '0');
    await redis.set(KEYS.outputTokenCount, '0');
  }

  const [currentRequests, currentOutputTokens, inflightCount] = await Promise.all([
    redis.get(KEYS.requestCount).then(v => parseInt(v || '0')),
    redis.get(KEYS.outputTokenCount).then(v => parseInt(v || '0')),
    redis.scard(KEYS.inflightSet)
  ]);

  if (currentRequests >= SAFE_RPM) return false;
  if (currentOutputTokens + estimatedOutputTokens > SAFE_OUTPUT_TPM) return false;
  if (inflightCount >= MAX_INFLIGHT_CALLS) return false;

  await Promise.all([
    redis.incr(KEYS.requestCount),
    redis.incrby(KEYS.outputTokenCount, estimatedOutputTokens),
    redis.sadd(KEYS.inflightSet, jobId),
    redis.expire(KEYS.inflightSet, 120)
  ]);

  return true;
}

async function releaseInflight(jobId) {
  await redis.srem(KEYS.inflightSet, jobId);
}

// =============================================================================
// WORKER
// =============================================================================

async function processJob(job, retries = 0) {
  const { jobId, intent } = job;

  try {
    const acquired = await acquireRateLimit(jobId);
    if (!acquired) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processJob(job, retries);
    }

    const response = await fetch(`${CLOUD_RUN_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job)
    });

    await releaseInflight(jobId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    // Save result
    const outputDir = OUTPUT_DIRS[intent] || './output';
    const outputPath = `${outputDir}/${jobId}.json`;
    writeFileSync(outputPath, JSON.stringify(result.data, null, 2));

    console.log(`✓ ${jobId} → ${result.itemCount} items`);
    return result;

  } catch (error) {
    await releaseInflight(jobId);

    if (retries < MAX_RETRIES && (error.message.includes('429') || error.message.includes('rate'))) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, retries) + Math.random() * 1000;
      console.log(`⏳ ${jobId} rate limited, retry ${retries + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return processJob(job, retries + 1);
    }

    console.error(`✗ ${jobId} failed:`, error.message);
    throw error;
  }
}

// =============================================================================
// ORCHESTRATOR
// =============================================================================

async function runOrchestrator() {
  console.log('🚀 All Intents Orchestrator Starting...\n');
  console.log('📊 Generating 3 intents:');
  console.log('  - CONVERSATION (meta-conversational AI response control)');
  console.log('  - DOCUMENTS (document content and operations)');
  console.log('  - HELP (Koda product usage and features)\n');

  // Generate all jobs
  const conversationJobs = generateConversationJobs();
  const helpJobs = generateHelpJobs();
  const documentsJobs = generateDocumentsJobs();
  const allJobs = [...conversationJobs, ...helpJobs, ...documentsJobs];

  const convTotals = calcConversationTotals();
  const helpTotals = calcHelpTotals();
  const docsTotals = calcDocumentsTotals();

  console.log(`📦 CONVERSATION: ${convTotals.totalJobs} jobs → ${convTotals.totalSignals.toLocaleString()} signals`);
  console.log(`📦 HELP: ${helpTotals.totalJobs} jobs → ${helpTotals.totalSignals.toLocaleString()} signals`);
  console.log(`📦 DOCUMENTS: ${docsTotals.jobCount} jobs → ${docsTotals.totals.grandTotal.toLocaleString()} signals`);
  console.log(`\n📊 TOTAL: ${allJobs.length} jobs → ${(convTotals.totalSignals + helpTotals.totalSignals + docsTotals.totals.grandTotal).toLocaleString()} signals\n`);

  console.log(`⚙️  Model: ${SELECTED_MODEL}`);
  console.log(`⚙️  Rate limits: ${SAFE_RPM} RPM, ${Math.floor(SAFE_OUTPUT_TPM/1000)}K output TPM`);
  console.log(`⚙️  Workers: ${WORKERS}, Max concurrent: ${MAX_INFLIGHT_CALLS}`);
  console.log(`⚙️  Cloud Run: ${CLOUD_RUN_URL}\n`);

  const startTime = Date.now();

  // Process jobs with worker pool
  const workerPool = Array(WORKERS).fill(null).map((_, i) => ({
    id: i,
    processing: false,
    processed: 0
  }));

  let jobIndex = 0;
  let completed = 0;
  let failed = 0;

  async function worker(workerData) {
    while (jobIndex < allJobs.length) {
      const job = allJobs[jobIndex++];
      if (!job) break;

      workerData.processing = true;
      await new Promise(resolve => setTimeout(resolve, INITIAL_STAGGER_MS * workerData.id));

      try {
        await processJob(job);
        completed++;
        workerData.processed++;
      } catch (error) {
        failed++;
      }

      workerData.processing = false;

      const progress = ((completed + failed) / allJobs.length * 100).toFixed(1);
      console.log(`Progress: ${completed + failed}/${allJobs.length} (${progress}%) - ✓${completed} ✗${failed}`);
    }
  }

  await Promise.all(workerPool.map(w => worker(w)));

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const successRate = ((completed / allJobs.length) * 100).toFixed(1);

  console.log(`\n✅ Generation complete!`);
  console.log(`   Completed: ${completed}/${allJobs.length} (${successRate}%)`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Duration: ${duration}s`);
  console.log(`   Rate: ${(completed / (duration / 60)).toFixed(1)} jobs/min\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// =============================================================================
// RUN
// =============================================================================

runOrchestrator().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
