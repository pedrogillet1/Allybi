import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import type {
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
} from "../domain/chat.contracts";
import { ScopeService } from "./ScopeService";
import { TurnFinalizationService } from "./TurnFinalizationService";
import {
  type PreparedTurnIdentity,
  type TurnExecutionDraft,
} from "./turnExecutionDraft";
import { ScopeMentionResolver } from "./ScopeMentionResolver";
import { RuntimePolicyGate } from "./RuntimePolicyGate";
import { buildBlockedTurnDraft } from "./BlockedTurnDraftBuilder";

export type RuntimeDelegate = {
  prepareTurnIdentity(req: ChatRequest): Promise<PreparedTurnIdentity>;
  executePreparedTurn(params: {
    req: ChatRequest;
    prepared: PreparedTurnIdentity;
    stream: boolean;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<TurnExecutionDraft>;
  persistFinalizedTurn(params: {
    draft: TurnExecutionDraft;
    finalized: ChatResult;
  }): Promise<ChatResult>;
  createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO>;
  listConversations(
    userId: string,
    opts?: ConversationListOptions,
  ): Promise<ConversationDTO[]>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null>;
  getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null>;
  updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null>;
  deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }>;
  deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }>;
  listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]>;
  createMessage(params: CreateMessageParams): Promise<ChatMessageDTO>;
};

type ChatRuntimeOrchestratorDeps = {
  scopeService: ScopeService;
  scopeMentionResolver: ScopeMentionResolver;
  finalizationService?: TurnFinalizationService;
  runtimePolicyGate?: RuntimePolicyGate;
};

export class ChatRuntimeOrchestrator {
  private readonly finalizationService: TurnFinalizationService;
  private readonly runtimePolicyGate: RuntimePolicyGate;

  constructor(
    private readonly delegate: RuntimeDelegate,
    private readonly deps: ChatRuntimeOrchestratorDeps,
  ) {
    this.finalizationService =
      deps.finalizationService || new TurnFinalizationService();
    this.runtimePolicyGate = deps.runtimePolicyGate || new RuntimePolicyGate();
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(req);
    return this.runTurnPipeline({
      req: preparedReq,
      stream: false,
    });
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(params.req);
    return this.runTurnPipeline({
      req: preparedReq,
      stream: true,
      sink: params.sink,
      streamingConfig: params.streamingConfig,
    });
  }

  async createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    return this.delegate.createConversation(params);
  }

  async listConversations(
    userId: string,
    opts?: ConversationListOptions,
  ): Promise<ConversationDTO[]> {
    return this.delegate.listConversations(userId, opts);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null> {
    return this.delegate.getConversation(userId, conversationId);
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ConversationWithMessagesDTO | null> {
    return this.delegate.getConversationWithMessages(
      userId,
      conversationId,
      opts,
    );
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null> {
    return this.delegate.updateTitle(userId, conversationId, title);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    return this.delegate.deleteConversation(userId, conversationId);
  }

  async deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    return this.delegate.deleteAllConversations(userId);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts?: ConversationMessagesOptions,
  ): Promise<ChatMessageDTO[]> {
    return this.delegate.listMessages(userId, conversationId, opts);
  }

  async createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    return this.delegate.createMessage(params);
  }

  private async prepareRequest(req: ChatRequest): Promise<ChatRequest> {
    const next: ChatRequest = {
      ...req,
      attachedDocumentIds: Array.isArray(req.attachedDocumentIds)
        ? [...req.attachedDocumentIds]
        : [],
    };
    const conversationId = String(req.conversationId || "").trim();

    if (
      conversationId &&
      this.deps.scopeService.shouldClearScope(req)
    ) {
      await this.deps.scopeService.clearConversationScope(
        req.userId,
        conversationId,
      );
      next.attachedDocumentIds = [];
      return next;
    }

    const explicitScope = this.deps.scopeService.attachedScope(next);
    if (explicitScope.length > 0) {
      const narrowed = await this.deps.scopeMentionResolver.detect(
        req.userId,
        req.message,
        { restrictToDocumentIds: explicitScope },
      );
      next.attachedDocumentIds = narrowed.length > 0 ? narrowed : explicitScope;
      return next;
    }

    if (!conversationId) {
      const detected = await this.deps.scopeMentionResolver.detect(
        req.userId,
        req.message,
      );
      if (detected.length > 0) {
        next.attachedDocumentIds = detected;
      }
      return next;
    }

    const persisted = await this.deps.scopeService.getConversationScope(
      req.userId,
      conversationId,
    );
    if (persisted.length > 0) {
      const narrowed = await this.deps.scopeMentionResolver.detect(
        req.userId,
        req.message,
        { restrictToDocumentIds: persisted },
      );
      next.attachedDocumentIds = narrowed.length > 0 ? narrowed : persisted;
      return next;
    }

    const detected = await this.deps.scopeMentionResolver.detect(
      req.userId,
      req.message,
    );
    if (detected.length > 0) {
      next.attachedDocumentIds = detected;
    }
    return next;
  }

  private async runTurnPipeline(params: {
    req: ChatRequest;
    stream: boolean;
    sink?: StreamSink;
    streamingConfig?: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const prepared = await this.delegate.prepareTurnIdentity(params.req);
    const policyDecision = this.runtimePolicyGate.evaluate(params.req);
    const draft = policyDecision.blocked
      ? buildBlockedTurnDraft({
          req: params.req,
          prepared,
          decision: policyDecision,
          stream: params.stream,
        })
      : await this.delegate.executePreparedTurn({
          req: params.req,
          prepared,
          stream: params.stream,
          sink: params.sink,
          streamingConfig: params.streamingConfig,
        });

    const conversationId = String(draft.conversationId || "").trim();
    if (conversationId) {
      if (this.deps.scopeService.shouldClearScope(params.req)) {
        await this.deps.scopeService.clearConversationScope(
          params.req.userId,
          conversationId,
        );
      }

      const attachedScope = this.deps.scopeService.attachedScope(params.req);
      if (attachedScope.length > 0) {
        await this.deps.scopeService.setConversationScope(
          params.req.userId,
          conversationId,
          attachedScope,
        );
      }
    }

    const scopeDocumentIds = conversationId
      ? await this.deps.scopeService.getConversationScope(
          params.req.userId,
          conversationId,
        )
      : this.deps.scopeService.attachedScope(params.req);
    const finalized = await this.finalizationService.finalize(draft, {
      request: params.req,
      scopeDocumentIds,
    });
    return this.delegate.persistFinalizedTurn({
      draft,
      finalized,
    });
  }
}
