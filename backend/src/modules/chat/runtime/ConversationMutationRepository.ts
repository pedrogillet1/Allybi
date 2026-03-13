import prisma from "../../../config/database";
import type {
  ConversationDTO,
} from "../domain/chat.contracts";
import { ConversationNotFoundError } from "../domain/chat.contracts";
import {
  isPlaceholderConversationTitle,
  type PersistedTurnIdentity,
  toConversationDTO,
} from "./conversationStoreShared";
import { ConversationTitlePolicy } from "./ConversationTitlePolicy";

export class ConversationMutationRepository {
  constructor(
    private readonly titlePolicy: ConversationTitlePolicy = new ConversationTitlePolicy(),
  ) {}

  async createConversation(params: {
    userId: string;
    title?: string;
  }): Promise<ConversationDTO> {
    const now = new Date();
    const rawTitle = String(params.title ?? "New Chat");
    const contextType = this.titlePolicy.resolveConversationContextType(rawTitle);
    const created = await prisma.conversation.create({
      data: {
        userId: params.userId,
        title: rawTitle,
        createdAt: now,
        updatedAt: now,
        ...(contextType ? { contextType } : {}),
      },
    });
    return this.titlePolicy.toConversationDTO(created);
  }

  async updateTitle(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDTO | null> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conversation) return null;
    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { title, updatedAt: new Date() },
    });
    return toConversationDTO(updated);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ ok: boolean }> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!conversation) return { ok: false };
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { ok: true };
  }

  async deleteAllConversations(
    userId: string,
  ): Promise<{ ok: boolean; deleted: number }> {
    const result = await prisma.conversation.updateMany({
      where: { userId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    return { ok: true, deleted: result.count };
  }

  async ensureConversation(
    userId: string,
    conversationId?: string,
  ): Promise<PersistedTurnIdentity> {
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId, isDeleted: false },
        select: { id: true, title: true, lastDocumentId: true },
      });
      if (!existing) {
        throw new ConversationNotFoundError(
          "Conversation not found for this account.",
        );
      }
      return {
        conversationId: existing.id,
        titleWasPlaceholder: isPlaceholderConversationTitle(existing.title),
        lastDocumentId: existing.lastDocumentId ?? null,
      };
    }
    const created = await this.createConversation({
      userId,
      title: "New Chat",
    });
    return {
      conversationId: created.id,
      titleWasPlaceholder: true,
      lastDocumentId: null,
    };
  }

  async persistResolvedDocScope(params: {
    conversationId: string;
    previousDocId: string | null;
    resolvedDocId: string | null;
  }): Promise<void> {
    if (!params.resolvedDocId || params.resolvedDocId === params.previousDocId) {
      return;
    }
    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { lastDocumentId: params.resolvedDocId },
    });
  }

  async assertConversationAccessForWrite(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const row = await prisma.conversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!row) {
      throw new ConversationNotFoundError(
        "Conversation not found for this account.",
      );
    }
  }
}
