import prisma from "../../../config/database";
import type { ChatRole } from "../domain/chat.contracts";
import type { MemoryRuntimeConfigProvider } from "./chatMemory.types";
import { clampLimit } from "./chatMemoryShared";
import { MemorySystemBlockBuilder } from "./MemorySystemBlockBuilder";

export class RecentConversationContextLoader {
  constructor(
    private readonly configProvider: MemoryRuntimeConfigProvider,
    private readonly memorySystemBlockBuilder: MemorySystemBlockBuilder,
  ) {}

  async loadRecentForEngine(
    conversationId: string,
    limit: number,
    userId: string,
    queryText?: string,
  ): Promise<Array<{ role: ChatRole; content: string }>> {
    const runtimeCfg = this.configProvider.getMemoryRuntimeTuning();
    const safeLimit = clampLimit(limit, runtimeCfg.historyClampMax);
    const useRecentHistoryWindow = this.configProvider.resolveRecentHistoryOrderV2();
    const encryptedContext = this.configProvider.getEncryptedContext();

    let recent: Array<{ role: ChatRole; content: string }>;
    if (encryptedContext) {
      recent = await encryptedContext.buildLLMContext(
        userId,
        conversationId,
        safeLimit,
        useRecentHistoryWindow,
      );
    } else {
      const rows = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: useRecentHistoryWindow ? "desc" : "asc" },
        take: safeLimit,
        select: {
          role: true,
          content: true,
        },
      });
      const orderedRows = useRecentHistoryWindow ? [...rows].reverse() : rows;
      recent = orderedRows.map((row) => ({
        role: row.role as ChatRole,
        content: String(row.content ?? ""),
      }));
    }

    const memoryBlocks = await this.memorySystemBlockBuilder.buildMemorySystemBlocks(
      {
        conversationId,
        userId,
        queryText: queryText || "",
      },
    );

    return [...memoryBlocks, ...recent];
  }
}
