/**
 * KODA Master Orchestrator v6.1 - HIGH-CEILING GENERATION
 *
 * Batch-by-intent execution with LOCAL rate limiting (no Redis required)
 *
 * Run: node masterOrchestrator.mjs [--tier 0|1|2] [--intent INTENT_NAME] [--dry-run]
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import {
  generateAllJobs,
  getJobsForTier,
  generateJobsForIntent,
  calculateTotals,
  SUPPORTED_LANGUAGES,
  INTENT_TARGETS
} from './masterSchema.mjs';
import { SYSTEM_PROMPT, buildPrompt } from './masterPrompts.mjs';

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

const MODEL_CONFIGS = {
  'claude-haiku-4-5-20251001': {
    requestsPerMinute: 4000,
    outputTokensPerMinute: 800000,
    maxTokensPerRequest: 4096,
    recommendedConcurrency: 100,
    safetyMargin: 0.95
  },
  'claude-haiku-4-20250514': {
    requestsPerMinute: 4000,
    outputTokensPerMinute: 800000,
    maxTokensPerRequest: 2048,
    recommendedConcurrency: 100,
    safetyMargin: 0.85
  },
  'claude-sonnet-4-20250514': {
    requestsPerMinute: 4000,
    outputTokensPerMinute: 80000,
    maxTokensPerRequest: 4096,
    recommendedConcurrency: 10,
    safetyMargin: 0.85
  }
};

// =============================================================================
// CONFIGURATION
// =============================================================================

const SELECTED_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const MODEL_CONFIG = MODEL_CONFIGS[SELECTED_MODEL] || MODEL_CONFIGS['claude-haiku-4-5-20251001'];

const SAFE_RPM = Math.floor(MODEL_CONFIG.requestsPerMinute * MODEL_CONFIG.safetyMargin);
const SAFE_OUTPUT_TPM = Math.floor(MODEL_CONFIG.outputTokensPerMinute * MODEL_CONFIG.safetyMargin);

const ESTIMATED_OUTPUT_TOKENS = parseInt(process.env.ESTIMATED_OUTPUT_TOKENS || '2000');
const MAX_JOBS_PER_MINUTE = Math.min(SAFE_RPM, Math.floor(SAFE_OUTPUT_TPM / ESTIMATED_OUTPUT_TOKENS));
const WORKERS = parseInt(process.env.WORKERS || '100');
const MAX_INFLIGHT_CALLS = 100;

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000;
const INITIAL_STAGGER_MS = 50;
const RETRY_JITTER_MS = 500;

const OUTPUT_DIR = './output/master';
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL || 'https://koda-96218414763.us-central1.run.app';

// =============================================================================
// LOCAL RATE LIMITER (NO REDIS REQUIRED)
// =============================================================================

class LocalRateLimiter {
  constructor() {
    this.windowStart = 0;
    this.requestCount = 0;
    this.outputTokenCount = 0;
    this.actualOutputTokens = 0;
    this.inflightSet = new Set();
  }

  getCurrentMinuteWindow() {
    return Math.floor(Date.now() / 60000) * 60000;
  }

  maybeResetCounters() {
    const currentWindow = this.getCurrentMinuteWindow();

    if (this.windowStart < currentWindow) {
      if (this.actualOutputTokens > 0) {
        console.log(`  [Rate Limiter] Previous minute actual output: ${this.actualOutputTokens.toLocaleString()} tokens`);
      }

      this.requestCount = 0;
      this.outputTokenCount = 0;
      this.actualOutputTokens = 0;
      this.windowStart = currentWindow;

      console.log(`  [Rate Limiter] New minute window started at ${new Date(currentWindow).toISOString()}`);
    }
  }

  acquirePermits(workerId) {
    this.maybeResetCounters();

    const slotId = `${workerId}_${Date.now()}`;

    // Check limits before incrementing
    const newReqCount = this.requestCount + 1;
    const newTokCount = this.outputTokenCount + ESTIMATED_OUTPUT_TOKENS;
    const newInflightCount = this.inflightSet.size + 1;

    let exceeded = false;
    let reason = '';

    if (newInflightCount > MAX_INFLIGHT_CALLS) {
      exceeded = true;
      reason = 'max-inflight';
    } else if (newReqCount > SAFE_RPM) {
      exceeded = true;
      reason = 'rpm-limit';
    } else if (newTokCount > SAFE_OUTPUT_TPM) {
      exceeded = true;
      reason = 'output-tpm-limit';
    }

    if (exceeded) {
      const msUntilNextMinute = 60000 - (Date.now() % 60000);
      return { acquired: false, waitMs: msUntilNextMinute + Math.random() * 1000, reason };
    }

    // Increment counters
    this.requestCount = newReqCount;
    this.outputTokenCount = newTokCount;
    this.inflightSet.add(slotId);

    return { acquired: true, slotId, reason: 'ok' };
  }

  releasePermits(slotId, actualOutputTokens = 0) {
    if (slotId) {
      this.inflightSet.delete(slotId);
      if (actualOutputTokens > 0) {
        this.actualOutputTokens += actualOutputTokens;
        const tokenDiff = actualOutputTokens - ESTIMATED_OUTPUT_TOKENS;
        if (tokenDiff !== 0) {
          this.outputTokenCount += tokenDiff;
        }
      }
    }
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      outputTokenCount: this.outputTokenCount,
      inflightCount: this.inflightSet.size,
      actualOutputTokens: this.actualOutputTokens
    };
  }
}

const rateLimiter = new LocalRateLimiter();

// =============================================================================
// HELPERS
// =============================================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (maxMs) => Math.random() * maxMs;

async function waitForPermits(workerId, maxWaitMs = 90000) {
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const result = rateLimiter.acquirePermits(workerId);
    if (result.acquired) {
      return result.slotId;
    }
    attempts++;
    if (attempts % 5 === 0) {
      console.log(`  [${workerId}] Permit wait attempt ${attempts}, reason: ${result.reason}`);
    }
    await sleep(Math.min(result.waitMs, 5000));
  }
  return null;
}

// =============================================================================
// JOB EXECUTION
// =============================================================================

async function executeJob(job, workerId) {
  const slotId = await waitForPermits(workerId);
  if (!slotId) {
    return { success: false, error: 'Permit timeout', job };
  }

  try {
    const response = await fetch(`${CLOUD_RUN_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      const outputTokens = result.usage?.output_tokens || 0;
      rateLimiter.releasePermits(slotId, outputTokens);
      return { success: true, data: result.data, usage: result.usage, job };
    }

    rateLimiter.releasePermits(slotId);

    if (response.status === 429) {
      return { success: false, error: 'rate_limited', retryable: true, job };
    }

    return { success: false, error: result.error || 'Unknown error', job };
  } catch (error) {
    rateLimiter.releasePermits(slotId);
    return { success: false, error: error.message, retryable: true, job };
  }
}

async function executeJobWithRetry(job, workerId) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await executeJob(job, workerId);

    if (result.success) {
      return result;
    }

    lastError = result.error;

    if (!result.retryable && attempt < MAX_RETRIES) {
      console.log(`  [${workerId}] Non-retryable error: ${result.error}`);
      break;
    }

    if (attempt < MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1) + jitter(RETRY_JITTER_MS);
      console.log(`  [${workerId}] Retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }

  return { success: false, error: lastError, job };
}

// =============================================================================
// BATCH EXECUTION
// =============================================================================

async function runBatch(jobs, batchName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting batch: ${batchName}`);
  console.log(`Jobs: ${jobs.length} | Workers: ${WORKERS} | Model: ${SELECTED_MODEL}`);
  console.log(`Rate limits: ${SAFE_RPM} RPM | ${SAFE_OUTPUT_TPM.toLocaleString()} output TPM`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();
  const results = { success: [], failed: [] };
  let completed = 0;

  // Create output directory
  const batchDir = `${OUTPUT_DIR}/${batchName}`;
  if (!existsSync(batchDir)) {
    mkdirSync(batchDir, { recursive: true });
  }

  // Process jobs with worker pool
  const queue = [...jobs];
  const activeWorkers = new Map();

  const processNext = async (workerId) => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;

      const result = await executeJobWithRetry(job, workerId);
      completed++;

      const progress = `[${completed}/${jobs.length}]`;

      if (result.success) {
        results.success.push(result);

        // Save individual job result
        const filename = `${batchDir}/${job.jobId}.json`;
        writeFileSync(filename, JSON.stringify(result.data, null, 2));

        const itemCount = result.data?.items?.length || 0;
        console.log(`${progress} ✓ ${job.jobId} - ${itemCount} items`);
      } else {
        results.failed.push(result);
        console.log(`${progress} ✗ ${job.jobId} - ${result.error}`);
      }

      // Stagger next request
      await sleep(INITIAL_STAGGER_MS);
    }
  };

  // Start workers
  const workerCount = Math.min(WORKERS, jobs.length);
  const workerPromises = [];

  for (let i = 0; i < workerCount; i++) {
    const workerId = `worker-${i}`;
    workerPromises.push(processNext(workerId));
    await sleep(INITIAL_STAGGER_MS); // Stagger worker starts
  }

  await Promise.all(workerPromises);

  const duration = (Date.now() - startTime) / 1000;
  const successRate = (results.success.length / jobs.length * 100).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Batch complete: ${batchName}`);
  console.log(`Success: ${results.success.length}/${jobs.length} (${successRate}%)`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Duration: ${duration.toFixed(1)}s`);
  console.log(`${'='.repeat(60)}\n`);

  // Save batch summary
  const summary = {
    batch: batchName,
    timestamp: new Date().toISOString(),
    model: SELECTED_MODEL,
    totalJobs: jobs.length,
    successful: results.success.length,
    failed: results.failed.length,
    successRate: parseFloat(successRate),
    durationSeconds: duration,
    failedJobs: results.failed.map(r => ({ jobId: r.job.jobId, error: r.error }))
  };

  writeFileSync(`${batchDir}/_summary.json`, JSON.stringify(summary, null, 2));

  return results;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  // Parse arguments
  let tier = null;
  let intentFilter = null;
  let languageFilter = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tier' && args[i + 1]) {
      tier = parseInt(args[i + 1]);
    }
    if (args[i] === '--intent' && args[i + 1]) {
      intentFilter = args[i + 1].toUpperCase();
    }
    if (args[i] === '--language' && args[i + 1]) {
      languageFilter = args[i + 1].toLowerCase();
    }
  }

  // Calculate and display totals
  const totals = calculateTotals();
  console.log('\n' + '='.repeat(60));
  console.log('KODA MASTER ORCHESTRATOR v6.1 - HIGH-CEILING GENERATION');
  console.log('(Local Rate Limiting - No Redis Required)');
  console.log('='.repeat(60));
  console.log(`\nTarget totals:`);
  console.log(`  Keywords: ${totals.keywords.toLocaleString()}`);
  console.log(`  Patterns: ${totals.patterns.toLocaleString()}`);
  console.log(`  Languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
  console.log(`\nBy intent:`);
  for (const [intent, counts] of Object.entries(totals.byIntent)) {
    console.log(`  ${intent}: ${counts.keywords.toLocaleString()} kw | ${counts.patterns.toLocaleString()} pat`);
  }

  // Get jobs based on filters
  let jobs = [];
  let batchName = '';

  if (intentFilter && languageFilter) {
    jobs = generateJobsForIntent(intentFilter, languageFilter);
    batchName = `${intentFilter}-${languageFilter}`;
  } else if (intentFilter) {
    for (const lang of SUPPORTED_LANGUAGES) {
      jobs.push(...generateJobsForIntent(intentFilter, lang));
    }
    batchName = intentFilter;
  } else if (tier !== null) {
    jobs = getJobsForTier(tier);
    batchName = `tier-${tier}`;
  } else {
    const result = generateAllJobs();
    jobs = result.jobs;
    batchName = 'full-generation';
  }

  console.log(`\nSelected: ${jobs.length} jobs for batch "${batchName}"`);
  console.log(`Cloud Run: ${CLOUD_RUN_URL}`);
  console.log(`Model: ${SELECTED_MODEL}`);
  console.log(`Workers: ${WORKERS}`);
  console.log(`Est. time: ${Math.ceil(jobs.length / MAX_JOBS_PER_MINUTE)} minutes`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Would generate:');
    const sample = jobs.slice(0, 10);
    for (const job of sample) {
      console.log(`  - ${job.jobId}`);
    }
    if (jobs.length > 10) {
      console.log(`  ... and ${jobs.length - 10} more`);
    }
    return;
  }

  // Confirm before starting
  console.log('\nStarting generation in 5 seconds... (Ctrl+C to cancel)');
  await sleep(5000);

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Run the batch
  const results = await runBatch(jobs, batchName);

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('GENERATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nResults saved to: ${OUTPUT_DIR}/${batchName}/`);

  if (results.failed.length > 0) {
    console.log(`\nFailed jobs (${results.failed.length}):`);
    for (const f of results.failed.slice(0, 10)) {
      console.log(`  - ${f.job.jobId}: ${f.error}`);
    }
    if (results.failed.length > 10) {
      console.log(`  ... and ${results.failed.length - 10} more`);
    }
  }
}

main().catch(console.error);
