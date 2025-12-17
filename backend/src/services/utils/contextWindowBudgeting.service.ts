/**
 * Context Window Budgeting Service
 *
 * Ensures chunks + system prompt + user query fit within LLM context window.
 * Service-based replacement for utils/contextWindowBudgeting.ts
 *
 * Key responsibilities:
 * - Calculate token allocations per component
 * - Select chunks that fit within budget
 * - Truncate content when necessary
 * - Provide detailed budget usage reports
 *
 * Used by: KodaRetrievalEngineV3, KodaAnswerEngineV3
 */

import {
  TokenBudgetEstimatorService,
  getTokenBudgetEstimator,
  SafetyLevel,
  SAFETY_MARGINS,
} from './tokenBudgetEstimator.service';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default token allocations (percentages of total budget)
 */
export const DEFAULT_ALLOCATIONS = {
  systemPrompt: 0.10,        // 10% for system instructions
  userQuery: 0.05,           // 5% for user's question
  conversationHistory: 0.15, // 15% for chat history
  retrievedChunks: 0.50,     // 50% for document chunks
  responseBuffer: 0.20,      // 20% reserved for LLM response
} as const;

/**
 * Minimum token allocations (absolute minimums)
 */
export const MIN_ALLOCATIONS = {
  systemPrompt: 500,
  userQuery: 100,
  conversationHistory: 200,
  retrievedChunks: 1000,
  responseBuffer: 500,
} as const;

/**
 * Maximum chunks to process (hard limit)
 */
export const MAX_CHUNKS = 50;

// ============================================================================
// TYPES
// ============================================================================

export interface BudgetAllocation {
  systemPrompt: number;
  userQuery: number;
  conversationHistory: number;
  retrievedChunks: number;
  responseBuffer: number;
  total: number;
}

export interface ComponentUsage {
  allocated: number;
  used: number;
  remaining: number;
}

export interface BudgetUsage {
  systemPrompt: ComponentUsage;
  userQuery: ComponentUsage;
  conversationHistory: ComponentUsage;
  retrievedChunks: ComponentUsage;
  responseBuffer: ComponentUsage;
  total: ComponentUsage;
  withinBudget: boolean;
  utilizationPercent: number;
}

export interface ChunkSelectionResult {
  selectedChunks: string[];
  tokensUsed: number;
  chunksIncluded: number;
  chunksExcluded: number;
  wasTruncated: boolean;
}

export interface ContextBudgetInput {
  model: string;
  systemPrompt: string;
  userQuery: string;
  conversationHistory?: string;
  chunks: string[];
  language?: string;
  safetyLevel?: SafetyLevel;
}

export interface ContextBudgetResult {
  allocation: BudgetAllocation;
  usage: BudgetUsage;
  selectedChunks: ChunkSelectionResult;
  truncatedSystemPrompt?: string;
  truncatedConversationHistory?: string;
  warnings: string[];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ContextWindowBudgetingService {
  private readonly tokenEstimator: TokenBudgetEstimatorService;
  private readonly logger: any;

  constructor(
    tokenEstimator?: TokenBudgetEstimatorService,
    logger?: any
  ) {
    this.tokenEstimator = tokenEstimator || getTokenBudgetEstimator();
    this.logger = logger || console;
  }

  /**
   * Calculate token budget allocation for a given model.
   *
   * @param model - Model name
   * @param safetyLevel - Safety margin level
   * @returns BudgetAllocation with token limits per category
   */
  calculateAllocation(model: string, safetyLevel: SafetyLevel = 'normal'): BudgetAllocation {
    const totalBudget = this.tokenEstimator.getSafeTokenBudget(model, safetyLevel);

    // Calculate proportional allocations
    let systemPrompt = Math.floor(totalBudget * DEFAULT_ALLOCATIONS.systemPrompt);
    let userQuery = Math.floor(totalBudget * DEFAULT_ALLOCATIONS.userQuery);
    let conversationHistory = Math.floor(totalBudget * DEFAULT_ALLOCATIONS.conversationHistory);
    let retrievedChunks = Math.floor(totalBudget * DEFAULT_ALLOCATIONS.retrievedChunks);
    let responseBuffer = Math.floor(totalBudget * DEFAULT_ALLOCATIONS.responseBuffer);

    // Ensure minimums are met
    systemPrompt = Math.max(systemPrompt, MIN_ALLOCATIONS.systemPrompt);
    userQuery = Math.max(userQuery, MIN_ALLOCATIONS.userQuery);
    conversationHistory = Math.max(conversationHistory, MIN_ALLOCATIONS.conversationHistory);
    retrievedChunks = Math.max(retrievedChunks, MIN_ALLOCATIONS.retrievedChunks);
    responseBuffer = Math.max(responseBuffer, MIN_ALLOCATIONS.responseBuffer);

    return {
      systemPrompt,
      userQuery,
      conversationHistory,
      retrievedChunks,
      responseBuffer,
      total: totalBudget,
    };
  }

  /**
   * Select chunks that fit within the budget.
   * Chunks are assumed to be ordered by relevance (most relevant first).
   *
   * @param chunks - Array of text chunks
   * @param budgetTokens - Maximum tokens for chunks
   * @param language - ISO language code
   * @returns ChunkSelectionResult with selected chunks
   */
  selectChunksWithinBudget(
    chunks: string[],
    budgetTokens: number,
    language?: string
  ): ChunkSelectionResult {
    const selectedChunks: string[] = [];
    let tokensUsed = 0;
    let chunksExcluded = 0;

    // Limit to MAX_CHUNKS to prevent excessive processing
    const candidateChunks = chunks.slice(0, MAX_CHUNKS);

    for (const chunk of candidateChunks) {
      const chunkTokens = this.tokenEstimator.estimateDetailed(chunk, language).tokens;

      if (tokensUsed + chunkTokens <= budgetTokens) {
        selectedChunks.push(chunk);
        tokensUsed += chunkTokens;
      } else {
        chunksExcluded++;
      }
    }

    // Add any remaining chunks beyond MAX_CHUNKS to excluded count
    chunksExcluded += Math.max(0, chunks.length - MAX_CHUNKS);

    return {
      selectedChunks,
      tokensUsed,
      chunksIncluded: selectedChunks.length,
      chunksExcluded,
      wasTruncated: chunksExcluded > 0,
    };
  }

  /**
   * Calculate detailed budget usage for all context components.
   *
   * @param allocation - Budget allocation
   * @param usage - Actual token usage per category
   * @returns BudgetUsage with detailed breakdown
   */
  calculateUsage(
    allocation: BudgetAllocation,
    usage: {
      systemPrompt: number;
      userQuery: number;
      conversationHistory: number;
      retrievedChunks: number;
    }
  ): BudgetUsage {
    const totalUsed =
      usage.systemPrompt +
      usage.userQuery +
      usage.conversationHistory +
      usage.retrievedChunks;

    const totalAllocated =
      allocation.systemPrompt +
      allocation.userQuery +
      allocation.conversationHistory +
      allocation.retrievedChunks;

    const withinBudget = totalUsed <= totalAllocated;
    const utilizationPercent = (totalUsed / allocation.total) * 100;

    return {
      systemPrompt: {
        allocated: allocation.systemPrompt,
        used: usage.systemPrompt,
        remaining: Math.max(0, allocation.systemPrompt - usage.systemPrompt),
      },
      userQuery: {
        allocated: allocation.userQuery,
        used: usage.userQuery,
        remaining: Math.max(0, allocation.userQuery - usage.userQuery),
      },
      conversationHistory: {
        allocated: allocation.conversationHistory,
        used: usage.conversationHistory,
        remaining: Math.max(0, allocation.conversationHistory - usage.conversationHistory),
      },
      retrievedChunks: {
        allocated: allocation.retrievedChunks,
        used: usage.retrievedChunks,
        remaining: Math.max(0, allocation.retrievedChunks - usage.retrievedChunks),
      },
      responseBuffer: {
        allocated: allocation.responseBuffer,
        used: 0, // Response hasn't been generated yet
        remaining: allocation.responseBuffer,
      },
      total: {
        allocated: allocation.total,
        used: totalUsed,
        remaining: Math.max(0, allocation.total - totalUsed),
      },
      withinBudget,
      utilizationPercent: Math.min(100, utilizationPercent),
    };
  }

  /**
   * Plan context window usage for an LLM call.
   * Main orchestration function that handles all budgeting logic.
   *
   * @param input - ContextBudgetInput with all context components
   * @returns ContextBudgetResult with allocations and selected content
   */
  planContextBudget(input: ContextBudgetInput): ContextBudgetResult {
    const {
      model,
      systemPrompt,
      userQuery,
      conversationHistory = '',
      chunks,
      language,
      safetyLevel = 'normal',
    } = input;

    const warnings: string[] = [];

    // Step 1: Calculate allocation
    const allocation = this.calculateAllocation(model, safetyLevel);

    // Step 2: Estimate token usage for fixed components
    const systemPromptTokens = this.tokenEstimator.estimateDetailed(systemPrompt, language).tokens;
    const userQueryTokens = this.tokenEstimator.estimateDetailed(userQuery, language).tokens;
    const conversationHistoryTokens = this.tokenEstimator.estimateDetailed(conversationHistory, language).tokens;

    // Step 3: Handle over-budget fixed components
    let truncatedSystemPrompt: string | undefined;
    let truncatedConversationHistory: string | undefined;
    let finalSystemPromptTokens = systemPromptTokens;
    let finalConversationHistoryTokens = conversationHistoryTokens;

    // Truncate system prompt if needed
    if (systemPromptTokens > allocation.systemPrompt) {
      truncatedSystemPrompt = this.tokenEstimator.truncateToTokenBudget(
        systemPrompt,
        allocation.systemPrompt,
        language
      );
      finalSystemPromptTokens = this.tokenEstimator.estimateDetailed(truncatedSystemPrompt, language).tokens;
      warnings.push(`System prompt truncated from ${systemPromptTokens} to ${finalSystemPromptTokens} tokens`);
    }

    // Truncate conversation history if needed
    if (conversationHistoryTokens > allocation.conversationHistory) {
      truncatedConversationHistory = this.tokenEstimator.truncateToTokenBudget(
        conversationHistory,
        allocation.conversationHistory,
        language
      );
      finalConversationHistoryTokens = this.tokenEstimator.estimateDetailed(
        truncatedConversationHistory,
        language
      ).tokens;
      warnings.push(
        `Conversation history truncated from ${conversationHistoryTokens} to ${finalConversationHistoryTokens} tokens`
      );
    }

    // Warn if user query is over budget (but don't truncate - user's question is sacred)
    if (userQueryTokens > allocation.userQuery) {
      warnings.push(`User query (${userQueryTokens} tokens) exceeds allocation (${allocation.userQuery})`);
    }

    // Step 4: Select chunks within budget
    const selectedChunks = this.selectChunksWithinBudget(
      chunks,
      allocation.retrievedChunks,
      language
    );

    if (selectedChunks.wasTruncated) {
      warnings.push(
        `Excluded ${selectedChunks.chunksExcluded} chunks due to token budget (included ${selectedChunks.chunksIncluded})`
      );
    }

    // Step 5: Calculate final usage
    const usage = this.calculateUsage(allocation, {
      systemPrompt: finalSystemPromptTokens,
      userQuery: userQueryTokens,
      conversationHistory: finalConversationHistoryTokens,
      retrievedChunks: selectedChunks.tokensUsed,
    });

    // Log if over budget
    if (!usage.withinBudget) {
      this.logger.warn?.('[ContextBudgeting] Context exceeds budget', {
        allocated: usage.total.allocated,
        used: usage.total.used,
        utilizationPercent: usage.utilizationPercent.toFixed(1),
      });
    }

    return {
      allocation,
      usage,
      selectedChunks,
      truncatedSystemPrompt,
      truncatedConversationHistory,
      warnings,
    };
  }

  /**
   * Quick check if total tokens will fit in context window.
   *
   * @param model - Model name
   * @param totalTokens - Estimated total tokens
   * @param safetyLevel - Safety margin level
   * @returns true if content fits
   */
  willFitInContext(
    model: string,
    totalTokens: number,
    safetyLevel: SafetyLevel = 'normal'
  ): boolean {
    const budget = this.tokenEstimator.getSafeTokenBudget(model, safetyLevel);
    return totalTokens <= budget;
  }

  /**
   * Get model context limit.
   * Convenience wrapper around tokenEstimator.
   *
   * @param model - Model name
   * @returns Context limit in tokens
   */
  getModelContextLimit(model: string): number {
    return this.tokenEstimator.getModelContextLimit(model);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: ContextWindowBudgetingService | null = null;

/**
 * Initialize the ContextWindowBudgetingService singleton.
 *
 * @param tokenEstimator - Optional TokenBudgetEstimatorService instance
 * @param logger - Optional logger
 */
export function initContextWindowBudgeting(
  tokenEstimator?: TokenBudgetEstimatorService,
  logger?: any
): void {
  instance = new ContextWindowBudgetingService(tokenEstimator, logger);
}

/**
 * Get the ContextWindowBudgetingService singleton instance.
 * Auto-initializes with defaults if not already initialized.
 *
 * @returns ContextWindowBudgetingService instance
 */
export function getContextWindowBudgeting(): ContextWindowBudgetingService {
  if (!instance) {
    instance = new ContextWindowBudgetingService();
  }
  return instance;
}

// Default export for convenience
export default ContextWindowBudgetingService;
