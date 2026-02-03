// file: src/admin/serializers/overview.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OverviewSerialized = {
  v: 1;
  kpis: {
    activeUsers: number;
    messages: number;
    documents: number;
    llmCostUsd: number;
    weakEvidenceRate: number; // 0..1
    ttftAvgMs: number | null;
  };
  charts: {
    dau: Array<{ day: string; value: number }>;
    queriesByDomain: Array<{
      day: string;
      finance: number;
      legal: number;
      medical: number;
      general: number;
      other: number;
    }>;
    costPerDay: Array<{ day: string; valueUsd: number }>;
    weakEvidenceRatePerDay: Array<{ day: string; value: number }>;
  };
  recentErrors: Array<{
    ts: string;
    service: string;
    type: string;
    severity: 'low' | 'med' | 'high';
    message: string;
  }>;
};

type RawOverviewInput = {
  kpis?: {
    activeUsers?: number;
    messages?: number;
    documents?: number;
    llmCostUsd?: number;
    weakEvidenceRate?: number;
    ttftAvgMs?: number | null;
  };
  charts?: {
    dau?: Array<{ day?: string | Date; value?: number }>;
    queriesByDomain?: Array<{
      day?: string | Date;
      finance?: number;
      legal?: number;
      medical?: number;
      general?: number;
      other?: number;
    }>;
    costPerDay?: Array<{ day?: string | Date; valueUsd?: number }>;
    weakEvidenceRatePerDay?: Array<{ day?: string | Date; value?: number }>;
  };
  recentErrors?: Array<{
    ts?: string | Date;
    service?: string;
    type?: string;
    severity?: string;
    message?: string;
  }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function normalizeSeverity(val: unknown): 'low' | 'med' | 'high' {
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'low' || lower === 'med' || lower === 'high') return lower;
    if (lower === 'medium') return 'med';
    if (lower === 'critical' || lower === 'error') return 'high';
    if (lower === 'warning' || lower === 'warn') return 'med';
    if (lower === 'info') return 'low';
  }
  return 'low';
}

function sanitizeMessage(val: unknown): string {
  if (typeof val !== 'string') return '';
  let msg = val
    .replace(/\r?\n/g, ' ')
    .replace(/Bearer\s+[A-Za-z0-9\-_]+/gi, '[REDACTED]')
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[REDACTED]')
    .trim();
  if (msg.length > 240) msg = msg.slice(0, 237) + '...';
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeOverview(raw: unknown): OverviewSerialized {
  const input = (raw ?? {}) as RawOverviewInput;

  const kpis = input.kpis ?? {};
  const charts = input.charts ?? {};
  const rawErrors = input.recentErrors ?? [];

  return {
    v: 1,
    kpis: {
      activeUsers: toNumber(kpis.activeUsers, 0),
      messages: toNumber(kpis.messages, 0),
      documents: toNumber(kpis.documents, 0),
      llmCostUsd: toNumber(kpis.llmCostUsd, 0),
      weakEvidenceRate: toNumber(kpis.weakEvidenceRate, 0),
      ttftAvgMs: toNullableNumber(kpis.ttftAvgMs),
    },
    charts: {
      dau: (charts.dau ?? []).map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value, 0),
      })),
      queriesByDomain: (charts.queriesByDomain ?? []).map((item) => ({
        day: toDayString(item?.day),
        finance: toNumber(item?.finance, 0),
        legal: toNumber(item?.legal, 0),
        medical: toNumber(item?.medical, 0),
        general: toNumber(item?.general, 0),
        other: toNumber(item?.other, 0),
      })),
      costPerDay: (charts.costPerDay ?? []).map((item) => ({
        day: toDayString(item?.day),
        valueUsd: toNumber(item?.valueUsd, 0),
      })),
      weakEvidenceRatePerDay: (charts.weakEvidenceRatePerDay ?? []).map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value, 0),
      })),
    },
    recentErrors: rawErrors.map((err) => ({
      ts: toIsoString(err?.ts),
      service: typeof err?.service === 'string' ? err.service : 'unknown',
      type: typeof err?.type === 'string' ? err.type : 'unknown',
      severity: normalizeSeverity(err?.severity),
      message: sanitizeMessage(err?.message),
    })),
  };
}
