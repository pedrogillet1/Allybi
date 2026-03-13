import prisma from "../../../config/database";
import type { EncryptedChatRepo } from "../../../modules/chat/infrastructure/encryptedChatRepo.service";
import type {
  ChatMessageDTO,
  ConversationDTO,
  ConversationListOptions,
  ConversationMessagesOptions,
  ConversationWithMessagesDTO,
} from "../domain/chat.contracts";
import {
  clampLimit,
  EncryptedConversationRepoBinding,
  toConversationDTO,
  toMessageDTO,
} from "./conversationStoreShared";

export class ConversationQueryStore {
  private readonly encryption = new EncryptedConversationRepoBinding();

  constructor(encryptedRepo?: EncryptedChatRepo) {
    if (encryptedRepo) this.encryption.wireEncryption(encryptedRepo);
  }

  wireEncryption(encryptedRepo: EncryptedChatRepo): void {
    this.encryption.wireEncryption(encryptedRepo);
  }

  async listConversations(
    userId: string,
    opts: ConversationListOptions = {},
  ): Promise<ConversationDTO[]> {
    const limit = clampLimit(opts.limit, 50);
    const rows = await prisma.conversation.findMany({
      where: {
        userId,
        isDeleted: false,
        OR: [{ contextType: null }, { contextType: { notIn: ["viewer", "editor"] } }],
        NOT: [
          { title: { startsWith: "__viewer__:" } },
          { title: { startsWith: "__editor__:" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    return rows.map(toConversationDTO);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDTO | null> {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    return row ? toConversationDTO(row) : null;
  }

  async getConversationWithMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ConversationWithMessagesDTO | null> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
    });
    if (!conversation) return null;

    const limit = clampLimit(opts.limit, 200);
    const encryptedRepo = this.encryption.getEncryptedRepo();
    if (encryptedRepo) {
      const decrypted = await encryptedRepo.listMessagesDecrypted(
        userId,
        conversationId,
        limit,
      );
      const ordered = opts.order === "desc" ? [...decrypted].reverse() : decrypted;
      return {
        ...toConversationDTO(conversation),
        messages: ordered.map((message) =>
          toMessageDTO({
            id: message.id,
            role: String(message.role),
            content: message.content,
            createdAt: message.createdAt,
            updatedAt: message.createdAt,
            metadata: message.metadata ?? null,
          }),
        ),
      };
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: opts.order === "desc" ? "desc" : "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });
    return {
      ...toConversationDTO(conversation),
      messages: rows.map(toMessageDTO),
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts: ConversationMessagesOptions = {},
  ): Promise<ChatMessageDTO[]> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conversation) return [];

    const limit = clampLimit(opts.limit, 200);
    const encryptedRepo = this.encryption.getEncryptedRepo();
    if (encryptedRepo) {
      const decrypted = await encryptedRepo.listMessagesDecrypted(
        userId,
        conversationId,
        limit,
      );
      const ordered = opts.order === "desc" ? [...decrypted].reverse() : decrypted;
      return ordered.map((message) =>
        toMessageDTO({
          id: message.id,
          role: String(message.role),
          content: message.content,
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
          metadata: message.metadata ?? null,
        }),
      );
    }

    const rows = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: opts.order === "desc" ? "desc" : "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });
    return rows.map(toMessageDTO);
  }
}
