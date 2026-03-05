import { getOptionalBank } from "./bankLoader.service";
import {
  resolveFeatureFlagBoolean,
  resolveFeatureFlagEnvName,
} from "./featureFlagResolver.service";

interface FeatureFlagEntry {
  id?: unknown;
  key?: unknown;
  rolloutPercent?: unknown;
  audience?: unknown;
}

interface FeatureFlagsBank {
  config?: {
    enabled?: unknown;
    runtimeOverrides?: {
      enabled?: unknown;
      allowList?: unknown;
    };
  };
  flags?: unknown;
}

export interface BankRolloutContext {
  workspaceId?: string | null;
  userId?: string | null;
  domainId?: string | null;
}

function clean(value: unknown): string {
  return String(value || "").trim();
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableHash(value: string): number {
  let out = 2166136261;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return Math.abs(out >>> 0);
}

function toFlagEntries(value: unknown): FeatureFlagEntry[] {
  if (!Array.isArray(value)) return [];
  return value as FeatureFlagEntry[];
}

export class BankRolloutService {
  isEnabled(flagKey: string, ctx: BankRolloutContext): boolean {
    const flagsBank = getOptionalBank<FeatureFlagsBank>("feature_flags");
    const enabled = resolveFeatureFlagBoolean({
      bank: flagsBank,
      flagId: flagKey,
      env: resolveFeatureFlagEnvName(process.env.NODE_ENV),
      fallback: false,
    });
    if (!enabled) return false;

    const flags = toFlagEntries(flagsBank?.flags);
    const match =
      flags.find((row) => clean(row?.key) === flagKey) ||
      flags.find((row) => clean(row?.id) === flagKey);
    if (!match) return true;

    const rolloutPercent = Math.max(
      0,
      Math.min(100, asNumber(match.rolloutPercent, 100)),
    );
    if (rolloutPercent >= 100) return true;

    const audience = clean(match.audience).toLowerCase();
    const workspaceId = clean(ctx.workspaceId);
    const userId = clean(ctx.userId);
    const domainId = clean(ctx.domainId);

    const seed =
      audience === "workspace" && workspaceId
        ? workspaceId
        : audience === "domain" && domainId
          ? domainId
          : userId || workspaceId || domainId || "global";

    const bucket = stableHash(`${flagKey}:${seed}`) % 100;
    return bucket < rolloutPercent;
  }
}

let singleton: BankRolloutService | null = null;

export function getBankRolloutInstance(): BankRolloutService {
  if (!singleton) singleton = new BankRolloutService();
  return singleton;
}

