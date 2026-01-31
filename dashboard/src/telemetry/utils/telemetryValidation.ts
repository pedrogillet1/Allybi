/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TelemetryEvent, TelemetrySeverity, TelemetryCategory } from "../types";

/**
 * telemetryValidation.ts (Koda)
 * -----------------------------
 * Runtime validation for telemetry events to catch mistakes early.
 *
 * This is not a full JSON-schema validator. It's a lightweight guardrail:
 *  - required envelope fields exist
 *  - payload is JSON-serializable
 *  - category/severity are valid strings
 *
 * Use in dev/local and optionally in prod with sampling.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function isSerializable(x: any): boolean {
  try {
    JSON.stringify(x);
    return true;
  } catch {
    return false;
  }
}

function isNonEmptyString(x: any) {
  return typeof x === "string" && x.trim().length > 0;
}

export function validateEvent(event: TelemetryEvent): ValidationResult {
  const errors: string[] = [];

  if (!event) errors.push("event_missing");
  if (!isNonEmptyString(event.id)) errors.push("id_missing");
  if (!isNonEmptyString(event.name)) errors.push("name_missing");
  if (!isNonEmptyString(event.ts)) errors.push("ts_missing");
  if (!isNonEmptyString(event.env)) errors.push("env_missing");

  // Category/severity must be stringy (enums are checked elsewhere)
  if (!isNonEmptyString(event.category as TelemetryCategory)) errors.push("category_missing");
  if (!isNonEmptyString(event.severity as TelemetrySeverity)) errors.push("severity_missing");

  if (!("payload" in event)) errors.push("payload_missing");
  else if (!isSerializable(event.payload)) errors.push("payload_not_serializable");

  // Optional: ensure correlationId/requestId look like strings if present
  if (event.correlationId != null && typeof event.correlationId !== "string") errors.push("correlationId_invalid");
  if (event.requestId != null && typeof event.requestId !== "string") errors.push("requestId_invalid");

  return { ok: errors.length === 0, errors };
}

export default { validateEvent };
