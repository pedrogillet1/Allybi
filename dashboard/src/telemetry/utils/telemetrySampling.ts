/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TelemetryEvent } from "../types";

/**
 * telemetrySampling.ts (Koda)
 * ---------------------------
 * Sampling rules to keep telemetry volume manageable at scale.
 *
 * Strategy:
 *  - Always keep WARN/ERROR/FATAL
 *  - Sample DEBUG aggressively
 *  - Sample noisy categories/events (e.g. stream chunk-like events) if you add them later
 */

export interface SamplingConfig {
  defaultRate: number; // 0..1
  debugRate: number;   // 0..1
  perCategory?: Partial<Record<string, number>>; // category -> rate
  perEvent?: Partial<Record<string, number>>;    // event name -> rate
  alwaysKeepSeverities?: string[];               // default ["warn","error","fatal"]
}

const DEFAULT: SamplingConfig = {
  defaultRate: 1,
  debugRate: 0.2,
  perCategory: {},
  perEvent: {},
  alwaysKeepSeverities: ["warn", "error", "fatal"],
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

export function shouldSample(event: TelemetryEvent, cfg?: Partial<SamplingConfig>): boolean {
  const c = { ...DEFAULT, ...(cfg || {}) };
  const sev = String(event.severity || "info").toLowerCase();

  // Always keep important severities
  if ((c.alwaysKeepSeverities || []).includes(sev)) return true;

  // Per-event override
  const byEvent = c.perEvent?.[String(event.name || "")];
  if (typeof byEvent === "number") return Math.random() <= clamp01(byEvent);

  // Per-category override
  const byCat = c.perCategory?.[String(event.category || "")];
  if (typeof byCat === "number") return Math.random() <= clamp01(byCat);

  // DEBUG default
  if (sev === "debug") return Math.random() <= clamp01(c.debugRate);

  // Everything else
  return Math.random() <= clamp01(c.defaultRate);
}

export default { shouldSample };
