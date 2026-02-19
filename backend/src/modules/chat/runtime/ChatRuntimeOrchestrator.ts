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
import { ContractNormalizer } from "./ContractNormalizer";
import { EvidenceValidator } from "./EvidenceValidator";
import { ScopeService } from "./ScopeService";

type RuntimeDelegate = {
  chat(req: ChatRequest): Promise<ChatResult>;
  streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
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

export class ChatRuntimeOrchestrator {
  private readonly normalizer = new ContractNormalizer();
  private readonly evidenceValidator = new EvidenceValidator();
  private readonly scopeService = new ScopeService();

  constructor(private readonly delegate: RuntimeDelegate) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(req);
    const raw = await this.delegate.chat(preparedReq);
    return this.postProcess(preparedReq, raw);
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    const preparedReq = await this.prepareRequest(params.req);
    const raw = await this.delegate.streamChat({
      ...params,
      req: preparedReq,
    });
    return this.postProcess(preparedReq, raw);
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
    return this.delegate.getConversationWithMessages(userId, conversationId, opts);
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
    if (!conversationId) return next;

    if (this.scopeService.shouldClearScope(req)) {
      await this.scopeService.clearConversationScope(req.userId, conversationId);
      next.attachedDocumentIds = [];
      return next;
    }

    if ((next.attachedDocumentIds || []).length > 0) {
      return next;
    }

    const persisted = await this.scopeService.getConversationScope(
      req.userId,
      conversationId,
    );
    if (persisted.length > 0) {
      next.attachedDocumentIds = persisted;
    }
    return next;
  }

  private async postProcess(req: ChatRequest, result: ChatResult): Promise<ChatResult> {
    const normalized = this.normalizer.normalize(result);
    const conversationId = String(result.conversationId || "").trim();
    if (!conversationId) return normalized;

    if (this.scopeService.shouldClearScope(req)) {
      await this.scopeService.clearConversationScope(req.userId, conversationId);
    }

    const attachedScope = this.scopeService.attachedScope(req);
    if (attachedScope.length > 0) {
      await this.scopeService.setConversationScope(req.userId, conversationId, attachedScope);
    }

    const persistedScope = await this.scopeService.getConversationScope(
      req.userId,
      conversationId,
    );

    const scopeForValidation = attachedScope.length > 0 ? attachedScope : persistedScope;
    const scoped = this.evidenceValidator.enforceScope(normalized, scopeForValidation);

    // Keep compatibility flags coherent.
    if (scoped.status !== "success" && !scoped.fallbackReasonCode && scoped.failureCode) {
      scoped.fallbackReasonCode = scoped.failureCode;
    }

    return scoped;
  }
}
