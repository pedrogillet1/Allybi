import type { ChatRequest } from "../domain/chat.contracts";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function sanitizeTraceId(input: unknown): string | null {
  const candidate = String(input || "").trim();
  if (!candidate) return null;
  if (/^[A-Za-z0-9._:-]{8,64}$/.test(candidate)) return candidate;
  const normalized = candidate.replace(/[^A-Za-z0-9._:-]/g, "");
  return normalized.length >= 8 ? normalized.slice(0, 64) : null;
}

export function mkTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveRequestTraceId(req: ChatRequest): string {
  const meta = asObject(req.meta);
  return (
    sanitizeTraceId(meta.requestId) ||
    sanitizeTraceId(meta.httpRequestId) ||
    mkTraceId()
  );
}
