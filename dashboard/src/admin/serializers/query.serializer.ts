// file: src/admin/serializers/query.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type QueriesSerialized = {
  v: 1;
  kpis: {
    queries: number;
    avgTopScore: number | null;
    weakEvidenceCount: number;
    weakEvidenceRate: number;
  };
  charts?: {
    byDomain?: Array<{
      day: string;
      finance: number;
      legal: number;
      medical: number;
      general: number;
      other: number;
    }>;
    fallbackRateByDomain?: Array<{ domain: string; value: number }>;
    avgScoreByDomain?: Array<{ domain: string; value: number | null }>;
  };
  feed: Array<{
    ts: string;
    userId: string | null;
    userEmailMasked: string | null;
    queryHash: string | null;
    queryLength: number | null;
    language: string | null;
    intent: string | null;
    domain: string | null;
    keywords: string[];
    result: string | null;
    score: number | null;
    fallbackUsed: boolean;
    docScopeApplied: boolean;
    chunksUsed: number | null;
  }>;
  total: number;
};

type RawQueryInput = {
  ts?: string | Date;
  createdAt?: string | Date;
  timestamp?: string | Date;
  userId?: string;
  userEmail?: string;
  email?: string;
  query?: string;
  queryText?: string;
  text?: string;
  language?: string;
  lang?: string;
  intent?: string;
  domain?: string;
  category?: string;
  keywords?: string[];
  tags?: string[];
  result?: string;
  answer?: string;
  score?: number;
  topScore?: number;
  relevanceScore?: number;
  fallbackUsed?: boolean;
  usedFallback?: boolean;
  docScopeApplied?: boolean;
  hasDocScope?: boolean;
  chunksUsed?: number;
  chunkCount?: number;
};

type RawQueriesInput = {
  total?: number;
  kpis?: {
    queries?: number;
    totalQueries?: number;
    avgTopScore?: number | null;
    avgScore?: number | null;
    weakEvidenceCount?: number;
    lowScoreCount?: number;
    weakEvidenceRate?: number;
    lowScoreRate?: number;
  };
  queries?: RawQueryInput[];
  feed?: RawQueryInput[];
  charts?: {
    byDomain?: Array<{
      day?: string | Date;
      finance?: number;
      legal?: number;
      medical?: number;
      general?: number;
      other?: number;
    }>;
    fallbackRateByDomain?: Array<{
      domain?: string;
      category?: string;
      value?: number;
      rate?: number;
    }>;
    avgScoreByDomain?: Array<{
      domain?: string;
      category?: string;
      value?: number | null;
      avgScore?: number | null;
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

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  return null;
}

function toStringOrNull(val: unknown): string | null {
  if (typeof val === 'string' && val.length > 0) return val;
  return null;
}

const VALID_DOMAINS = new Set(['finance', 'legal', 'medical', 'general', 'other']);

function normalizeDomain(val: unknown): string {
  if (typeof val !== 'string') return 'other';
  const lower = val.toLowerCase().trim();
  return VALID_DOMAINS.has(lower) ? lower : 'other';
}

function normalizeResult(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const lower = val.toLowerCase().trim();
  if (lower === 'success' || lower === 'answered' || lower === 'found') return 'success';
  if (lower === 'fallback' || lower === 'partial') return 'fallback';
  if (lower === 'failed' || lower === 'error' || lower === 'not_found') return 'failed';
  if (lower === 'no_answer' || lower === 'empty') return 'no_answer';
  return val.length > 50 ? val.slice(0, 50) : val;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeQuery(raw: unknown): QueriesSerialized['feed'][0] {
  const input = (raw ?? {}) as RawQueryInput;

  const userId = toStringOrNull(input.userId);
  const email =
    typeof input.userEmail === 'string' && input.userEmail.includes('@')
      ? input.userEmail
      : typeof input.email === 'string' && input.email.includes('@')
        ? input.email
        : null;

  const queryText = input.query ?? input.queryText ?? input.text ?? null;
  const queryHash = typeof queryText === 'string' ? hashValue(queryText) : null;
  const queryLength = typeof queryText === 'string' ? queryText.length : null;

  const rawKeywords = input.keywords ?? input.tags ?? [];
  const keywords = Array.isArray(rawKeywords)
    ? rawKeywords.filter((k): k is string => typeof k === 'string').slice(0, 10)
    : [];

  return {
    ts: toIsoString(input.ts ?? input.createdAt ?? input.timestamp),
    userId,
    userEmailMasked: email ? maskEmail(email) : null,
    queryHash,
    queryLength,
    language: toStringOrNull(input.language ?? input.lang),
    intent: toStringOrNull(input.intent),
    domain: normalizeDomain(input.domain ?? input.category),
    keywords,
    result: normalizeResult(input.result ?? input.answer),
    score: toNullableNumber(input.score ?? input.topScore ?? input.relevanceScore),
    fallbackUsed: input.fallbackUsed === true || input.usedFallback === true,
    docScopeApplied: input.docScopeApplied === true || input.hasDocScope === true,
    chunksUsed: toNullableNumber(input.chunksUsed ?? input.chunkCount),
  };
}

export function serializeQueries(raw: unknown): QueriesSerialized {
  const input = (raw ?? {}) as RawQueriesInput;
  const rawQueries = input.queries ?? input.feed ?? [];
  const kpis = input.kpis ?? {};
  const charts = input.charts;

  const serializedFeed = rawQueries.map((q) => serializeQuery(q));

  const result: QueriesSerialized = {
    v: 1,
    kpis: {
      queries: toNumber(kpis.queries ?? kpis.totalQueries, serializedFeed.length),
      avgTopScore: toNullableNumber(kpis.avgTopScore ?? kpis.avgScore),
      weakEvidenceCount: toNumber(kpis.weakEvidenceCount ?? kpis.lowScoreCount, 0),
      weakEvidenceRate: toNumber(kpis.weakEvidenceRate ?? kpis.lowScoreRate, 0),
    },
    feed: serializedFeed,
    total: toNumber(input.total, serializedFeed.length),
  };

  if (charts) {
    result.charts = {};

    if (charts.byDomain) {
      result.charts.byDomain = charts.byDomain.map((item) => ({
        day: toDayString(item?.day),
        finance: toNumber(item?.finance, 0),
        legal: toNumber(item?.legal, 0),
        medical: toNumber(item?.medical, 0),
        general: toNumber(item?.general, 0),
        other: toNumber(item?.other, 0),
      }));
    }

    if (charts.fallbackRateByDomain) {
      result.charts.fallbackRateByDomain = charts.fallbackRateByDomain.map((item) => ({
        domain: normalizeDomain(item?.domain ?? item?.category),
        value: toNumber(item?.value ?? item?.rate, 0),
      }));
    }

    if (charts.avgScoreByDomain) {
      result.charts.avgScoreByDomain = charts.avgScoreByDomain.map((item) => ({
        domain: normalizeDomain(item?.domain ?? item?.category),
        value: toNullableNumber(item?.value ?? item?.avgScore),
      }));
    }
  }

  return result;
}
