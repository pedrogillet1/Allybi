import type { StreamSink, LLMStreamingConfig } from "./llm/types/llmStreaming.types";
import {
  PrismaChatService as PrismaChatLegacyService,
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
 * Thin chat facade:
 * - Keeps persistence + legacy operational paths available via inheritance
 * - Routes turn handling through ChatKernelService
 */
export class PrismaChatService extends PrismaChatLegacyService {
  private readonly kernel: ChatKernelService;

  constructor(
    engine: ChatEngine,
    opts?: {
      encryptedRepo?: EncryptedChatRepo;
      encryptedContext?: EncryptedChatContextService;
    },
  ) {
    super(engine, opts);
    this.kernel = new ChatKernelService({
      chat: (req: ChatRequest) => super.chat(req),
      streamChat: (params: { req: ChatRequest; sink: StreamSink; streamingConfig: LLMStreamingConfig }) =>
        super.streamChat(params),
    });
  }

  override async chat(req: ChatRequest): Promise<ChatResult> {
    return this.kernel.handleTurn(req);
  }

  override async streamChat(params: {
    req: ChatRequest;
    sink: StreamSink;
    streamingConfig: LLMStreamingConfig;
  }): Promise<ChatResult> {
    return this.kernel.streamTurn(params);
  }
}
