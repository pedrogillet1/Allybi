// file: src/admin/serializers/security.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SecuritySerialized = {
  v: 1;
  kpis: {
    totalUsers: number;
    activeUsers: number;
    authFailures: number;
    rateLimitTriggers: number;
  };
  charts?: {
    failedLoginsPerDay?: Array<{ day: string; value: number }>;
    rateLimitsPerDay?: Array<{ day: string; value: number }>;
    adminActionsPerDay?: Array<{ day: string; value: number }>;
  };
  authEvents: Array<{
    ts: string;
    userId: string | null;
    userEmailMasked: string | null;
    event: string;
    ipHash: string | null;
    result: string;
  }>;
  rateLimitEvents: Array<{
    ts: string;
    route: string;
    ipHash: string | null;
    limiterName: string;
  }>;
  adminAudit: Array<{
    ts: string;
    admin: string;
    action: string;
    target: string;
  }>;
};

type RawAuthEventInput = {
  ts?: string | Date;
  createdAt?: string | Date;
  timestamp?: string | Date;
  userId?: string;
  userEmail?: string;
  email?: string;
  event?: string;
  eventType?: string;
  type?: string;
  ip?: string;
  ipAddress?: string;
  clientIp?: string;
  result?: string;
  status?: string;
  success?: boolean;
};

type RawRateLimitEventInput = {
  ts?: string | Date;
  createdAt?: string | Date;
  timestamp?: string | Date;
  route?: string;
  path?: string;
  endpoint?: string;
  ip?: string;
  ipAddress?: string;
  clientIp?: string;
  limiterName?: string;
  limiter?: string;
  name?: string;
};

type RawAdminAuditInput = {
  ts?: string | Date;
  createdAt?: string | Date;
  timestamp?: string | Date;
  admin?: string;
  adminId?: string;
  adminEmail?: string;
  user?: string;
  action?: string;
  actionType?: string;
  type?: string;
  target?: string;
  targetId?: string;
  resource?: string;
};

type RawSecurityInput = {
  kpis?: {
    totalUsers?: number;
    userCount?: number;
    activeUsers?: number;
    activeUserCount?: number;
    authFailures?: number;
    failedLogins?: number;
    rateLimitTriggers?: number;
    rateLimits?: number;
  };
  charts?: {
    failedLoginsPerDay?: Array<{ day?: string | Date; value?: number; count?: number }>;
    rateLimitsPerDay?: Array<{ day?: string | Date; value?: number; count?: number }>;
    adminActionsPerDay?: Array<{ day?: string | Date; value?: number; count?: number }>;
  };
  authEvents?: RawAuthEventInput[];
  loginEvents?: RawAuthEventInput[];
  rateLimitEvents?: RawRateLimitEventInput[];
  rateLimits?: RawRateLimitEventInput[];
  adminAudit?: RawAdminAuditInput[];
  auditLog?: RawAdminAuditInput[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPepper(): string {
  return process.env.TELEMETRY_HASH_PEPPER ?? '';
}

function hashValue(val: string): string {
  const pepper = getPepper();
  return createHash('sha256')
    .update(pepper + val)
    .digest('hex');
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '***@***.***';

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf('.');

  const maskedLocal = local.length <= 2 ? local[0] + '***' : local.slice(0, 2) + '***';

  let maskedDomain: string;
  if (dotIndex < 1) {
    maskedDomain = domain.length <= 2 ? domain[0] + '***' : domain.slice(0, 2) + '***';
  } else {
    const domainName = domain.slice(0, dotIndex);
    const tld = domain.slice(dotIndex);
    const maskedDomainName = domainName.length <= 2 ? domainName[0] + '***' : domainName.slice(0, 2) + '***';
    maskedDomain = maskedDomainName + tld;
  }

  return `${maskedLocal}@${maskedDomain}`;
}

function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

function toDayString(val: unknown): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function toNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  return fallback;
}

function toStringOrNull(val: unknown): string | null {
  if (typeof val === 'string' && val.length > 0) return val;
  return null;
}

function hashIp(ip: unknown): string | null {
  if (typeof ip !== 'string' || ip.length === 0) return null;
  return hashValue(ip);
}

function normalizeAuthResult(input: RawAuthEventInput): string {
  if (typeof input.result === 'string') {
    const lower = input.result.toLowerCase().trim();
    if (lower === 'success' || lower === 'ok' || lower === 'allowed') return 'success';
    if (lower === 'failure' || lower === 'failed' || lower === 'denied' || lower === 'blocked') return 'failure';
    return input.result;
  }
  if (typeof input.status === 'string') {
    const lower = input.status.toLowerCase().trim();
    if (lower === 'success' || lower === 'ok') return 'success';
    if (lower === 'failure' || lower === 'failed') return 'failure';
    return input.status;
  }
  if (typeof input.success === 'boolean') {
    return input.success ? 'success' : 'failure';
  }
  return 'unknown';
}

function sanitizeAdminIdentifier(val: unknown): string {
  if (typeof val !== 'string') return 'unknown';
  // Remove email if present, just use ID or masked version
  if (val.includes('@')) {
    return maskEmail(val);
  }
  // Truncate long identifiers
  return val.length > 50 ? val.slice(0, 50) : val;
}

function sanitizeTarget(val: unknown): string {
  if (typeof val !== 'string') return 'unknown';
  // Remove potential PII from target
  let target = val
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  return target.length > 100 ? target.slice(0, 100) : target;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeAuthEvent(raw: unknown): SecuritySerialized['authEvents'][0] {
  const input = (raw ?? {}) as RawAuthEventInput;

  const userId = toStringOrNull(input.userId);
  const email =
    typeof input.userEmail === 'string' && input.userEmail.includes('@')
      ? input.userEmail
      : typeof input.email === 'string' && input.email.includes('@')
        ? input.email
        : null;

  const ip = input.ip ?? input.ipAddress ?? input.clientIp;

  return {
    ts: toIsoString(input.ts ?? input.createdAt ?? input.timestamp),
    userId,
    userEmailMasked: email ? maskEmail(email) : null,
    event:
      typeof input.event === 'string'
        ? input.event
        : typeof input.eventType === 'string'
          ? input.eventType
          : typeof input.type === 'string'
            ? input.type
            : 'unknown',
    ipHash: hashIp(ip),
    result: normalizeAuthResult(input),
  };
}

export function serializeRateLimitEvent(raw: unknown): SecuritySerialized['rateLimitEvents'][0] {
  const input = (raw ?? {}) as RawRateLimitEventInput;

  const ip = input.ip ?? input.ipAddress ?? input.clientIp;
  const route =
    typeof input.route === 'string'
      ? input.route
      : typeof input.path === 'string'
        ? input.path
        : typeof input.endpoint === 'string'
          ? input.endpoint
          : 'unknown';

  return {
    ts: toIsoString(input.ts ?? input.createdAt ?? input.timestamp),
    route,
    ipHash: hashIp(ip),
    limiterName:
      typeof input.limiterName === 'string'
        ? input.limiterName
        : typeof input.limiter === 'string'
          ? input.limiter
          : typeof input.name === 'string'
            ? input.name
            : 'default',
  };
}

export function serializeAdminAudit(raw: unknown): SecuritySerialized['adminAudit'][0] {
  const input = (raw ?? {}) as RawAdminAuditInput;

  const admin = sanitizeAdminIdentifier(input.admin ?? input.adminId ?? input.adminEmail ?? input.user);
  const action =
    typeof input.action === 'string'
      ? input.action
      : typeof input.actionType === 'string'
        ? input.actionType
        : typeof input.type === 'string'
          ? input.type
          : 'unknown';
  const target = sanitizeTarget(input.target ?? input.targetId ?? input.resource);

  return {
    ts: toIsoString(input.ts ?? input.createdAt ?? input.timestamp),
    admin,
    action,
    target,
  };
}

export function serializeSecurity(raw: unknown): SecuritySerialized {
  const input = (raw ?? {}) as RawSecurityInput;
  const kpis = input.kpis ?? {};
  const charts = input.charts;

  const rawAuthEvents = input.authEvents ?? input.loginEvents ?? [];
  const rawRateLimitEvents = input.rateLimitEvents ?? input.rateLimits ?? [];
  const rawAdminAudit = input.adminAudit ?? input.auditLog ?? [];

  const result: SecuritySerialized = {
    v: 1,
    kpis: {
      totalUsers: toNumber(kpis.totalUsers ?? kpis.userCount, 0),
      activeUsers: toNumber(kpis.activeUsers ?? kpis.activeUserCount, 0),
      authFailures: toNumber(kpis.authFailures ?? kpis.failedLogins, 0),
      rateLimitTriggers: toNumber(kpis.rateLimitTriggers ?? kpis.rateLimits, 0),
    },
    authEvents: rawAuthEvents.map((e) => serializeAuthEvent(e)),
    rateLimitEvents: rawRateLimitEvents.map((e) => serializeRateLimitEvent(e)),
    adminAudit: rawAdminAudit.map((e) => serializeAdminAudit(e)),
  };

  if (charts) {
    result.charts = {};

    if (charts.failedLoginsPerDay) {
      result.charts.failedLoginsPerDay = charts.failedLoginsPerDay.map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value ?? item?.count, 0),
      }));
    }

    if (charts.rateLimitsPerDay) {
      result.charts.rateLimitsPerDay = charts.rateLimitsPerDay.map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value ?? item?.count, 0),
      }));
    }

    if (charts.adminActionsPerDay) {
      result.charts.adminActionsPerDay = charts.adminActionsPerDay.map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value ?? item?.count, 0),
      }));
    }
  }

  return result;
}
