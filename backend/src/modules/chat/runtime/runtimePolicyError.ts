export type RuntimePolicyErrorCode =
  | "RUNTIME_POLICY_MISSING"
  | "RUNTIME_POLICY_INVALID";

export class RuntimePolicyError extends Error {
  readonly code: RuntimePolicyErrorCode;

  constructor(code: RuntimePolicyErrorCode, message: string) {
    super(message);
    this.name = "RuntimePolicyError";
    this.code = code;
  }
}

export function isRuntimePolicyError(
  error: unknown,
): error is RuntimePolicyError {
  if (!error || typeof error !== "object") return false;
  const anyErr = error as any;
  return (
    anyErr?.name === "RuntimePolicyError" ||
    anyErr?.code === "RUNTIME_POLICY_MISSING" ||
    anyErr?.code === "RUNTIME_POLICY_INVALID"
  );
}

export function toRuntimePolicyErrorCode(
  error: unknown,
): RuntimePolicyErrorCode {
  if (isRuntimePolicyError(error)) return error.code;
  const message = String((error as any)?.message || "");
  if (
    message.includes("memory_policy.config.runtimeTuning") ||
    message.includes("Required bank missing: memory_policy")
  ) {
    return "RUNTIME_POLICY_INVALID";
  }
  return "RUNTIME_POLICY_INVALID";
}
