import type {
  ChatProvenanceDTO,
  ChatQualityGateState,
  ChatResult,
  ChatWarningState,
} from "../../domain/chat.contracts";
import { buildReturnResult } from "./FinalizedResultBuilder";
import {
  hasAnsweredOutput,
  makeWarning,
  resolveFailureCode,
  resolveStatus,
} from "./finalizationStatus";
import {
  mapFailedQualityGates,
} from "./finalizationValidation";
import type { TurnExecutionDraft } from "../turnExecutionDraft";
import type { ChatSourceDTO } from "../../domain/chat.contracts";
import type { QualityRunResult } from "../../../../services/core/enforcement/qualityGateRunner.service";
import type { StyleRepairResult } from "../StyleRepairService";

type FinalizationOutcomeParams = {
  draft: TurnExecutionDraft;
  scoped: ChatResult;
  enforced: {
    content: string;
    attachments: unknown[];
    enforcement: {
      violations?: Array<{ code?: string | null }>;
      repairs?: unknown;
    };
  };
  repairedContent: string;
  styleRepair: StyleRepairResult;
  gateResult: QualityRunResult;
  retainSources: boolean;
  baseSources: Array<{ documentId?: string | null }>;
  rawProvenance: ChatProvenanceDTO;
  provenanceValidation: {
    ok: boolean;
    failureCode?: string | null;
  };
  semanticTruncation: {
    occurred: boolean;
    reason: string | null;
    detectorVersion: string | null;
  };
  providerTruncation: {
    occurred: boolean;
    reason: string | null;
  };
  sortSources: (sources: ChatSourceDTO[]) => ChatSourceDTO[];
};

function selectUserWarning(
  warnings: ChatWarningState[],
): ChatWarningState | null {
  const priorityOrder = [
    "QUALITY_GATE_BLOCKED",
    "RESPONSE_CONTRACT_VIOLATION",
    "NEEDS_PROVENANCE",
  ];
  for (const code of priorityOrder) {
    const match = warnings.find((warning) => warning.code === code);
    if (match) return match;
  }
  return warnings[0] || null;
}

export function resolveFinalizationOutcome(
  params: FinalizationOutcomeParams,
): {
  finalized: ChatResult;
  failureCode: string | null;
  status: ReturnType<typeof resolveStatus>;
  fallbackReasonCode: string | undefined;
} {
  const {
    draft,
    scoped,
    enforced,
    repairedContent,
    styleRepair,
    gateResult,
    retainSources,
    baseSources,
    rawProvenance,
    provenanceValidation,
    semanticTruncation,
    providerTruncation,
    sortSources,
  } = params;

  const warnings: ChatWarningState[] = [
    ...(!gateResult.allPassed
      ? [makeWarning("QUALITY_GATE_BLOCKED", "quality_gate")]
      : []),
    ...((enforced.enforcement.violations || []).map((violation) =>
      makeWarning(
        String(violation.code || "RESPONSE_CONTRACT_VIOLATION"),
        "enforcer",
      ),
    )),
  ];
  const qualityGates: ChatQualityGateState = gateResult.allPassed
    ? { allPassed: true, failed: [] }
    : {
        allPassed: false,
        failed: mapFailedQualityGates(gateResult),
      };
  const assistantTelemetry = {
    ...(scoped.assistantTelemetry || {}),
    styleRepairTrace: styleRepair.repairs,
    styleFailureHistory: styleRepair.detectedFailures,
  };

  const finalized = {
    ...scoped,
    assistantText: repairedContent,
    attachmentsPayload: enforced.attachments,
    assistantTelemetry,
    sources: retainSources ? scoped.sources || [] : [],
    provenance: {
      ...rawProvenance,
      validated: provenanceValidation.ok,
      failureCode: provenanceValidation.failureCode,
    },
    qualityGates,
    warnings,
    userWarning: selectUserWarning(warnings),
    truncation: {
      occurred:
        Boolean(scoped.truncation?.occurred) || semanticTruncation.occurred,
      reason:
        scoped.truncation?.reason ??
        semanticTruncation.reason ??
        providerTruncation.reason,
      resumeToken: scoped.truncation?.resumeToken ?? null,
      providerOccurred:
        scoped.truncation?.providerOccurred ?? providerTruncation.occurred,
      providerReason:
        scoped.truncation?.providerReason ?? providerTruncation.reason,
      detectorVersion:
        scoped.truncation?.detectorVersion ??
        semanticTruncation.detectorVersion,
    },
    evidence: {
      required: scoped.evidence?.required || false,
      provided: retainSources && baseSources.length > 0,
      sourceIds: retainSources
        ? baseSources
            .map((source) => source.documentId)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        : [],
    },
    completion: {
      answered: hasAnsweredOutput(
        {
          ...scoped,
          assistantText: repairedContent,
          assistantTelemetry,
          attachmentsPayload: enforced.attachments,
        },
        draft.outputContract,
      ),
      missingSlots: Array.isArray(scoped.completion?.missingSlots)
        ? scoped.completion.missingSlots
        : [],
      nextAction: null,
      nextActionCode:
        scoped.completion?.nextActionCode ??
        (!provenanceValidation.ok ? "NEEDS_PROVENANCE" : null),
      nextActionArgs:
        scoped.completion?.nextActionArgs ??
        (!provenanceValidation.ok
          ? { failureCode: provenanceValidation.failureCode || "missing_provenance" }
          : null),
    },
  } satisfies ChatResult;

  const enforcementViolationCode = enforced.enforcement.violations?.[0]?.code || null;
  const failureCode =
    finalized.failureCode ||
    (!provenanceValidation.ok
      ? String(provenanceValidation.failureCode || "MISSING_PROVENANCE").toUpperCase()
      : null) ||
    (enforcementViolationCode ? "RESPONSE_CONTRACT_VIOLATION" : null) ||
    (!gateResult.allPassed ? "QUALITY_GATE_BLOCKED" : null) ||
    resolveFailureCode(finalized);
  const status = resolveStatus({
    ...finalized,
    failureCode,
  });

  return {
    finalized: {
      ...buildReturnResult({
        finalized: {
          ...finalized,
          completion: {
            answered: hasAnsweredOutput(
              {
                ...finalized,
                attachmentsPayload: enforced.attachments,
                assistantText: repairedContent,
              },
              draft.outputContract,
            ),
            missingSlots: Array.isArray(finalized.completion?.missingSlots)
              ? finalized.completion.missingSlots
              : [],
            nextAction: null,
            nextActionCode: finalized.completion?.nextActionCode ?? null,
            nextActionArgs: finalized.completion?.nextActionArgs ?? null,
          },
        },
        draft,
        enforcedAttachments: enforced.attachments,
        enforcedContent: repairedContent,
        retainSources,
        sortSources,
      }),
      failureCode,
      status,
      fallbackReasonCode:
        finalized.fallbackReasonCode ||
        (status !== "success" ? failureCode || undefined : undefined),
    },
    failureCode,
    status,
    fallbackReasonCode:
      finalized.fallbackReasonCode ||
      (status !== "success" ? failureCode || undefined : undefined),
  };
}
