// file: src/analytics/rollups/retentionRollup.job.ts
//
// Retention cohort rollup: computes day-N retention for user cohorts.
// Designed to be called by the job scheduler with bounded backfill.

import type { PrismaClient } from '@prisma/client';

export interface RetentionRollupOptions {
  cohortsBackfillDays?: number; // Default: 30
  windows?: number[]; // Default: [1, 7, 30] - retention windows to compute
}

export interface RetentionRollupResult {
  cohortsProcessed: number;
  rowsWritten: number;
  errors: number;
  oldestCohort: string;
  newestCohort: string;
}

export async function runRetentionRollup(
  prisma: PrismaClient,
  opts: RetentionRollupOptions = {}
): Promise<RetentionRollupResult> {
  const backfillDays = opts.cohortsBackfillDays ?? 30;
  const windows = opts.windows ?? [1, 7, 30];

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // We need to process cohorts that are old enough to have retention data
  // E.g., for day-30 retention, we need cohorts from at least 30 days ago
  const maxWindow = Math.max(...windows);

  let cohortsProcessed = 0;
  let rowsWritten = 0;
  let errors = 0;
  let oldestCohort = '';
  let newestCohort = '';

  // Process cohorts from (backfillDays + maxWindow) days ago to maxWindow days ago
  // This ensures we have enough data to compute retention
  for (let daysAgo = backfillDays + maxWindow; daysAgo >= maxWindow; daysAgo--) {
    const cohortDate = new Date(today);
    cohortDate.setDate(cohortDate.getDate() - daysAgo);
    const cohortKey = cohortDate.toISOString().slice(0, 10);

    if (!oldestCohort) oldestCohort = cohortKey;
    newestCohort = cohortKey;

    const cohortStart = new Date(cohortDate);
    const cohortEnd = new Date(cohortDate);
    cohortEnd.setDate(cohortEnd.getDate() + 1);

    try {
      // Get users who signed up on this cohort date
      const cohortUsers = await prisma.user.findMany({
        where: {
          createdAt: { gte: cohortStart, lt: cohortEnd },
        },
        select: { id: true },
      });

      const cohortSize = cohortUsers.length;
      if (cohortSize === 0) {
        cohortsProcessed++;
        continue;
      }

      const cohortUserIds = cohortUsers.map((u) => u.id);

      // Compute retention for each window
      for (const windowDays of windows) {
        const windowStart = new Date(cohortDate);
        windowStart.setDate(windowStart.getDate() + windowDays);
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + 1);

        // Skip if window is in the future
        if (windowStart >= today) continue;

        // Count users from cohort who were active on day N
        const retainedUsers = await prisma.message.groupBy({
          by: ['userId'],
          where: {
            userId: { in: cohortUserIds },
            createdAt: { gte: windowStart, lt: windowEnd },
          },
        });

        const retainedCount = retainedUsers.length;
        const retentionRate = cohortSize > 0 ? retainedCount / cohortSize : 0;

        const bucketKey = `${cohortKey}:d${windowDays}`;

        await prisma.retentionCohort.upsert({
          where: { bucketKey },
          create: {
            bucketKey,
            cohortDate,
            windowDays,
            cohortSize,
            retainedCount,
            retentionRate,
            updatedAt: new Date(),
          },
          update: {
            cohortSize,
            retainedCount,
            retentionRate,
            updatedAt: new Date(),
          },
        });

        rowsWritten++;
      }

      cohortsProcessed++;
    } catch (e) {
      errors++;
      // Continue processing other cohorts
    }
  }

  return {
    cohortsProcessed,
    rowsWritten,
    errors,
    oldestCohort,
    newestCohort,
  };
}
