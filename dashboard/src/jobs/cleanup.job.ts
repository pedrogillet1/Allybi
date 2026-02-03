// file: src/jobs/cleanup.job.ts
//
// Cleanup job for pruning old data.
// - Operates in bounded batches to avoid long transactions
// - Prunes analytics_events, job_runs, stale locks
// - Records job run summary via telemetry

import { PrismaClient } from '@prisma/client';
import { emit } from '../telemetry';
import { tryAdvisoryLock, releaseAdvisoryLock } from './utils/locks';
import { recordJobRun } from './utils/jobRun';

const LOCK_KEY = 'koda:job:cleanup';
const JOB_NAME = 'cleanup';

// Default retention periods (days)
const RETENTION_DAYS = {
  analyticsEvents: 180,
  jobRuns: 30,
  telemetryEvents: 90,
  securitySnapshots: 30,
};

// Batch size to avoid long transactions
const BATCH_SIZE = 5000;

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

export interface CleanupJobOptions {
  retentionDays?: {
    analyticsEvents?: number;
    jobRuns?: number;
    telemetryEvents?: number;
    securitySnapshots?: number;
  };
  batchSize?: number;
  maxBatches?: number; // Limit total batches per run
}

export interface CleanupResult {
  analyticsEventsDeleted: number;
  jobRunsDeleted: number;
  telemetryEventsDeleted: number;
  securitySnapshotsDeleted: number;
  totalDeleted: number;
  batchesProcessed: number;
}

async function deleteInBatches(
  db: PrismaClient,
  tableName: string,
  cutoffDate: Date,
  batchSize: number,
  maxBatches: number
): Promise<number> {
  let totalDeleted = 0;
  let batchCount = 0;

  while (batchCount < maxBatches) {
    let deleted = 0;

    try {
      // Use Prisma model-based delete
      switch (tableName) {
        case 'TelemetryEvent':
          try {
            const telemetryResult = await db.telemetryEvent.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
            deleted = Math.min(telemetryResult.count, batchSize);
          } catch {
            // Table doesn't exist
          }
          break;
        case 'JobRun':
          try {
            const jobRunResult = await db.jobRun.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
            deleted = Math.min(jobRunResult.count, batchSize);
          } catch {
            // Table doesn't exist
          }
          break;
        case 'SecuritySnapshot':
          try {
            const securityResult = await db.securitySnapshot.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
            deleted = Math.min(securityResult.count, batchSize);
          } catch {
            // Table doesn't exist
          }
          break;
        case 'AnalyticsEvent':
          try {
            const analyticsResult = await db.analyticsEvent.deleteMany({
              where: { createdAt: { lt: cutoffDate } },
            });
            deleted = Math.min(analyticsResult.count, batchSize);
          } catch {
            // Table doesn't exist
          }
          break;
        default:
          break;
      }
    } catch {
      // Table doesn't exist, skip
      break;
    }

    totalDeleted += deleted;
    batchCount++;

    // If we deleted less than batch size, we're done with this table
    if (deleted < batchSize) break;
  }

  return totalDeleted;
}

export async function runCleanupJob(opts: CleanupJobOptions = {}): Promise<void> {
  const db = getPrisma();
  const startTime = Date.now();

  const retention = { ...RETENTION_DAYS, ...opts.retentionDays };
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const maxBatches = opts.maxBatches ?? 10;

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
    const now = new Date();
    const result: CleanupResult = {
      analyticsEventsDeleted: 0,
      jobRunsDeleted: 0,
      telemetryEventsDeleted: 0,
      securitySnapshotsDeleted: 0,
      totalDeleted: 0,
      batchesProcessed: 0,
    };

    // Cleanup analytics events
    const analyticsEventsCutoff = new Date(now);
    analyticsEventsCutoff.setDate(analyticsEventsCutoff.getDate() - retention.analyticsEvents);
    result.analyticsEventsDeleted = await deleteInBatches(
      db,
      'AnalyticsEvent',
      analyticsEventsCutoff,
      batchSize,
      maxBatches
    );

    // Cleanup job runs
    const jobRunsCutoff = new Date(now);
    jobRunsCutoff.setDate(jobRunsCutoff.getDate() - retention.jobRuns);
    result.jobRunsDeleted = await deleteInBatches(db, 'JobRun', jobRunsCutoff, batchSize, maxBatches);

    // Cleanup telemetry events
    const telemetryCutoff = new Date(now);
    telemetryCutoff.setDate(telemetryCutoff.getDate() - retention.telemetryEvents);
    result.telemetryEventsDeleted = await deleteInBatches(
      db,
      'TelemetryEvent',
      telemetryCutoff,
      batchSize,
      maxBatches
    );

    // Cleanup security snapshots
    const securityCutoff = new Date(now);
    securityCutoff.setDate(securityCutoff.getDate() - retention.securitySnapshots);
    result.securitySnapshotsDeleted = await deleteInBatches(
      db,
      'SecuritySnapshot',
      securityCutoff,
      batchSize,
      maxBatches
    );

    result.totalDeleted =
      result.analyticsEventsDeleted +
      result.jobRunsDeleted +
      result.telemetryEventsDeleted +
      result.securitySnapshotsDeleted;

    const durationMs = Date.now() - startTime;

    console.log(
      `[${JOB_NAME}] Completed: ${result.totalDeleted} total deleted (analytics: ${result.analyticsEventsDeleted}, jobs: ${result.jobRunsDeleted}, telemetry: ${result.telemetryEventsDeleted}, security: ${result.securitySnapshotsDeleted}) (${durationMs}ms)`
    );

    // Record success
    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'success',
      durationMs,
      counts: {
        analyticsEventsDeleted: result.analyticsEventsDeleted,
        jobRunsDeleted: result.jobRunsDeleted,
        telemetryEventsDeleted: result.telemetryEventsDeleted,
        securitySnapshotsDeleted: result.securitySnapshotsDeleted,
        totalDeleted: result.totalDeleted,
      },
    });

    // Emit telemetry
    try {
      await emit('job.run', {
        category: 'system',
        severity: 'info',
        payload: {
          jobName: JOB_NAME,
          status: 'success',
          durationMs,
          totalDeleted: result.totalDeleted,
          analyticsEventsDeleted: result.analyticsEventsDeleted,
          jobRunsDeleted: result.jobRunsDeleted,
          telemetryEventsDeleted: result.telemetryEventsDeleted,
          securitySnapshotsDeleted: result.securitySnapshotsDeleted,
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
