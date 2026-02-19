import api from './api';

const SESSION_ID_KEY = 'allybi_telemetry_session_id';
const DEDUPE_PREFIX = 'allybi_telemetry_dedupe:';
const VISIT_DEDUPE_MS = 30 * 60 * 1000;

const safeTrim = (value, max = 128) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
};

const getDeviceType = () => {
  if (typeof window === 'undefined') return 'unknown';
  const width = Number(window.innerWidth || 0);
  if (!Number.isFinite(width) || width <= 0) return 'unknown';
  return width <= 900 ? 'mobile' : 'desktop';
};

const nowMs = () => Date.now();

function getSessionStorage() {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  return window.sessionStorage;
}

function getSessionId() {
  const storage = getSessionStorage();
  if (!storage) return 'unknown';
  const existing = safeTrim(storage.getItem(SESSION_ID_KEY), 96);
  if (existing) return existing;
  const next = `allybi:${nowMs().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  try { storage.setItem(SESSION_ID_KEY, next); } catch {}
  return next;
}

function makeDedupeKey(eventType, dedupeKey) {
  const base = safeTrim(eventType, 80);
  const extra = safeTrim(dedupeKey, 120);
  return `${DEDUPE_PREFIX}${base}:${extra || 'default'}`;
}

function isWithinDedupeWindow(eventType, dedupeKey, dedupeMs) {
  if (!Number.isFinite(dedupeMs) || dedupeMs <= 0) return false;
  const storage = getSessionStorage();
  if (!storage) return false;
  const key = makeDedupeKey(eventType, dedupeKey);
  const last = Number(storage.getItem(key) || 0);
  if (!Number.isFinite(last) || last <= 0) return false;
  return nowMs() - last < dedupeMs;
}

function markDedupe(eventType, dedupeKey) {
  const storage = getSessionStorage();
  if (!storage) return;
  const key = makeDedupeKey(eventType, dedupeKey);
  try { storage.setItem(key, String(nowMs())); } catch {}
}

function baseMeta(meta = {}) {
  const extra = {};
  const entries = Object.entries(meta || {});
  for (const [rawKey, rawValue] of entries) {
    const key = safeTrim(rawKey, 64);
    if (!key) continue;
    if (key === 'surface' || key === 'source' || key === 'documentType' || key === 'sessionId') continue;
    if (typeof rawValue === 'string') {
      extra[key] = safeTrim(rawValue, 256);
      continue;
    }
    if (typeof rawValue === 'number' || typeof rawValue === 'boolean' || rawValue == null) {
      extra[key] = rawValue;
    }
  }
  return {
    version: 1,
    surface: safeTrim(meta.surface || 'chat_screen', 64),
    source: safeTrim(meta.source || 'unknown', 64),
    documentType: safeTrim(meta.documentType || '', 24) || null,
    sessionId: safeTrim(meta.sessionId || getSessionId(), 96),
    ...extra,
  };
}

export async function trackAllybiEvent(eventType, options = {}) {
  const safeEventType = safeTrim(eventType, 64);
  if (!safeEventType) return;

  const dedupeMs = Number(options.dedupeMs || 0);
  const dedupeKey = safeTrim(
    options.dedupeKey ||
      `${safeTrim(options.meta?.surface || '', 64)}:${safeTrim(options.documentId || '', 64)}:${safeTrim(options.conversationId || '', 64)}`,
    190
  );
  if (isWithinDedupeWindow(safeEventType, dedupeKey, dedupeMs)) return;

  const payload = {
    eventType: safeEventType,
    conversationId: safeTrim(options.conversationId, 128) || undefined,
    documentId: safeTrim(options.documentId, 128) || undefined,
    deviceType: getDeviceType(),
    meta: baseMeta(options.meta),
  };
  const endpoint = safeTrim(options.endpoint || '/api/telemetry/usage', 128) || '/api/telemetry/usage';

  try {
    await api.post(endpoint, payload);
    if (dedupeMs > 0) markDedupe(safeEventType, dedupeKey);
  } catch {
    // Fail-open: telemetry never blocks UX actions.
  }
}

export function trackAllybiVisit(options = {}) {
  const meta = options.meta || {};
  const dedupeKey = safeTrim(
    options.dedupeKey ||
      `${safeTrim(meta.surface || '', 64)}:${safeTrim(options.documentId || '', 64)}:${safeTrim(options.conversationId || '', 64)}`,
    190
  );
  return trackAllybiEvent('ALLYBI_VISIT_STARTED', {
    ...options,
    dedupeMs: Number(options.dedupeMs || VISIT_DEDUPE_MS),
    dedupeKey,
    meta,
  });
}

export function trackAllybiPublicVisit(options = {}) {
  const meta = options.meta || {};
  const dedupeKey = safeTrim(
    options.dedupeKey ||
      `${safeTrim(meta.surface || '', 64)}:${safeTrim(meta.path || '', 128)}:${safeTrim(meta.utmSource || '', 64)}`,
    190
  );

  return trackAllybiEvent('ALLYBI_PUBLIC_VISIT_STARTED', {
    ...options,
    endpoint: '/api/telemetry/public/visit',
    dedupeMs: Number(options.dedupeMs || VISIT_DEDUPE_MS),
    dedupeKey,
    meta,
  });
}
