// file: src/analytics/rollups/hourlyRollup.job.ts
//
// Hourly analytics rollup: aggregates raw events into hourly buckets.
// Designed to be called by the job scheduler with bounded backfill.

import type { PrismaClient } from '@prisma/client';

export interface HourlyRollupOptions {
  backfillHours?: number; // Default: 6
  maxBuckets?: number; // Default: 24
}

export interface HourlyRollupResult {
  bucketsProcessed: number;
  rowsWritten: number;
  errors: number;
  startHour: string;
  endHour: string;
}

export async function runHourlyRollup(
  prisma: PrismaClient,
  opts: HourlyRollupOptions = {}
): Promise<HourlyRollupResult> {
  const backfillHours = opts.backfillHours ?? 6;
  const maxBuckets = opts.maxBuckets ?? 24;

  const now = new Date();
  const endHour = new Date(now);
  endHour.setMinutes(0, 0, 0);

  const startHour = new Date(endHour);
  startHour.setHours(startHour.getHours() - Math.min(backfillHours, maxBuckets));

  let bucketsProcessed = 0;
  let rowsWritten = 0;
  let errors = 0;

  // Process each hour bucket
  const currentBucket = new Date(startHour);
  while (currentBucket < endHour && bucketsProcessed < maxBuckets) {
    const bucketStart = new Date(currentBucket);
    const bucketEnd = new Date(currentBucket);
    bucketEnd.setHours(bucketEnd.getHours() + 1);

    const bucketKey = bucketStart.toISOString().slice(0, 13); // YYYY-MM-DDTHH

    try {
      // Aggregate messages per hour
      const messageStats = await prisma.message.aggregate({
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
        },
        _count: true,
      });

      // Aggregate active users per hour
      const activeUsers = await prisma.message.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
          userId: { not: null },
        },
      });

      // Aggregate document uploads per hour
      const documentStats = await prisma.document.aggregate({
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
        },
        _count: true,
        _sum: { sizeBytes: true },
      });

      // Aggregate LLM calls per hour (if table exists)
      let llmStats = { count: 0, totalTokens: 0, totalCost: 0 };
      try {
        const llmAgg = await prisma.lLMCall.aggregate({
          where: {
            createdAt: { gte: bucketStart, lt: bucketEnd },
          },
          _count: true,
          _sum: {
            inputTokens: true,
            outputTokens: true,
            costUsd: true,
          },
        });
        llmStats = {
          count: llmAgg._count,
          totalTokens: (llmAgg._sum.inputTokens ?? 0) + (llmAgg._sum.outputTokens ?? 0),
          totalCost: llmAgg._sum.costUsd ?? 0,
        };
      } catch {
        // Table may not exist
      }

      // Upsert hourly analytics bucket
      await prisma.analyticsHourlyBucket.upsert({
        where: { bucketKey },
        create: {
          bucketKey,
          bucketHour: bucketStart,
          messageCount: messageStats._count,
          activeUserCount: activeUsers.length,
          documentCount: documentStats._count,
          documentBytes: documentStats._sum.sizeBytes ?? 0,
          llmCallCount: llmStats.count,
          llmTokenCount: llmStats.totalTokens,
          llmCostUsd: llmStats.totalCost,
          updatedAt: new Date(),
        },
        update: {
          messageCount: messageStats._count,
          activeUserCount: activeUsers.length,
          documentCount: documentStats._count,
          documentBytes: documentStats._sum.sizeBytes ?? 0,
          llmCallCount: llmStats.count,
          llmTokenCount: llmStats.totalTokens,
          llmCostUsd: llmStats.totalCost,
          updatedAt: new Date(),
        },
      });

      rowsWritten++;
      bucketsProcessed++;
    } catch (e) {
      errors++;
      // Continue processing other buckets
    }

    currentBucket.setHours(currentBucket.getHours() + 1);
  }

  return {
    bucketsProcessed,
    rowsWritten,
    errors,
    startHour: startHour.toISOString(),
    endHour: endHour.toISOString(),
  };
}
