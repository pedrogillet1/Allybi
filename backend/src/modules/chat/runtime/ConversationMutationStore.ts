import type { EncryptedChatRepo } from "../../../modules/chat/infrastructure/encryptedChatRepo.service";
import type {
  ChatRequest,
  ChatResult,
  ConversationDTO,
  CreateMessageParams,
} from "../domain/chat.contracts";
import {
  type PersistedTurnIdentity,
  type PreparedUserTurn,
} from "./conversationStoreShared";
import type { ConversationQueryStore } from "./ConversationQueryStore";
import { ConversationTitlePolicy } from "./ConversationTitlePolicy";
import { ConversationMutationRepository } from "./ConversationMutationRepository";
import { ConversationMessageWriteRepository } from "./ConversationMessageWriteRepository";

export class ConversationMutationStore {
  private readonly titlePolicy: ConversationTitlePolicy;
  private readonly mutationRepository: ConversationMutationRepository;
  private readonly messageWriteRepository: ConversationMessageWriteRepository;

  constructor(
    private readonly queryStore: ConversationQueryStore,
    encryptedRepo?: EncryptedChatRepo,
    titlePolicy: ConversationTitlePolicy = new ConversationTitlePolicy(),
  ) {
    this.titlePolicy = titlePolicy;
    this.mutationRepository = new ConversationMutationRepository(titlePolicy);
    this.messageWriteRepository = new ConversationMessageWriteRepository(
      queryStore,
      titlePolicy,
      this.mutationRepository,
      encryptedRepo,
    );
  }

  wireEncryption(encryptedRepo: EncryptedChatRepo): void {
    this.messageWriteRepository.wireEncryption(encryptedRepo);
  }

  async createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    return this.mutationRepository.createConversation(params);
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null> {
    return this.mutationRepository.updateTitle(userId, conversationId, title);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    return this.mutationRepository.deleteConversation(userId, conversationId);
  }

  async deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    return this.mutationRepository.deleteAllConversations(userId);
  }

  async createMessage(params: CreateMessageParams) {
    return this.messageWriteRepository.createMessage(params);
  }

  async ensureConversation(
    userId: string,
    conversationId?: string,
  ): Promise<PersistedTurnIdentity> {
    return this.mutationRepository.ensureConversation(userId, conversationId);
  }

  async prepareUserTurn(
    req: ChatRequest,
    conversationId: string,
  ): Promise<PreparedUserTurn> {
    return this.messageWriteRepository.prepareUserTurn(req, conversationId);
  }

  async resolveGeneratedTitleForTurn(input: {
    conversationId: string;
    titleWasPlaceholder: boolean;
  }): Promise<string | null> {
    return this.titlePolicy.resolveGeneratedTitleForTurn(input);
  }

  withGeneratedConversationTitle(
    result: ChatResult,
    generatedTitle: string | null,
  ): ChatResult {
    return this.titlePolicy.withGeneratedConversationTitle(result, generatedTitle);
  }

  async persistResolvedDocScope(params: {
    traceId: string;
    conversationId: string;
    previousDocId: string | null;
    resolvedDocId: string | null;
    stream: boolean;
  }): Promise<void> {
    void params.traceId;
    void params.stream;
    return this.mutationRepository.persistResolvedDocScope({
      conversationId: params.conversationId,
      previousDocId: params.previousDocId,
      resolvedDocId: params.resolvedDocId,
    });
  }
}
