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
  // Governance hardening policy: fail-closed is mandatory in every environment.
  return {
    failClosed: true,
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
  return {
    enforceQualityGates: true,
    failClosed: true,
    runtimeEnv: failClosed.runtimeEnv,
    protectedEnv: failClosed.protectedEnv,
    strictCertProfile: failClosed.strictCertProfile,
    reasonCode: "strict_fail_closed",
  };
}
