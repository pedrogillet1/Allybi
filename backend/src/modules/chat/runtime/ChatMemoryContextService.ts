import type { EncryptedChatContextService } from "../../../modules/chat/infrastructure/encryptedChatContext.service";
import { ConversationMemoryService } from "../../../services/memory/conversationMemory.service";
import {
  MemoryPolicyEngine,
  type MemoryPolicyRuntimeConfig,
} from "../../../services/memory/memoryPolicyEngine.service";
import type { ChatRole } from "../domain/chat.contracts";
import { MemoryArtifactRecorder } from "./MemoryArtifactRecorder";
import { MemorySystemBlockBuilder } from "./MemorySystemBlockBuilder";
import { QuerySemanticSignals } from "./QuerySemanticSignals";
import { RecentConversationContextLoader } from "./RecentConversationContextLoader";
import type {
  MemoryRuntimeConfigProvider,
  MemoryRuntimeTuning,
} from "./chatMemory.types";

export class ChatMemoryContextService implements MemoryRuntimeConfigProvider {
  private readonly memoryPolicyEngine = new MemoryPolicyEngine();
  private encryptedContext?: EncryptedChatContextService;
  private readonly querySemanticSignals = new QuerySemanticSignals(this);
  private readonly memorySystemBlockBuilder: MemorySystemBlockBuilder;
  private readonly recentConversationContextLoader: RecentConversationContextLoader;
  private readonly memoryArtifactRecorder: MemoryArtifactRecorder;

  constructor(
    private readonly conversationMemory: ConversationMemoryService,
    encryptedContext?: EncryptedChatContextService,
    private readonly runtimeFlags: {
      recentHistoryOrderV2: boolean;
    } = {
      recentHistoryOrderV2: true,
    },
  ) {
    this.encryptedContext = encryptedContext;
    this.memorySystemBlockBuilder = new MemorySystemBlockBuilder(
      conversationMemory,
      this,
      this.querySemanticSignals,
    );
    this.recentConversationContextLoader = new RecentConversationContextLoader(
      this,
      this.memorySystemBlockBuilder,
    );
    this.memoryArtifactRecorder = new MemoryArtifactRecorder(
      conversationMemory,
      this,
    );
  }

  wireEncryptedContext(encryptedContext?: EncryptedChatContextService): void {
    this.encryptedContext = encryptedContext;
  }

  getEncryptedContext(): EncryptedChatContextService | undefined {
    return this.encryptedContext;
  }

  resolveRecentContextLimit(): number {
    return this.getMemoryRuntimeTuning().recentContextLimit;
  }

  getMemoryPolicyRuntimeConfig(): MemoryPolicyRuntimeConfig {
    return this.memoryPolicyEngine.resolveRuntimeConfig();
  }

  getMemoryRuntimeTuning(): MemoryRuntimeTuning {
    return this.getMemoryPolicyRuntimeConfig()
      .runtimeTuning as MemoryRuntimeTuning;
  }

  async loadRecentForEngine(
    conversationId: string,
    limit: number,
    userId: string,
    queryText?: string,
  ): Promise<Array<{ role: ChatRole; content: string }>> {
    return this.recentConversationContextLoader.loadRecentForEngine(
      conversationId,
      limit,
      userId,
      queryText,
    );
  }

  collectSemanticSignals(
    queryText: string,
    contextSignals: Record<string, unknown>,
  ): Record<string, boolean> {
    return this.querySemanticSignals.collectSemanticSignals(queryText, contextSignals);
  }

  extractQueryKeywords(queryText: string): string[] {
    return this.querySemanticSignals.extractQueryKeywords(queryText);
  }

  async recordConversationMemoryArtifacts(input: {
    messageId: string;
    conversationId: string;
    userId: string;
    role: ChatRole;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void> {
    return this.memoryArtifactRecorder.recordConversationMemoryArtifacts(input);
  }

  resolveRecentHistoryOrderV2(): boolean {
    return this.runtimeFlags.recentHistoryOrderV2;
  }
}
