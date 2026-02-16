/**
 * Security Service
 * Security counters and audit events (deterministic, empty if no data)
 */

import type { PrismaClient } from '@prisma/client';
import { parseRange, normalizeRange } from './_shared/rangeWindow';
import { clampLimit } from './_shared/clamp';
import { processPage, buildCursorClause } from './_shared/pagination';
import { supportsModel } from './_shared/prismaAdapter';

export interface SecurityCounters {
  privacyBlocks: number;
  redactions: number;
  failedAuth: number;
  accessDenied: number;
}

export interface SecurityEventRow {
  at: string;
  userId: string | null;
  action: string;
  resource: string | null;
  status: string;
  ipAddress: string | null;
  details: string | null;
}

export interface SecurityResult {
  range: string;
  counters: SecurityCounters;
  items: SecurityEventRow[];
  nextCursor?: string;
}

/**
 * Get security metrics
 * Returns deterministic empty structure if no security tables exist
 */
export async function getSecurity(
  prisma: PrismaClient,
  params: { range?: string; limit?: number; cursor?: string }
): Promise<SecurityResult> {
  const rangeKey = normalizeRange(params.range, '7d');
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;
  const safe = async <T>(query: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await query();
    } catch {
      return fallback;
    }
  };

  // Initialize counters to zero
  let counters: SecurityCounters = {
    privacyBlocks: 0,
    redactions: 0,
    failedAuth: 0,
    accessDenied: 0,
  };

  let items: SecurityEventRow[] = [];
  let nextCursor: string | undefined;

  // Try to read from AuditLog if available
  if (supportsModel(prisma, 'auditLog')) {
    // Get security-related events
    const securityActions = [
      'PRIVACY_BLOCK',
      'REDACTION',
      'LOGIN_FAILED',
      'login_failed',
      'ACCESS_DENIED',
      'access_denied',
      'AUTH_FAILURE',
      'auth_failure',
      'BLOCKED',
      'blocked',
    ];

    // Count security events
    const [privacyBlocks, redactions, failedAuth, accessDenied] = await Promise.all([
      safe(() => prisma.auditLog.count({
        where: {
          createdAt: { gte: from, lt: to },
          action: { in: ['PRIVACY_BLOCK', 'privacy_block', 'BLOCKED', 'blocked'] },
        },
      }), 0),
      safe(() => prisma.auditLog.count({
        where: {
          createdAt: { gte: from, lt: to },
          action: { in: ['REDACTION', 'redaction', 'REDACT', 'redact'] },
        },
      }), 0),
      safe(() => prisma.auditLog.count({
        where: {
          createdAt: { gte: from, lt: to },
          action: { in: ['LOGIN_FAILED', 'login_failed', 'AUTH_FAILURE', 'auth_failure'] },
        },
      }), 0),
      safe(() => prisma.auditLog.count({
        where: {
          createdAt: { gte: from, lt: to },
          action: { in: ['ACCESS_DENIED', 'access_denied'] },
        },
      }), 0),
    ]);

    counters = {
      privacyBlocks: privacyBlocks as number,
      redactions: redactions as number,
      failedAuth: failedAuth as number,
      accessDenied: accessDenied as number,
    };

    // Get security events with pagination
    const events = await safe(() => prisma.auditLog.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        action: { in: securityActions },
      },
      take: limit + 1,
      ...cursorClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        userId: true,
        action: true,
        resource: true,
        status: true,
        ipAddress: true,
        details: true,
      },
    }), []);

    const page = processPage(events, limit);
    nextCursor = page.nextCursor ?? undefined;

    items = page.page.map(e => ({
      at: e.createdAt.toISOString(),
      userId: e.userId,
      action: e.action,
      resource: e.resource,
      status: e.status,
      ipAddress: e.ipAddress,
      details: e.details,
    }));
  }

  // Also check AdminAuditLog if available
  if (supportsModel(prisma, 'adminAuditLog')) {
    const adminSecurityActions = [
      'ADMIN_LOGIN_FAILED',
      'admin_login_failed',
      'ADMIN_ACCESS_DENIED',
      'admin_access_denied',
    ];

    const adminFailedAuth = await safe(() => prisma.adminAuditLog.count({
      where: {
        timestamp: { gte: from, lt: to },
        action: { in: adminSecurityActions },
      },
    }), 0);

    counters.failedAuth += adminFailedAuth as number;
  }

  // Check for suspicious sessions
  if (supportsModel(prisma, 'session')) {
    const suspiciousSessions = await safe(() => prisma.session.count({
      where: {
        createdAt: { gte: from, lt: to },
        isSuspicious: true,
      },
    }), 0);

    counters.accessDenied += suspiciousSessions as number;
  }

  return {
    range: rangeKey,
    counters,
    items,
    ...(nextCursor ? { nextCursor } : {}),
  };
}
