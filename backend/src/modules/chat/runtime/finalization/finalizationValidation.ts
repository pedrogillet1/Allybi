import type {
  ChatQualityGateFailure,
  ChatRequest,
  ChatResult,
} from "../../domain/chat.contracts";
import type { TurnStyleState } from "../chatCompose.types";
import type { ResponseContractContext } from "../../../../services/core/enforcement/responseContractEnforcer.service";
import type { TurnExecutionDraft } from "../turnExecutionDraft";
import type { QualityGateRunnerService } from "../../../../services/core/enforcement/qualityGateRunner.service";

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asString(value: unknown): string {
  return String(value || "").trim();
}

export function asTurnStyleState(value: unknown): TurnStyleState | null {
  const record = asObject(value);
  if (!record) return null;
  return {
    assistantTurnsSeen: Number.isFinite(Number(record.assistantTurnsSeen))
      ? Number(record.assistantTurnsSeen)
      : 0,
    recentLeadSignatures: Array.isArray(record.recentLeadSignatures)
      ? record.recentLeadSignatures
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : [],
    recentCloserSignatures: Array.isArray(record.recentCloserSignatures)
      ? record.recentCloserSignatures
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : [],
    lastAssistantPreview: asString(record.lastAssistantPreview) || null,
    repeatedLeadRisk: Boolean(record.repeatedLeadRisk),
    repeatedCloserRisk: Boolean(record.repeatedCloserRisk),
  };
}

export function readRequestMeta(request: ChatRequest): Record<string, unknown> {
  return asObject(request.meta) || {};
}

export function extractEnforcementRepairs(result: ChatResult): string[] {
  const telemetry = asObject(result.assistantTelemetry);
  const enforcement = asObject(telemetry?.enforcement);
  const repairs = Array.isArray(enforcement?.repairs)
    ? enforcement.repairs
    : Array.isArray(telemetry?.repairs)
      ? telemetry.repairs
      : [];
  return repairs
    .map((repair) => String(repair || "").trim())
    .filter(Boolean);
}

export function mapFailedQualityGates(
  result: Awaited<ReturnType<QualityGateRunnerService["runGates"]>>,
): ChatQualityGateFailure[] {
  return result.results
    .filter((gate) => !gate.passed)
    .map((gate) => ({
      gateName: gate.gateName,
      severity: gate.severity === "block" ? "block" : "warn",
      reason: gate.failureCode || gate.gateName,
    }));
}

export function shouldRetainSources(contract: TurnExecutionDraft["outputContract"]): boolean {
  return contract === "USER_VISIBLE_TEXT" || contract === "STREAMING_TEXT";
}

export function resolveContractShape(
  draft: TurnExecutionDraft,
): ResponseContractContext["contractShape"] | undefined {
  if (draft.outputContract === "NAVIGATION_PAYLOAD") return "button_only";
  if (draft.outputContract === "FILE_ACTIONS") return "button_only";
  const configuredShape = asObject(draft.request.meta)?.outputShape;
  if (typeof configuredShape === "string" && configuredShape.trim()) {
    return configuredShape as ResponseContractContext["contractShape"];
  }
  return undefined;
}

export function usedDocumentContext(draft: TurnExecutionDraft): boolean {
  return (
    draft.answerClass === "DOCUMENT" ||
    String(draft.answerMode || "").startsWith("doc_grounded") ||
    Boolean(draft.request.attachedDocumentIds?.length) ||
    Boolean(draft.retrievalPack?.evidence?.length)
  );
}
