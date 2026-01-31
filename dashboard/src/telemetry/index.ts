/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Telemetry (Koda)
 * ----------------
 * initTelemetry() wires sinks and defaults.
 * emit() is the single entry point used across the codebase.
 *
 * This module is intentionally small:
 *  - build event envelope
 *  - sanitize payload (optional)
 *  - fan-out to sinks
 */

import crypto from "crypto";
import type {
  TelemetryCategory,
  TelemetryEnv,
  TelemetryEvent,
  TelemetryEmitInput,
  TelemetryEventName,
  TelemetrySeverity,
} from "./types";

// Sinks (you can add redis.sink.ts later)
import { createNoopSink, type TelemetrySink } from "./sinks/noop.sink";
import { createConsoleSink } from "./sinks/console.sink";
import { createPostgresSink } from "./sinks/postgres.sink";

export interface TelemetryInitOptions {
  env: TelemetryEnv;
  sinks?: {
    postgres?: {
      enabled: boolean;
      // Prisma client is injected to avoid import cycles
      prisma: any;
    };
    console?: {
      enabled: boolean;
    };
  };
  defaultContext?: {
    service?: string; // e.g. "api"
    version?: string; // optional app version
  };
  /**
   * In production, you typically redact stack traces and large payloads in sinks.
   * Keep this here for simple global control.
   */
  redaction?: {
    allowStacksInProd?: boolean;
    maxStringLen?: number; // default 4000
  };
}

let _env: TelemetryEnv = (process.env.NODE_ENV as TelemetryEnv) || "dev";
let _sinks: TelemetrySink[] = [createNoopSink()];
let _defaultContext: Record<string, any> = {};
let _redaction = { allowStacksInProd: false, maxStringLen: 4000 };

export function initTelemetry(opts: TelemetryInitOptions) {
  _env = opts.env;
  _defaultContext = opts.defaultContext || {};
  _redaction = { ..._redaction, ...(opts.redaction || {}) };

  const sinks: TelemetrySink[] = [];

  if (opts.sinks?.console?.enabled) sinks.push(createConsoleSink());
  if (opts.sinks?.postgres?.enabled) sinks.push(createPostgresSink(opts.sinks.postgres.prisma));

  _sinks = sinks.length ? sinks : [createNoopSink()];
}

/**
 * Emit an event to all configured sinks.
 */
export async function emit<TName extends TelemetryEventName, TPayload = any>(
  name: TName,
  input: Omit<TelemetryEmitInput<TName, TPayload>, "category" | "severity"> & {
    category: TelemetryCategory;
    severity: TelemetrySeverity;
  }
): Promise<TelemetryEvent<TName, TPayload>> {
  const event: TelemetryEvent<TName, TPayload> = {
    id: crypto.randomUUID(),
    name,
    category: input.category,
    severity: input.severity,
    ts: new Date().toISOString(),
    env: _env,

    correlationId: input.correlationId,
    requestId: input.requestId,
    sessionId: input.sessionId,

    userId: input.userId,
    ip: input.ip,
    userAgent: input.userAgent,

    conversationId: input.conversationId,
    messageId: input.messageId,
    documentId: input.documentId,
    folderId: input.folderId,

    payload: sanitizePayload(input.payload, _redaction),
  };

  // Attach default context (service/version) into payload meta if not present
  if (_defaultContext && Object.keys(_defaultContext).length) {
    (event.payload as any) = {
      ...((event.payload as any) || {}),
      _ctx: { ..._defaultContext, ...((event.payload as any)?._ctx || {}) },
    };
  }

  // Fan out to sinks (best-effort)
  await Promise.all(
    _sinks.map(async (sink) => {
      try {
        await sink.write(event);
      } catch {
        // Telemetry should never crash the main request path
      }
    })
  );

  return event;
}

function sanitizePayload(payload: any, cfg: { allowStacksInProd: boolean; maxStringLen: number }) {
  if (payload == null) return payload;

  const max = cfg.maxStringLen ?? 4000;

  const walk = (obj: any): any => {
    if (obj == null) return obj;
    if (typeof obj === "string") {
      return obj.length > max ? obj.slice(0, max - 1) + "…" : obj;
    }
    if (Array.isArray(obj)) return obj.map(walk);
    if (typeof obj !== "object") return obj;

    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      // Simple secret redaction by key name
      const key = k.toLowerCase();
      if (key.includes("password") || key.includes("token") || key.includes("secret") || key.includes("key")) {
        out[k] = "[redacted]";
        continue;
      }
      if (key.includes("stack") && _env === "production" && !cfg.allowStacksInProd) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = walk(v);
    }
    return out;
  };

  return walk(payload);
}

export default { initTelemetry, emit };
