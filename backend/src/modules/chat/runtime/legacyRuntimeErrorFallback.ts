import {
  type RuntimePolicyErrorCode,
  normalizeRuntimeFailureCode,
} from "./runtimeFailureCodes";

function getMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return String((error as Record<string, unknown>).message || "")
    .trim()
    .toLowerCase();
}

export function resolveLegacyRuntimePolicyErrorCode(
  error: unknown,
): RuntimePolicyErrorCode {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const explicit =
    normalizeRuntimeFailureCode(record?.code) ||
    normalizeRuntimeFailureCode(
      record?.cause && typeof record.cause === "object"
        ? (record.cause as Record<string, unknown>).code
        : null,
    );
  if (explicit) return explicit;

  const message = getMessage(error);
  if (
    message.includes("memory_policy.config.runtimetuning") ||
    message.includes("required bank missing: memory_policy") ||
    message.includes("runtime policy")
  ) {
    return "RUNTIME_POLICY_INVALID";
  }
  if (message.includes("missing provenance")) {
    return "MISSING_PROVENANCE";
  }
  if (message.includes("missing source") || message.includes("missing evidence")) {
    return "MISSING_SOURCES";
  }
  if (
    message.includes("out of scope") ||
    message.includes("document lock") ||
    message.includes("wrong doc")
  ) {
    return "OUT_OF_SCOPE";
  }
  if (
    message.includes("truncat") ||
    message.includes("max token") ||
    message.includes("max output")
  ) {
    return "TRUNCATED_OUTPUT";
  }
  if (message.includes("empty output") || message.includes("empty answer")) {
    return "EMPTY_OUTPUT";
  }
  if (message.includes("policy blocked") || message.includes("refusal policy")) {
    return "POLICY_BLOCKED";
  }
  return "CONTRACT_INVALID";
}
