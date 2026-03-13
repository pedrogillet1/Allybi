import type { PrismaClient } from "@prisma/client";
import { ConversationKeyService } from "./conversationKey.service";
import { ChatCryptoService } from "./chatCrypto.service";
import crypto from "crypto";
import { assertNoPlaintext } from "../../../services/security/plaintextPolicy";

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

    const messageId = crypto.randomUUID();

    const encrypted = this.chatCrypto.encryptMessage(
      userId,
      conversationId,
      messageId,
      role,
      plaintext,
      ck,
    );

    const msg = await this.prisma.message.create({
      data: {
        id: messageId,
        conversationId,
        role,
        content: null,
        contentEncrypted: encrypted,
      },
      select: { id: true, role: true },
    });

    return msg;
  }

  async saveMessageWithMetadata(params: {
    userId: string;
    conversationId: string;
    role: "user" | "assistant" | "system";
    plaintext: string;
    metadataJson?: string | null;
    updatedAt?: Date;
  }) {
    const ck = await this.convoKeys.getConversationKey(
      params.userId,
      params.conversationId,
    );
    const messageId = crypto.randomUUID();
    const encrypted = this.chatCrypto.encryptMessage(
      params.userId,
      params.conversationId,
      messageId,
      params.role,
      params.plaintext,
      ck,
    );
    const now = params.updatedAt ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          id: messageId,
          conversationId: params.conversationId,
          role: params.role,
          content: null,
          contentEncrypted: encrypted,
          metadata: params.metadataJson ?? null,
        },
        select: { id: true, role: true },
      });

      const updated = await tx.conversation.updateMany({
        where: {
          id: params.conversationId,
          userId: params.userId,
          isDeleted: false,
        },
        data: { updatedAt: now },
      });
      if (updated.count === 0) {
        throw new Error("Conversation not found for this account.");
      }

      return msg;
    });
  }

  async listMessagesDecrypted(
    userId: string,
    conversationId: string,
    limit = 50,
    fromLatest = false,
  ) {
    const ck = await this.convoKeys.getConversationKey(userId, conversationId);

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: fromLatest ? "desc" : "asc" },
      take: limit,
      select: {
        id: true,
        role: true,
        contentEncrypted: true,
        createdAt: true,
        metadata: true,
      },
    });
    const orderedRows = fromLatest ? [...rows].reverse() : rows;

    return orderedRows.map((r) => ({
      id: r.id,
      role: r.role,
      createdAt: r.createdAt,
      content: r.contentEncrypted
        ? this.chatCrypto.decryptMessage(
            userId,
            conversationId,
            r.id,
            r.role,
            r.contentEncrypted,
            ck,
          )
        : "",
      metadata: r.metadata,
    }));
  }

  async setConversationTitleEncrypted(
    userId: string,
    conversationId: string,
    titlePlain: string,
  ) {
    const ck = await this.convoKeys.getConversationKey(userId, conversationId);
    const titleEnc = this.chatCrypto.encryptTitle(
      userId,
      conversationId,
      titlePlain,
      ck,
    );

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
    if (!convo || convo.userId !== userId)
      throw new Error("Conversation not found");

    if (convo.titleEncrypted) {
      return this.chatCrypto.decryptTitle(
        userId,
        conversationId,
        convo.titleEncrypted,
        ck,
      );
    }
    return convo.title ?? null;
  }
}
