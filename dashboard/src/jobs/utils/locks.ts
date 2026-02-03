// file: src/jobs/utils/locks.ts
//
// PostgreSQL advisory lock helpers for job coordination.
// Uses pg_try_advisory_lock to ensure only one instance of a job runs at a time.

import type { PrismaClient } from '@prisma/client';

/**
 * Try to acquire a PostgreSQL advisory lock.
 * Returns true if lock acquired, false if held by another process.
 * Advisory locks are session-scoped and automatically released on disconnect.
 */
export async function tryAdvisoryLock(prisma: PrismaClient, lockKey: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
      SELECT pg_try_advisory_lock(hashtext(${lockKey}))
    `;
    return result[0]?.pg_try_advisory_lock === true;
  } catch (e) {
    // If advisory locks aren't available, log and continue (allows testing without Postgres)
    console.warn(`[Locks] Could not acquire advisory lock for ${lockKey}:`, e instanceof Error ? e.message : e);
    return true; // Fail-open for non-Postgres environments
  }
}

/**
 * Release a PostgreSQL advisory lock.
 * Should be called in finally block after job completion.
 */
export async function releaseAdvisoryLock(prisma: PrismaClient, lockKey: string): Promise<void> {
  try {
    await prisma.$queryRaw`
      SELECT pg_advisory_unlock(hashtext(${lockKey}))
    `;
  } catch (e) {
    // Log but don't throw - lock will be released on session end anyway
    console.warn(`[Locks] Could not release advisory lock for ${lockKey}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Execute a function while holding an advisory lock.
 * Automatically acquires and releases the lock.
 */
export async function withAdvisoryLock<T>(
  prisma: PrismaClient,
  lockKey: string,
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false; result: null }> {
  const acquired = await tryAdvisoryLock(prisma, lockKey);
  if (!acquired) {
    return { acquired: false, result: null };
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releaseAdvisoryLock(prisma, lockKey);
  }
}
