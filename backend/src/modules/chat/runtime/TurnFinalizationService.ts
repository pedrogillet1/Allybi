import type {
  ChatQualityGateFailure,
  ChatRequest,
  ChatResult,
  ChatResultStatus,
  ChatSourceDTO,
  ChatWarningState,
} from "../domain/chat.contracts";
import { ContractNormalizer } from "./ContractNormalizer";
import { EvidenceValidator } from "./EvidenceValidator";
import {
  classifyProviderTruncation,
  classifyVisibleTruncation,
} from "./truncationClassifier";
import { normalizeRuntimeFailureCode } from "./runtimePolicyError";
import type { TurnExecutionDraft } from "./turnExecutionDraft";
import {
  buildEvidenceItemsForQualityGate,
  type ChatOutputContract,
} from "./turnExecutionDraft";
import { QualityGateRunnerService } from "../../../services/core/enforcement/qualityGateRunner.service";
import {
  getResponseContractEnforcer,
  type ResponseContractContext,
} from "../../../services/core/enforcement/responseContractEnforcer.service";
import { buildChatProvenance } from "./provenance/ProvenanceBuilder";
import { validateChatProvenance } from "./provenance/ProvenanceValidator";

type FinalizationContext = {
  request: ChatRequest;
  scopeDocumentIds?: string[];
};

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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractEnforcementRepairs(result: ChatResult): string[] {
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

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): number {
  const left = Number.isFinite(Number(a)) ? Number(a) : Number.MAX_SAFE_INTEGER;
  const right = Number.isFinite(Number(b)) ? Number(b) : Number.MAX_SAFE_INTEGER;
  return left - right;
}

function sortSources(sources: ChatSourceDTO[]): ChatSourceDTO[] {
  return [...sources].sort((a, b) => {
    const leftDoc = String(a.documentId || "").trim();
    const rightDoc = String(b.documentId || "").trim();
    if (leftDoc !== rightDoc) return leftDoc.localeCompare(rightDoc);
    const byPage = compareNullableNumber(a.page, b.page);
    if (byPage !== 0) return byPage;
    const bySlide = compareNullableNumber(a.slide, b.slide);
    if (bySlide !== 0) return bySlide;
    return String(a.locationKey || "").localeCompare(String(b.locationKey || ""));
  });
}

function makeWarning(code: string, source: ChatWarningState["source"]): ChatWarningState {
  return {
    code,
    message: code,
    severity: "warning",
    source,
  };
}

function mapFailedQualityGates(result: Awaited<ReturnType<QualityGateRunnerService["runGates"]>>): ChatQualityGateFailure[] {
  return result.results
    .filter((gate) => !gate.passed)
    .map((gate) => ({
      gateName: gate.gateName,
      severity: gate.severity === "block" ? "block" : "warn",
      reason: gate.failureCode || gate.gateName,
    }));
}

function shouldRetainSources(contract: ChatOutputContract): boolean {
  return contract === "USER_VISIBLE_TEXT" || contract === "STREAMING_TEXT";
}

function usedDocumentContext(draft: TurnExecutionDraft): boolean {
  return (
    draft.answerClass === "DOCUMENT" ||
    String(draft.answerMode || "").startsWith("doc_grounded") ||
    Boolean(draft.request.attachedDocumentIds?.length) ||
    Boolean(draft.retrievalPack?.evidence?.length)
  );
}

function toAttachmentArray(value: unknown): any[] {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") return [value as any];
  return [];
}

function filterAttachmentsForSources(
  attachmentsPayload: unknown,
  allowedDocumentIds: Set<string>,
): any[] {
  const attachments = toAttachmentArray(attachmentsPayload);
  if (allowedDocumentIds.size === 0) {
    return attachments.filter((attachment) => {
      if (!attachment || typeof attachment !== "object") return true;
      return String((attachment as Record<string, unknown>).type || "").trim() !== "source_buttons";
    });
  }

  return attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") return attachment;
      if (String((attachment as Record<string, unknown>).type || "").trim() !== "source_buttons") {
        return attachment;
      }
      const buttons = Array.isArray((attachment as Record<string, unknown>).buttons)
        ? ((attachment as Record<string, unknown>).buttons as any[])
        : [];
      const filteredButtons = buttons.filter((button) => {
        const documentId = String((button as Record<string, unknown>).documentId || "").trim();
        return allowedDocumentIds.has(documentId);
      });
      if (filteredButtons.length === 0) return null;
      return {
        ...attachment,
        buttons: filteredButtons,
      };
    })
    .filter(Boolean);
}

function hasAnsweredOutput(result: ChatResult, contract: ChatOutputContract): boolean {
  if (contract === "NAVIGATION_PAYLOAD") {
    return (
      (Array.isArray(result.listing) && result.listing.length > 0) ||
      (Array.isArray(result.breadcrumb) && result.breadcrumb.length > 0) ||
      (Array.isArray(result.attachmentsPayload) && result.attachmentsPayload.length > 0)
    );
  }
  if (contract === "FILE_ACTIONS") {
    return Boolean(result.attachmentsPayload);
  }
  return Boolean(result.completion?.answered);
}

function resolveFailureCode(result: ChatResult): string | null {
  const failureCode = String(result.failureCode || "").trim();
  if (failureCode) return failureCode;
  if (result.truncation?.occurred) return "TRUNCATED_OUTPUT";
  if (result.evidence?.required && !result.evidence?.provided) {
    return "MISSING_SOURCES";
  }
  if (!result.completion?.answered) return "EMPTY_OUTPUT";
  return null;
}

function resolveStatus(result: ChatResult): ChatResultStatus {
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

export class TurnFinalizationService {
  constructor(
    private readonly normalizer = new ContractNormalizer(),
    private readonly evidenceValidator = new EvidenceValidator(),
    private readonly qualityRunner = new QualityGateRunnerService(),
  ) {}

  async finalize(
    draft: TurnExecutionDraft,
    context: FinalizationContext,
  ): Promise<ChatResult> {
    const request = context.request;
    const docContextUsed = usedDocumentContext(draft);
    const retainSources =
      shouldRetainSources(draft.outputContract) && docContextUsed;
    const baseSources = retainSources ? sortSources(draft.sources) : [];
    const sourceDocumentIds = new Set(
      baseSources.map((source) => String(source.documentId || "").trim()).filter(Boolean),
    );
    const attachmentsPayload = filterAttachmentsForSources(
      draft.draftResult.attachmentsPayload,
      sourceDocumentIds,
    );
    const baseResult: ChatResult = {
      ...draft.draftResult,
      conversationId: draft.conversationId,
      userMessageId: draft.userMessage.id,
      assistantMessageId: draft.draftResult.assistantMessageId || "",
      turnKey: draft.turnKey,
      sources: baseSources,
      attachmentsPayload,
      evidence: {
        required:
          docContextUsed,
        provided: baseSources.length > 0,
        sourceIds: baseSources.map((source) => source.documentId),
      },
      assistantTelemetry: draft.telemetry || draft.draftResult.assistantTelemetry,
      provenance:
        draft.draftResult.provenance ||
        buildChatProvenance({
          answerText: draft.draftResult.assistantText,
          answerMode: draft.answerMode,
          answerClass: draft.answerClass,
          retrievalPack: draft.retrievalPack,
        }),
    };

    let normalized = this.normalizer.normalize(baseResult);
    normalized.completion = {
      answered: hasAnsweredOutput(normalized, draft.outputContract),
      missingSlots: Array.isArray(normalized.completion?.missingSlots)
        ? normalized.completion!.missingSlots
        : [],
      nextAction: null,
      nextActionCode: normalized.completion?.nextActionCode ?? null,
      nextActionArgs: normalized.completion?.nextActionArgs ?? null,
    };

    const scoped = this.evidenceValidator.enforceScope(
      normalized,
      context.scopeDocumentIds || [],
    );

    const gateResult = await this.qualityRunner.runGates(scoped.assistantText || "", {
      answerMode: draft.answerMode,
      answerClass: draft.answerClass,
      operator: String((request.meta as any)?.operator || "").trim().toLowerCase(),
      intentFamily: String((request.meta as any)?.intentFamily || "")
        .trim()
        .toLowerCase(),
      language: String(request.preferredLanguage || "en") as "en" | "pt" | "es",
      evidenceItems: buildEvidenceItemsForQualityGate(draft.retrievalPack),
      explicitDocRef: (request.attachedDocumentIds || []).length === 1,
      sourceButtonsCount: Array.isArray(scoped.attachmentsPayload)
        ? scoped.attachmentsPayload.length
        : 0,
      userRequestedShort: request.truncationRetry === true,
    });

    const enforcerCtx: ResponseContractContext = {
      answerMode: draft.answerMode,
      outputContract: draft.outputContract,
      language: String(request.preferredLanguage || "en") as "en" | "pt" | "es",
      operator: String((request.meta as any)?.operator || "").trim().toLowerCase(),
      intentFamily: String((request.meta as any)?.intentFamily || "")
        .trim()
        .toLowerCase(),
      constraints: {
        userRequestedShort: request.truncationRetry === true || undefined,
      },
      signals: asObject(request.context) || undefined,
    };
    const enforced = getResponseContractEnforcer().enforce(
      {
        content: scoped.assistantText,
        attachments: toAttachmentArray(scoped.attachmentsPayload),
      },
      enforcerCtx,
    );

    const providerTruncation = classifyProviderTruncation(
      asObject(scoped.assistantTelemetry),
    );
    const semanticTruncation = classifyVisibleTruncation({
      finalText: enforced.content,
      enforcementRepairs: enforced.enforcement.repairs || extractEnforcementRepairs(scoped),
      providerTruncation,
    });

    const rawProvenance = buildChatProvenance({
      answerText: enforced.content,
      answerMode: draft.answerMode,
      answerClass: draft.answerClass,
      retrievalPack: draft.retrievalPack,
    });
    const provenanceValidation = validateChatProvenance({
      provenance: rawProvenance,
      answerMode: draft.answerMode,
      answerClass: draft.answerClass,
      allowedDocumentIds: request.attachedDocumentIds || [],
    });

    const warnings: ChatWarningState[] = [
      ...((gateResult.allPassed ? [] : [makeWarning("QUALITY_GATE_BLOCKED", "quality_gate")])),
      ...((enforced.enforcement.violations || []).map((violation) =>
        makeWarning(String(violation.code || "RESPONSE_CONTRACT_VIOLATION"), "enforcer"),
      )),
    ];

    const qualityGates = gateResult.allPassed
      ? { allPassed: true, failed: [] }
      : {
          allPassed: false,
          failed: mapFailedQualityGates(gateResult),
        };

    const finalized = this.normalizer.normalize({
      ...scoped,
      assistantText: enforced.content,
      attachmentsPayload: enforced.attachments,
      sources: retainSources ? scoped.sources || [] : [],
      provenance: {
        ...rawProvenance,
        validated: provenanceValidation.ok,
        failureCode: provenanceValidation.failureCode,
      },
      qualityGates,
      warnings,
      userWarning: warnings[0] || null,
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
        required: baseResult.evidence?.required || false,
        provided: retainSources && baseSources.length > 0,
        sourceIds: retainSources ? baseSources.map((source) => source.documentId) : [],
      },
      completion: {
        answered: hasAnsweredOutput(
          {
            ...scoped,
            assistantText: enforced.content,
            attachmentsPayload: enforced.attachments,
          },
          draft.outputContract,
        ),
        missingSlots: Array.isArray(scoped.completion?.missingSlots)
          ? scoped.completion!.missingSlots
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
    });

    const enforcementViolationCode = enforced.enforcement.violations?.[0]?.code || null;
    const failureCode =
      finalized.failureCode ||
      (!provenanceValidation.ok
        ? String(provenanceValidation.failureCode || "MISSING_PROVENANCE").toUpperCase()
        : null) ||
      (enforcementViolationCode
        ? "RESPONSE_CONTRACT_VIOLATION"
        : null) ||
      (!gateResult.allPassed ? "QUALITY_GATE_BLOCKED" : null) ||
      resolveFailureCode(finalized);
    const status = resolveStatus({
      ...finalized,
      failureCode,
    });

    return {
      ...finalized,
      assistantMessageId: finalized.assistantMessageId || "",
      turnKey: draft.turnKey,
      sources: retainSources ? sortSources(finalized.sources || []) : [],
      failureCode,
      status,
      fallbackReasonCode:
        finalized.fallbackReasonCode ||
        (status !== "success" ? failureCode || undefined : undefined),
      completion: {
        answered: hasAnsweredOutput(
          {
            ...finalized,
            attachmentsPayload: enforced.attachments,
            assistantText: enforced.content,
          },
          draft.outputContract,
        ),
        missingSlots: Array.isArray(finalized.completion?.missingSlots)
          ? finalized.completion!.missingSlots
          : [],
        nextAction: null,
        nextActionCode: finalized.completion?.nextActionCode ?? null,
        nextActionArgs: finalized.completion?.nextActionArgs ?? null,
      },
      evidence: {
        required: finalized.evidence?.required || false,
        provided: retainSources && (finalized.sources || []).length > 0,
        sourceIds: retainSources
          ? (finalized.sources || []).map((source) => source.documentId)
          : [],
      },
    };
  }
}
