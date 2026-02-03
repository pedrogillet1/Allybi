// file: src/jobs/securityScan.job.ts
//
// Security monitoring rollup job.
// Computes aggregated security signals (no PII):
// - Failed logins
// - Rate limit triggers
// - Admin actions
// - Anomaly detection (simple threshold-based)

import { PrismaClient } from '@prisma/client';
import { emit } from '../telemetry';
import { tryAdvisoryLock, releaseAdvisoryLock } from './utils/locks';
import { recordJobRun } from './utils/jobRun';

const LOCK_KEY = 'koda:job:security_scan';
const JOB_NAME = 'security_scan';

// Thresholds for anomaly detection
const THRESHOLDS = {
  failedLoginsPerMinute: 10,
  rateLimitsPerMinute: 50,
  adminActionsPerMinute: 20,
};

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

export interface SecurityScanJobOptions {
  windowMinutes?: number; // Default: 10
}

export interface SecurityScanResult {
  failedLogins: number;
  rateLimitTriggers: number;
  adminActions: number;
  alerts: string[];
}

export async function runSecurityScanJob(opts: SecurityScanJobOptions = {}): Promise<void> {
  const db = getPrisma();
  const startTime = Date.now();
  const windowMinutes = opts.windowMinutes ?? 10;

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
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

    const result: SecurityScanResult = {
      failedLogins: 0,
      rateLimitTriggers: 0,
      adminActions: 0,
      alerts: [],
    };

    // Count failed logins (from telemetry events)
    try {
      const failedLogins = await db.telemetryEvent.count({
        where: {
          name: { in: ['auth.login.failed', 'auth.failure', 'login.failed'] },
          createdAt: { gte: windowStart },
        },
      });
      result.failedLogins = failedLogins;

      // Check threshold
      const failedPerMinute = failedLogins / windowMinutes;
      if (failedPerMinute > THRESHOLDS.failedLoginsPerMinute) {
        result.alerts.push(`high_failed_logins:${Math.round(failedPerMinute)}/min`);
      }
    } catch {
      // Table may not exist, try alternative
      try {
        const failedLogins = await db.authEvent.count({
          where: {
            event: { in: ['login_failed', 'auth_failed'] },
            createdAt: { gte: windowStart },
          },
        });
        result.failedLogins = failedLogins;
      } catch {
        // Skip if no auth events table
      }
    }

    // Count rate limit triggers
    try {
      const rateLimits = await db.telemetryEvent.count({
        where: {
          name: { in: ['rate_limit.triggered', 'ratelimit.hit', 'rate.limited'] },
          createdAt: { gte: windowStart },
        },
      });
      result.rateLimitTriggers = rateLimits;

      // Check threshold
      const rateLimitsPerMinute = rateLimits / windowMinutes;
      if (rateLimitsPerMinute > THRESHOLDS.rateLimitsPerMinute) {
        result.alerts.push(`high_rate_limits:${Math.round(rateLimitsPerMinute)}/min`);
      }
    } catch {
      // Table may not exist, try alternative
      try {
        const rateLimits = await db.rateLimitEvent.count({
          where: {
            createdAt: { gte: windowStart },
          },
        });
        result.rateLimitTriggers = rateLimits;
      } catch {
        // Skip if no rate limit events table
      }
    }

    // Count admin actions
    try {
      const adminActions = await db.telemetryEvent.count({
        where: {
          name: { startsWith: 'admin.' },
          createdAt: { gte: windowStart },
        },
      });
      result.adminActions = adminActions;

      // Check threshold
      const adminPerMinute = adminActions / windowMinutes;
      if (adminPerMinute > THRESHOLDS.adminActionsPerMinute) {
        result.alerts.push(`high_admin_actions:${Math.round(adminPerMinute)}/min`);
      }
    } catch {
      // Table may not exist, try alternative
      try {
        const adminActions = await db.adminAuditLog.count({
          where: {
            createdAt: { gte: windowStart },
          },
        });
        result.adminActions = adminActions;
      } catch {
        // Skip if no admin audit table
      }
    }

    // Write security snapshot
    try {
      await db.securitySnapshot.create({
        data: {
          windowStart,
          windowEnd: now,
          windowMinutes,
          failedLogins: result.failedLogins,
          rateLimitTriggers: result.rateLimitTriggers,
          adminActions: result.adminActions,
          alertCount: result.alerts.length,
          alerts: result.alerts,
        },
      });
    } catch {
      // Table may not exist, just log
      console.log(`[${JOB_NAME}] Could not write security snapshot (table may not exist)`);
    }

    const durationMs = Date.now() - startTime;
    const hasAlerts = result.alerts.length > 0;

    console.log(
      `[${JOB_NAME}] Completed: ${result.failedLogins} failed logins, ${result.rateLimitTriggers} rate limits, ${result.adminActions} admin actions, ${result.alerts.length} alerts (${durationMs}ms)`
    );

    // Record success
    await recordJobRun(db, {
      jobName: JOB_NAME,
      status: 'success',
      durationMs,
      counts: {
        failedLogins: result.failedLogins,
        rateLimitTriggers: result.rateLimitTriggers,
        adminActions: result.adminActions,
        alertCount: result.alerts.length,
      },
    });

    // Emit telemetry
    try {
      await emit('job.run', {
        category: 'security',
        severity: hasAlerts ? 'warn' : 'info',
        payload: {
          jobName: JOB_NAME,
          status: 'success',
          durationMs,
          failedLogins: result.failedLogins,
          rateLimitTriggers: result.rateLimitTriggers,
          adminActions: result.adminActions,
          alertCount: result.alerts.length,
          // Only include alert types, not details
          alertTypes: result.alerts.map((a) => a.split(':')[0]),
        },
      });

      // Emit separate alert event if there are alerts
      if (hasAlerts) {
        await emit('security.alert', {
          category: 'security',
          severity: 'warn',
          payload: {
            alertCount: result.alerts.length,
            alertTypes: result.alerts.map((a) => a.split(':')[0]),
            windowMinutes,
          },
        });
      }
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
        category: 'security',
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
