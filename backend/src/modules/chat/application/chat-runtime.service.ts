import type {
  LLMStreamingConfig,
  StreamSink,
} from "../../../services/llm/types/llmStreaming.types";
import type { EncryptedChatRepo } from "../../../modules/chat/infrastructure/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "../../../modules/chat/infrastructure/encryptedChatContext.service";
import { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
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
import { ChatRuntimeOrchestrator } from "../runtime/ChatRuntimeOrchestrator";
import { ChatTurnExecutor } from "../runtime/ChatTurnExecutor";
import {
  createChatRuntimeFacade,
  type ChatRuntimeFactoryOptions,
} from "./chat-runtime.factory";

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
 * - single runtime delegate (no legacy chat runtime import path)
 * - applies contract normalization + scope/evidence policies in orchestrator
 */
export class ChatRuntimeService {
  private readonly executor: ChatTurnExecutor;
  private readonly orchestrator: ChatRuntimeOrchestrator;

  constructor(
    engine: ChatEngine,
    opts: ChatRuntimeFactoryOptions = {},
  ) {
    const runtime = createChatRuntimeFacade(engine, opts);
    this.executor = runtime.executor;
    this.orchestrator = runtime.orchestrator;
  }

  wireEncryption(
    encryptedRepo: EncryptedChatRepo,
    encryptedContext?: EncryptedChatContextService,
  ): void {
    this.executor.wireEncryption(encryptedRepo, encryptedContext);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    return this.orchestrator.chat(req);
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
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
