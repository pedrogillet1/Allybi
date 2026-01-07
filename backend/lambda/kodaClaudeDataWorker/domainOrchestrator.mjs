/**
 * KODA Domain Orchestrator v1.0 - PARALLEL DOMAIN GENERATION
 *
 * Run: node domainOrchestrator.mjs [--domain DOMAIN] [--tier 0|1|2] [--dry-run]
 * Run all: node domainOrchestrator.mjs --all
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import {
  DOMAINS,
  SUPPORTED_LANGUAGES,
  generateJobsForDomain,
  generateAllDomainJobs,
  getJobsForDomainTier,
  calculateDomainTotals
} from './domainSchema.mjs';
import { DOMAIN_SYSTEM_PROMPT, buildDomainPrompt } from './domainPrompts.mjs';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SELECTED_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const SAFE_RPM = 3800;
const SAFE_OUTPUT_TPM = 760000;
const ESTIMATED_OUTPUT_TOKENS = 2000;
const MAX_JOBS_PER_MINUTE = Math.min(SAFE_RPM, Math.floor(SAFE_OUTPUT_TPM / ESTIMATED_OUTPUT_TOKENS));
const WORKERS = parseInt(process.env.WORKERS || '150'); // Increased for speed
const MAX_INFLIGHT_CALLS = 150;

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000;
const INITIAL_STAGGER_MS = 30; // Reduced for speed
const RETRY_JITTER_MS = 500;

const OUTPUT_DIR = './output/domains';
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL || 'https://koda-96218414763.us-central1.run.app';

// =============================================================================
// LOCAL RATE LIMITER
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
        console.log(`  [Rate Limiter] Previous minute: ${this.actualOutputTokens.toLocaleString()} tokens`);
      }
      this.requestCount = 0;
      this.outputTokenCount = 0;
      this.actualOutputTokens = 0;
      this.windowStart = currentWindow;
    }
  }

  acquirePermits(workerId) {
    this.maybeResetCounters();
    const slotId = `${workerId}_${Date.now()}`;
    const newReqCount = this.requestCount + 1;
    const newTokCount = this.outputTokenCount + ESTIMATED_OUTPUT_TOKENS;
    const newInflightCount = this.inflightSet.size + 1;

    if (newInflightCount > MAX_INFLIGHT_CALLS || newReqCount > SAFE_RPM || newTokCount > SAFE_OUTPUT_TPM) {
      const msUntilNextMinute = 60000 - (Date.now() % 60000);
      return { acquired: false, waitMs: msUntilNextMinute + Math.random() * 1000 };
    }

    this.requestCount = newReqCount;
    this.outputTokenCount = newTokCount;
    this.inflightSet.add(slotId);
    return { acquired: true, slotId };
  }

  releasePermits(slotId, actualOutputTokens = 0) {
    if (slotId) {
      this.inflightSet.delete(slotId);
      if (actualOutputTokens > 0) {
        this.actualOutputTokens += actualOutputTokens;
        this.outputTokenCount += actualOutputTokens - ESTIMATED_OUTPUT_TOKENS;
      }
    }
  }
}

const rateLimiter = new LocalRateLimiter();

// =============================================================================
// HELPERS
// =============================================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForPermits(workerId, maxWaitMs = 90000) {
  const startTime = Date.now();
  let attempts = 0;
  while (Date.now() - startTime < maxWaitMs) {
    const result = rateLimiter.acquirePermits(workerId);
    if (result.acquired) return result.slotId;
    attempts++;
    if (attempts % 10 === 0) console.log(`  [${workerId}] Waiting for permits...`);
    await sleep(Math.min(result.waitMs, 3000));
  }
  return null;
}

// =============================================================================
// JOB EXECUTION
// =============================================================================

async function executeJob(job, workerId) {
  const slotId = await waitForPermits(workerId);
  if (!slotId) return { success: false, error: 'Permit timeout', job };

  try {
    const userPrompt = buildDomainPrompt(job);
    const response = await fetch(`${CLOUD_RUN_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...job, userPrompt, systemPrompt: DOMAIN_SYSTEM_PROMPT })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      rateLimiter.releasePermits(slotId, result.usage?.output_tokens || 0);
      return { success: true, data: result.data, usage: result.usage, job };
    }

    rateLimiter.releasePermits(slotId);
    if (response.status === 429) return { success: false, error: 'rate_limited', retryable: true, job };
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
    if (result.success) return result;
    lastError = result.error;
    if (!result.retryable) break;
    if (attempt < MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1) + Math.random() * RETRY_JITTER_MS;
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
  console.log(`Starting: ${batchName}`);
  console.log(`Jobs: ${jobs.length} | Workers: ${WORKERS} | Model: ${SELECTED_MODEL}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();
  const results = { success: [], failed: [] };
  let completed = 0;

  const batchDir = `${OUTPUT_DIR}/${batchName}`;
  if (!existsSync(batchDir)) mkdirSync(batchDir, { recursive: true });

  const queue = [...jobs];

  const processNext = async (workerId) => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;

      const result = await executeJobWithRetry(job, workerId);
      completed++;

      if (result.success) {
        results.success.push(result);
        writeFileSync(`${batchDir}/${job.jobId}.json`, JSON.stringify(result.data, null, 2));
        const itemCount = result.data?.items?.length || 0;
        if (completed % 50 === 0 || completed === jobs.length) {
          console.log(`[${completed}/${jobs.length}] ✓ ${itemCount} items - ${batchName}`);
        }
      } else {
        results.failed.push(result);
        console.log(`[${completed}/${jobs.length}] ✗ ${job.jobId} - ${result.error}`);
      }

      await sleep(INITIAL_STAGGER_MS);
    }
  };

  const workerCount = Math.min(WORKERS, jobs.length);
  const workerPromises = [];
  for (let i = 0; i < workerCount; i++) {
    workerPromises.push(processNext(`w${i}`));
    await sleep(INITIAL_STAGGER_MS);
  }

  await Promise.all(workerPromises);

  const duration = (Date.now() - startTime) / 1000;
  const successRate = (results.success.length / jobs.length * 100).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Complete: ${batchName}`);
  console.log(`Success: ${results.success.length}/${jobs.length} (${successRate}%) in ${duration.toFixed(0)}s`);
  console.log(`${'='.repeat(60)}\n`);

  writeFileSync(`${batchDir}/_summary.json`, JSON.stringify({
    batch: batchName,
    timestamp: new Date().toISOString(),
    totalJobs: jobs.length,
    successful: results.success.length,
    failed: results.failed.length,
    successRate: parseFloat(successRate),
    durationSeconds: duration,
    failedJobs: results.failed.map(r => ({ jobId: r.job.jobId, error: r.error }))
  }, null, 2));

  return results;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const runAll = args.includes('--all');

  let domainFilter = null;
  let tierFilter = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--domain' && args[i + 1]) domainFilter = args[i + 1].toUpperCase();
    if (args[i] === '--tier' && args[i + 1]) tierFilter = parseInt(args[i + 1]);
  }

  const totals = calculateDomainTotals();
  console.log('\n' + '='.repeat(60));
  console.log('KODA DOMAIN ORCHESTRATOR v1.0');
  console.log('='.repeat(60));
  console.log(`\nTargets: ${totals.keywords.toLocaleString()} keywords | ${totals.patterns.toLocaleString()} patterns`);
  console.log('\nBy domain:');
  for (const [name, counts] of Object.entries(totals.byDomain)) {
    console.log(`  ${name}: ${counts.keywords.toLocaleString()} kw | ${counts.patterns.toLocaleString()} pat`);
  }

  let jobs = [];
  let batchName = '';

  if (domainFilter) {
    for (const lang of SUPPORTED_LANGUAGES) {
      jobs.push(...generateJobsForDomain(domainFilter, lang));
    }
    batchName = domainFilter.toLowerCase();
  } else if (tierFilter !== null) {
    jobs = getJobsForDomainTier(tierFilter);
    batchName = `tier-${tierFilter}`;
  } else if (runAll) {
    jobs = generateAllDomainJobs();
    batchName = 'all-domains';
  } else {
    console.log('\nUsage:');
    console.log('  node domainOrchestrator.mjs --domain LEGAL');
    console.log('  node domainOrchestrator.mjs --tier 0');
    console.log('  node domainOrchestrator.mjs --all');
    console.log('  node domainOrchestrator.mjs --dry-run');
    return;
  }

  console.log(`\nSelected: ${jobs.length} jobs for "${batchName}"`);
  console.log(`Est. time: ${Math.ceil(jobs.length / MAX_JOBS_PER_MINUTE)} minutes`);

  if (isDryRun) {
    console.log('\n[DRY RUN] Sample jobs:');
    jobs.slice(0, 5).forEach(j => console.log(`  - ${j.jobId}`));
    if (jobs.length > 5) console.log(`  ... and ${jobs.length - 5} more`);
    return;
  }

  console.log('\nStarting in 3 seconds...');
  await sleep(3000);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  await runBatch(jobs, batchName);
  console.log(`\nResults saved to: ${OUTPUT_DIR}/${batchName}/`);
}

main().catch(console.error);
