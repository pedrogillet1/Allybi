import type {
  ChatRequest,
  ChatResult,
} from "../domain/chat.contracts";
import { ContractNormalizer } from "./ContractNormalizer";
import { EvidenceValidator } from "./EvidenceValidator";
import {
  classifyProviderTruncation,
  classifyVisibleTruncation,
} from "./truncationClassifier";
import type { TurnExecutionDraft } from "./turnExecutionDraft";
import { buildEvidenceItemsForQualityGate } from "./turnExecutionDraft";
import { QualityGateRunnerService } from "../../../services/core/enforcement/qualityGateRunner.service";
import {
  getResponseContractEnforcer,
  type ResponseContractContext,
} from "../../../services/core/enforcement/responseContractEnforcer.service";
import { buildChatProvenance } from "./provenance/ProvenanceBuilder";
import { validateChatProvenance } from "./provenance/ProvenanceValidator";
import {
  filterAttachmentsForSources,
  sortSources,
  toEnforcerAttachments,
} from "./finalization/finalizationAttachments";
import {
  asObject,
  asString,
  asTurnStyleState,
  extractEnforcementRepairs,
  readRequestMeta,
  resolveContractShape,
  shouldRetainSources,
  usedDocumentContext,
} from "./finalization/finalizationValidation";
import { hasAnsweredOutput } from "./finalization/finalizationStatus";
import { buildBaseResult } from "./finalization/FinalizedResultBuilder";
import { resolveFinalizationOutcome } from "./finalization/FinalizationOutcomeResolver";
import type { QualityRunResult } from "../../../services/core/enforcement/qualityGateRunner.service";
import { StyleRepairService } from "./StyleRepairService";

type FinalizationContext = {
  request: ChatRequest;
  scopeDocumentIds?: string[];
};

export class TurnFinalizationService {
  constructor(
    private readonly normalizer = new ContractNormalizer(),
    private readonly evidenceValidator = new EvidenceValidator(),
    private readonly qualityRunner = new QualityGateRunnerService(),
    private readonly styleRepairService = new StyleRepairService(),
  ) {}

  async finalize(
    draft: TurnExecutionDraft,
    context: FinalizationContext,
  ): Promise<ChatResult> {
    const request = context.request;
    const requestMeta = readRequestMeta(request);
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
    const baseResult = {
      ...buildBaseResult({
        draft,
        baseSources,
        attachmentsPayload,
        docContextUsed,
      }),
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

    const enforcerCtx: ResponseContractContext = {
      answerMode: draft.answerMode,
      outputContract: draft.outputContract,
      contractShape: resolveContractShape(draft),
      language: String(request.preferredLanguage || "en") as "en" | "pt" | "es",
      operator: asString(requestMeta.operator).toLowerCase(),
      intentFamily: asString(requestMeta.intentFamily).toLowerCase(),
      constraints: {
        userRequestedShort: request.truncationRetry === true || undefined,
      },
      signals: asObject(request.context) || undefined,
    };
    const enforced = getResponseContractEnforcer().enforce(
      {
        content: scoped.assistantText,
        attachments: toEnforcerAttachments(scoped.attachmentsPayload),
      },
      enforcerCtx,
    );
    const runtimeStyleDecision =
      asObject(draft.runtimeContext?.styleDecision) ||
      asObject(draft.runtimeMeta?.styleDecision) ||
      asObject(asObject(request.context)?.styleDecision);
    const turnStyleState =
      asTurnStyleState(draft.runtimeContext?.turnStyleState) ||
      asTurnStyleState(draft.runtimeMeta?.turnStyleState) ||
      asTurnStyleState(asObject(request.context)?.turnStyleState);
    const requestEvidenceGate = asObject(asObject(request.meta)?.evidenceGate);
    const evidenceStrength =
      asString(requestEvidenceGate?.strength).toLowerCase() ||
      asString(asObject(asObject(request.context)?.signals)?.evidenceStrength).toLowerCase();
    const domainHint =
      asString(asObject(request.meta)?.domain || asObject(request.meta)?.domainId).toLowerCase() ||
      asString(asObject(asObject(request.context)?.signals)?.domain).toLowerCase();
    const styleRepair = this.styleRepairService.repair({
      content: enforced.content || "",
      styleDecision: runtimeStyleDecision,
      turnStyleState,
      language: String(request.preferredLanguage || "en"),
      evidenceStrength,
      domainHint,
    });
    const repairedContent = styleRepair.content || enforced.content || "";
    scoped.assistantTelemetry = {
      ...(asObject(scoped.assistantTelemetry) || {}),
      styleDecision: runtimeStyleDecision || null,
      turnStyleState: turnStyleState || null,
      styleRepairTrace: styleRepair.repairs,
      styleFailureHistory: styleRepair.detectedFailures,
    };

    const gateResult: QualityRunResult = await this.qualityRunner.runGates(
      repairedContent,
      {
        answerMode: draft.answerMode,
        answerClass: draft.answerClass,
        operator: asString(requestMeta.operator).toLowerCase(),
        intentFamily: asString(requestMeta.intentFamily).toLowerCase(),
        domainHint,
        language: String(request.preferredLanguage || "en") as "en" | "pt" | "es",
        evidenceItems: buildEvidenceItemsForQualityGate(draft.retrievalPack),
        explicitDocRef: (request.attachedDocumentIds || []).length === 1,
        sourceButtonsCount: Array.isArray(enforced.attachments)
          ? enforced.attachments.length
          : 0,
        userRequestedShort: request.truncationRetry === true,
        evidenceStrength,
        styleDecision: runtimeStyleDecision,
        turnStyleState,
      },
    );

    const providerTruncation = classifyProviderTruncation(
      asObject(scoped.assistantTelemetry),
    );
    const semanticTruncation = classifyVisibleTruncation({
      finalText: repairedContent,
      enforcementRepairs: enforced.enforcement.repairs || extractEnforcementRepairs(scoped),
      providerTruncation,
    });

    const rawProvenance = buildChatProvenance({
      answerText: repairedContent,
      answerMode: draft.answerMode,
      answerClass: draft.answerClass,
      retrievalPack: draft.retrievalPack,
    });
    const allowedDocumentIds =
      context.scopeDocumentIds && context.scopeDocumentIds.length > 0
        ? context.scopeDocumentIds
        : request.attachedDocumentIds || [];
    const provenanceValidation = validateChatProvenance({
      provenance: rawProvenance,
      answerMode: draft.answerMode,
      answerClass: draft.answerClass,
      allowedDocumentIds,
    });

    return resolveFinalizationOutcome({
      draft,
      scoped: this.normalizer.normalize({
        ...scoped,
        assistantTelemetry: scoped.assistantTelemetry,
        evidence: {
          required: baseResult.evidence?.required || false,
          provided: retainSources && baseSources.length > 0,
          sourceIds: retainSources ? baseSources.map((source) => source.documentId) : [],
        },
      }),
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
    }).finalized;
  }
}
