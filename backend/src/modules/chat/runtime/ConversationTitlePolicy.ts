import prisma from "../../../config/database";
import type {
  ChatResult,
  ChatRole,
} from "../domain/chat.contracts";
import {
  deriveAutoConversationTitleFromMessage,
  isPlaceholderConversationTitle,
  toConversationDTO,
  withGeneratedConversationTitle,
} from "./conversationStoreShared";

export class ConversationTitlePolicy {
  resolveConversationContextType(title?: string): "viewer" | "editor" | null {
    const rawTitle = String(title ?? "New Chat");
    const lowered = rawTitle.toLowerCase();
    if (lowered.startsWith("__viewer__:")) return "viewer";
    if (lowered.startsWith("__editor__:")) return "editor";
    return null;
  }

  async resolveGeneratedTitleForTurn(input: {
    conversationId: string;
    titleWasPlaceholder: boolean;
  }): Promise<string | null> {
    if (!input.titleWasPlaceholder) return null;
    const row = await prisma.conversation.findFirst({
      where: { id: input.conversationId, isDeleted: false },
      select: { title: true },
    });
    const title = String(row?.title || "").trim();
    if (!title || isPlaceholderConversationTitle(title)) return null;
    return title;
  }

  withGeneratedConversationTitle(
    result: ChatResult,
    generatedTitle: string | null,
  ): ChatResult {
    return withGeneratedConversationTitle(result, generatedTitle);
  }

  async maybeAutoTitleConversationFromFirstUserMessage(input: {
    conversationId: string;
    role: ChatRole;
    content: string;
    now: Date;
  }): Promise<void> {
    if (input.role !== "user") return;

    const titleCandidate = deriveAutoConversationTitleFromMessage(input.content, {
      maxWords: 10,
      maxChars: 80,
    });
    if (!titleCandidate) return;

    const existing = await prisma.conversation.findFirst({
      where: { id: input.conversationId, isDeleted: false },
      select: { title: true },
    });
    if (!existing || !isPlaceholderConversationTitle(existing.title)) return;

    await prisma.conversation.updateMany({
      where: {
        id: input.conversationId,
        isDeleted: false,
        ...(existing.title === null ? { title: null } : { title: existing.title }),
      },
      data: {
        title: titleCandidate,
        updatedAt: input.now,
      },
    });
  }

  toConversationDTO = toConversationDTO;
}
