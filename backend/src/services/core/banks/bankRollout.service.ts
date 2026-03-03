import { getOptionalBank } from "./bankLoader.service";

interface FeatureFlagEntry {
  key?: unknown;
  enabled?: unknown;
  rolloutPercent?: unknown;
  audience?: unknown;
}

interface FeatureFlagsBank {
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

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const raw = clean(value).toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
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
    const flags = toFlagEntries(flagsBank?.flags);
    const match = flags.find((row) => clean(row?.key) === flagKey);
    if (!match) return false;
    if (!asBool(match.enabled, false)) return false;

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

