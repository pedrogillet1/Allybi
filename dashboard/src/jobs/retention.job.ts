// file: src/jobs/retention.job.ts
//
// Retention cohort rollup job.
// - Acquires advisory lock to prevent concurrent runs
// - Calls runRetentionRollup with bounded backfill
// - Records job run summary via telemetry

import { PrismaClient } from '@prisma/client';
import { runRetentionRollup } from '../analytics/rollups/retentionRollup.job';
import { emit } from '../telemetry';
import { tryAdvisoryLock, releaseAdvisoryLock } from './utils/locks';
import { recordJobRun } from './utils/jobRun';

const LOCK_KEY = 'koda:job:retention';
const JOB_NAME = 'retention';

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

export interface RetentionJobOptions {
  cohortsBackfillDays?: number;
  windows?: number[];
}

export async function runRetentionJob(opts: RetentionJobOptions = {}): Promise<void> {
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
    const result = await runRetentionRollup(db, {
      cohortsBackfillDays: opts.cohortsBackfillDays ?? 30,
      windows: opts.windows ?? [1, 7, 30],
    });

    const durationMs = Date.now() - startTime;

    console.log(
      `[${JOB_NAME}] Completed: ${result.cohortsProcessed} cohorts, ${result.rowsWritten} rows, ${result.errors} errors (${durationMs}ms)`
    );

    // Record success
    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'success',
      durationMs,
      counts: {
        cohortsProcessed: result.cohortsProcessed,
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
          cohortsProcessed: result.cohortsProcessed,
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
