import { logger as appLogger } from "../../../utils/logger";
import type {
  ChatMessageDTO,
  ChatResult,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
} from "../domain/chat.contracts";
import type { EncryptedChatRepo } from "../infrastructure/encryptedChatRepo.service";
import type { ConversationMutationStore } from "./ConversationMutationStore";
import type { ConversationQueryStore } from "./ConversationQueryStore";
import type { ChatMemoryContextService } from "./ChatMemoryContextService";
import type { ChatTraceArtifactsService } from "./ChatTraceArtifactsService";
import type { TurnExecutionDraft } from "./turnExecutionDraft";

export class ChatTurnPersistenceService {
  constructor(
    private readonly conversationQueryStore: ConversationQueryStore,
    private readonly conversationMutationStore: ConversationMutationStore,
    private readonly memoryContextService: ChatMemoryContextService,
    private readonly traceArtifactsService: ChatTraceArtifactsService,
  ) {}

  wireEncryption(encryptedRepo: EncryptedChatRepo): void {
    this.conversationQueryStore.wireEncryption(encryptedRepo);
    this.conversationMutationStore.wireEncryption(encryptedRepo);
  }

  async persistFinalizedTurn(params: {
    draft: TurnExecutionDraft;
    finalized: ChatResult;
  }): Promise<ChatResult> {
    const { draft, finalized } = params;
    const outputSpanId = this.traceArtifactsService.startSpan(
      draft.traceId,
      "output_contract",
      { stream: draft.timing.stream },
    );
    const metadata: Record<string, unknown> = {
      sources: finalized.sources || [],
      answerMode: finalized.answerMode,
      answerClass: finalized.answerClass,
      navType: finalized.navType,
      failureCode: finalized.failureCode || null,
      fallbackReasonCode: finalized.fallbackReasonCode || null,
      provenance: finalized.provenance || null,
      qualityGates: finalized.qualityGates || null,
      userWarning: finalized.userWarning || null,
      warnings: finalized.warnings || [],
      turnKey: finalized.turnKey || draft.turnKey,
      regenerateOfUserMessageId: draft.request.isRegenerate
        ? draft.userMessage.id
        : null,
      priorAssistantMessageId: draft.priorAssistantMessageId || null,
    };
    const assistantMessage = await this.conversationMutationStore.createMessage({
      conversationId: finalized.conversationId,
      role: "assistant",
      content: finalized.assistantText || "",
      userId: draft.request.userId,
      attachments: finalized.attachmentsPayload ?? [],
      telemetry: finalized.assistantTelemetry ?? null,
      metadata,
    });
    await this.memoryContextService.recordConversationMemoryArtifacts({
      messageId: assistantMessage.id,
      conversationId: finalized.conversationId,
      userId: draft.request.userId,
      role: "assistant",
      content: finalized.assistantText || "",
      metadata,
      createdAt: new Date(assistantMessage.createdAt),
    });
    this.traceArtifactsService.endSpan(draft.traceId, outputSpanId, {
      status: "ok",
      metadata: {
        assistantMessageId: assistantMessage.id,
        answerLength: String(finalized.assistantText || "").length,
      },
    });

    await this.traceArtifactsService
      .persistTraceArtifacts({
        traceId: draft.traceId,
        req: draft.request,
        conversationId: draft.conversationId,
        userMessageId: draft.userMessage.id,
        assistantMessageId: assistantMessage.id,
        retrievalPack: draft.retrievalPack,
        evidenceGateDecision: draft.evidenceGateDecision,
        answerMode: draft.answerMode,
        status: finalized.status,
        failureCode: finalized.failureCode || null,
        fallbackReasonCode: draft.fallbackReasonCode,
        fallbackReasonCodeTelemetry: draft.fallbackReasonCodeTelemetry,
        fallbackPolicyMeta: draft.fallbackPolicyMeta || null,
        assistantText: finalized.assistantText || "",
        telemetry: draft.telemetry,
        totalMs: Date.now() - draft.timing.turnStartedAt,
        retrievalMs: draft.timing.retrievalMs,
        llmMs: draft.timing.llmMs,
        stream: draft.timing.stream,
        provenance: finalized.provenance || null,
        truncation: finalized.truncation || null,
      })
      .catch((error) => {
        appLogger.warn("[trace-writer] failed to persist chat trace", {
          traceId: draft.traceId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return this.conversationMutationStore.withGeneratedConversationTitle(
      {
        ...finalized,
        assistantMessageId: assistantMessage.id,
        traceId: draft.traceId,
      },
      draft.generatedConversationTitle || null,
    );
  }

  createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    return this.conversationMutationStore.createConversation(params);
  }

  listConversations(
    userId: string,
    opts?: ConversationListOptions,
  ): Promise<ConversationDTO[]> {
    return this.conversationQueryStore.listConversations(userId, opts);
  }

  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null> {
    return this.conversationQueryStore.getConversation(userId, conversationId);
  }

  getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null> {
    return this.conversationQueryStore.getConversationWithMessages(
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
    return this.conversationMutationStore.updateTitle(
      userId,
      conversationId,
      title,
    );
  }

  deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    return this.conversationMutationStore.deleteConversation(userId, conversationId);
  }

  deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    return this.conversationMutationStore.deleteAllConversations(userId);
  }

  listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]> {
    return this.conversationQueryStore.listMessages(userId, conversationId, opts);
  }

  createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    return this.conversationMutationStore.createMessage(params);
  }

  persistResolvedDocScope(params: {
    traceId: string;
    conversationId: string;
    previousDocId: string | null;
    resolvedDocId: string | null;
    stream: boolean;
  }): Promise<void> {
    return this.conversationMutationStore.persistResolvedDocScope(params);
  }
}
