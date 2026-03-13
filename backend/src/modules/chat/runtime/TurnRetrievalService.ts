import type {
  ChatEngine,
  ChatRequest,
} from "../domain/chat.contracts";
import type {
  EvidencePack,
  IRetrievalEngine,
  RetrievalRequest,
} from "../../../services/core/retrieval/retrieval.types";
import { resolveSlot } from "../../../services/core/retrieval/slotResolver.service";
import { UserScopedRetrievalRuntime } from "../../../services/core/retrieval/v2/UserScopedRetrievalRuntime.service";
import { coerceRetrievalAnswerMode } from "../domain/answerModes";
import { RuntimePolicyError } from "./runtimePolicyError";
import { normalizeChatLanguage } from "./chatRuntimeLanguage";
import {
  applyConversationHistoryDocScopeFallback,
  buildAttachmentDocScopeSignals,
} from "./chatRuntimeScopeSignals";
import type { ChatMemoryContextService } from "./ChatMemoryContextService";
import { RetrievalPlanResolver } from "./RetrievalPlanResolver";
import type { RetrievalRuntimeConfig } from "../config/chatRuntimeConfig";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

type RuntimeContext = { traceId?: string | null; conversationId?: string | null };

export class TurnRetrievalService {
  private readonly planResolver: RetrievalPlanResolver;

  constructor(
    private readonly engine: ChatEngine,
    private readonly retrievalRuntime: UserScopedRetrievalRuntime,
    private readonly memoryContextService: ChatMemoryContextService,
    private readonly config: RetrievalRuntimeConfig,
  ) {
    this.planResolver = new RetrievalPlanResolver(
      engine,
      config.retrievalPlanTimeoutMs,
    );
  }

  async retrieveEvidence(
    req: ChatRequest,
    lastDocumentId?: string | null,
    runtimeCtx?: RuntimeContext,
  ): Promise<(EvidencePack & { resolvedDocId: string | null }) | null> {
    const cfg = this.memoryContextService.getMemoryRuntimeTuning();
    const attachedBase = Array.isArray(req.attachedDocumentIds)
      ? req.attachedDocumentIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];
    const context = asObject(req.context);
    const contextSignals = asObject(context.signals);

    if (contextSignals.isFollowup == null && lastDocumentId) {
      contextSignals.isFollowup = true;
      if (attachedBase.length <= 1) {
        contextSignals.activeDocId =
          String(contextSignals.activeDocId || "").trim() || lastDocumentId;
      }
    }

    const preferActiveScopeWhenFollowup = Boolean(
      cfg.semanticRetrieval?.preferActiveScopeWhenFollowup,
    );
    const staleScopePenalty = Number(cfg.semanticRetrieval?.staleScopePenalty);
    if (!Number.isFinite(staleScopePenalty) || staleScopePenalty < 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.staleScopePenalty is required",
      );
    }
    const maxGlobalRetrievalsPerTurn = Number(
      cfg.semanticRetrieval?.maxGlobalRetrievalsPerTurn,
    );
    if (!Number.isFinite(maxGlobalRetrievalsPerTurn) || maxGlobalRetrievalsPerTurn < 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.maxGlobalRetrievalsPerTurn is required",
      );
    }

    const followupActive = contextSignals.isFollowup === true;
    const activeDocHint = String(contextSignals.activeDocId || "").trim();
    const attached =
      attachedBase.length === 0 &&
      preferActiveScopeWhenFollowup &&
      followupActive &&
      activeDocHint
        ? [activeDocHint]
        : attachedBase;

    const globalSearchEnabled = Boolean(
      cfg.semanticRetrieval?.enableGlobalEvidenceSearch,
    );
    const minGlobalChars = Number(cfg.semanticRetrieval?.globalSearchMinQueryChars);
    if (!Number.isFinite(minGlobalChars) || minGlobalChars < 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.globalSearchMinQueryChars is required",
      );
    }

    const allowGlobalScope =
      attached.length === 0 &&
      globalSearchEnabled &&
      maxGlobalRetrievalsPerTurn > 0 &&
      String(req.message || "").trim().length >= minGlobalChars;
    if (attached.length === 0 && !allowGlobalScope) return null;

    const dependencies = this.retrievalRuntime.getDependenciesForUser(req.userId);
    const retrievalEngine: IRetrievalEngine = this.retrievalRuntime.getEngineForUser(req.userId);
    const semanticSignals = this.memoryContextService.collectSemanticSignals(
      req.message,
      contextSignals,
    );
    const slotResult = resolveSlot(
      req.message,
      normalizeChatLanguage(req.preferredLanguage),
    );
    const docScopeSignals = buildAttachmentDocScopeSignals(attached);

    const docNameMatch = await this.planResolver.resolveDocNameFromQuery(
      req.message,
      attached,
      req.userId,
      dependencies.docStore,
    );
    if (docNameMatch.matchedDocIds.length === 1 && docNameMatch.resolvedDocId) {
      docScopeSignals.docScopeLock = {
        mode: "single_doc",
        allowedDocumentIds: [docNameMatch.resolvedDocId],
        activeDocumentId: docNameMatch.resolvedDocId,
        source: "user_explicit",
      };
      docScopeSignals.explicitDocLock = true;
      docScopeSignals.activeDocId = docNameMatch.resolvedDocId;
      docScopeSignals.explicitDocRef = true;
      docScopeSignals.resolvedDocId = docNameMatch.resolvedDocId;
      docScopeSignals.hardScopeActive = true;
      docScopeSignals.singleDocIntent = true;
    } else if (docNameMatch.matchedDocIds.length > 1) {
      docScopeSignals.docScopeLock = {
        mode: "docset",
        allowedDocumentIds: docNameMatch.matchedDocIds,
        source: "user_explicit",
      };
      docScopeSignals.explicitDocLock = true;
      docScopeSignals.activeDocId = null;
      docScopeSignals.explicitDocRef = false;
      docScopeSignals.resolvedDocId = null;
      docScopeSignals.hardScopeActive = true;
      docScopeSignals.singleDocIntent = false;
    }

    Object.assign(
      docScopeSignals,
      applyConversationHistoryDocScopeFallback({
        signals: docScopeSignals,
        attachedDocumentIds: attached,
        lastDocumentId,
      }),
    );

    const meta = asObject(req.meta);
    const intentFamily =
      typeof meta.intentFamily === "string" ? String(meta.intentFamily) : "documents";
    const operator = typeof meta.operator === "string" ? String(meta.operator) : null;
    const answerMode = coerceRetrievalAnswerMode(meta.answerMode);
    const retrievalPlan = await this.planResolver.generateRetrievalPlanForEvidence({
      req,
      runtimeCtx,
      intentFamily,
      operator,
      answerMode,
      docScopeSignals,
      semanticSignals,
      allowGlobalScope,
      attachedDocumentIds: attached,
      docStore: dependencies.docStore,
    });

    const retrievalReq: RetrievalRequest = {
      query: req.message,
      env: this.config.environment,
      retrievalPlan,
      signals: {
        intentFamily,
        operator,
        answerMode,
        ...docScopeSignals,
        hasQuotedText: semanticSignals.hasQuotedText,
        hasFilename: semanticSignals.hasFilename,
        userAskedForTable: semanticSignals.userAskedForTable,
        userAskedForQuote: semanticSignals.userAskedForQuote,
        sheetHintPresent: semanticSignals.sheetHintPresent,
        resolvedSheetName:
          typeof contextSignals.resolvedSheetName === "string"
            ? String(contextSignals.resolvedSheetName)
            : null,
        rangeExplicit: semanticSignals.rangeExplicit,
        resolvedRangeA1:
          typeof contextSignals.resolvedRangeA1 === "string"
            ? String(contextSignals.resolvedRangeA1)
            : null,
        timeConstraintsPresent: semanticSignals.timeConstraintsPresent,
        explicitYearOrQuarterComparison:
          semanticSignals.explicitYearOrQuarterComparison,
        tableExpected: semanticSignals.tableExpected,
        corpusSearchAllowed: allowGlobalScope,
        unsafeGate: contextSignals.unsafeGate === true,
        slotContract: slotResult.contract,
        isExtractionQuery: slotResult.isExtractionQuery,
        allowExpansion:
          contextSignals.allowExpansion !== false &&
          !(followupActive && attached.length === 0 && staleScopePenalty >= 0.5),
      },
    };

    const pack = await retrievalEngine.retrieve(retrievalReq);
    const maxEvidence = Number(cfg.semanticRetrieval?.maxEvidenceItemsForAnswer);
    if (!Number.isFinite(maxEvidence) || maxEvidence <= 0) {
      throw new RuntimePolicyError(
        "RUNTIME_POLICY_INVALID",
        "memory_policy.config.runtimeTuning.semanticRetrieval.maxEvidenceItemsForAnswer is required",
      );
    }
    pack.evidence = pack.evidence.slice(0, Math.floor(maxEvidence));
    return Object.assign(pack, {
      resolvedDocId: docScopeSignals.resolvedDocId ?? null,
    });
  }
}
