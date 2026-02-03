// file: src/admin/serializers/user.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UsersSerialized = {
  v: 1;
  total: number;
  users: Array<{
    userId: string;
    emailMasked: string | null;
    emailHash: string | null;
    tier: string | null;
    joinedAt: string | null;
    lastActiveAt: string | null;
    conversations7d: number;
    documents7d: number;
    storageBytes: number;
  }>;
  charts?: {
    newUsersPerDay?: Array<{ day: string; value: number }>;
    active?: Array<{ day: string; dau: number; wau: number; mau: number }>;
  };
};

type RawUserInput = {
  id?: string;
  userId?: string;
  email?: string;
  tier?: string;
  plan?: string;
  joinedAt?: string | Date;
  createdAt?: string | Date;
  lastActiveAt?: string | Date;
  conversations7d?: number;
  conversationCount?: number;
  documents7d?: number;
  documentCount?: number;
  storageBytes?: number;
  storageUsed?: number;
};

type RawUsersInput = {
  total?: number;
  users?: RawUserInput[];
  charts?: {
    newUsersPerDay?: Array<{ day?: string | Date; value?: number; count?: number }>;
    active?: Array<{
      day?: string | Date;
      dau?: number;
      wau?: number;
      mau?: number;
    }>;
  };
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

function toIsoStringOrNull(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeUser(raw: unknown): UsersSerialized['users'][0] {
  const input = (raw ?? {}) as RawUserInput;

  const userId = typeof input.userId === 'string' ? input.userId : typeof input.id === 'string' ? input.id : '';
  const email = typeof input.email === 'string' && input.email.includes('@') ? input.email : null;

  return {
    userId,
    emailMasked: email ? maskEmail(email) : null,
    emailHash: email ? hashValue(email.toLowerCase()) : null,
    tier: toStringOrNull(input.tier) ?? toStringOrNull(input.plan),
    joinedAt: toIsoStringOrNull(input.joinedAt) ?? toIsoStringOrNull(input.createdAt),
    lastActiveAt: toIsoStringOrNull(input.lastActiveAt),
    conversations7d: toNumber(input.conversations7d, toNumber(input.conversationCount, 0)),
    documents7d: toNumber(input.documents7d, toNumber(input.documentCount, 0)),
    storageBytes: toNumber(input.storageBytes, toNumber(input.storageUsed, 0)),
  };
}

export function serializeUsers(raw: unknown): UsersSerialized {
  const input = (raw ?? {}) as RawUsersInput;
  const rawUsers = input.users ?? [];
  const charts = input.charts;

  const serializedUsers = rawUsers.map((u) => serializeUser(u));

  const result: UsersSerialized = {
    v: 1,
    total: toNumber(input.total, serializedUsers.length),
    users: serializedUsers,
  };

  if (charts) {
    result.charts = {};

    if (charts.newUsersPerDay) {
      result.charts.newUsersPerDay = charts.newUsersPerDay.map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value ?? item?.count, 0),
      }));
    }

    if (charts.active) {
      result.charts.active = charts.active.map((item) => ({
        day: toDayString(item?.day),
        dau: toNumber(item?.dau, 0),
        wau: toNumber(item?.wau, 0),
        mau: toNumber(item?.mau, 0),
      }));
    }
  }

  return result;
}
