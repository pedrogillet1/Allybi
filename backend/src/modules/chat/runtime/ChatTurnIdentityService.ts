import type { ChatRequest } from "../domain/chat.contracts";
import type { EncryptedChatRepo } from "../infrastructure/encryptedChatRepo.service";
import type { ConversationMutationStore } from "./ConversationMutationStore";
import type { ChatMemoryContextService } from "./ChatMemoryContextService";
import type { PreparedTurnIdentity } from "./turnExecutionDraft";
import { resolveRequestTraceId } from "./chatRuntimeTraceId";

export class ChatTurnIdentityService {
  constructor(
    private readonly conversationStore: ConversationMutationStore,
    private readonly memoryContextService: ChatMemoryContextService,
  ) {}

  wireEncryption(encryptedRepo: EncryptedChatRepo): void {
    this.conversationStore.wireEncryption(encryptedRepo);
  }

  async prepareTurnIdentity(req: ChatRequest): Promise<PreparedTurnIdentity> {
    const traceId = resolveRequestTraceId(req);
    const turnStartedAt = Date.now();
    const conversation = await this.conversationStore.ensureConversation(
      req.userId,
      req.conversationId,
    );
    const turnIdentity = await this.conversationStore.prepareUserTurn(
      req,
      conversation.conversationId,
    );
    if (!req.isRegenerate) {
      await this.memoryContextService.recordConversationMemoryArtifacts({
        messageId: turnIdentity.userMessage.id,
        conversationId: conversation.conversationId,
        userId: req.userId,
        role: "user",
        content: req.message,
        metadata: {},
        createdAt: new Date(turnIdentity.userMessage.createdAt),
      });
    }
    const generatedConversationTitle =
      await this.conversationStore.resolveGeneratedTitleForTurn({
        conversationId: conversation.conversationId,
        titleWasPlaceholder: conversation.titleWasPlaceholder,
      });
    return {
      traceId,
      turnStartedAt,
      conversationId: conversation.conversationId,
      lastDocumentId: conversation.lastDocumentId,
      generatedConversationTitle,
      userMessage: turnIdentity.userMessage,
      priorAssistantMessageId: turnIdentity.priorAssistantMessageId,
    };
  }
}
