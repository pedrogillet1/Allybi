// file: src/jobs/queueHealth.job.ts
//
// Queue health monitoring job.
// Monitors:
// - Queue depth (waiting jobs)
// - Active jobs
// - Failed jobs count
// - Stalled jobs count
// - Oldest waiting job age
//
// Emits health telemetry and alerts on threshold breaches.

import { PrismaClient } from '@prisma/client';
import { emit } from '../telemetry';
import { tryAdvisoryLock, releaseAdvisoryLock } from './utils/locks';
import { recordJobRun } from './utils/jobRun';

const LOCK_KEY = 'koda:job:queue_health';
const JOB_NAME = 'queue_health';

// Thresholds for alerts
const THRESHOLDS = {
  maxWaiting: 1000,
  maxOldestAgeMs: 5 * 60 * 1000, // 5 minutes
  maxFailed: 100,
  maxStalled: 10,
};

// Known queue names to monitor
const QUEUE_NAMES = ['document-processing', 'preview-generation', 'email', 'notifications'];

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

export interface QueueHealthJobOptions {
  thresholds?: {
    maxWaiting?: number;
    maxOldestAgeMs?: number;
    maxFailed?: number;
    maxStalled?: number;
  };
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  stalled: number;
  oldestWaitingAgeMs: number | null;
}

export interface QueueHealthResult {
  queues: QueueStats[];
  totalWaiting: number;
  totalActive: number;
  totalFailed: number;
  totalStalled: number;
  alerts: string[];
}

async function getQueueStats(db: PrismaClient, queueName: string): Promise<QueueStats> {
  const stats: QueueStats = {
    name: queueName,
    waiting: 0,
    active: 0,
    failed: 0,
    stalled: 0,
    oldestWaitingAgeMs: null,
  };

  try {
    // Try to query from a job_queue table if it exists
    const queueJobs = await db.$queryRaw<
      Array<{
        status: string;
        count: bigint;
        oldest_created_at: Date | null;
      }>
    >`
      SELECT
        status,
        COUNT(*)::bigint as count,
        MIN("createdAt") as oldest_created_at
      FROM "JobQueue"
      WHERE "queueName" = ${queueName}
      GROUP BY status
    `;

    const now = Date.now();
    for (const row of queueJobs) {
      const count = Number(row.count);
      switch (row.status) {
        case 'waiting':
        case 'pending':
          stats.waiting = count;
          if (row.oldest_created_at) {
            stats.oldestWaitingAgeMs = now - row.oldest_created_at.getTime();
          }
          break;
        case 'active':
        case 'processing':
          stats.active = count;
          break;
        case 'failed':
        case 'error':
          stats.failed = count;
          break;
        case 'stalled':
          stats.stalled = count;
          break;
      }
    }
  } catch {
    // JobQueue table doesn't exist, try BullMQ-style table
    try {
      const bullJobs = await db.$queryRaw<
        Array<{
          status: string;
          count: bigint;
        }>
      >`
        SELECT
          CASE
            WHEN "processedOn" IS NULL AND "finishedOn" IS NULL THEN 'waiting'
            WHEN "processedOn" IS NOT NULL AND "finishedOn" IS NULL THEN 'active'
            WHEN "failedReason" IS NOT NULL THEN 'failed'
            ELSE 'completed'
          END as status,
          COUNT(*)::bigint as count
        FROM "BullJob"
        WHERE "queue" = ${queueName}
        GROUP BY 1
      `;

      for (const row of bullJobs) {
        const count = Number(row.count);
        switch (row.status) {
          case 'waiting':
            stats.waiting = count;
            break;
          case 'active':
            stats.active = count;
            break;
          case 'failed':
            stats.failed = count;
            break;
        }
      }
    } catch {
      // No queue tables exist, return empty stats
    }
  }

  return stats;
}

export async function runQueueHealthJob(opts: QueueHealthJobOptions = {}): Promise<void> {
  const db = getPrisma();
  const startTime = Date.now();

  const thresholds = { ...THRESHOLDS, ...opts.thresholds };

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
    const result: QueueHealthResult = {
      queues: [],
      totalWaiting: 0,
      totalActive: 0,
      totalFailed: 0,
      totalStalled: 0,
      alerts: [],
    };

    // Get stats for each known queue
    for (const queueName of QUEUE_NAMES) {
      const stats = await getQueueStats(db, queueName);
      result.queues.push(stats);

      result.totalWaiting += stats.waiting;
      result.totalActive += stats.active;
      result.totalFailed += stats.failed;
      result.totalStalled += stats.stalled;

      // Check thresholds per queue
      if (stats.waiting > thresholds.maxWaiting) {
        result.alerts.push(`${queueName}:high_waiting:${stats.waiting}`);
      }
      if (stats.oldestWaitingAgeMs && stats.oldestWaitingAgeMs > thresholds.maxOldestAgeMs) {
        result.alerts.push(`${queueName}:stale_jobs:${Math.round(stats.oldestWaitingAgeMs / 1000)}s`);
      }
      if (stats.failed > thresholds.maxFailed) {
        result.alerts.push(`${queueName}:high_failed:${stats.failed}`);
      }
      if (stats.stalled > thresholds.maxStalled) {
        result.alerts.push(`${queueName}:high_stalled:${stats.stalled}`);
      }
    }

    // Write health snapshot
    try {
      await db.systemHealthSnapshot.create({
        data: {
          snapshotType: 'queue_health',
          totalWaiting: result.totalWaiting,
          totalActive: result.totalActive,
          totalFailed: result.totalFailed,
          totalStalled: result.totalStalled,
          alertCount: result.alerts.length,
          queueStats: result.queues as any,
        },
      });
    } catch {
      // Table may not exist, just log
      console.log(`[${JOB_NAME}] Could not write health snapshot (table may not exist)`);
    }

    const durationMs = Date.now() - startTime;
    const hasAlerts = result.alerts.length > 0;

    console.log(
      `[${JOB_NAME}] Completed: waiting=${result.totalWaiting}, active=${result.totalActive}, failed=${result.totalFailed}, stalled=${result.totalStalled}, alerts=${result.alerts.length} (${durationMs}ms)`
    );

    // Record success
    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'success',
      durationMs,
      counts: {
        totalWaiting: result.totalWaiting,
        totalActive: result.totalActive,
        totalFailed: result.totalFailed,
        totalStalled: result.totalStalled,
        alertCount: result.alerts.length,
      },
    });

    // Emit telemetry
    try {
      await emit('job.run', {
        category: 'system',
        severity: hasAlerts ? 'warn' : 'info',
        payload: {
          jobName: JOB_NAME,
          status: 'success',
          durationMs,
          totalWaiting: result.totalWaiting,
          totalActive: result.totalActive,
          totalFailed: result.totalFailed,
          totalStalled: result.totalStalled,
          alertCount: result.alerts.length,
        },
      });

      // Emit separate health event
      await emit('system.queue_health', {
        category: 'system',
        severity: hasAlerts ? 'warn' : 'info',
        payload: {
          totalWaiting: result.totalWaiting,
          totalActive: result.totalActive,
          totalFailed: result.totalFailed,
          totalStalled: result.totalStalled,
          alertCount: result.alerts.length,
          alertTypes: result.alerts.map((a) => a.split(':').slice(0, 2).join(':')),
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
