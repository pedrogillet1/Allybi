import prisma from "../../../config/database";
import { logger as appLogger } from "../../../utils/logger";
import type { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import { MemoryRedactionService } from "../../../services/memory/memoryRedaction.service";
import type { ChatRole } from "../domain/chat.contracts";
import {
  asObject,
  sanitizeSnippet,
  toStringArray,
} from "./chatMemoryShared";
import type { MemoryRuntimeConfigProvider } from "./chatMemory.types";

export class MemoryArtifactRecorder {
  private readonly memoryRedaction = new MemoryRedactionService();

  constructor(
    private readonly conversationMemory: ConversationMemoryService,
    private readonly configProvider: MemoryRuntimeConfigProvider,
  ) {}

  async recordConversationMemoryArtifacts(input: {
    messageId: string;
    conversationId: string;
    userId: string;
    role: ChatRole;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void> {
    if (!input.userId) return;

    const cfg = this.configProvider.getMemoryRuntimeTuning();
    const policyConfig = this.configProvider.getMemoryPolicyRuntimeConfig();
    const memoryRole =
      input.role === "user" || input.role === "assistant" ? input.role : null;
    const metadataSources = Array.isArray(input.metadata.sources)
      ? input.metadata.sources
      : [];
    const rawSourceDocumentIds = metadataSources
      .map((source) => {
        const record = asObject(source);
        return String(record.documentId || "").trim();
      })
      .filter(Boolean);
    const storeCfg = asObject(cfg.memoryArtifactStore);
    const maxPersistedSourceDocumentIds = Math.max(
      1,
      Number(storeCfg.maxPersistedSourceDocumentIds || 0) || 0,
    );
    const sourceDocumentIds = this.memoryRedaction.sanitizeSourceDocumentIds(
      rawSourceDocumentIds,
      maxPersistedSourceDocumentIds,
    );
    const intentFamily = this.memoryRedaction.normalizeIntentFamily(
      input.metadata.intentFamily,
    );

    try {
      if (memoryRole) {
        await this.conversationMemory.addMessage(
          input.conversationId,
          memoryRole,
          input.content,
          {
            intent:
              typeof input.metadata.intentFamily === "string"
                ? String(input.metadata.intentFamily)
                : undefined,
            sourceDocumentIds,
          },
          input.userId,
        );
      }
    } catch (error) {
      appLogger.warn("[Memory] in-memory mirror update failed", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const now = input.createdAt;
    const nowIso = now.toISOString();
    const recentMessageIdMaxItems = Math.max(
      1,
      Number(storeCfg.recentMessageIdMaxItems || 0) || 0,
    );
    const recallBufferMaxItems = Math.max(
      cfg.memoryRecallMaxItems,
      Number(storeCfg.recallBufferMaxItems || 0) || 0,
    );
    const keyTopicMaxItems = Math.max(
      1,
      Number(storeCfg.keyTopicMaxItems || 0) || 0,
    );
    const summaryRefreshAssistantEveryTurns = Math.max(
      1,
      Number(storeCfg.summaryRefreshAssistantEveryTurns || 0) || 1,
    );
    const staleTopicDecayTurns = Math.max(
      1,
      Number(storeCfg.staleTopicDecayTurns || 0) || 1,
    );
    const maxPersistedRecallBytes = Math.max(
      256,
      Number(storeCfg.maxPersistedRecallBytes || 0) || 24000,
    );

    try {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const existing = await prisma.conversation.findFirst({
          where: {
            id: input.conversationId,
            userId: input.userId,
            isDeleted: false,
          },
          select: {
            summary: true,
            contextMeta: true,
            updatedAt: true,
          },
        });
        if (!existing) return;

        const contextMeta = asObject(existing.contextMeta);
        const priorMemory = asObject(contextMeta.memory);
        const priorRecentMessageIds = toStringArray(priorMemory.recentMessageIds);
        if (priorRecentMessageIds.includes(input.messageId)) return;
        const priorKeyTopics = toStringArray(priorMemory.keyTopics);
        const priorSourceDocumentIds = toStringArray(priorMemory.sourceDocumentIds);
        const priorRecall = Array.isArray(priorMemory.recall)
          ? priorMemory.recall
          : [];
        const priorTurnsSinceLastSummary = Number(priorMemory.turnsSinceLastSummary);

        const nextRecentMessageIds = [input.messageId, ...priorRecentMessageIds].slice(
          0,
          recentMessageIdMaxItems,
        );
        const nextKeyTopics = Array.from(new Set([...priorKeyTopics, intentFamily]))
          .filter(Boolean)
          .slice(0, keyTopicMaxItems);
        const nextSourceDocumentIds =
          this.memoryRedaction.sanitizeSourceDocumentIds(
            [...priorSourceDocumentIds, ...sourceDocumentIds],
            maxPersistedSourceDocumentIds,
          );

        const nextRecall = [
          this.memoryRedaction.buildPersistedRecallEntry({
            messageId: input.messageId,
            role: memoryRole || "assistant",
            intentFamily,
            sourceDocumentIds,
            content: input.content,
            createdAt: now,
          }),
          ...priorRecall.map((entry) => {
            const record = asObject(entry);
            const recordSourceDocumentIds = toStringArray(record.sourceDocumentIds);
            return {
              messageId: String(record.messageId || ""),
              role:
                String(record.role || "").toLowerCase() === "assistant"
                  ? "assistant"
                  : "user",
              intentFamily: this.memoryRedaction.normalizeIntentFamily(
                record.intentFamily,
              ),
              sourceDocumentIds: this.memoryRedaction.sanitizeSourceDocumentIds(
                recordSourceDocumentIds,
                maxPersistedSourceDocumentIds,
              ),
              sourceCount: Math.max(
                0,
                Number(record.sourceCount || recordSourceDocumentIds.length) || 0,
              ),
              summary: String(record.summary || "").trim(),
              contentHash: String(record.contentHash || "").trim(),
              createdAt: String(record.createdAt || nowIso),
            };
          }),
        ]
          .filter((entry) => entry.messageId && entry.summary)
          .slice(0, recallBufferMaxItems);

        while (
          nextRecall.length > 1 &&
          this.memoryRedaction.approximateBytes(nextRecall) >
            maxPersistedRecallBytes
        ) {
          nextRecall.pop();
        }

        const nextTurnsSinceLastSummary =
          input.role === "assistant"
            ? (Math.max(0, Math.floor(priorTurnsSinceLastSummary || 0)) + 1) %
              summaryRefreshAssistantEveryTurns
            : Number.isFinite(priorTurnsSinceLastSummary)
              ? Math.max(0, Math.floor(priorTurnsSinceLastSummary) + 1)
              : 1;
        const topicHasDecayed =
          nextTurnsSinceLastSummary >= staleTopicDecayTurns &&
          input.role !== "assistant";
        const effectiveKeyTopics = topicHasDecayed ? [] : nextKeyTopics;
        const nextTopic = effectiveKeyTopics[0] || cfg.defaultStateTopic;
        const persistedConversationSummary = sanitizeSnippet(
          String(cfg.defaultStateSummary || "").trim(),
          cfg.memorySummaryMaxChars,
        );

        const nextMemory: Record<string, unknown> = {
          ...priorMemory,
          summary: persistedConversationSummary,
          summaryMode: "structural",
          currentTopic: nextTopic,
          keyTopics: effectiveKeyTopics,
          recentMessageIds: nextRecentMessageIds,
          sourceDocumentIds: nextSourceDocumentIds,
          recall: nextRecall,
          turnsSinceLastSummary: nextTurnsSinceLastSummary,
          lastSummaryAt: nowIso,
          lastRole: input.role,
          lastMessageId: input.messageId,
        };

        if (policyConfig.privacy.doNotPersistExtractedPIIValues) {
          delete nextMemory.rawUserTextHistory;
          delete nextMemory.fullRetrievedChunks;
          delete nextMemory.debugTraces;
        }
        if (policyConfig.privacy.doNotPersistRawNumbersFromDocs) {
          delete nextMemory.numericSnapshots;
          delete nextMemory.rawNumbers;
        }
        if (policyConfig.privacy.debugTracesNotPersisted) {
          delete nextMemory.debugTraces;
        }
        const structuralHints = new Set(
          (policyConfig.privacy.persistOnlyStructuralHints || []).map((item) =>
            String(item || "").trim(),
          ),
        );
        if (structuralHints.size > 0) {
          const sensitiveKeys = [
            "rawUserTextHistory",
            "fullRetrievedChunks",
            "debugTraces",
            "numericSnapshots",
            "rawNumbers",
          ];
          for (const key of sensitiveKeys) {
            if (!structuralHints.has(key)) {
              delete nextMemory[key];
            }
          }
        }

        const updated = await prisma.conversation.updateMany({
          where: {
            id: input.conversationId,
            userId: input.userId,
            isDeleted: false,
            updatedAt: existing.updatedAt,
          },
          data: {
            updatedAt: now,
            summary: persistedConversationSummary,
            contextMeta: {
              ...contextMeta,
              memory: nextMemory,
            } as unknown as object,
          },
        });

        if (updated.count > 0) return;
      }

      appLogger.warn("[Memory] durable artifact write retried out", {
        conversationId: input.conversationId,
        messageId: input.messageId,
      });
    } catch (error) {
      appLogger.warn("[Memory] durable artifact write failed", {
        conversationId: input.conversationId,
        messageId: input.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
