/**
 * Cohorts Service
 * Calculate user retention cohorts from real data
 */

import type { PrismaClient } from "@prisma/client";
import {
  parseRange,
  normalizeRange,
  type TimeWindow,
} from "./_shared/rangeWindow";
import { supportsModel } from "./_shared/prismaAdapter";

export interface CohortRow {
  cohort: string;
  cohortStart: string;
  users: number;
  week0: number;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
}

export interface CohortSummary {
  totalCohorts: number;
  totalUsers: number;
  avgWeek1Retention: number;
  avgWeek4Retention: number;
  hasEnoughData: boolean;
}

export interface CohortsResult {
  range: string;
  cohorts: CohortRow[];
  summary: CohortSummary;
}

/**
 * Get user retention cohorts
 * Groups users by signup week and calculates retention
 */
export async function getCohorts(
  prisma: PrismaClient,
  params: { range?: string },
): Promise<CohortsResult> {
  const rangeKey = normalizeRange(params.range, "90d");
  const window = parseRange(rangeKey);
  const { from, to } = window;

  // Empty result structure
  const emptyResult: CohortsResult = {
    range: rangeKey,
    cohorts: [],
    summary: {
      totalCohorts: 0,
      totalUsers: 0,
      avgWeek1Retention: 0,
      avgWeek4Retention: 0,
      hasEnoughData: false,
    },
  };

  if (!supportsModel(prisma, "user")) {
    return emptyResult;
  }

  // Get all users who signed up in the time window
  const users = await prisma.user.findMany({
    where: {
      createdAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      createdAt: true,
    },
    take: 10000,
  });

  if (users.length === 0) {
    return emptyResult;
  }

  // Group users by signup week
  const cohortMap = new Map<
    string,
    {
      cohortStart: Date;
      userIds: string[];
    }
  >();

  for (const user of users) {
    const weekStart = getWeekStart(user.createdAt);
    const cohortKey = formatCohortKey(weekStart);

    if (!cohortMap.has(cohortKey)) {
      cohortMap.set(cohortKey, {
        cohortStart: weekStart,
        userIds: [],
      });
    }
    cohortMap.get(cohortKey)!.userIds.push(user.id);
  }

  // Calculate retention for each cohort
  const cohorts: CohortRow[] = [];
  const now = new Date();

  for (const [cohortKey, cohortData] of cohortMap) {
    const { cohortStart, userIds } = cohortData;
    const cohortUsers = userIds.length;

    // Calculate retention at each week mark
    const week0 = 100; // All users are active in week 0 by definition
    const week1 = await calculateRetention(
      prisma,
      userIds,
      cohortStart,
      1,
      now,
    );
    const week2 = await calculateRetention(
      prisma,
      userIds,
      cohortStart,
      2,
      now,
    );
    const week3 = await calculateRetention(
      prisma,
      userIds,
      cohortStart,
      3,
      now,
    );
    const week4 = await calculateRetention(
      prisma,
      userIds,
      cohortStart,
      4,
      now,
    );

    cohorts.push({
      cohort: cohortKey,
      cohortStart: cohortStart.toISOString(),
      users: cohortUsers,
      week0,
      week1,
      week2,
      week3,
      week4,
    });
  }

  // Sort by cohort date (newest first)
  cohorts.sort((a, b) => b.cohortStart.localeCompare(a.cohortStart));

  // Take most recent 8 cohorts
  const recentCohorts = cohorts.slice(0, 8);

  // Calculate summary
  const cohortsWithWeek1 = recentCohorts.filter((c) => c.week1 >= 0);
  const cohortsWithWeek4 = recentCohorts.filter((c) => c.week4 >= 0);

  const avgWeek1Retention =
    cohortsWithWeek1.length > 0
      ? Math.round(
          cohortsWithWeek1.reduce((sum, c) => sum + c.week1, 0) /
            cohortsWithWeek1.length,
        )
      : 0;

  const avgWeek4Retention =
    cohortsWithWeek4.length > 0
      ? Math.round(
          cohortsWithWeek4.reduce((sum, c) => sum + c.week4, 0) /
            cohortsWithWeek4.length,
        )
      : 0;

  const totalUsers = recentCohorts.reduce((sum, c) => sum + c.users, 0);

  return {
    range: rangeKey,
    cohorts: recentCohorts,
    summary: {
      totalCohorts: recentCohorts.length,
      totalUsers,
      avgWeek1Retention,
      avgWeek4Retention,
      hasEnoughData: recentCohorts.length >= 2 && totalUsers >= 5,
    },
  };
}

/**
 * Get the start of the week (Monday) for a date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format cohort key as "Mon W#" (e.g., "Jan W1", "Feb W2")
 */
function formatCohortKey(date: Date): string {
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const weekOfMonth = Math.ceil(date.getDate() / 7);
  return `${month} W${weekOfMonth}`;
}

/**
 * Calculate retention percentage for a cohort at a specific week
 * Returns -1 if the week hasn't occurred yet
 */
async function calculateRetention(
  prisma: PrismaClient,
  userIds: string[],
  cohortStart: Date,
  weekNumber: number,
  now: Date,
): Promise<number> {
  const weekStartMs =
    cohortStart.getTime() + weekNumber * 7 * 24 * 60 * 60 * 1000;
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;

  // If this week hasn't started yet, return -1
  if (weekStartMs > now.getTime()) {
    return -1;
  }

  const weekStart = new Date(weekStartMs);
  const weekEnd = new Date(Math.min(weekEndMs, now.getTime()));

  // Count active users in this week
  // Check for activity in Conversation table (most reliable indicator)
  if (supportsModel(prisma, "conversation")) {
    const activeUsers = await prisma.conversation.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        updatedAt: { gte: weekStart, lt: weekEnd },
      },
    });

    const retentionPct = Math.round(
      (activeUsers.length / userIds.length) * 100,
    );
    return retentionPct;
  }

  // Fallback: check Message table
  if (supportsModel(prisma, "message")) {
    const messages = await prisma.message.findMany({
      where: {
        createdAt: { gte: weekStart, lt: weekEnd },
        role: "user",
        conversation: {
          userId: { in: userIds },
        },
      },
      select: { conversation: { select: { userId: true } } },
      distinct: ["conversationId"],
    });

    const activeUserIds = new Set(
      messages.map((m) => m.conversation?.userId).filter(Boolean),
    );
    const retentionPct = Math.round(
      (activeUserIds.size / userIds.length) * 100,
    );
    return retentionPct;
  }

  return 0;
}
