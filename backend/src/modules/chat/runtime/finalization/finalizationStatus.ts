import type {
  ChatResult,
  ChatResultStatus,
  ChatWarningState,
} from "../../domain/chat.contracts";
import { normalizeRuntimeFailureCode } from "../runtimePolicyError";
import type { ChatOutputContract } from "../turnExecutionDraft";

const PARTIAL_FAILURE_CODES = new Set([
  "MISSING_SOURCES",
  "MISSING_PROVENANCE",
  "OUT_OF_SCOPE",
  "OUT_OF_SCOPE_SOURCES",
  "OUT_OF_SCOPE_PROVENANCE",
  "TRUNCATED_OUTPUT",
  "QUALITY_GATE_BLOCKED",
  "RESPONSE_CONTRACT_VIOLATION",
]);

export function makeWarning(
  code: string,
  source: ChatWarningState["source"],
): ChatWarningState {
  return {
    code,
    message: code,
    severity: "warning",
    source,
  };
}

export function hasAnsweredOutput(
  result: ChatResult,
  contract: ChatOutputContract,
): boolean {
  if (contract === "NAVIGATION_PAYLOAD") {
    return (
      (Array.isArray(result.listing) && result.listing.length > 0) ||
      (Array.isArray(result.breadcrumb) && result.breadcrumb.length > 0) ||
      (Array.isArray(result.attachmentsPayload) &&
        result.attachmentsPayload.length > 0)
    );
  }
  if (contract === "FILE_ACTIONS") {
    return Boolean(result.attachmentsPayload);
  }
  return Boolean(result.completion?.answered);
}

export function resolveFailureCode(result: ChatResult): string | null {
  const failureCode = String(result.failureCode || "").trim();
  if (failureCode) return failureCode;
  if (result.truncation?.occurred) return "TRUNCATED_OUTPUT";
  if (result.evidence?.required && !result.evidence?.provided) {
    return "MISSING_SOURCES";
  }
  if (!result.completion?.answered) return "EMPTY_OUTPUT";
  return null;
}

export function resolveStatus(result: ChatResult): ChatResultStatus {
  const failureCode = resolveFailureCode(result);
  const rawCode = String(failureCode || "").trim().toUpperCase();
  const normalizedCode = normalizeRuntimeFailureCode(rawCode);
  if (result.status === "blocked" || normalizedCode === "POLICY_BLOCKED") {
    return "blocked";
  }
  if (result.status === "clarification_required") {
    return "clarification_required";
  }
  if (
    result.completion?.nextActionCode &&
    (rawCode === "MISSING_SOURCES" ||
      rawCode === "OUT_OF_SCOPE_SOURCES" ||
      rawCode === "MISSING_PROVENANCE" ||
      rawCode === "OUT_OF_SCOPE_PROVENANCE")
  ) {
    return "clarification_required";
  }
  if (
    PARTIAL_FAILURE_CODES.has(rawCode) ||
    (normalizedCode && PARTIAL_FAILURE_CODES.has(normalizedCode))
  ) {
    return "partial";
  }
  if (!result.completion?.answered) return "failed";
  return "success";
}
