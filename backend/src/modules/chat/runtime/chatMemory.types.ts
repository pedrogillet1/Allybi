import type { EncryptedChatContextService } from "../infrastructure/encryptedChatContext.service";
import type {
  MemoryPolicyRuntimeConfig,
} from "../../../services/memory/memoryPolicyEngine.service";

export type SemanticSignalKey =
  | "hasQuotedText"
  | "hasFilename"
  | "userAskedForTable"
  | "userAskedForQuote"
  | "sheetHintPresent"
  | "rangeExplicit"
  | "timeConstraintsPresent"
  | "explicitYearOrQuarterComparison"
  | "tableExpected";

export type MemoryRuntimeTuning = {
  recentContextLimit: number;
  historyClampMax: number;
  defaultStateSummary: string;
  defaultStateTopic: string;
  memorySummaryMaxChars: number;
  memoryRecallMaxItems: number;
  memoryRecallSnippetChars: number;
  queryKeywordMaxTerms: number;
  queryKeywordMinLength: number;
  queryStopWords: { any: string[]; pt?: string[]; es?: string[] };
  memoryArtifactStore?: {
    recentMessageIdMaxItems?: number;
    recallBufferMaxItems?: number;
    keyTopicMaxItems?: number;
    summaryRefreshAssistantEveryTurns?: number;
    staleTopicDecayTurns?: number;
    maxPersistedSourceDocumentIds?: number;
    maxPersistedRecallBytes?: number;
  };
  semanticSignals?: {
    regexFlags?: string;
    patterns?: Partial<Record<SemanticSignalKey, string[]>>;
  };
  semanticRetrieval?: {
    enableGlobalEvidenceSearch?: boolean;
    globalSearchMinQueryChars?: number;
    maxEvidenceItemsForAnswer?: number;
    preferActiveScopeWhenFollowup?: boolean;
    staleScopePenalty?: number;
    maxGlobalRetrievalsPerTurn?: number;
  };
};

export type MemoryRuntimeConfigProvider = {
  getMemoryPolicyRuntimeConfig(): MemoryPolicyRuntimeConfig;
  getMemoryRuntimeTuning(): MemoryRuntimeTuning;
  getEncryptedContext(): EncryptedChatContextService | undefined;
  resolveRecentHistoryOrderV2(): boolean;
};
