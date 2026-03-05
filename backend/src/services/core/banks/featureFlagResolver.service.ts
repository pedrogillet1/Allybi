import type { EnvName } from "../../llm/types/llm.types";

export type FeatureFlagEnv = "production" | "staging" | "dev" | "local";

type FeatureFlagEntry = {
  id?: unknown;
  key?: unknown;
  enabled?: unknown;
  defaultByEnv?: unknown;
};

type FeatureFlagsBank = {
  config?: {
    enabled?: unknown;
    runtimeOverrides?: {
      enabled?: unknown;
      allowList?: unknown;
    };
  };
  flags?: unknown;
};

function clean(value: unknown): string {
  return String(value || "").trim();
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => clean(v)).filter(Boolean);
}

function toEntries(value: unknown): FeatureFlagEntry[] {
  if (!Array.isArray(value)) return [];
  return value as FeatureFlagEntry[];
}

export function resolveFeatureFlagEnvName(
  value?: EnvName | string | null,
): FeatureFlagEnv {
  const env = clean(value || process.env.NODE_ENV).toLowerCase();
  if (env === "production" || env === "prod") return "production";
  if (env === "staging" || env === "stage") return "staging";
  if (env === "dev" || env === "development" || env === "test") return "dev";
  return "local";
}

function matchFlagId(row: FeatureFlagEntry, flagId: string): boolean {
  const id = clean(row?.id);
  const key = clean(row?.key);
  return id === flagId || key === flagId;
}

function baseEnabledForEnv(
  row: FeatureFlagEntry,
  env: FeatureFlagEnv,
  fallback: boolean,
): boolean {
  if (typeof row?.enabled === "boolean") return row.enabled;

  const perEnv =
    row?.defaultByEnv && typeof row.defaultByEnv === "object"
      ? (row.defaultByEnv as Record<string, unknown>)
      : null;
  if (perEnv) {
    if (Object.prototype.hasOwnProperty.call(perEnv, env)) {
      return asBool(perEnv[env], fallback);
    }
  }

  return fallback;
}

export function findFeatureFlagEntry(
  bank: FeatureFlagsBank | null | undefined,
  flagId: string,
): FeatureFlagEntry | null {
  const entries = toEntries(bank?.flags);
  return entries.find((row) => matchFlagId(row, flagId)) ?? null;
}

export function resolveFeatureFlagBoolean(input: {
  bank: FeatureFlagsBank | null | undefined;
  flagId: string;
  env?: EnvName | string | null;
  runtimeOverrides?: Record<string, unknown> | null;
  fallback?: boolean;
}): boolean {
  const bank = input.bank;
  if (bank?.config?.enabled === false) return false;

  const env = resolveFeatureFlagEnvName(input.env);
  const fallback = asBool(input.fallback, false);
  const flagId = clean(input.flagId);
  if (!flagId) return fallback;

  const row = findFeatureFlagEntry(bank, flagId);
  if (!row) return fallback;

  let enabled = baseEnabledForEnv(row, env, fallback);

  const runtimeCfg = bank?.config?.runtimeOverrides;
  const overridesEnabled = asBool(runtimeCfg?.enabled, false);
  if (!overridesEnabled) return enabled;

  const allowList = asStringArray(runtimeCfg?.allowList);
  if (allowList.length > 0 && !allowList.includes(flagId)) return enabled;

  const overrides = input.runtimeOverrides || null;
  if (!overrides) return enabled;
  if (!Object.prototype.hasOwnProperty.call(overrides, flagId)) return enabled;

  enabled = asBool(overrides[flagId], enabled);
  return enabled;
}

