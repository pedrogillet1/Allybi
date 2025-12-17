/**
 * Budget Enforcer - Ensures queries complete within target latency
 *
 * Features:
 * - Timeout enforcement with configurable budgets
 * - Graceful degradation with fallback strategies
 * - Performance tracking for adaptive budgeting
 * - Warning callbacks at 80% budget
 */

export interface BudgetConfig {
  targetLatency: number;           // Target completion time (ms)
  hardTimeout?: number;            // Maximum allowed time (ms) - defaults to 2x target
  onBudgetWarning?: () => void;    // Called at 80% of budget
  onBudgetExceeded?: () => Promise<any>; // Fallback strategy
  context?: string;                // Description for logging
}

export interface BudgetResult<T> {
  success: boolean;
  result?: T;
  latency: number;
  budgetExceeded: boolean;
  usedFallback: boolean;
  context?: string;
}

// Performance history for adaptive budgeting
const performanceHistory: Map<string, number[]> = new Map();
const MAX_HISTORY = 100;

/**
 * Execute a function with budget enforcement
 */
export async function withBudget<T>(
  fn: () => Promise<T>,
  config: BudgetConfig
): Promise<BudgetResult<T>> {
  const startTime = Date.now();
  const hardTimeout = config.hardTimeout || config.targetLatency * 2;
  const context = config.context || 'Operation';

  let warningTriggered = false;
  let budgetExceeded = false;
  let usedFallback = false;

  // Warning at 80% of target
  const warningTimer = setTimeout(() => {
    warningTriggered = true;
    const elapsed = Date.now() - startTime;
    console.warn(`⚠️ [BUDGET WARNING] ${context} at ${elapsed}ms (target: ${config.targetLatency}ms)`);

    if (config.onBudgetWarning) {
      config.onBudgetWarning();
    }
  }, config.targetLatency * 0.8);

  // Hard timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Budget exceeded: ${context} took > ${hardTimeout}ms`));
    }, hardTimeout);
  });

  try {
    // Race between function execution and timeout
    const result = await Promise.race([fn(), timeoutPromise]);

    clearTimeout(warningTimer);
    const latency = Date.now() - startTime;

    // Record performance for adaptive budgeting
    recordPerformance(context, latency);

    // Check if target was exceeded (but still completed)
    budgetExceeded = latency > config.targetLatency;
    if (budgetExceeded) {
      console.warn(`⚠️ [BUDGET SOFT EXCEEDED] ${context} took ${latency}ms (target: ${config.targetLatency}ms)`);
    }

    return {
      success: true,
      result,
      latency,
      budgetExceeded,
      usedFallback: false,
      context,
    };
  } catch (error) {
    clearTimeout(warningTimer);
    const latency = Date.now() - startTime;
    budgetExceeded = true;

    console.error(`🔴 [BUDGET EXCEEDED] ${context} failed after ${latency}ms:`, error);

    // Try fallback if available
    if (config.onBudgetExceeded) {
      console.log(`🔄 [FALLBACK] Attempting fallback for ${context}`);
      usedFallback = true;

      try {
        const fallbackResult = await config.onBudgetExceeded();
        return {
          success: true,
          result: fallbackResult,
          latency,
          budgetExceeded: true,
          usedFallback: true,
          context,
        };
      } catch (fallbackError) {
        console.error(`❌ [FALLBACK FAILED] ${context}:`, fallbackError);
      }
    }

    // No fallback or fallback failed
    return {
      success: false,
      latency,
      budgetExceeded: true,
      usedFallback,
      context,
    };
  }
}

/**
 * Record performance for adaptive budgeting
 */
function recordPerformance(context: string, latency: number): void {
  if (!performanceHistory.has(context)) {
    performanceHistory.set(context, []);
  }

  const history = performanceHistory.get(context)!;
  history.push(latency);

  // Keep only last N measurements
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/**
 * Get adaptive budget based on historical performance
 * Returns P95 + 20% buffer, but never below baseline
 */
export function getAdaptiveBudget(context: string, baselineBudget: number): number {
  const history = performanceHistory.get(context);

  if (!history || history.length < 10) {
    return baselineBudget; // Not enough data
  }

  // Calculate P95 (95th percentile)
  const sorted = [...history].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index];

  // Use P95 + 20% buffer as adaptive budget
  const adaptiveBudget = Math.ceil(p95 * 1.2);

  console.log(`📊 [ADAPTIVE BUDGET] ${context}: P95=${p95}ms, adaptive=${adaptiveBudget}ms (baseline=${baselineBudget}ms)`);

  return Math.max(adaptiveBudget, baselineBudget); // Never go below baseline
}

/**
 * Get performance statistics for a context
 */
export function getPerformanceStats(context: string): {
  count: number;
  avg: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
} | null {
  const history = performanceHistory.get(context);

  if (!history || history.length === 0) {
    return null;
  }

  const sorted = [...history].sort((a, b) => a - b);
  const sum = history.reduce((a, b) => a + b, 0);

  return {
    count: history.length,
    avg: Math.round(sum / history.length),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Get all performance statistics
 */
export function getAllPerformanceStats(): Record<string, ReturnType<typeof getPerformanceStats>> {
  const stats: Record<string, ReturnType<typeof getPerformanceStats>> = {};

  performanceHistory.forEach((_, context) => {
    stats[context] = getPerformanceStats(context);
  });

  return stats;
}

/**
 * Clear performance history (for testing)
 */
export function clearPerformanceHistory(): void {
  performanceHistory.clear();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREDEFINED BUDGETS FOR KODA QUERY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export const QUERY_BUDGETS = {
  ULTRA_FAST_GREETING: 500,    // 500ms target
  DOC_COUNT: 1000,             // 1s target
  FILE_NAVIGATION: 2000,       // 2s target
  FOLDER_NAVIGATION: 2000,     // 2s target
  APP_HELP: 1500,              // 1.5s target
  CALCULATION: 3000,           // 3s target
  SINGLE_DOC_RAG: 5000,        // 5s target
  CROSS_DOC_RAG: 8000,         // 8s target
  COMPLEX_ANALYSIS: 10000,     // 10s target
  STANDARD_QUERY: 5000,        // 5s target
} as const;

/**
 * Get budget for a query type
 */
export function getBudgetForQueryType(answerType: string): number {
  return QUERY_BUDGETS[answerType as keyof typeof QUERY_BUDGETS] || QUERY_BUDGETS.STANDARD_QUERY;
}
