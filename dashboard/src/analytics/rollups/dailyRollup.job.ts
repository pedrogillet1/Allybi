// file: src/analytics/rollups/dailyRollup.job.ts
//
// Daily analytics rollup: aggregates raw events into daily buckets.
// Designed to be called by the job scheduler with bounded backfill.

import type { PrismaClient } from '@prisma/client';

export interface DailyRollupOptions {
  backfillDays?: number; // Default: 3
  maxBuckets?: number; // Default: 14
}

export interface DailyRollupResult {
  bucketsProcessed: number;
  rowsWritten: number;
  errors: number;
  startDay: string;
  endDay: string;
}

export async function runDailyRollup(
  prisma: PrismaClient,
  opts: DailyRollupOptions = {}
): Promise<DailyRollupResult> {
  const backfillDays = opts.backfillDays ?? 3;
  const maxBuckets = opts.maxBuckets ?? 14;

  const now = new Date();
  const endDay = new Date(now);
  endDay.setHours(0, 0, 0, 0);

  const startDay = new Date(endDay);
  startDay.setDate(startDay.getDate() - Math.min(backfillDays, maxBuckets));

  let bucketsProcessed = 0;
  let rowsWritten = 0;
  let errors = 0;

  // Process each day bucket
  const currentBucket = new Date(startDay);
  while (currentBucket < endDay && bucketsProcessed < maxBuckets) {
    const bucketStart = new Date(currentBucket);
    const bucketEnd = new Date(currentBucket);
    bucketEnd.setDate(bucketEnd.getDate() + 1);

    const bucketKey = bucketStart.toISOString().slice(0, 10); // YYYY-MM-DD

    try {
      // Aggregate messages per day
      const messageStats = await prisma.message.aggregate({
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
        },
        _count: true,
      });

      // Count unique active users per day
      const activeUsers = await prisma.message.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
          userId: { not: null },
        },
      });

      // New users that day
      const newUsers = await prisma.user.count({
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
        },
      });

      // Document stats
      const documentStats = await prisma.document.aggregate({
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
        },
        _count: true,
        _sum: { sizeBytes: true },
      });

      // Conversation stats
      const conversationCount = await prisma.conversation.count({
        where: {
          createdAt: { gte: bucketStart, lt: bucketEnd },
        },
      });

      // LLM cost aggregation
      let llmStats = { count: 0, totalTokens: 0, totalCost: 0, avgLatencyMs: 0 };
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
          _avg: {
            latencyMs: true,
          },
        });
        llmStats = {
          count: llmAgg._count,
          totalTokens: (llmAgg._sum.inputTokens ?? 0) + (llmAgg._sum.outputTokens ?? 0),
          totalCost: llmAgg._sum.costUsd ?? 0,
          avgLatencyMs: llmAgg._avg.latencyMs ?? 0,
        };
      } catch {
        // Table may not exist
      }

      // Error count for the day
      let errorCount = 0;
      try {
        errorCount = await prisma.errorLog.count({
          where: {
            createdAt: { gte: bucketStart, lt: bucketEnd },
          },
        });
      } catch {
        // Table may not exist
      }

      // Upsert daily analytics bucket
      await prisma.analyticsDailyBucket.upsert({
        where: { bucketKey },
        create: {
          bucketKey,
          bucketDate: bucketStart,
          messageCount: messageStats._count,
          dauCount: activeUsers.length,
          newUserCount: newUsers,
          conversationCount,
          documentCount: documentStats._count,
          documentBytes: documentStats._sum.sizeBytes ?? 0,
          llmCallCount: llmStats.count,
          llmTokenCount: llmStats.totalTokens,
          llmCostUsd: llmStats.totalCost,
          llmAvgLatencyMs: llmStats.avgLatencyMs,
          errorCount,
          updatedAt: new Date(),
        },
        update: {
          messageCount: messageStats._count,
          dauCount: activeUsers.length,
          newUserCount: newUsers,
          conversationCount,
          documentCount: documentStats._count,
          documentBytes: documentStats._sum.sizeBytes ?? 0,
          llmCallCount: llmStats.count,
          llmTokenCount: llmStats.totalTokens,
          llmCostUsd: llmStats.totalCost,
          llmAvgLatencyMs: llmStats.avgLatencyMs,
          errorCount,
          updatedAt: new Date(),
        },
      });

      rowsWritten++;
      bucketsProcessed++;
    } catch (e) {
      errors++;
      // Continue processing other buckets
    }

    currentBucket.setDate(currentBucket.getDate() + 1);
  }

  return {
    bucketsProcessed,
    rowsWritten,
    errors,
    startDay: startDay.toISOString().slice(0, 10),
    endDay: endDay.toISOString().slice(0, 10),
  };
}
