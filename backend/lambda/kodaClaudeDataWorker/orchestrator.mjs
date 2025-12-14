/**
 * Tier 2 Orchestrator - Triggers 720 Lambda invocations
 * Run locally: node orchestrator.mjs --language en --concurrency 10
 */

import 'dotenv/config';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { generateAllJobs, calculateTotalInvocations, TIER2_TARGETS } from './schemas.mjs';

const LAMBDA_FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || 'kodaClaudeDataWorker';
const REGION = process.env.AWS_REGION || 'us-east-2';
const DEFAULT_CONCURRENCY = 10; // How many parallel invocations

const lambdaClient = new LambdaClient({ region: REGION });

/**
 * Invoke Lambda for a single job
 */
async function invokeJob(job) {
  const payload = {
    action: 'generate-batch',
    ...job
  };

  try {
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
      InvocationType: 'RequestResponse', // Synchronous
      Payload: JSON.stringify(payload)
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    if (response.StatusCode === 200 && result.statusCode === 200) {
      const body = JSON.parse(result.body);
      return { success: true, jobId: job.jobId, itemCount: body.itemCount };
    } else {
      return { success: false, jobId: job.jobId, error: result.body || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, jobId: job.jobId, error: error.message };
  }
}

/**
 * Process jobs in batches with concurrency control
 */
async function processJobs(jobs, concurrency) {
  const results = [];
  const total = jobs.length;
  let completed = 0;
  let failed = 0;

  console.log(`\nStarting ${total} jobs with concurrency ${concurrency}...\n`);

  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(invokeJob));

    for (const result of batchResults) {
      results.push(result);
      completed++;

      if (result.success) {
        console.log(`✓ [${completed}/${total}] ${result.jobId} - ${result.itemCount} items`);
      } else {
        failed++;
        console.log(`✗ [${completed}/${total}] ${result.jobId} - ${result.error}`);
      }
    }

    // Progress update
    const pct = ((completed / total) * 100).toFixed(1);
    console.log(`\n--- Progress: ${pct}% (${completed}/${total}, ${failed} failed) ---\n`);
  }

  return results;
}

/**
 * Main orchestration
 */
async function main() {
  const args = process.argv.slice(2);
  const languageIdx = args.indexOf('--language');
  const concurrencyIdx = args.indexOf('--concurrency');
  const dryRunIdx = args.indexOf('--dry-run');
  const intentIdx = args.indexOf('--intent');
  const subIntentIdx = args.indexOf('--subIntent');
  const dataTypeIdx = args.indexOf('--dataType');

  const language = languageIdx !== -1 ? args[languageIdx + 1] : 'en';
  const concurrency = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1]) : DEFAULT_CONCURRENCY;
  const dryRun = dryRunIdx !== -1;
  const filterIntent = intentIdx !== -1 ? args[intentIdx + 1] : null;
  const filterSubIntent = subIntentIdx !== -1 ? args[subIntentIdx + 1] : null;
  const filterDataType = dataTypeIdx !== -1 ? args[dataTypeIdx + 1] : null;

  console.log('='.repeat(60));
  console.log('KODA Tier 2 Dataset Generator - Orchestrator');
  console.log('='.repeat(60));

  // Get all jobs
  let jobs = generateAllJobs(language);

  // Apply filters
  if (filterIntent) {
    jobs = jobs.filter(j => j.intent === filterIntent);
    console.log(`Filtered to intent: ${filterIntent}`);
  }
  if (filterSubIntent) {
    jobs = jobs.filter(j => j.subIntent === filterSubIntent);
    console.log(`Filtered to subIntent: ${filterSubIntent}`);
  }
  if (filterDataType) {
    jobs = jobs.filter(j => j.dataType === filterDataType);
    console.log(`Filtered to dataType: ${filterDataType}`);
  }

  const stats = calculateTotalInvocations();

  console.log(`\nConfiguration:`);
  console.log(`  Language: ${language}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Total Jobs: ${jobs.length}`);
  console.log(`  Dry Run: ${dryRun}`);
  console.log(`\nTier 2 Targets per sub-intent:`);
  for (const [type, config] of Object.entries(TIER2_TARGETS)) {
    console.log(`  ${type}: ${config.total} items (${config.batches} batches × ${config.batchSize})`);
  }
  console.log(`\nTotal invocations needed: ${stats.totalInvocations}`);
  console.log(`Estimated cost: ~$${(jobs.length * 0.003).toFixed(2)} (Lambda) + ~$${(jobs.length * 0.15).toFixed(2)} (Claude)`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would invoke these jobs:');
    jobs.slice(0, 10).forEach(j => console.log(`  - ${j.jobId}`));
    if (jobs.length > 10) console.log(`  ... and ${jobs.length - 10} more`);
    return;
  }

  // Confirm
  console.log('\nStarting in 5 seconds... (Ctrl+C to cancel)');
  await new Promise(r => setTimeout(r, 5000));

  const startTime = Date.now();
  const results = await processJobs(jobs, concurrency);
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

  // Summary
  const succeeded = results.filter(r => r.success).length;
  const failedJobs = results.filter(r => !r.success);

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration} minutes`);
  console.log(`Succeeded: ${succeeded}/${results.length}`);
  console.log(`Failed: ${failedJobs.length}`);

  if (failedJobs.length > 0) {
    console.log('\nFailed jobs:');
    failedJobs.forEach(j => console.log(`  - ${j.jobId}: ${j.error}`));
  }
}

main().catch(console.error);
