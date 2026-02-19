import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import type { EncryptedChatRepo } from "../../../services/chat/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../../../services/chat/encryptedChatContext.service";
import {
  ConversationNotFoundError,
  type AnswerClass,
  type AnswerMode,
  type ChatEngine,
  type ChatMessageDTO,
  type ChatRequest,
  type ChatResult,
  type ChatRole,
  type ConversationDTO,
  type ConversationListOptions,
  type ConversationMessagesOptions,
  type ConversationWithMessagesDTO,
  type CreateMessageParams,
  type NavType,
} from "../domain/chat.contracts";
import { ChatRuntimeService as LegacyChatRuntimeService } from "../../../services/chatRuntime.legacy.service";
import { ChatRuntimeOrchestrator } from "../runtime/ChatRuntimeOrchestrator";

export type {
  AnswerClass,
  AnswerMode,
  ChatEngine,
  ChatMessageDTO,
  ChatRequest,
  ChatResult,
  ChatRole,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
  CreateMessageParams,
  NavType,
} from "../domain/chat.contracts";

export { ConversationNotFoundError } from "../domain/chat.contracts";

/**
 * ChatRuntimeService v2 facade
 * - concise, centralized runtime entrypoint
 * - delegates feature execution to legacy runtime while migration is in progress
 * - applies v2 contract normalization + scope/evidence policies in orchestrator
 */
export class ChatRuntimeService {
  private readonly delegate: LegacyChatRuntimeService;
  private readonly orchestrator: ChatRuntimeOrchestrator;
  private readonly useV2: boolean;

  constructor(
    engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
    },
  ) {
    this.delegate = new LegacyChatRuntimeService(engine, opts);
    this.orchestrator = new ChatRuntimeOrchestrator(this.delegate as any);
    this.useV2 = (process.env.CHAT_RUNTIME_V2_ENABLED ?? "true") !== "false";
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!this.useV2) return this.delegate.chat(req);
    return this.orchestrator.chat(req);
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    if (!this.useV2) return this.delegate.streamChat(params);
    return this.orchestrator.streamChat(params);
  }

  async createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    return this.orchestrator.createConversation(params);
  }

  async listConversations(
    userId: string,
    opts: ConversationListOptions = {},
  ): Promise<ConversationDTO[]> {
    return this.orchestrator.listConversations(userId, opts);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null> {
    return this.orchestrator.getConversation(userId, conversationId);
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ConversationWithMessagesDTO | null> {
    return this.orchestrator.getConversationWithMessages(
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
    return this.orchestrator.updateTitle(userId, conversationId, title);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    return this.orchestrator.deleteConversation(userId, conversationId);
  }

  async deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    return this.orchestrator.deleteAllConversations(userId);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ChatMessageDTO[]> {
    return this.orchestrator.listMessages(userId, conversationId, opts);
  }

  async createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    return this.orchestrator.createMessage(params);
  }
}
