import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import { logger as appLogger } from "../../../utils/logger";
import type {
  ChatEngine,
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
} from "../domain/chat.contracts";
import type { EncryptedChatRepo } from "../infrastructure/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../infrastructure/encryptedChatContext.service";
import { isRuntimePolicyError } from "./runtimePolicyError";
import type { PreparedTurnIdentity, TurnExecutionDraft } from "./turnExecutionDraft";
import type { ChatMemoryContextService } from "./ChatMemoryContextService";
import type { ChatComposeService } from "./ChatComposeService";
import type { ChatTraceArtifactsService } from "./ChatTraceArtifactsService";
import { ChatStreamProgressService } from "./ChatStreamProgressService";
import { ChatTurnIdentityService } from "./ChatTurnIdentityService";
import {
  buildBypassTurnDraft,
  buildRuntimePolicyFailureDraft,
  buildSuccessTurnDraft,
} from "./ChatTurnDraftBuilder";
import { ChatTurnPersistenceService } from "./ChatTurnPersistenceService";
import type { TurnRetrievalService } from "./TurnRetrievalService";
import type { SourceAssemblyService } from "./SourceAssemblyService";

function isRuntimePolicyFailure(error: unknown): boolean {
  if (isRuntimePolicyError(error)) return true;
  const message = String((error as Error)?.message || "");
  return (
    message.includes("memory_policy.config.runtimeTuning") ||
    message.includes("Required bank missing: memory_policy") ||
    message.includes("memory_policy.config.integrationHooks")
  );
}

type ChatTurnExecutorDeps = {
  engine: ChatEngine;
  memoryContextService: ChatMemoryContextService;
  retrievalService: TurnRetrievalService;
  sourceAssemblyService: SourceAssemblyService;
  composeService: ChatComposeService;
  traceArtifactsService: ChatTraceArtifactsService;
  streamProgressService?: ChatStreamProgressService;
  turnIdentityService: ChatTurnIdentityService;
  turnPersistenceService: ChatTurnPersistenceService;
};

export class ChatTurnExecutor {
  private readonly streamProgressService: ChatStreamProgressService;
  private readonly turnIdentityService: ChatTurnIdentityService;
  private readonly turnPersistenceService: ChatTurnPersistenceService;

  constructor(private readonly deps: ChatTurnExecutorDeps) {
    this.streamProgressService = deps.streamProgressService || new ChatStreamProgressService();
    this.turnIdentityService = deps.turnIdentityService;
    this.turnPersistenceService = deps.turnPersistenceService;
  }

  wireEncryption(
    encryptedRepo: EncryptedChatRepo,
    encryptedContext?: EncryptedChatContextService,
  ): void {
    this.turnPersistenceService.wireEncryption(encryptedRepo);
    this.turnIdentityService.wireEncryption(encryptedRepo);
    this.deps.memoryContextService.wireEncryptedContext(encryptedContext);
  }

  prepareTurnIdentity(req: ChatRequest): Promise<PreparedTurnIdentity> {
    return this.turnIdentityService.prepareTurnIdentity(req);
  }

  async executePreparedTurn(params: {
    req: ChatRequest;
    prepared: PreparedTurnIdentity;
    stream: boolean;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<TurnExecutionDraft> {
    const { req, prepared, stream, sink, streamingConfig } = params;
    const traceId = prepared.traceId;
    const turnStartedAt = prepared.turnStartedAt;
    const inputSpanId = this.deps.traceArtifactsService.startSpan(
      traceId,
      "input_normalization",
      {
        hasConversationId: Boolean(req.conversationId),
        stream,
      },
    );

    let retrievalMs = 0;
    let llmMs = 0;
    let retrievalPack: TurnExecutionDraft["retrievalPack"] = null;
    let evidenceGateDecision: TurnExecutionDraft["evidenceGateDecision"] = null;
    let answerMode: TurnExecutionDraft["answerMode"] =
      (req.attachedDocumentIds || []).length > 0 ? "help_steps" : "general_answer";

    try {
      if (stream) {
        this.streamProgressService.write(
          sink,
          "retrieval",
          "RETRIEVAL_IN_PROGRESS",
        );
      }

      const history = await this.deps.memoryContextService.loadRecentForEngine(
        prepared.conversationId,
        this.deps.memoryContextService.resolveRecentContextLimit(),
        req.userId,
        req.message,
      );
      this.deps.traceArtifactsService.endSpan(traceId, inputSpanId, {
        status: "ok",
        metadata: {
          conversationId: prepared.conversationId,
          userMessageId: prepared.userMessage.id,
          historyMessages: history.length,
          regenerate: Boolean(req.isRegenerate),
        },
      });

      const retrievalSpanId = this.deps.traceArtifactsService.startSpan(
        traceId,
        "retrieval",
        { stream },
      );
      const retrievalStartedAt = Date.now();
      retrievalPack = await this.deps.retrievalService.retrieveEvidence(
        req,
        prepared.lastDocumentId,
        {
          traceId,
          conversationId: prepared.conversationId,
        },
      );
      retrievalMs = Date.now() - retrievalStartedAt;
      await this.turnPersistenceService.persistResolvedDocScope({
        traceId,
        conversationId: prepared.conversationId,
        previousDocId: prepared.lastDocumentId,
        resolvedDocId: retrievalPack?.resolvedDocId ?? null,
        stream,
      });
      this.deps.traceArtifactsService.endSpan(traceId, retrievalSpanId, {
        status: "ok",
        metadata: {
          evidenceItems: retrievalPack?.evidence.length ?? 0,
          uniqueDocs: retrievalPack?.stats.uniqueDocsInEvidence ?? 0,
          candidates: retrievalPack?.stats.candidatesConsidered ?? 0,
          topScore: retrievalPack?.stats.topScore ?? null,
        },
      });

      const evidenceGateSpanId = this.deps.traceArtifactsService.startSpan(
        traceId,
        "evidence_gate",
        { stream },
      );
      evidenceGateDecision = this.deps.composeService.evaluateEvidenceGateDecision(
        req,
        retrievalPack,
      );
      answerMode = this.deps.composeService.resolveAnswerMode(req, retrievalPack);
      const answerClass = this.deps.composeService.resolveAnswerClass(answerMode);
      const navType = this.deps.composeService.resolveNavType();
      this.deps.traceArtifactsService.endSpan(traceId, evidenceGateSpanId, {
        status: "ok",
        metadata: {
          action: evidenceGateDecision?.suggestedAction ?? "answer",
          strength: evidenceGateDecision?.evidenceStrength ?? "none",
        },
      });

      const sources = this.deps.sourceAssemblyService.buildSources({
        retrievalPack,
        answerMode,
        attachedDocumentIds: req.attachedDocumentIds || [],
      });
      const sourceButtonsAttachment =
        this.deps.sourceAssemblyService.buildSourceButtonsAttachment(
          retrievalPack,
          req.preferredLanguage,
        );
      const bypass = this.deps.composeService.resolveEvidenceGateBypass(
        evidenceGateDecision,
        {
          attachedDocumentIds: req.attachedDocumentIds,
          evidenceCount: retrievalPack?.evidence.length ?? 0,
        },
      );
      if (bypass) {
        this.streamProgressService.write(
          sink,
          "validation",
          "EVIDENCE_GATE_BYPASS",
        );
        return buildBypassTurnDraft({
          traceId,
          req,
          prepared,
          retrievalPack,
          evidenceGateDecision,
          answerMode,
          answerClass,
          navType,
          retrievalMs,
          llmMs,
          stream,
          bypass,
          sources,
          sourceButtonsAttachment,
        });
      }

      const fallbackSignal = this.deps.composeService.resolveFallbackSignal(
        req,
        retrievalPack,
      );
      const messages = this.deps.composeService.buildEngineMessages(
        history,
        req.message,
        req.preferredLanguage,
        evidenceGateDecision,
      );
      if (stream && sources.length > 0) {
        this.streamProgressService.write(
          sink,
          "compose",
          "COMPOSITION_IN_PROGRESS",
        );
      }

      const composeSpanId = this.deps.traceArtifactsService.startSpan(
        traceId,
        stream ? "stream" : "compose",
      );
      const llmStartedAt = Date.now();
      const runtimeContext = this.deps.composeService.buildRuntimeContext(
        req,
        retrievalPack,
        answerMode,
        history,
      );
      const runtimeMeta = this.deps.composeService.buildRuntimeMeta(
        req,
        retrievalPack,
        answerMode,
        runtimeContext,
        evidenceGateDecision,
        fallbackSignal,
      );
      const generated = await this.deps.composeService.toEngineCall({
        engine: this.deps.engine,
        stream,
        traceId,
        userId: req.userId,
        conversationId: prepared.conversationId,
        messages,
        retrievalPack,
        runtimeContext,
        runtimeMeta,
        sink,
        streamingConfig,
      });
      llmMs = Date.now() - llmStartedAt;
      const generatedTelemetry =
        generated.telemetry && typeof generated.telemetry === "object"
          ? generated.telemetry
          : {};
      this.deps.traceArtifactsService.endSpan(traceId, composeSpanId, {
        status: "ok",
        metadata: {
          finishReason: String(generatedTelemetry.finishReason || "unknown"),
          model: String(generatedTelemetry.model || ""),
        },
      });

      const assistantTextRaw = String(
        ("finalText" in generated ? generated.finalText : generated.text) || "",
      ).trim();
      const attachmentsPayload = this.deps.composeService.mergeAttachments(
        generated.attachmentsPayload,
        sourceButtonsAttachment,
      );
      return buildSuccessTurnDraft({
        traceId,
        req,
        prepared,
        retrievalPack,
        evidenceGateDecision,
        answerMode,
        answerClass,
        navType,
        retrievalMs,
        llmMs,
        stream,
        sources,
        sourceButtonsAttachment,
        runtimeContext,
        runtimeMeta,
        generated: {
          assistantTextRaw,
          attachmentsPayload,
          telemetry: generatedTelemetry,
          followups: this.deps.composeService.generateFollowups(
            req,
            answerMode,
            retrievalPack,
          ),
          assistantText:
            this.deps.composeService.applyEvidenceGatePostProcessText(
              assistantTextRaw,
              evidenceGateDecision,
            ),
        },
        fallbackSignal,
      });
    } catch (error) {
      if (!isRuntimePolicyFailure(error)) {
        await this.deps.traceArtifactsService
          .persistTraceArtifacts({
            traceId,
            req,
            conversationId: prepared.conversationId,
            userMessageId: prepared.userMessage.id,
            assistantMessageId: null,
            retrievalPack,
            evidenceGateDecision,
            answerMode,
            status: "failed",
            failureCode: stream ? "CHAT_STREAM_RUNTIME_ERROR" : "CHAT_RUNTIME_ERROR",
            assistantText: "",
            telemetry: null,
            totalMs: Date.now() - turnStartedAt,
            retrievalMs,
            llmMs,
            stream,
          })
          .catch((persistError) => {
            appLogger.warn("[trace-writer] failed to persist crash trace", {
              traceId,
              error:
                persistError instanceof Error
                  ? persistError.message
                  : String(persistError),
            });
          });
        throw error;
      }

      return buildRuntimePolicyFailureDraft({
        traceId,
        req,
        prepared,
        retrievalPack,
        evidenceGateDecision,
        answerMode,
        answerClass:
          answerMode === "general_answer" ? "GENERAL" : "DOCUMENT",
        navType: null,
        retrievalMs,
        llmMs,
        stream,
        error,
      });
    }
  }

  persistFinalizedTurn(params: {
    draft: TurnExecutionDraft;
    finalized: ChatResult;
  }): Promise<ChatResult> {
    return this.turnPersistenceService.persistFinalizedTurn(params);
  }

  createConversation(params: { userId: string; title?: string }): Promise<ConversationDTO> {
    return this.turnPersistenceService.createConversation(params);
  }

  listConversations(userId: string, opts?: ConversationListOptions): Promise<ConversationDTO[]> {
    return this.turnPersistenceService.listConversations(userId, opts);
  }

  getConversation(userId: string, conversationId: string): Promise<ConversationDTO | null> {
    return this.turnPersistenceService.getConversation(userId, conversationId);
  }

  getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null> {
    return this.turnPersistenceService.getConversationWithMessages(
      userId,
      conversationId,
      opts,
    );
  }

  updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null> {
    return this.turnPersistenceService.updateTitle(userId, conversationId, title);
  }

  deleteConversation(userId: string, conversationId: string): Promise<{ ok: boolean }> {
    return this.turnPersistenceService.deleteConversation(userId, conversationId);
  }

  deleteAllConversations(userId: string): Promise<{ ok: boolean; deleted: number }> {
    return this.turnPersistenceService.deleteAllConversations(userId);
  }

  listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]> {
    return this.turnPersistenceService.listMessages(userId, conversationId, opts);
  }

  createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    return this.turnPersistenceService.createMessage(params);
  }
}
