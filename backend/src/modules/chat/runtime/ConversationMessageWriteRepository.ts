import prisma from "../../../config/database";
import type { EncryptedChatRepo } from "../../../modules/chat/infrastructure/encryptedChatRepo.service";
import type {
  ChatMessageDTO,
  ChatRequest,
  ChatRole,
  CreateMessageParams,
} from "../domain/chat.contracts";
import {
  buildMetadataJson,
  EncryptedConversationRepoBinding,
  isRegenerateRequest,
  toMessageDTO,
  type PreparedUserTurn,
} from "./conversationStoreShared";
import type { ConversationQueryStore } from "./ConversationQueryStore";
import { ConversationTitlePolicy } from "./ConversationTitlePolicy";

type ConversationWriteAccess = {
  assertConversationAccessForWrite(
    userId: string,
    conversationId: string,
  ): Promise<void>;
};

export class ConversationMessageWriteRepository {
  private readonly encryption = new EncryptedConversationRepoBinding();

  constructor(
    private readonly queryStore: ConversationQueryStore,
    private readonly titlePolicy: ConversationTitlePolicy,
    private readonly accessRepository: ConversationWriteAccess,
    encryptedRepo?: EncryptedChatRepo,
  ) {
    if (encryptedRepo) this.encryption.wireEncryption(encryptedRepo);
  }

  wireEncryption(encryptedRepo: EncryptedChatRepo): void {
    this.encryption.wireEncryption(encryptedRepo);
    this.queryStore.wireEncryption(encryptedRepo);
  }

  async createMessage(params: CreateMessageParams): Promise<ChatMessageDTO> {
    await this.accessRepository.assertConversationAccessForWrite(
      params.userId,
      params.conversationId,
    );
    const now = new Date();
    const { mergedMetadata, metadataJson } = buildMetadataJson({
      metadata: params.metadata || {},
      attachments: params.attachments,
      telemetry: params.telemetry ?? null,
    });
    const encryptedRepo = this.encryption.getEncryptedRepo();

    if (encryptedRepo) {
      const saved = await encryptedRepo.saveMessageWithMetadata({
        userId: params.userId,
        conversationId: params.conversationId,
        role: params.role,
        plaintext: params.content ?? "",
        metadataJson,
        updatedAt: now,
      });
      await this.maybeAutoTitle(params, now);
      return {
        id: saved.id,
        role: saved.role as ChatRole,
        content: params.content ?? "",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        attachments: mergedMetadata.attachments ?? null,
        telemetry:
          (mergedMetadata.telemetry as Record<string, unknown> | null) ?? null,
        metadata: mergedMetadata,
      };
    }

    const created = await prisma.$transaction(async (transaction) => {
      const message = await transaction.message.create({
        data: {
          conversationId: params.conversationId,
          role: params.role,
          content: params.content ?? "",
          createdAt: now,
          ...(metadataJson ? { metadata: metadataJson } : {}),
        },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
          metadata: true,
        },
      });

      await transaction.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: now },
      });
      return message;
    });

    await this.maybeAutoTitle(params, now);
    return toMessageDTO(created);
  }

  async prepareUserTurn(
    req: ChatRequest,
    conversationId: string,
  ): Promise<PreparedUserTurn> {
    if (!isRegenerateRequest(req)) {
      return {
        userMessage: await this.createMessage({
          conversationId,
          role: "user",
          content: req.message,
          userId: req.userId,
        }),
        priorAssistantMessageId: null,
      };
    }

    const recent = await this.queryStore.listMessages(req.userId, conversationId, {
      limit: 20,
      order: "desc",
    });
    const latestUser = recent.find((message) => message.role === "user");
    if (!latestUser) {
      return {
        userMessage: await this.createMessage({
          conversationId,
          role: "user",
          content: req.message,
          userId: req.userId,
        }),
        priorAssistantMessageId: null,
      };
    }

    const latestUserIndex = recent.findIndex((message) => message.id === latestUser.id);
    const priorAssistant =
      latestUserIndex >= 0
        ? recent
            .slice(0, latestUserIndex)
            .find((message) => message.role === "assistant") || null
        : null;
    return {
      userMessage: latestUser,
      priorAssistantMessageId: priorAssistant?.id || null,
    };
  }

  private async maybeAutoTitle(
    params: Pick<CreateMessageParams, "conversationId" | "role" | "content">,
    now: Date,
  ): Promise<void> {
    await this.titlePolicy.maybeAutoTitleConversationFromFirstUserMessage({
      conversationId: params.conversationId,
      role: params.role,
      content: params.content ?? "",
      now,
    });
  }
}
