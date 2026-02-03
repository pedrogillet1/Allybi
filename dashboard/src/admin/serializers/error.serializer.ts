// file: src/admin/serializers/error.serializer.ts
import { createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorsSerialized = {
  v: 1;
  errors: Array<{
    ts: string;
    service: string;
    type: string;
    severity: 'low' | 'med' | 'high';
    message: string; // sanitized short message (never stacktrace)
    resolved: boolean | null;
  }>;
};

type RawErrorInput = {
  ts?: string | Date;
  createdAt?: string | Date;
  timestamp?: string | Date;
  service?: string;
  source?: string;
  component?: string;
  type?: string;
  errorType?: string;
  code?: string;
  severity?: string;
  level?: string;
  priority?: string;
  message?: string;
  error?: string;
  description?: string;
  resolved?: boolean;
  isResolved?: boolean;
  status?: string;
};

type RawErrorsInput = {
  errors?: RawErrorInput[];
  logs?: RawErrorInput[];
  events?: RawErrorInput[];
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

function normalizeSeverity(val: unknown): 'low' | 'med' | 'high' {
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === 'low' || lower === 'info' || lower === 'debug') return 'low';
    if (lower === 'med' || lower === 'medium' || lower === 'warn' || lower === 'warning') return 'med';
    if (lower === 'high' || lower === 'error' || lower === 'critical' || lower === 'fatal') return 'high';
  }
  return 'low';
}

function sanitizeMessage(val: unknown): string {
  if (typeof val !== 'string') return '';

  let msg = val
    // Remove newlines
    .replace(/\r?\n/g, ' ')
    // Remove Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, '[REDACTED]')
    // Remove long base64-like strings (potential tokens/secrets)
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[REDACTED]')
    // Remove potential API keys (common patterns)
    .replace(/sk-[A-Za-z0-9]{20,}/gi, '[REDACTED]')
    .replace(/pk-[A-Za-z0-9]{20,}/gi, '[REDACTED]')
    .replace(/api[_-]?key[=:]\s*["']?[A-Za-z0-9\-_]+["']?/gi, 'api_key=[REDACTED]')
    // Remove potential passwords
    .replace(/password[=:]\s*["']?[^"'\s]+["']?/gi, 'password=[REDACTED]')
    // Remove potential email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    // Remove potential IP addresses
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]')
    // Remove file paths that might contain sensitive info
    .replace(/\/[^\s]*\/[^\s]*(password|secret|key|token|credential)[^\s]*/gi, '[PATH_REDACTED]')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate to 240 chars
  if (msg.length > 240) {
    msg = msg.slice(0, 237) + '...';
  }

  return msg;
}

function normalizeType(val: unknown): string {
  if (typeof val === 'string' && val.length > 0) {
    // Remove stack trace-like patterns
    const cleaned = val
      .replace(/at\s+[^\s]+\s+\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length > 50 ? cleaned.slice(0, 50) : cleaned || 'unknown';
  }
  return 'unknown';
}

function normalizeResolved(input: RawErrorInput): boolean | null {
  if (typeof input.resolved === 'boolean') return input.resolved;
  if (typeof input.isResolved === 'boolean') return input.isResolved;
  if (typeof input.status === 'string') {
    const lower = input.status.toLowerCase();
    if (lower === 'resolved' || lower === 'closed' || lower === 'fixed') return true;
    if (lower === 'open' || lower === 'active' || lower === 'unresolved') return false;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export function serializeError(raw: unknown): ErrorsSerialized['errors'][0] {
  const input = (raw ?? {}) as RawErrorInput;

  const service =
    typeof input.service === 'string'
      ? input.service
      : typeof input.source === 'string'
        ? input.source
        : typeof input.component === 'string'
          ? input.component
          : 'unknown';

  const type = normalizeType(input.type ?? input.errorType ?? input.code);

  const message = sanitizeMessage(input.message ?? input.error ?? input.description);

  return {
    ts: toIsoString(input.ts ?? input.createdAt ?? input.timestamp),
    service,
    type,
    severity: normalizeSeverity(input.severity ?? input.level ?? input.priority),
    message,
    resolved: normalizeResolved(input),
  };
}

export function serializeErrors(raw: unknown): ErrorsSerialized {
  const input = (raw ?? {}) as RawErrorsInput;
  const rawErrors = input.errors ?? input.logs ?? input.events ?? [];

  return {
    v: 1,
    errors: rawErrors.map((e) => serializeError(e)),
  };
}
