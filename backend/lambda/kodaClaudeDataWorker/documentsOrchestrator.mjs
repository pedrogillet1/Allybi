/**
 * Documents Generator Orchestrator - Adaptive Rate-Limited Workers
 *
 * Uses Redis for distributed rate limiting based on Anthropic's ACTUAL limits:
 * - Per-MINUTE request limits (RPM)
 * - Per-MINUTE OUTPUT token limits (the binding constraint!)
 * - Concurrent call limiting
 *
 * CRITICAL: Anthropic's OUTPUT TPM is much lower than INPUT TPM
 * - Haiku 3.5: 80K output TPM (vs 400K input)
 * - Haiku 4:   800K output TPM (vs 4M input)
 */

import 'dotenv/config';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { generateAllJobs, calculateTotals } from './documentsSchema.mjs';
import { Redis } from '@upstash/redis';

// =============================================================================
// MODEL CONFIGURATIONS - Based on Anthropic's actual tier limits
// =============================================================================

const MODEL_CONFIGS = {
  // Haiku 3.5 - Tier 4 limits (OUTPUT TPM is the binding constraint!)
  'claude-3-5-haiku-20241022': {
    requestsPerMinute: 4000,
    inputTokensPerMinute: 400000,
    outputTokensPerMinute: 80000,    // This is the binding limit!
    recommendedConcurrency: 8,        // With ~3s latency and 40 jobs/min max
    safetyMargin: 0.85                // Use 85% of limits
  },
  // Haiku 4 - 800K output TPM, fast latency (~5-8s), can push 100 concurrent
  'claude-haiku-4-20250514': {
    requestsPerMinute: 4000,
    inputTokensPerMinute: 400000,
    outputTokensPerMinute: 800000,   // 800K/2048 = 390 req/min
    maxTokensPerRequest: 2048,
    recommendedConcurrency: 100,      // With 6s latency: can saturate 390/min
    safetyMargin: 0.85
  },
  // Haiku 4.5 - Lambda limit is ~10 concurrent (tested)
  'claude-haiku-4-5-20251001': {
    requestsPerMinute: 4000,
    inputTokensPerMinute: 400000,
    outputTokensPerMinute: 800000,
    maxTokensPerRequest: 2048,
    recommendedConcurrency: 10,   // Lambda concurrent limit
    safetyMargin: 0.85
  },
  // Sonnet 4 - For reference
  'claude-sonnet-4-20250514': {
    requestsPerMinute: 4000,
    inputTokensPerMinute: 400000,
    outputTokensPerMinute: 80000,
    recommendedConcurrency: 8,
    safetyMargin: 0.85
  }
};

// =============================================================================
// CONFIGURATION - Select your model and let limits auto-configure
// =============================================================================

// Select model (change this to switch models)
const SELECTED_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const MODEL_CONFIG = MODEL_CONFIGS[SELECTED_MODEL] || MODEL_CONFIGS['claude-haiku-4-5-20251001'];

// Auto-calculated limits based on model
const SAFE_RPM = Math.floor(MODEL_CONFIG.requestsPerMinute * MODEL_CONFIG.safetyMargin);
const SAFE_OUTPUT_TPM = Math.floor(MODEL_CONFIG.outputTokensPerMinute * MODEL_CONFIG.safetyMargin);

// Worker settings - derived from model limits
// CRITICAL: Must match max_tokens in Lambda because Claude RESERVES full max_tokens against output TPM
const ESTIMATED_OUTPUT_TOKENS = parseInt(process.env.ESTIMATED_OUTPUT_TOKENS || '2048');
const MAX_JOBS_PER_MINUTE = Math.min(
  SAFE_RPM,
  Math.floor(SAFE_OUTPUT_TPM / ESTIMATED_OUTPUT_TOKENS)
);
const LAMBDA_WORKERS = parseInt(process.env.LAMBDA_WORKERS || MODEL_CONFIG.recommendedConcurrency);
const MAX_INFLIGHT_CALLS = Math.min(LAMBDA_WORKERS * 2, Math.ceil(MAX_JOBS_PER_MINUTE / 10));

// Retry settings
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 2000;
// Stagger: 332 req/min = 5.5/sec = ~180ms minimum between requests
// Using 500ms for safety margin to prevent any burst
const INITIAL_STAGGER_MS = 500;       // 500ms stagger = 2 requests/sec start rate
const RETRY_JITTER_MS = 1000;

// Redis keys - now tracking per-minute
const KEYS = {
  requestCount: 'claude:ratelimit:requests:min',
  outputTokenCount: 'claude:ratelimit:output_tokens:min',
  inflightSet: 'claude:ratelimit:inflight',
  windowStart: 'claude:ratelimit:window_start',
  actualOutputTokens: 'claude:ratelimit:actual_output'  // Track actual usage for tuning
};

const OUTPUT_DIR = './output/documents';
const LAMBDA_FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || 'kodaClaudeDataWorker';
const REGION = process.env.AWS_REGION || 'us-east-2';

const lambdaClient = new LambdaClient({ region: REGION });
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// =============================================================================
// HELPERS
// =============================================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const jitter = (maxMs) => Math.random() * maxMs;

// =============================================================================
// GLOBAL RATE LIMITER - Per-MINUTE windows (matching Anthropic's limits)
// =============================================================================

/**
 * Get current minute window start timestamp
 */
function getCurrentMinuteWindow() {
  return Math.floor(Date.now() / 60000) * 60000;
}

/**
 * Reset rate limit counters if we're in a new minute window
 */
async function maybeResetCounters() {
  const currentWindow = getCurrentMinuteWindow();
  const lastWindow = await redis.get(KEYS.windowStart);

  if (!lastWindow || parseInt(lastWindow) < currentWindow) {
    // New minute window - reset counters
    const actualOutput = await redis.get(KEYS.actualOutputTokens);
    if (actualOutput) {
      console.log(`  [Rate Limiter] Previous minute actual output: ${parseInt(actualOutput).toLocaleString()} tokens`);
    }

    await redis.pipeline()
      .set(KEYS.requestCount, 0)
      .set(KEYS.outputTokenCount, 0)
      .set(KEYS.actualOutputTokens, 0)
      .set(KEYS.windowStart, currentWindow)
      .expire(KEYS.requestCount, 120)
      .expire(KEYS.outputTokenCount, 120)
      .expire(KEYS.actualOutputTokens, 120)
      .expire(KEYS.windowStart, 120)
      .exec();

    console.log(`  [Rate Limiter] New minute window started at ${new Date(currentWindow).toISOString()}`);
  }
}

/**
 * Try to acquire permits for a Claude call
 * Uses ATOMIC increment-then-check to prevent race conditions
 */
async function acquirePermits(workerId) {
  await maybeResetCounters();

  const slotId = `${workerId}_${Date.now()}`;

  // ATOMIC: Increment FIRST, then check if we exceeded
  const results = await redis.pipeline()
    .incr(KEYS.requestCount)
    .incrby(KEYS.outputTokenCount, ESTIMATED_OUTPUT_TOKENS)
    .sadd(KEYS.inflightSet, slotId)
    .scard(KEYS.inflightSet)
    .exec();

  const newReqCount = results[0];
  const newTokCount = results[1];
  const inflightCount = results[3];

  // Check if we exceeded limits AFTER incrementing
  let exceeded = false;
  let reason = '';

  if (inflightCount > MAX_INFLIGHT_CALLS) {
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
    // ROLLBACK: Decrement since we exceeded
    await redis.pipeline()
      .decr(KEYS.requestCount)
      .decrby(KEYS.outputTokenCount, ESTIMATED_OUTPUT_TOKENS)
      .srem(KEYS.inflightSet, slotId)
      .exec();

    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    return { acquired: false, waitMs: msUntilNextMinute + jitter(1000), reason };
  }

  // Set expiry on inflight set
  await redis.expire(KEYS.inflightSet, 300);

  return { acquired: true, slotId, reason: 'ok' };
}

/**
 * Release permits after call completes and record actual token usage
 */
async function releasePermits(slotId, actualOutputTokens = 0) {
  if (slotId) {
    const pipeline = redis.pipeline().srem(KEYS.inflightSet, slotId);

    // Track actual output tokens for monitoring/tuning
    if (actualOutputTokens > 0) {
      pipeline.incrby(KEYS.actualOutputTokens, actualOutputTokens);

      // Adjust reserved tokens if actual was different from estimate
      const tokenDiff = actualOutputTokens - ESTIMATED_OUTPUT_TOKENS;
      if (tokenDiff !== 0) {
        pipeline.incrby(KEYS.outputTokenCount, tokenDiff);
      }
    }

    await pipeline.exec();
  }
}

/**
 * Wait for permits with exponential backoff
 */
async function waitForPermits(workerId, maxWaitMs = 90000) { // 90s max (1.5 minute windows)
  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const result = await acquirePermits(workerId);
    if (result.acquired) {
      return result.slotId;
    }

    attempts++;
    // Log every 5th attempt
    if (attempts % 5 === 0) {
      console.log(`  [${workerId}] Permit wait attempt ${attempts}, reason: ${result.reason}`);
    }

    // Wait before retrying
    await sleep(result.waitMs);
  }

  return null; // Timeout
}

/**
 * Clear all rate limit state (for fresh start)
 */
async function clearRateLimitState() {
  await redis.pipeline()
    .del(KEYS.requestCount)
    .del(KEYS.outputTokenCount)
    .del(KEYS.inflightSet)
    .del(KEYS.windowStart)
    .del(KEYS.actualOutputTokens)
    .exec();
}

// =============================================================================
// JOB INVOCATION
// =============================================================================

/**
 * Invoke Lambda with global rate limiting
 */
async function invokeJobWithRetry(job, retryCount = 0) {
  const workerId = `${job.jobId}_${retryCount}`;

  // Wait for rate limit permits
  const slotId = await waitForPermits(workerId);
  if (!slotId) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  [${job.jobId}] Permit timeout, retry ${retryCount + 1}/${MAX_RETRIES}`);
      await sleep(BASE_RETRY_DELAY + jitter(RETRY_JITTER_MS));
      return invokeJobWithRetry(job, retryCount + 1);
    }
    return { success: false, jobId: job.jobId, error: 'Rate limit timeout', retries: retryCount };
  }

  const payload = {
    action: 'generate',
    ...job
  };

  try {
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    if (response.StatusCode === 200 && result.statusCode === 200) {
      const body = JSON.parse(result.body);
      const actualOutputTokens = body.usage?.output_tokens || 0;

      // Release permits with actual token count for accurate tracking
      await releasePermits(slotId, actualOutputTokens);

      return {
        success: true,
        jobId: job.jobId,
        itemCount: body.itemCount || 0,
        s3Key: body.s3Key,
        retries: retryCount,
        usage: body.usage
      };
    } else {
      // Release permits on failure (no tokens used)
      await releasePermits(slotId, 0);

      const errorBody = result.body ? JSON.parse(result.body) : { error: 'Unknown error' };
      const error = errorBody.error || 'Lambda error';

      // Check if rate limited by Claude
      const isRateLimited = error.includes('Rate') || error.includes('rate') || result.statusCode === 429;

      if (isRateLimited && retryCount < MAX_RETRIES) {
        // Longer backoff for rate limits - wait closer to minute boundary
        const msUntilNextMinute = 60000 - (Date.now() % 60000);
        const delay = Math.min(msUntilNextMinute + jitter(2000), Math.pow(2, retryCount) * BASE_RETRY_DELAY);
        console.log(`  [${job.jobId}] Rate limited: ${error}, retry ${retryCount + 1}/${MAX_RETRIES} in ${(delay/1000).toFixed(1)}s`);
        await sleep(delay);
        return invokeJobWithRetry(job, retryCount + 1);
      }

      return { success: false, jobId: job.jobId, error, retries: retryCount };
    }
  } catch (error) {
    // Release permits on exception (no tokens used)
    await releasePermits(slotId, 0);

    const errorMsg = error.message || String(error);
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * BASE_RETRY_DELAY + jitter(RETRY_JITTER_MS);
      console.log(`  [${job.jobId}] Error: ${errorMsg}, retry ${retryCount + 1}/${MAX_RETRIES} in ${(delay/1000).toFixed(1)}s`);
      await sleep(delay);
      return invokeJobWithRetry(job, retryCount + 1);
    }
    return { success: false, jobId: job.jobId, error: errorMsg, retries: retryCount };
  }
}

// =============================================================================
// JOB PROCESSING
// =============================================================================

/**
 * Process all jobs with 200 parallel workers
 */
async function processJobs(jobs, concurrency) {
  const results = [];
  const total = jobs.length;
  let completed = 0;
  let failed = 0;
  let totalItems = 0;
  let totalRetries = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const startTime = Date.now();

  console.log(`\nProcessing ${total} jobs...`);
  console.log(`  Workers: ${concurrency} parallel`);
  console.log(`  Rate limits: ${SAFE_RPM} RPM, ${SAFE_OUTPUT_TPM.toLocaleString()} output TPM, ${MAX_INFLIGHT_CALLS} concurrent`);
  console.log(`  Max throughput: ~${MAX_JOBS_PER_MINUTE} jobs/minute`);
  console.log(`  Retries: ${MAX_RETRIES} max, exponential backoff + jitter\n`);

  // Process in batches with staggered starts
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchStart = Date.now();

    // Launch workers with staggered delays to prevent burst
    const batchResults = await Promise.all(
      batch.map((j, idx) => {
        const staggerDelay = idx * INITIAL_STAGGER_MS; // Stagger each worker
        return sleep(staggerDelay).then(() => invokeJobWithRetry(j));
      })
    );

    for (const result of batchResults) {
      results.push(result);
      completed++;

      if (result.success) {
        totalItems += result.itemCount;
        totalRetries += result.retries || 0;
        if (result.usage) {
          totalInputTokens += result.usage.input_tokens || 0;
          totalOutputTokens += result.usage.output_tokens || 0;
        }
      } else {
        failed++;
        console.log(`  FAILED: ${result.jobId} - ${result.error}`);
      }
    }

    const batchDuration = ((Date.now() - batchStart) / 1000).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const elapsedMin = elapsed / 60;
    const pct = ((completed / total) * 100).toFixed(1);
    const rate = elapsedMin > 0 ? (completed / elapsedMin).toFixed(0) : 0;
    const itemRate = elapsedMin > 0 ? (totalItems / elapsedMin).toFixed(0) : 0;
    const eta = rate > 0 ? ((total - completed) / rate).toFixed(1) : '?';

    // Progress display
    console.log(
      `[${pct}%] ${completed}/${total} | ` +
      `${totalItems.toLocaleString()} items | ` +
      `${failed} failed | ` +
      `${totalRetries} retries | ` +
      `${rate} jobs/min | ` +
      `${itemRate} items/min | ` +
      `ETA: ${eta}min | ` +
      `batch: ${batchDuration}s`
    );
  }

  return { results, totalItems, totalRetries, totalInputTokens, totalOutputTokens };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('DOCUMENTS GENERATOR - ADAPTIVE RATE-LIMITED MODE');
  console.log('='.repeat(70));

  // Validate Redis
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('\n❌ ERROR: Upstash Redis required for rate limiting');
    process.exit(1);
  }

  // Display model configuration
  console.log('\n📊 Model Configuration:');
  console.log(`  Model: ${SELECTED_MODEL}`);
  console.log(`  RPM Limit: ${MODEL_CONFIG.requestsPerMinute.toLocaleString()} (using ${SAFE_RPM.toLocaleString()} @ ${MODEL_CONFIG.safetyMargin * 100}%)`);
  console.log(`  Output TPM: ${MODEL_CONFIG.outputTokensPerMinute.toLocaleString()} (using ${SAFE_OUTPUT_TPM.toLocaleString()} @ ${MODEL_CONFIG.safetyMargin * 100}%)`);
  console.log(`  Est. output/job: ${ESTIMATED_OUTPUT_TOKENS.toLocaleString()} tokens`);
  console.log(`  Max jobs/minute: ${MAX_JOBS_PER_MINUTE}`);
  console.log(`  Workers: ${LAMBDA_WORKERS} (recommended: ${MODEL_CONFIG.recommendedConcurrency})`);
  console.log(`  Max inflight: ${MAX_INFLIGHT_CALLS}`);

  // Clear rate limit state for fresh start
  console.log('\n✓ Clearing rate limit state...');
  await clearRateLimitState();
  console.log('✓ Rate limiter ready (per-MINUTE windows)');

  const totals = calculateTotals();
  console.log(`\nTargets:`);
  console.log(`  Sub-intents: ${totals.subIntentCount} (D1-D16)`);
  console.log(`  Facets: ${totals.facetCount}`);
  console.log(`  Languages: ${totals.langCount} (en/pt/es)`);
  console.log(`  Total patterns: ${totals.allLanguages.totalPatterns.toLocaleString()}`);
  console.log(`  Total keywords: ${totals.allLanguages.totalKeywords.toLocaleString()}`);
  console.log(`  Depth examples: ${totals.allLanguages.depthExamples.toLocaleString()}`);
  console.log(`  TOTAL ITEMS: ${totals.allLanguages.totalItems.toLocaleString()}`);
  console.log(`  TOTAL JOBS: ${totals.jobCount.toLocaleString()}`);
  console.log(`\nWorkers: ${LAMBDA_WORKERS}`);
  console.log(`Lambda: ${LAMBDA_FUNCTION_NAME}`);

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const jobs = generateAllJobs();

  console.log('\nStarting in 3 seconds... (Ctrl+C to cancel)');
  await sleep(3000);

  const startTime = Date.now();
  const { results, totalItems, totalRetries, totalInputTokens, totalOutputTokens } =
    await processJobs(jobs, LAMBDA_WORKERS);

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  const succeeded = results.filter(r => r.success).length;
  const failedJobs = results.filter(r => !r.success);

  // Save results
  const summaryPath = `${OUTPUT_DIR}/generation_summary.json`;
  const summary = {
    completedAt: new Date().toISOString(),
    duration: `${duration} minutes`,
    totalJobs: jobs.length,
    succeeded,
    failed: failedJobs.length,
    totalRetries,
    totalItems,
    totalInputTokens,
    totalOutputTokens,
    targets: totals,
    config: {
      model: SELECTED_MODEL,
      workers: LAMBDA_WORKERS,
      safeRpm: SAFE_RPM,
      safeOutputTpm: SAFE_OUTPUT_TPM,
      estimatedOutputTokens: ESTIMATED_OUTPUT_TOKENS,
      maxJobsPerMinute: MAX_JOBS_PER_MINUTE,
      maxInflight: MAX_INFLIGHT_CALLS,
      maxRetries: MAX_RETRIES,
      safetyMargin: MODEL_CONFIG.safetyMargin
    }
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  if (failedJobs.length > 0) {
    const failedPath = `${OUTPUT_DIR}/failed_jobs.json`;
    writeFileSync(failedPath, JSON.stringify(failedJobs, null, 2));
  }

  console.log('\n' + '='.repeat(70));
  console.log('COMPLETE');
  console.log('='.repeat(70));
  console.log(`Duration: ${duration} minutes`);
  console.log(`Succeeded: ${succeeded}/${jobs.length}`);
  console.log(`Failed: ${failedJobs.length}`);
  console.log(`Total retries: ${totalRetries}`);
  console.log(`Total items: ${totalItems.toLocaleString()}`);
  console.log(`Total tokens: ${(totalInputTokens + totalOutputTokens).toLocaleString()}`);
  console.log(`\nSaved to: ${summaryPath}`);

  if (failedJobs.length > 0) {
    console.log(`\nFailed jobs: ${OUTPUT_DIR}/failed_jobs.json`);
  }
}

main().catch(console.error);
