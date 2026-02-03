// file: src/admin/serializers/llm.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LlmCostSerialized = {
  v: 1;
  kpis: {
    costUsd: number;
    totalTokens: number;
    totalCalls: number;
    avgLatencyMs: number | null;
    errorRate: number;
    recentErrors: number;
  };
  charts?: {
    costPerDay?: Array<{ day: string; valueUsd: number }>;
    tokensPerDay?: Array<{ day: string; value: number }>;
    costByModel?: Array<{ label: string; valueUsd: number }>;
  };
  calls: Array<{
    ts: string;
    provider: string;
    model: string;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    latencyMs: number | null;
    status: string;
  }>;
  total: number;
};

type RawLlmCallInput = {
  ts?: string | Date;
  createdAt?: string | Date;
  timestamp?: string | Date;
  provider?: string;
  vendor?: string;
  model?: string;
  modelId?: string;
  inputTokens?: number;
  promptTokens?: number;
  outputTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  cost?: number;
  latencyMs?: number;
  latency?: number;
  durationMs?: number;
  status?: string;
  result?: string;
  error?: boolean;
  success?: boolean;
};

type RawLlmInput = {
  total?: number;
  kpis?: {
    costUsd?: number;
    totalCost?: number;
    totalTokens?: number;
    tokens?: number;
    totalCalls?: number;
    calls?: number;
    avgLatencyMs?: number | null;
    avgLatency?: number | null;
    errorRate?: number;
    failureRate?: number;
    recentErrors?: number;
    errorCount?: number;
  };
  calls?: RawLlmCallInput[];
  logs?: RawLlmCallInput[];
  charts?: {
    costPerDay?: Array<{ day?: string | Date; valueUsd?: number; cost?: number }>;
    tokensPerDay?: Array<{ day?: string | Date; value?: number; tokens?: number }>;
    costByModel?: Array<{
      label?: string;
      model?: string;
      valueUsd?: number;
      cost?: number;
    }>;
  };
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

function normalizeStatus(input: RawLlmCallInput): string {
  if (typeof input.status === 'string') {
    const lower = input.status.toLowerCase().trim();
    if (lower === 'success' || lower === 'ok' || lower === 'completed') return 'success';
    if (lower === 'error' || lower === 'failed' || lower === 'failure') return 'error';
    if (lower === 'timeout' || lower === 'cancelled' || lower === 'canceled') return lower;
    return input.status;
  }
  if (input.error === true) return 'error';
  if (input.success === false) return 'error';
  if (typeof input.result === 'string') {
    const lower = input.result.toLowerCase().trim();
    if (lower === 'success' || lower === 'ok') return 'success';
    if (lower === 'error' || lower === 'failed') return 'error';
    return input.result;
  }
  return 'unknown';
}

function normalizeProvider(val: unknown): string {
  if (typeof val !== 'string') return 'unknown';
  const lower = val.toLowerCase().trim();
  if (lower.includes('openai') || lower.includes('gpt')) return 'openai';
  if (lower.includes('anthropic') || lower.includes('claude')) return 'anthropic';
  if (lower.includes('google') || lower.includes('gemini') || lower.includes('palm')) return 'google';
  if (lower.includes('cohere')) return 'cohere';
  if (lower.includes('mistral')) return 'mistral';
  if (lower.includes('azure')) return 'azure';
  return val;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeLlmCall(raw: unknown): LlmCostSerialized['calls'][0] {
  const input = (raw ?? {}) as RawLlmCallInput;

  return {
    ts: toIsoString(input.ts ?? input.createdAt ?? input.timestamp),
    provider: normalizeProvider(input.provider ?? input.vendor),
    model: typeof input.model === 'string' ? input.model : typeof input.modelId === 'string' ? input.modelId : 'unknown',
    inputTokens: toNullableNumber(input.inputTokens ?? input.promptTokens),
    outputTokens: toNullableNumber(input.outputTokens ?? input.completionTokens),
    costUsd: toNullableNumber(input.costUsd ?? input.cost),
    latencyMs: toNullableNumber(input.latencyMs ?? input.latency ?? input.durationMs),
    status: normalizeStatus(input),
  };
}

export function serializeLlmCost(raw: unknown): LlmCostSerialized {
  const input = (raw ?? {}) as RawLlmInput;
  const kpis = input.kpis ?? {};
  const rawCalls = input.calls ?? input.logs ?? [];
  const charts = input.charts;

  const serializedCalls = rawCalls.map((c) => serializeLlmCall(c));

  const result: LlmCostSerialized = {
    v: 1,
    kpis: {
      costUsd: toNumber(kpis.costUsd ?? kpis.totalCost, 0),
      totalTokens: toNumber(kpis.totalTokens ?? kpis.tokens, 0),
      totalCalls: toNumber(kpis.totalCalls ?? kpis.calls, serializedCalls.length),
      avgLatencyMs: toNullableNumber(kpis.avgLatencyMs ?? kpis.avgLatency),
      errorRate: toNumber(kpis.errorRate ?? kpis.failureRate, 0),
      recentErrors: toNumber(kpis.recentErrors ?? kpis.errorCount, 0),
    },
    calls: serializedCalls,
    total: toNumber(input.total, serializedCalls.length),
  };

  if (charts) {
    result.charts = {};

    if (charts.costPerDay) {
      result.charts.costPerDay = charts.costPerDay.map((item) => ({
        day: toDayString(item?.day),
        valueUsd: toNumber(item?.valueUsd ?? item?.cost, 0),
      }));
    }

    if (charts.tokensPerDay) {
      result.charts.tokensPerDay = charts.tokensPerDay.map((item) => ({
        day: toDayString(item?.day),
        value: toNumber(item?.value ?? item?.tokens, 0),
      }));
    }

    if (charts.costByModel) {
      result.charts.costByModel = charts.costByModel.map((item) => ({
        label: typeof item?.label === 'string' ? item.label : typeof item?.model === 'string' ? item.model : 'unknown',
        valueUsd: toNumber(item?.valueUsd ?? item?.cost, 0),
      }));
    }
  }

  return result;
}
