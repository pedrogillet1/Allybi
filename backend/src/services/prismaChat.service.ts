import type { StreamSink, LLMStreamingConfig } from "./llm/types/llmStreaming.types";
import { ChatRuntimeService } from "./chatRuntime.service";
import { ConversationNotFoundError } from "./chatRuntime.contracts";
import type {
  ChatEngine,
  ChatRole,
  ChatRequest,
  ChatResult,
  ChatMessageDTO,
  ConversationDTO,
  ConversationWithMessagesDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  CreateMessageParams,
  PrismaChatServicePort,
  AnswerMode,
  AnswerClass,
  NavType,
} from "./chatRuntime.contracts";
import type { EncryptedChatRepo } from "./chat/encryptedChatRepo.service";
import type { EncryptedChatContextService } from "./chat/encryptedChatContext.service";
import { ChatKernelService } from "./chat/chatKernel.service";

export type {
  ChatEngine,
  ChatRole,
  ChatRequest,
  ChatResult,
  ChatMessageDTO,
  ConversationDTO,
  ConversationWithMessagesDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  CreateMessageParams,
  PrismaChatServicePort,
  AnswerMode,
  AnswerClass,
  NavType,
};

export { ConversationNotFoundError };

/**
 * Centralized chat service entrypoint:
 * - Single public PrismaChatService surface for routes/controllers
 * - Uses core implementation for persistence + shared operations
 * - Optionally routes turns through ChatKernelService
 */
export class PrismaChatService implements PrismaChatServicePort {
  private readonly runtime: ChatRuntimeService;
  private readonly kernel: ChatKernelService;
  private readonly useKernel: boolean;

  constructor(
    engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
    },
  ) {
    this.runtime = new ChatRuntimeService(engine, opts);
    // Staged cutover switch for centralized turn routing.
    // default=true preserves current behavior unless explicitly disabled.
    this.useKernel = (process.env.PRISMA_CHAT_KERNEL_ENABLED ?? "true") !== "false";
    this.kernel = new ChatKernelService({
      chat: (req: ChatRequest) => this.runtime.chat(req),
      streamChat: (params: { req: ChatRequest; sink: StreamSink; streamingConfig: LLMStreamingConfig }) =>
        this.runtime.streamChat(params),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!this.useKernel) return this.runtime.chat(req);
    return this.kernel.handleTurn(req);
  }

  async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    if (!this.useKernel) return this.runtime.streamChat(params);
    return this.kernel.streamTurn(params);
  }

  async createConversation(params: { userId: string; title?: string }): Promise<ConversationDTO> {
    return this.runtime.createConversation(params);
  }

  async listConversations(userId: string, opts: ConversationListOptions = {}): Promise<ConversationDTO[]> {
    return this.runtime.listConversations(userId, opts);
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationDTO | null> {
    return this.runtime.getConversation(userId, conversationId);
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ConversationWithMessagesDTO | null> {
    return this.runtime.getConversationWithMessages(userId, conversationId, opts);
  }

  async updateTitle(userId: string, conversationId: string, title: string): Promise<ConversationDTO | null> {
    return this.runtime.updateTitle(userId, conversationId, title);
  }

  async deleteConversation(userId: string, conversationId: string): Promise<{ ok: boolean }> {
    return this.runtime.deleteConversation(userId, conversationId);
  }

  async deleteAllConversations(userId: string): Promise<{ ok: boolean; deleted: number }> {
    return this.runtime.deleteAllConversations(userId);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ChatMessageDTO[]> {
    return this.runtime.listMessages(userId, conversationId, opts);
  }

  async createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    return this.runtime.createMessage(params);
  }
}
