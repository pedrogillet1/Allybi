import {
  type RuntimePolicyErrorCategory,
  type RuntimePolicyErrorCode,
  isKnownRuntimePolicyCode,
  normalizeRuntimeFailureCode,
  resolveRuntimePolicyErrorCategory,
} from "./runtimeFailureCodes";

const RUNTIME_POLICY_ERROR_TAG = Symbol.for("koda.runtimePolicyError");

export class RuntimePolicyError extends Error {
  readonly code: RuntimePolicyErrorCode;
  readonly category: RuntimePolicyErrorCategory;
  readonly details: Record<string, unknown> | null;
  readonly [RUNTIME_POLICY_ERROR_TAG] = true;

  constructor(
    code: RuntimePolicyErrorCode,
    message: string,
    details?: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "RuntimePolicyError";
    this.code = code;
    this.category = resolveRuntimePolicyErrorCategory(code);
    this.details = details || null;
  }
}

export function isRuntimePolicyError(
  error: unknown,
): error is RuntimePolicyError {
  if (!(error instanceof Error)) return false;
  const tagged = error as RuntimePolicyError & {
    [RUNTIME_POLICY_ERROR_TAG]?: boolean;
  };
  return (
    tagged[RUNTIME_POLICY_ERROR_TAG] === true &&
    isKnownRuntimePolicyCode(tagged.code)
  );
}

function fromStructuredError(error: unknown): RuntimePolicyErrorCode | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  if (isKnownRuntimePolicyCode(record.code)) return record.code;
  const cause =
    record.cause && typeof record.cause === "object"
      ? (record.cause as Record<string, unknown>)
      : null;
  if (cause && isKnownRuntimePolicyCode(cause.code)) {
    return cause.code;
  }
  return null;
}

export function toRuntimePolicyErrorCode(
  error: unknown,
): RuntimePolicyErrorCode {
  if (isRuntimePolicyError(error)) return error.code;

  const structured = fromStructuredError(error);
  if (structured) return structured;
  return "CONTRACT_INVALID";
}

export { normalizeRuntimeFailureCode };
export type { RuntimePolicyErrorCategory, RuntimePolicyErrorCode };
