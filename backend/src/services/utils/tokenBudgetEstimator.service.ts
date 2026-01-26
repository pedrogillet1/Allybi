/**
 * Token Budget Estimator Service
 *
 * Provides deterministic token estimation for context window budgeting.
 * Service-based replacement for utils/tokenBudgetEstimator.ts
 *
 * Key methods:
 * - estimateFast: Quick chars/4 estimation
 * - estimateDetailed: Word-based with language awareness
 *
 * Used by: ContextWindowBudgetingService, KodaRetrievalEngineV3, KodaAnswerEngineV3
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Tokens per word ratios by language family
 */
export const TOKENS_PER_WORD = {
  en: 0.75,      // English - shorter average words
  pt: 1.0,       // Portuguese - more inflection
  es: 1.0,       // Spanish - more inflection
  default: 0.85, // Default for unknown languages
} as const;

/**
 * Average characters per token (fast estimation)
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Model context window limits
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Gemini 2.5 (current default)
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.5-pro': 1_048_576,
  // Gemini 2.0
  'gemini-2.0-flash': 1_000_000,
  'gemini-2.0-flash-exp': 1_000_000,
  // Gemini 1.5 (legacy)
  'gemini-1.5-flash': 1_000_000,
  'gemini-1.5-pro': 2_000_000,
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  // Anthropic
  'claude-3-opus': 200_000,
  'claude-3-sonnet': 200_000,
  'claude-3-haiku': 200_000,
  'claude-3.5-sonnet': 200_000,
  default: 128_000,
};

/**
 * Safety margins for different use cases
 */
export const SAFETY_MARGINS = {
  strict: 0.80,   // Leave 20% buffer
  normal: 0.85,   // Leave 15% buffer
  relaxed: 0.90,  // Leave 10% buffer
} as const;

// ============================================================================
// TYPES
// ============================================================================

export type SafetyLevel = keyof typeof SAFETY_MARGINS;

export interface TokenEstimateDetailed {
  tokens: number;
  method: 'word-based' | 'char-based' | 'hybrid';
  confidence: 'high' | 'medium' | 'low';
  language?: string;
}

export interface BudgetCheck {
  withinBudget: boolean;
  estimatedTokens: number;
  budgetLimit: number;
  remainingTokens: number;
  utilizationPercent: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class TokenBudgetEstimatorService {
  private readonly charsPerToken: number;

  constructor(charsPerToken: number = CHARS_PER_TOKEN) {
    this.charsPerToken = charsPerToken;
  }

  /**
   * Fast token estimation using chars/4.
   * Deterministic and efficient for quick budgeting.
   *
   * @param text - Text to estimate tokens for
   * @returns Estimated token count
   */
  estimateFast(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Detailed token estimation with language awareness.
   * Uses word-based heuristics for better accuracy.
   *
   * @param text - Text to estimate tokens for
   * @param language - ISO language code (en, pt, es)
   * @returns TokenEstimateDetailed with count and metadata
   */
  estimateDetailed(text: string, language?: string): TokenEstimateDetailed {
    if (!text || text.trim().length === 0) {
      return { tokens: 0, method: 'word-based', confidence: 'high' };
    }

    // Count words (split on whitespace)
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Get language-specific ratio
    const lang = language?.toLowerCase().slice(0, 2) || 'default';
    const ratio = TOKENS_PER_WORD[lang as keyof typeof TOKENS_PER_WORD] || TOKENS_PER_WORD.default;

    // Word-based estimate
    const wordBasedTokens = Math.ceil(wordCount * ratio);

    // Character-based estimate (fallback)
    const charBasedTokens = this.estimateFast(text);

    // Use hybrid approach for edge cases
    let tokens: number;
    let method: TokenEstimateDetailed['method'];
    let confidence: TokenEstimateDetailed['confidence'];

    if (wordCount < 5) {
      // Very short text - use char-based
      tokens = charBasedTokens;
      method = 'char-based';
      confidence = 'medium';
    } else if (wordCount > 1000) {
      // Long text - use hybrid (average of both)
      tokens = Math.ceil((wordBasedTokens + charBasedTokens) / 2);
      method = 'hybrid';
      confidence = 'high';
    } else {
      // Normal text - use word-based
      tokens = wordBasedTokens;
      method = 'word-based';
      confidence = 'high';
    }

    return {
      tokens,
      method,
      confidence,
      language: lang !== 'default' ? lang : undefined,
    };
  }

  /**
   * Estimate tokens for an array of text chunks.
   *
   * @param chunks - Array of text strings
   * @param language - ISO language code
   * @returns Total token count
   */
  estimateChunks(chunks: string[], language?: string): number {
    return chunks.reduce((total, chunk) => {
      return total + this.estimateDetailed(chunk, language).tokens;
    }, 0);
  }

  /**
   * Get the context window limit for a model.
   *
   * @param model - Model name or ID
   * @returns Context window size in tokens
   */
  getModelContextLimit(model: string): number {
    // Normalize model name
    const normalizedModel = model.toLowerCase().replace(/[_-]/g, '-');

    // Check for exact match
    if (normalizedModel in MODEL_CONTEXT_LIMITS) {
      return MODEL_CONTEXT_LIMITS[normalizedModel];
    }

    // Check for partial match
    for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (key !== 'default' && (normalizedModel.includes(key) || key.includes(normalizedModel))) {
        return limit;
      }
    }

    return MODEL_CONTEXT_LIMITS.default;
  }

  /**
   * Calculate safe token budget for a model with safety margin.
   *
   * @param model - Model name
   * @param safetyLevel - Safety margin level
   * @returns Safe token budget
   */
  getSafeTokenBudget(model: string, safetyLevel: SafetyLevel = 'normal'): number {
    const contextLimit = this.getModelContextLimit(model);
    const margin = SAFETY_MARGINS[safetyLevel];
    return Math.floor(contextLimit * margin);
  }

  /**
   * Check if content fits within a token budget.
   *
   * @param text - Text to check
   * @param budgetLimit - Maximum tokens allowed
   * @param language - ISO language code
   * @returns BudgetCheck with detailed status
   */
  checkBudget(text: string, budgetLimit: number, language?: string): BudgetCheck {
    const estimate = this.estimateDetailed(text, language);
    const remainingTokens = budgetLimit - estimate.tokens;
    const utilizationPercent = (estimate.tokens / budgetLimit) * 100;

    return {
      withinBudget: estimate.tokens <= budgetLimit,
      estimatedTokens: estimate.tokens,
      budgetLimit,
      remainingTokens: Math.max(0, remainingTokens),
      utilizationPercent: Math.min(100, utilizationPercent),
    };
  }

  /**
   * Truncate text to fit within token budget.
   *
   * @param text - Text to truncate
   * @param maxTokens - Maximum tokens allowed
   * @param language - ISO language code
   * @returns Truncated text
   */
  truncateToTokenBudget(text: string, maxTokens: number, language?: string): string {
    const estimate = this.estimateDetailed(text, language);

    if (estimate.tokens <= maxTokens) {
      return text;
    }

    // Estimate how many characters we need to keep
    const ratio = maxTokens / estimate.tokens;
    const targetLength = Math.floor(text.length * ratio * 0.95); // 5% safety buffer

    // Find a good break point (end of sentence or paragraph)
    let truncated = text.slice(0, targetLength);

    // Try to end at sentence boundary
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastPeriod, lastNewline);

    if (breakPoint > targetLength * 0.7) {
      truncated = truncated.slice(0, breakPoint + 1);
    }

    return truncated.trim();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: TokenBudgetEstimatorService | null = null;

/**
 * Initialize the TokenBudgetEstimatorService singleton.
 *
 * @param charsPerToken - Characters per token ratio (default: 4)
 */
export function initTokenBudgetEstimator(charsPerToken: number = CHARS_PER_TOKEN): void {
  instance = new TokenBudgetEstimatorService(charsPerToken);
}

/**
 * Get the TokenBudgetEstimatorService singleton instance.
 * Auto-initializes with defaults if not already initialized.
 *
 * @returns TokenBudgetEstimatorService instance
 */
export function getTokenBudgetEstimator(): TokenBudgetEstimatorService {
  if (!instance) {
    instance = new TokenBudgetEstimatorService();
  }
  return instance;
}

// Default export for convenience
export default TokenBudgetEstimatorService;
