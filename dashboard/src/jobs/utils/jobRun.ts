// file: src/jobs/utils/jobRun.ts
//
// Job run recording helper.
// Records job execution metadata to job_runs table or telemetry.
// Never logs sensitive payloads.

import type { PrismaClient } from '@prisma/client';

export interface JobRunRecord {
  jobName: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  counts?: Record<string, unknown>;
}

/**
 * Record a job run to the database.
 * Falls back to console logging if table doesn't exist.
 */
export async function recordJobRun(prisma: PrismaClient, record: JobRunRecord): Promise<void> {
  try {
    await prisma.jobRun.create({
      data: {
        jobName: record.jobName,
        status: record.status,
        durationMs: record.durationMs,
        counts: record.counts ?? {},
        createdAt: new Date(),
      },
    });
  } catch (e) {
    // Table may not exist - log to console as fallback
    // Only log safe metadata, never payload contents
    console.log(
      `[JobRun] ${record.jobName}: ${record.status} (${record.durationMs}ms)`,
      record.counts ? JSON.stringify(sanitizeCounts(record.counts)) : ''
    );
  }
}

/**
 * Get recent job runs for monitoring.
 */
export async function getRecentJobRuns(
  prisma: PrismaClient,
  opts: { jobName?: string; limit?: number; since?: Date } = {}
): Promise<JobRunRecord[]> {
  try {
    const runs = await prisma.jobRun.findMany({
      where: {
        ...(opts.jobName && { jobName: opts.jobName }),
        ...(opts.since && { createdAt: { gte: opts.since } }),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
    });

    return runs.map((r) => ({
      jobName: r.jobName,
      status: r.status as 'success' | 'failed' | 'skipped',
      durationMs: r.durationMs,
      counts: r.counts as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}

/**
 * Sanitize counts object to ensure no sensitive data is logged.
 */
function sanitizeCounts(counts: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(counts)) {
    // Skip any keys that might contain sensitive data
    const keyLower = key.toLowerCase();
    if (
      keyLower.includes('email') ||
      keyLower.includes('password') ||
      keyLower.includes('token') ||
      keyLower.includes('secret') ||
      keyLower.includes('key') ||
      keyLower.includes('ip') ||
      keyLower.includes('content') ||
      keyLower.includes('payload')
    ) {
      sanitized[key] = '[redacted]';
      continue;
    }

    // Only include primitive values
    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (typeof value === 'string' && value.length <= 100) {
      sanitized[key] = value;
    } else if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 100) + '...';
    }
  }

  return sanitized;
}
