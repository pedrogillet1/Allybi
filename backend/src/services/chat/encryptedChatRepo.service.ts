import type { PrismaClient } from "@prisma/client";
import { ConversationKeyService } from "./conversationKey.service";
import { ChatCryptoService } from "./chatCrypto.service";
import { assertNoPlaintext } from "../security/plaintextPolicy";

/**
 * DB-only operations for encrypted chat logs.
 * - Stores contentEncrypted
 * - Leaves content NULL
 */
export class EncryptedChatRepo {
  constructor(
    private prisma: PrismaClient,
    private convoKeys: ConversationKeyService,
    private chatCrypto: ChatCryptoService,
  ) {}

  async saveMessage(
    userId: string,
    conversationId: string,
    role: "user" | "assistant" | "system",
    plaintext: string,
  ) {
    const ck = await this.convoKeys.getConversationKey(userId, conversationId);

    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content: null,
        contentEncrypted: "",
      },
      select: { id: true, role: true },
    });

    const encrypted = this.chatCrypto.encryptMessage(
      userId,
      conversationId,
      msg.id,
      role,
      plaintext,
      ck,
    );

    assertNoPlaintext("Message.content", null);

    await this.prisma.message.update({
      where: { id: msg.id },
      data: { contentEncrypted: encrypted },
    });

    return msg;
  }

  async listMessagesDecrypted(userId: string, conversationId: string, limit = 50) {
    const ck = await this.convoKeys.getConversationKey(userId, conversationId);

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, role: true, contentEncrypted: true, createdAt: true },
    });

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      createdAt: r.createdAt,
      content: r.contentEncrypted
        ? this.chatCrypto.decryptMessage(userId, conversationId, r.id, r.role, r.contentEncrypted, ck)
        : "",
    }));
  }

  async setConversationTitleEncrypted(
    userId: string,
    conversationId: string,
    titlePlain: string,
  ) {
    const ck = await this.convoKeys.getConversationKey(userId, conversationId);
    const titleEnc = this.chatCrypto.encryptTitle(userId, conversationId, titlePlain, ck);

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title: null, titleEncrypted: titleEnc },
    });
  }

  async getConversationTitleDecrypted(
    userId: string,
    conversationId: string,
  ): Promise<string | null> {
    const ck = await this.convoKeys.getConversationKey(userId, conversationId);

    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, titleEncrypted: true, userId: true },
    });
    if (!convo || convo.userId !== userId) throw new Error("Conversation not found");

    if (convo.titleEncrypted) {
      return this.chatCrypto.decryptTitle(userId, conversationId, convo.titleEncrypted, ck);
    }
    return convo.title ?? null;
  }
}
