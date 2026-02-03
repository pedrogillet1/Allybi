// file: src/analytics/rollups/retentionRollup.job.ts
// Retention rollup job - computes cohort-based retention metrics

import { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface RetentionRollupOptions {
  backfillDays?: number;       // Default: 30 days of cohorts
  windowsDays?: number[];      // Default: [1, 7, 30]
  maxCohortsPerRun?: number;   // Default: 60 cohorts
  dryRun?: boolean;            // Log only, don't write
}

export interface CohortRetentionMetrics {
  cohortDay: Date;
  cohortSize: number;
  windowDays: number;
  retainedUsers: number;
  retentionRate: number;
}

export interface RollupResult {
  success: boolean;
  cohortsProcessed: number;
  rowsWritten: number;
  errors: string[];
  durationMs: number;
  startCohort: string | null;
  endCohort: string | null;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Get UTC day start for a timestamp
 */
export function getUtcDayStart(ts: Date | string): Date {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Add days to a date
 */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Format date as ISO day string (YYYY-MM-DD)
 */
function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generate array of day buckets between start and end
 */
function generateDayBuckets(start: Date, end: Date): Date[] {
  const buckets: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    buckets.push(new Date(current));
    current = addDays(current, 1);
  }
  return buckets;
}

// ─────────────────────────────────────────────────────────────
// ADVISORY LOCK
// ─────────────────────────────────────────────────────────────

const LOCK_KEY = 'koda:analytics:retention';

async function tryAcquireLock(prisma: PrismaClient): Promise<boolean> {
  const result = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${LOCK_KEY})) as locked
  `;
  return result[0]?.locked === true;
}

async function releaseLock(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(hashtext(${LOCK_KEY}))
  `;
}

// ─────────────────────────────────────────────────────────────
// RETENTION COMPUTATION
// ─────────────────────────────────────────────────────────────

/**
 * Get cohort data: users grouped by their signup day
 */
async function getCohorts(
  prisma: PrismaClient,
  startDay: Date,
  endDay: Date
): Promise<Map<string, string[]>> {
  const result = await prisma.$queryRaw<{ signupDay: Date; userId: string }[]>`
    SELECT
      DATE("createdAt") as "signupDay",
      id as "userId"
    FROM users
    WHERE "createdAt" >= ${startDay} AND "createdAt" < ${addDays(endDay, 1)}
  `;

  // Group users by signup day
  const cohorts = new Map<string, string[]>();

  for (const row of result) {
    const day = formatDay(new Date(row.signupDay));
    if (!cohorts.has(day)) {
      cohorts.set(day, []);
    }
    cohorts.get(day)!.push(row.userId);
  }

  return cohorts;
}

/**
 * Get user activity days: which days each user had activity
 */
async function getUserActivityDays(
  prisma: PrismaClient,
  userIds: string[],
  startDay: Date,
  endDay: Date
): Promise<Map<string, Set<string>>> {
  if (userIds.length === 0) {
    return new Map();
  }

  // Query activity from usage_events
  const result = await prisma.$queryRaw<{ userId: string; activityDay: Date }[]>`
    SELECT DISTINCT
      "userId",
      DATE("at") as "activityDay"
    FROM usage_events
    WHERE "userId" = ANY(${userIds})
      AND "at" >= ${startDay}
      AND "at" < ${addDays(endDay, 1)}
      AND "eventType" IN ('chat.message_sent', 'rag.query', 'document.upload', 'auth.login')
  `;

  // Group activity days by user
  const userActivityDays = new Map<string, Set<string>>();

  for (const row of result) {
    const userId = row.userId;
    const day = formatDay(new Date(row.activityDay));

    if (!userActivityDays.has(userId)) {
      userActivityDays.set(userId, new Set());
    }
    userActivityDays.get(userId)!.add(day);
  }

  return userActivityDays;
}

/**
 * Compute retention for a single cohort at a specific window
 */
function computeCohortRetention(
  cohortDay: Date,
  cohortUserIds: string[],
  windowDays: number,
  userActivityDays: Map<string, Set<string>>
): CohortRetentionMetrics {
  const cohortSize = cohortUserIds.length;
  const targetDay = formatDay(addDays(cohortDay, windowDays));

  let retainedUsers = 0;

  for (const userId of cohortUserIds) {
    const activityDays = userActivityDays.get(userId);
    if (activityDays && activityDays.has(targetDay)) {
      retainedUsers++;
    }
  }

  return {
    cohortDay,
    cohortSize,
    windowDays,
    retainedUsers,
    retentionRate: cohortSize > 0 ? retainedUsers / cohortSize : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// UPSERT TO ROLLUP TABLE
// ─────────────────────────────────────────────────────────────

async function upsertRetentionMetrics(
  prisma: PrismaClient,
  metrics: CohortRetentionMetrics
): Promise<void> {
  // Using raw SQL upsert - requires retention_metrics table
  await prisma.$executeRaw`
    INSERT INTO retention_metrics (
      "cohortDay", "cohortSize", "windowDays", "retainedUsers", "retentionRate",
      "createdAt", "updatedAt"
    ) VALUES (
      ${metrics.cohortDay}, ${metrics.cohortSize}, ${metrics.windowDays},
      ${metrics.retainedUsers}, ${metrics.retentionRate},
      NOW(), NOW()
    )
    ON CONFLICT ("cohortDay", "windowDays") DO UPDATE SET
      "cohortSize" = EXCLUDED."cohortSize",
      "retainedUsers" = EXCLUDED."retainedUsers",
      "retentionRate" = EXCLUDED."retentionRate",
      "updatedAt" = NOW()
  `;
}

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────

export async function runRetentionRollup(
  prisma: PrismaClient,
  opts?: RetentionRollupOptions
): Promise<RollupResult> {
  const startTime = Date.now();
  const backfillDays = opts?.backfillDays ?? 30;
  const windowsDays = opts?.windowsDays ?? [1, 7, 30];
  const maxCohorts = opts?.maxCohortsPerRun ?? 60;
  const dryRun = opts?.dryRun ?? false;

  const result: RollupResult = {
    success: false,
    cohortsProcessed: 0,
    rowsWritten: 0,
    errors: [],
    durationMs: 0,
    startCohort: null,
    endCohort: null,
  };

  // Acquire advisory lock
  const gotLock = await tryAcquireLock(prisma);
  if (!gotLock) {
    result.errors.push('Failed to acquire advisory lock - another instance may be running');
    result.durationMs = Date.now() - startTime;
    return result;
  }

  try {
    // Calculate cohort range
    const now = new Date();
    const today = getUtcDayStart(now);

    // End cohort is far enough back that all windows can be measured
    const maxWindow = Math.max(...windowsDays);
    const endCohortDay = addDays(today, -maxWindow - 1);

    // Start cohort is backfillDays before end
    const startCohortDay = addDays(endCohortDay, -(backfillDays - 1));

    // Generate cohort days
    let cohortDays = generateDayBuckets(startCohortDay, endCohortDay);

    // Limit cohorts per run
    if (cohortDays.length > maxCohorts) {
      cohortDays = cohortDays.slice(-maxCohorts);
    }

    if (cohortDays.length === 0) {
      result.success = true;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    result.startCohort = formatDay(cohortDays[0]);
    result.endCohort = formatDay(cohortDays[cohortDays.length - 1]);

    // Get all cohorts (users by signup day)
    const cohorts = await getCohorts(prisma, cohortDays[0], cohortDays[cohortDays.length - 1]);

    // Collect all user IDs for activity query
    const allUserIds: string[] = [];
    for (const userIds of Array.from(cohorts.values())) {
      allUserIds.push(...userIds);
    }

    // Get activity data for all users
    // Activity window: from first cohort day to today (to capture all windows)
    const userActivityDays = await getUserActivityDays(
      prisma,
      allUserIds,
      cohortDays[0],
      today
    );

    // Process each cohort and window
    for (const cohortDay of cohortDays) {
      const cohortDayStr = formatDay(cohortDay);
      const cohortUserIds = cohorts.get(cohortDayStr) || [];

      if (cohortUserIds.length === 0) {
        // Still write zero-row for empty cohorts (contiguous data)
        for (const windowDays of windowsDays) {
          const metrics: CohortRetentionMetrics = {
            cohortDay,
            cohortSize: 0,
            windowDays,
            retainedUsers: 0,
            retentionRate: 0,
          };

          try {
            if (!dryRun) {
              await upsertRetentionMetrics(prisma, metrics);
              result.rowsWritten++;
            }
          } catch (err: any) {
            result.errors.push(`Cohort ${cohortDayStr} D+${windowDays}: ${err.message || 'unknown error'}`);
          }
        }
        result.cohortsProcessed++;
        continue;
      }

      // Compute retention for each window
      for (const windowDays of windowsDays) {
        try {
          const metrics = computeCohortRetention(
            cohortDay,
            cohortUserIds,
            windowDays,
            userActivityDays
          );

          if (!dryRun) {
            await upsertRetentionMetrics(prisma, metrics);
            result.rowsWritten++;
          }
        } catch (err: any) {
          result.errors.push(`Cohort ${cohortDayStr} D+${windowDays}: ${err.message || 'unknown error'}`);
        }
      }

      result.cohortsProcessed++;
    }

    result.success = result.errors.length === 0;
  } finally {
    await releaseLock(prisma);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

export default runRetentionRollup;
