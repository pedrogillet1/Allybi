import { getOptionalBank } from "./bankLoader.service";
import {
  resolveFeatureFlagBoolean,
  resolveFeatureFlagEnvName,
} from "./featureFlagResolver.service";
import {
  assessCanaryHealth,
  type CanaryAssessment,
  type CanaryHealthSnapshot,
  type CanaryHealthThresholds,
} from "./canaryHealthCheck.service";

interface FeatureFlagEntry {
  id?: unknown;
  key?: unknown;
  rolloutPercent?: unknown;
  audience?: unknown;
  riskLevel?: unknown;
  rollout?: {
    requiresCanary?: unknown;
    maxPercentByEnv?: Record<string, unknown>;
  };
}

interface FeatureFlagsBank {
  config?: {
    enabled?: unknown;
    runtimeOverrides?: {
      enabled?: unknown;
      allowList?: unknown;
    };
    rolloutSafety?: {
      enabled?: unknown;
      thresholds?: Partial<CanaryHealthThresholds>;
    };
  };
  flags?: unknown;
}

export interface BankRolloutContext {
  workspaceId?: string | null;
  userId?: string | null;
  domainId?: string | null;
  canarySnapshot?: Partial<CanaryHealthSnapshot> | null;
}

export interface BankRolloutCanaryAssessment extends CanaryAssessment {
  policyEnabled: boolean;
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

function normalizePercent(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(100, asNumber(value, fallback)));
}

function parseBooleanEnvFlag(value: unknown): boolean | null {
  const raw = clean(value).toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return null;
}

function resolvePolicyRolloutCap(
  entry: FeatureFlagEntry,
  envName: string,
): number | null {
  const caps = entry?.rollout?.maxPercentByEnv;
  if (!caps || typeof caps !== "object") return null;
  const cap = (caps as Record<string, unknown>)[envName];
  const normalized = asNumber(cap, NaN);
  if (!Number.isFinite(normalized)) return null;
  return normalizePercent(normalized, 100);
}

function parseEnvCanarySnapshot(): Partial<CanaryHealthSnapshot> | null {
  const raw = {
    sampleSize: process.env.BANK_ROLLOUT_CANARY_SAMPLE_SIZE,
    errorRate: process.env.BANK_ROLLOUT_CANARY_ERROR_RATE,
    p95LatencyMs: process.env.BANK_ROLLOUT_CANARY_P95_LATENCY_MS,
    weakEvidenceRate: process.env.BANK_ROLLOUT_CANARY_WEAK_EVIDENCE_RATE,
  };
  const hasAny = Object.values(raw).some((value) => clean(value).length > 0);
  if (!hasAny) return null;
  return {
    sampleSize: asNumber(raw.sampleSize, 0),
    errorRate: asNumber(raw.errorRate, 0),
    p95LatencyMs: asNumber(raw.p95LatencyMs, 0),
    weakEvidenceRate: asNumber(raw.weakEvidenceRate, 0),
  };
}

function shouldEnforceCanaryForFlag(entry: FeatureFlagEntry): boolean {
  const requiresCanary = entry?.rollout?.requiresCanary === true;
  const riskLevel = clean(entry?.riskLevel).toLowerCase();
  return requiresCanary || riskLevel === "high";
}

function shouldEnforceCanaryPolicy(envName: string): boolean {
  const override = parseBooleanEnvFlag(process.env.BANK_ROLLOUT_ENFORCE_CANARY);
  if (override != null) return override;
  return envName === "production";
}

export class BankRolloutService {
  isEnabled(flagKey: string, ctx: BankRolloutContext): boolean {
    const envName = resolveFeatureFlagEnvName(process.env.NODE_ENV);
    const flagsBank = getOptionalBank<FeatureFlagsBank>("feature_flags");
    const enabled = resolveFeatureFlagBoolean({
      bank: flagsBank,
      flagId: flagKey,
      env: envName,
      fallback: false,
    });
    if (!enabled) return false;

    const flags = toFlagEntries(flagsBank?.flags);
    const match =
      flags.find((row) => clean(row?.key) === flagKey) ||
      flags.find((row) => clean(row?.id) === flagKey);
    if (!match) return true;

    const enforceCanary = shouldEnforceCanaryPolicy(envName);
    if (enforceCanary && shouldEnforceCanaryForFlag(match)) {
      const snapshot = ctx.canarySnapshot ?? parseEnvCanarySnapshot();
      const assessment = this.evaluateCanaryHealth(snapshot);
      if (
        assessment.policyEnabled &&
        assessment.recommendation !== "continue"
      ) {
        return false;
      }
    }

    let rolloutPercent = normalizePercent(match.rolloutPercent, 100);
    const enforcePolicy = process.env.BANK_ROLLOUT_ENFORCE_POLICY === "true";
    if (enforcePolicy) {
      const policyCap = resolvePolicyRolloutCap(match, envName);
      if (policyCap != null) rolloutPercent = Math.min(rolloutPercent, policyCap);
    }
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

  evaluateCanaryHealth(
    snapshot: Partial<CanaryHealthSnapshot> | null | undefined,
  ): BankRolloutCanaryAssessment {
    const flagsBank = getOptionalBank<FeatureFlagsBank>("feature_flags");
    const rolloutSafety = flagsBank?.config?.rolloutSafety;
    const policyEnabled = rolloutSafety?.enabled !== false;
    const assessment = assessCanaryHealth(snapshot, rolloutSafety?.thresholds);
    if (!policyEnabled) {
      return {
        ...assessment,
        policyEnabled: false,
        recommendation: "continue",
        violations: [],
      };
    }
    return {
      ...assessment,
      policyEnabled: true,
    };
  }
}

let singleton: BankRolloutService | null = null;

export function getBankRolloutInstance(): BankRolloutService {
  if (!singleton) singleton = new BankRolloutService();
  return singleton;
}

