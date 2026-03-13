import { resolvePolicyBank } from "./policyBankResolver.service";

type LoggingPolicyBank = {
  config?: {
    enabled?: boolean;
    strict?: boolean;
    failClosedInProd?: boolean;
    redactKeys?: unknown;
    runtimePathsNoRawConsole?: unknown;
  };
};

export type LoggingPolicyConfig = {
  enabled: boolean;
  strict: boolean;
  failClosedInProd: boolean;
  redactKeys: string[];
  runtimePathsNoRawConsole: string[];
};

const DEFAULT_REDACT_KEYS = [
  "password",
  "token",
  "authorization",
  "apikey",
  "secret",
  "ssn",
  "creditcard",
];

const DEFAULT_RUNTIME_PATHS_NO_RAW_CONSOLE = [
  "src/modules/chat/runtime/ChatTurnExecutor.ts",
  "src/modules/chat/runtime/ChatRuntimeOrchestrator.ts",
  "src/services/core/retrieval/evidenceGate.service.ts",
  "src/services/llm/core/llmGateway.service.ts",
];

function normalizeKey(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function sanitizeValue(
  value: unknown,
  sensitiveKeys: Set<string>,
  seen: WeakSet<object>,
): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, sensitiveKeys, seen));
  }
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(input)) {
    const normalized = normalizeKey(key);
    if (normalized && sensitiveKeys.has(normalized)) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = sanitizeValue(current, sensitiveKeys, seen);
  }
  return out;
}

export class LoggingPolicyService {
  resolveConfig(): LoggingPolicyConfig {
    const bank = resolvePolicyBank<LoggingPolicyBank>(
      "logging_policy",
      "logging_policy.any.json",
    );
    const config = bank?.config ?? {};
    const configuredRedactKeys = toStringList(config.redactKeys)
      .map(normalizeKey)
      .filter(Boolean);
    const configuredRuntimePaths = toStringList(
      config.runtimePathsNoRawConsole,
    );

    return {
      enabled: config.enabled !== false,
      strict: config.strict !== false,
      failClosedInProd: config.failClosedInProd !== false,
      redactKeys:
        configuredRedactKeys.length > 0
          ? configuredRedactKeys
          : DEFAULT_REDACT_KEYS,
      runtimePathsNoRawConsole:
        configuredRuntimePaths.length > 0
          ? configuredRuntimePaths
          : DEFAULT_RUNTIME_PATHS_NO_RAW_CONSOLE,
    };
  }

  sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    if (!context || typeof context !== "object") return {};
    const config = this.resolveConfig();
    const sensitiveKeys = new Set(config.redactKeys.map(normalizeKey));
    const sanitized = sanitizeValue(context, sensitiveKeys, new WeakSet());
    if (
      !sanitized ||
      typeof sanitized !== "object" ||
      Array.isArray(sanitized)
    ) {
      return {};
    }
    return sanitized as Record<string, unknown>;
  }
}
