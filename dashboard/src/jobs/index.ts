// file: src/jobs/index.ts
//
// Job scheduler and orchestrator for Koda analytics + monitoring.
// Provides both:
//   - startJobsScheduler() for internal interval-based scheduling
//   - runAllJobsOnce() for cron/systemd timer execution

import { runAnalyticsHourlyJob } from './analyticsHourly.job';
import { runAnalyticsDailyJob } from './analyticsDaily.job';
import { runRetentionJob } from './retention.job';
import { runSecurityScanJob } from './securityScan.job';
import { runCleanupJob } from './cleanup.job';
import { runQueueHealthJob } from './queueHealth.job';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JobSchedulerOptions {
  /** Disable specific jobs */
  disabled?: {
    hourly?: boolean;
    daily?: boolean;
    retention?: boolean;
    securityScan?: boolean;
    cleanup?: boolean;
    queueHealth?: boolean;
  };
  /** Custom intervals in milliseconds */
  intervals?: {
    hourly?: number; // Default: 15 minutes
    daily?: number; // Default: 1 hour
    retention?: number; // Default: 6 hours
    securityScan?: number; // Default: 10 minutes
    cleanup?: number; // Default: 6 hours
    queueHealth?: number; // Default: 1 minute
  };
}

export interface JobRunResult {
  jobName: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const DEFAULT_INTERVALS = {
  hourly: 15 * MINUTE,
  daily: 1 * HOUR,
  retention: 6 * HOUR,
  securityScan: 10 * MINUTE,
  cleanup: 6 * HOUR,
  queueHealth: 1 * MINUTE,
};

// ─────────────────────────────────────────────────────────────────────────────
// Safe job wrapper
// ─────────────────────────────────────────────────────────────────────────────

async function safeRunJob(
  jobName: string,
  jobFn: () => Promise<void>
): Promise<JobRunResult> {
  const start = Date.now();
  try {
    await jobFn();
    return {
      jobName,
      status: 'success',
      durationMs: Date.now() - start,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[Jobs] ${jobName} failed:`, error);
    return {
      jobName,
      status: 'failed',
      durationMs: Date.now() - start,
      error,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run all jobs once (for cron/systemd)
// ─────────────────────────────────────────────────────────────────────────────

export async function runAllJobsOnce(): Promise<JobRunResult[]> {
  console.log('[Jobs] Running all jobs once...');
  const results: JobRunResult[] = [];

  // Run jobs sequentially to avoid overloading the database
  results.push(await safeRunJob('analytics_hourly', runAnalyticsHourlyJob));
  results.push(await safeRunJob('analytics_daily', runAnalyticsDailyJob));
  results.push(await safeRunJob('retention', runRetentionJob));
  results.push(await safeRunJob('security_scan', runSecurityScanJob));
  results.push(await safeRunJob('cleanup', runCleanupJob));
  results.push(await safeRunJob('queue_health', runQueueHealthJob));

  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`[Jobs] Completed: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal scheduler
// ─────────────────────────────────────────────────────────────────────────────

export function startJobsScheduler(opts: JobSchedulerOptions = {}): () => void {
  const intervals = { ...DEFAULT_INTERVALS, ...opts.intervals };
  const disabled = opts.disabled ?? {};
  const timers: NodeJS.Timeout[] = [];

  console.log('[Jobs] Starting scheduler...');

  // Helper to schedule a job with interval
  const schedule = (
    name: string,
    jobFn: () => Promise<void>,
    intervalMs: number,
    isDisabled?: boolean
  ) => {
    if (isDisabled) {
      console.log(`[Jobs] ${name} is disabled`);
      return;
    }

    console.log(`[Jobs] Scheduling ${name} every ${Math.round(intervalMs / 1000)}s`);

    // Run immediately on startup (with small stagger)
    const stagger = Math.random() * 5000;
    setTimeout(() => {
      safeRunJob(name, jobFn);
    }, stagger);

    // Then run at interval
    const timer = setInterval(() => {
      safeRunJob(name, jobFn);
    }, intervalMs);

    timers.push(timer);
  };

  // Schedule all jobs
  schedule('analytics_hourly', runAnalyticsHourlyJob, intervals.hourly, disabled.hourly);
  schedule('analytics_daily', runAnalyticsDailyJob, intervals.daily, disabled.daily);
  schedule('retention', runRetentionJob, intervals.retention, disabled.retention);
  schedule('security_scan', runSecurityScanJob, intervals.securityScan, disabled.securityScan);
  schedule('cleanup', runCleanupJob, intervals.cleanup, disabled.cleanup);
  schedule('queue_health', runQueueHealthJob, intervals.queueHealth, disabled.queueHealth);

  // Return cleanup function
  return () => {
    console.log('[Jobs] Stopping scheduler...');
    timers.forEach((t) => clearInterval(t));
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
  runAnalyticsHourlyJob,
  runAnalyticsDailyJob,
  runRetentionJob,
  runSecurityScanJob,
  runCleanupJob,
  runQueueHealthJob,
};
