export const RUNTIME_POLICY_ERROR_CODES = new Set([
  "RUNTIME_POLICY_MISSING",
  "RUNTIME_POLICY_INVALID",
  "MISSING_SOURCES",
  "MISSING_PROVENANCE",
  "OUT_OF_SCOPE",
  "CONTRACT_INVALID",
  "POLICY_BLOCKED",
  "TRUNCATED_OUTPUT",
  "EMPTY_OUTPUT",
] as const);

export type RuntimePolicyErrorCode =
  | "RUNTIME_POLICY_MISSING"
  | "RUNTIME_POLICY_INVALID"
  | "MISSING_SOURCES"
  | "MISSING_PROVENANCE"
  | "OUT_OF_SCOPE"
  | "CONTRACT_INVALID"
  | "POLICY_BLOCKED"
  | "TRUNCATED_OUTPUT"
  | "EMPTY_OUTPUT";

export type RuntimePolicyErrorCategory =
  | "config"
  | "scope"
  | "contract"
  | "policy"
  | "output";

export function isKnownRuntimePolicyCode(
  value: unknown,
): value is RuntimePolicyErrorCode {
  return (
    typeof value === "string" &&
    RUNTIME_POLICY_ERROR_CODES.has(value as RuntimePolicyErrorCode)
  );
}

export function resolveRuntimePolicyErrorCategory(
  code: RuntimePolicyErrorCode,
): RuntimePolicyErrorCategory {
  if (code === "RUNTIME_POLICY_MISSING" || code === "RUNTIME_POLICY_INVALID") {
    return "config";
  }
  if (code === "MISSING_SOURCES" || code === "MISSING_PROVENANCE" || code === "OUT_OF_SCOPE") {
    return "scope";
  }
  if (code === "POLICY_BLOCKED") return "policy";
  if (code === "TRUNCATED_OUTPUT" || code === "EMPTY_OUTPUT") return "output";
  return "contract";
}

export function normalizeRuntimeFailureCode(
  value: unknown,
): RuntimePolicyErrorCode | null {
  if (!isKnownRuntimePolicyCode(value)) return null;
  return value;
}
