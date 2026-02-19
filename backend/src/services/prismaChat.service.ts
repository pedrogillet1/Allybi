import type { StreamSink, LLMStreamingConfig } from "./llm/types/llmStreaming.types";
import {
  PrismaChatCoreService,
  ConversationNotFoundError,
} from "./prismaChat.legacy.service";
import type {
  ChatEngine,
  ChatRole,
  ChatRequest,
  ChatResult,
  ChatMessageDTO,
  ConversationDTO,
  ConversationWithMessagesDTO,
  AnswerMode,
  AnswerClass,
  NavType,
} from "./prismaChat.legacy.service";
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
export class PrismaChatService extends PrismaChatCoreService {
  private readonly kernel: ChatKernelService;
  private readonly useKernel: boolean;

  constructor(
    engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
    },
  ) {
    super(engine, opts);
    // Staged cutover switch for centralized turn routing.
    // default=true preserves current behavior unless explicitly disabled.
    this.useKernel = (process.env.PRISMA_CHAT_KERNEL_ENABLED ?? "true") !== "false";
    this.kernel = new ChatKernelService({
      chat: (req: ChatRequest) => super.chat(req),
      streamChat: (params: { req: ChatRequest; sink: StreamSink; streamingConfig: LLMStreamingConfig }) =>
        super.streamChat(params),
    });
  }

  override async chat(req: ChatRequest): Promise<ChatResult> {
    if (!this.useKernel) return super.chat(req);
    return this.kernel.handleTurn(req);
  }

  override async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    if (!this.useKernel) return super.streamChat(params);
    return this.kernel.streamTurn(params);
  }
}
