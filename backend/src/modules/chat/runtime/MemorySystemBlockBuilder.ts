import prisma from "../../../config/database";
import type { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import type { ChatRole } from "../domain/chat.contracts";
import {
  asObject,
  sanitizeSnippet,
  toStringArray,
} from "./chatMemoryShared";
import type { MemoryRuntimeConfigProvider } from "./chatMemory.types";
import { QuerySemanticSignals } from "./QuerySemanticSignals";

export class MemorySystemBlockBuilder {
  constructor(
    private readonly conversationMemory: ConversationMemoryService,
    private readonly configProvider: MemoryRuntimeConfigProvider,
    private readonly querySignals: QuerySemanticSignals,
  ) {}

  async buildMemorySystemBlocks(params: {
    conversationId: string;
    userId: string;
    queryText: string;
  }): Promise<Array<{ role: ChatRole; content: string }>> {
    const cfg = this.configProvider.getMemoryRuntimeTuning();
    const blocks: Array<{ role: ChatRole; content: string }> = [];
    const keywords = this.querySignals.extractQueryKeywords(params.queryText);
    const memoryStoreCfg = asObject(cfg.memoryArtifactStore);
    const recallBufferMaxItems = Math.max(
      cfg.memoryRecallMaxItems,
      Number(memoryStoreCfg.recallBufferMaxItems || 0) || 0,
    );
    const keyTopicMaxItems = Math.max(
      1,
      Number(memoryStoreCfg.keyTopicMaxItems || 0) || 0,
    );

    let memoryMeta: Record<string, unknown> = {};
    try {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.conversationId,
          userId: params.userId,
          isDeleted: false,
        },
        select: {
          summary: true,
          contextMeta: true,
        },
      });
      const contextMeta = asObject(conversation?.contextMeta);
      memoryMeta = asObject(contextMeta.memory);
    } catch {
      memoryMeta = {};
    }

    const stateSummary = sanitizeSnippet(
      String(memoryMeta.summary || "").trim() || cfg.defaultStateSummary,
      cfg.memorySummaryMaxChars,
    );
    const currentTopic = String(memoryMeta.currentTopic || "").trim();
    if (stateSummary) {
      blocks.push({
        role: "system",
        content: [
          "CONVERSATION_MEMORY_STATE",
          `summary: ${stateSummary}`,
          `topic: ${currentTopic || cfg.defaultStateTopic}`,
        ].join("\n"),
      });
    }

    const keyTopics = toStringArray(memoryMeta.keyTopics).slice(0, keyTopicMaxItems);
    const turnsSinceLastSummary = Number(memoryMeta.turnsSinceLastSummary);
    if (keyTopics.length > 0 || Number.isFinite(turnsSinceLastSummary)) {
      blocks.push({
        role: "system",
        content: [
          "CONVERSATION_CONTEXT_MEMORY",
          keyTopics.length > 0 ? `keyTopics: ${keyTopics.join(", ")}` : null,
          Number.isFinite(turnsSinceLastSummary)
            ? `turnsSinceLastSummary: ${Math.max(0, Math.floor(turnsSinceLastSummary))}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    const recallCandidates: Array<{ summary: string; createdAt: number }> = [];
    for (const entry of Array.isArray(memoryMeta.recall) ? memoryMeta.recall : []) {
      const record = asObject(entry);
      const summary = String(record.summary || "").trim();
      const createdAt = Date.parse(String(record.createdAt || ""));
      if (!summary) continue;
      recallCandidates.push({
        summary,
        createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      });
      if (recallCandidates.length >= recallBufferMaxItems) break;
    }

    if (recallCandidates.length > 0) {
      const ranked = recallCandidates
        .map((entry) => {
          const text = entry.summary.toLowerCase();
          const score = keywords.reduce(
            (acc, term) => (text.includes(term) ? acc + 1 : acc),
            0,
          );
          return { ...entry, score };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.createdAt - a.createdAt;
        })
        .filter((entry) => entry.score > 0 || keywords.length === 0)
        .slice(0, cfg.memoryRecallMaxItems);

      if (ranked.length > 0) {
        blocks.push({
          role: "system",
          content: [
            "CONVERSATION_MEMORY_RECALL",
            ...ranked.map((entry, idx) => `${idx + 1}. ${entry.summary}`),
          ].join("\n"),
        });
      }
    }

    try {
      const inMemoryContext = await this.conversationMemory.getContext(
        params.conversationId,
        params.userId,
      );
      const inMemoryMessages = inMemoryContext?.messages || [];
      if (inMemoryMessages.length > 0) {
        const tail = inMemoryMessages
          .slice(-Math.min(inMemoryMessages.length, cfg.memoryRecallMaxItems))
          .map(
            (message) =>
              `${message.role.toUpperCase()}: ${sanitizeSnippet(
                message.content || "",
                cfg.memoryRecallSnippetChars,
              )}`,
          );
        blocks.push({
          role: "system",
          content: ["CONVERSATION_MEMORY_TAIL", ...tail].join("\n"),
        });
      }
    } catch {
      // Non-fatal cache/read path.
    }

    return blocks;
  }
}
