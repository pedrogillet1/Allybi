export type GovernanceRuntimeEnv = "production" | "staging" | "dev" | "local";

export interface GovernanceFailClosedResolutionInput {
  nodeEnv?: unknown;
  runtimeEnv?: unknown;
  certProfile?: unknown;
  strictGovernanceFlag?: unknown;
  configuredFailClosed?: boolean | null | undefined;
}

export interface GovernanceQualityGateEnforcementInput
  extends GovernanceFailClosedResolutionInput {
  qualityGatesEnforcingFlag?: unknown;
}

function normalizeString(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseBooleanString(value: unknown): boolean | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return null;
}

function isStrictCertificationProfile(profile: string): boolean {
  return (
    profile === "ci" ||
    profile === "release" ||
    profile === "retrieval_signoff" ||
    profile === "local_hard"
  );
}

export function resolveGovernanceRuntimeEnv(input?: {
  nodeEnv?: unknown;
  runtimeEnv?: unknown;
}): GovernanceRuntimeEnv {
  const raw = normalizeString(input?.runtimeEnv || input?.nodeEnv);
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  if (raw === "local") return "local";
  return "dev";
}

export function resolveGovernanceFailClosed(
  input: GovernanceFailClosedResolutionInput,
): {
  failClosed: boolean;
  runtimeEnv: GovernanceRuntimeEnv;
  protectedEnv: boolean;
  strictCertProfile: boolean;
} {
  const runtimeEnv = resolveGovernanceRuntimeEnv({
    nodeEnv: input.nodeEnv,
    runtimeEnv: input.runtimeEnv,
  });
  const strictCertProfile = isStrictCertificationProfile(
    normalizeString(input.certProfile),
  );
  const protectedEnv =
    normalizeString(input.nodeEnv) === "production" ||
    runtimeEnv === "production" ||
    runtimeEnv === "staging" ||
    strictCertProfile;
  const explicit = parseBooleanString(input.strictGovernanceFlag);

  if (explicit === true) {
    return {
      failClosed: true,
      runtimeEnv,
      protectedEnv,
      strictCertProfile,
    };
  }
  if (explicit === false) {
    return {
      failClosed: protectedEnv,
      runtimeEnv,
      protectedEnv,
      strictCertProfile,
    };
  }

  const configured =
    typeof input.configuredFailClosed === "boolean"
      ? input.configuredFailClosed
      : protectedEnv;
  return {
    failClosed: protectedEnv ? true : configured,
    runtimeEnv,
    protectedEnv,
    strictCertProfile,
  };
}

export function resolveGovernanceQualityGateEnforcement(
  input: GovernanceQualityGateEnforcementInput,
): {
  enforceQualityGates: boolean;
  failClosed: boolean;
  runtimeEnv: GovernanceRuntimeEnv;
  protectedEnv: boolean;
  strictCertProfile: boolean;
  reasonCode?: string;
} {
  const failClosed = resolveGovernanceFailClosed(input);
  if (failClosed.failClosed) {
    return {
      enforceQualityGates: true,
      failClosed: true,
      runtimeEnv: failClosed.runtimeEnv,
      protectedEnv: failClosed.protectedEnv,
      strictCertProfile: failClosed.strictCertProfile,
      reasonCode: "strict_fail_closed",
    };
  }
  const explicit = parseBooleanString(input.qualityGatesEnforcingFlag);
  const enforceQualityGates = explicit !== false;
  return {
    enforceQualityGates,
    failClosed: false,
    runtimeEnv: failClosed.runtimeEnv,
    protectedEnv: failClosed.protectedEnv,
    strictCertProfile: failClosed.strictCertProfile,
    reasonCode: enforceQualityGates
      ? "quality_gates_enforcing_enabled"
      : "quality_gates_enforcing_disabled",
  };
}
