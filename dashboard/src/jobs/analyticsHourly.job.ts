// file: src/jobs/analyticsHourly.job.ts
//
// Hourly analytics rollup job.
// - Acquires advisory lock to prevent concurrent runs
// - Calls runHourlyRollup with bounded backfill
// - Records job run summary via telemetry

import { PrismaClient } from '@prisma/client';
import { runHourlyRollup } from '../analytics/rollups/hourlyRollup.job';
import { emit } from '../telemetry';
import { tryAdvisoryLock, releaseAdvisoryLock } from './utils/locks';
import { recordJobRun } from './utils/jobRun';

const LOCK_KEY = 'koda:job:analytics_hourly';
const JOB_NAME = 'analytics_hourly';

// Singleton prisma instance for jobs
let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['error'],
    });
  }
  return prisma;
}

export interface AnalyticsHourlyJobOptions {
  backfillHours?: number;
  maxBuckets?: number;
}

export async function runAnalyticsHourlyJob(opts: AnalyticsHourlyJobOptions = {}): Promise<void> {
  const db = getPrisma();
  const startTime = Date.now();

  console.log(`[${JOB_NAME}] Starting...`);

  // Try to acquire lock
  const lockAcquired = await tryAdvisoryLock(db, LOCK_KEY);
  if (!lockAcquired) {
    console.log(`[${JOB_NAME}] Skipped: lock held by another instance`);
    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'skipped',
      durationMs: Date.now() - startTime,
      counts: { reason: 'lock_held' },
    });
    return;
  }

  try {
    const result = await runHourlyRollup(db, {
      backfillHours: opts.backfillHours ?? 6,
      maxBuckets: opts.maxBuckets ?? 24,
    });

    const durationMs = Date.now() - startTime;

    console.log(
      `[${JOB_NAME}] Completed: ${result.bucketsProcessed} buckets, ${result.rowsWritten} rows, ${result.errors} errors (${durationMs}ms)`
    );

    // Record success
    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'success',
      durationMs,
      counts: {
        bucketsProcessed: result.bucketsProcessed,
        rowsWritten: result.rowsWritten,
        errors: result.errors,
      },
    });

    // Emit telemetry
    try {
      await emit('job.run', {
        category: 'system',
        severity: result.errors > 0 ? 'warn' : 'info',
        payload: {
          jobName: JOB_NAME,
          status: 'success',
          durationMs,
          bucketsProcessed: result.bucketsProcessed,
          rowsWritten: result.rowsWritten,
          errors: result.errors,
        },
      });
    } catch {
      // Telemetry failure should not fail the job
    }
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const errorMsg = e instanceof Error ? e.message : String(e);

    console.error(`[${JOB_NAME}] Failed:`, errorMsg);

    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'failed',
      durationMs,
      counts: { error: errorMsg },
    });

    try {
      await emit('job.run', {
        category: 'system',
        severity: 'error',
        payload: {
          jobName: JOB_NAME,
          status: 'failed',
          durationMs,
          error: errorMsg,
        },
      });
    } catch {
      // Telemetry failure should not fail the job
    }

    throw e;
  } finally {
    await releaseAdvisoryLock(db, LOCK_KEY);
  }
}
