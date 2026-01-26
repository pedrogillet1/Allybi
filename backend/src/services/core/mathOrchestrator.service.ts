/**
 * KODA Math Orchestrator Service
 *
 * Bridges the LLM and Python Math Engine.
 *
 * Core principle: LLMs should NEVER do math.
 * - If the answer depends on numbers → Python Math Engine
 * - If the answer depends on interpretation → LLM
 *
 * Flow:
 * 1. LLM produces calculation plan (JSON)
 * 2. This service sends plan to Python Math Engine
 * 3. Python executes deterministically
 * 4. Results returned to LLM for explanation
 *
 * Categories handled:
 * - Financial: ROI, IRR, NPV, CAGR, margins
 * - Accounting: rollforwards, reconciliations, variance
 * - Statistical: averages, percentiles, outliers
 * - Aggregation: sums, counts, group by
 * - Engineering: unit conversions, tolerances
 * - Time: date math, rolling averages
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// =============================================================================
// TYPES
// =============================================================================

export interface CalculationPlan {
  operation: string;
  inputs: Record<string, unknown>;
}

export interface BatchCalculationPlans {
  plans: CalculationPlan[];
}

export interface CalculationResult {
  success: boolean;
  operation?: string;
  result?: Record<string, unknown>;
  error?: string;
  metadata?: {
    execution_time_ms: number;
    timestamp: string;
    engine_version: string;
  };
}

export interface BatchCalculationResult {
  success: boolean;
  results: (CalculationResult & { batch_index: number })[];
  summary: {
    total: number;
    success_count: number;
    error_count: number;
    total_time_ms: number;
  };
}

export interface OperationSchema {
  operation: string;
  category: string;
  parameters: Record<string, {
    required: boolean;
    default?: unknown;
    type?: string;
  }>;
  description?: string;
  full_doc?: string;
}

export interface MathOperationCategory {
  name: string;
  operations: string[];
}

// Math intent detection patterns
const MATH_TRIGGER_PATTERNS = [
  // Financial calculations
  /\b(calculate|compute)\s+(the\s+)?(roi|return|irr|npv|cagr|margin|growth rate)\b/i,
  /\bwhat('s| is)\s+(the\s+)?(roi|return|irr|npv|cagr|margin)\b/i,
  /\b(roi|irr|npv|cagr)\s*(of|for|on)\b/i,
  /\b(return on investment|internal rate of return|net present value)\b/i,
  /\bcompound(ed)?\s+(annual|interest|growth)\b/i,
  /\bbreak[\s-]?even\b/i,
  /\b(compute|calculate)\s+(the\s+)?margin\b/i,

  // Accounting calculations
  /\b(roll ?forward|reconcil|variance|depreciat)\b/i,
  /\b(budget|actual)\s+(vs|versus|compared)\b/i,
  /\b(debit|credit)\s+(total|sum|balance)\b/i,

  // Statistical calculations
  /\b(average|mean|median|mode|percentile|quartile)\s*(of|for|is)?\b/i,
  /\b(std|standard)\s*dev(iation)?\b/i,
  /\boutlier(s)?\b/i,
  /\b(calculate|compute|find)\s+(the\s+)?(sum|total|count|average)\b/i,

  // Aggregation - direct operations
  /\bsum\s+(column|row|the|all|up)\b/i,
  /\b(add up|total)\s+(the|all|column|row)\b/i,

  // Aggregation - "total" queries (common user patterns)
  /\bwhat('s| is| was)\s+(the\s+)?total\b/i,
  /\btotal\s+(revenue|cost|expense|income|profit|sales|amount|value|budget|spending)\b/i,
  /\b(give me|show|tell me)\s+(the\s+)?total\b/i,
  /\bgrand\s+total\b/i,

  // Engineering calculations
  /\bconvert\s+\d+\s*\w+\s+to\s+\w+\b/i,
  /\b(within|in)\s+tolerance\b/i,
  /\brate\s+(of|per)\b/i,

  // Time calculations
  /\b(days?|weeks?|months?|years?)\s+(until|since|between|from)\b/i,
  /\brolling\s+(average|mean|sum)\b/i,
  /\bgrowth\s+rate(s)?\s+(over|per|by)\b/i,

  // Generic math signals
  /\b(how much|how many|what percent|what percentage|what ratio)\b/i,
  /\b\d+(\.\d+)?\s*(%|percent)\s*(of|increase|decrease|growth|change)\b/i,
];

// Operations that indicate a calculation is needed
const CALCULATION_OPERATIONS = [
  'calculate_roi', 'calculate_cagr', 'calculate_npv', 'calculate_irr',
  'calculate_margin', 'calculate_break_even', 'calculate_compound_interest',
  'calculate_rollforward', 'calculate_variance', 'verify_debits_credits',
  'calculate_depreciation', 'calculate_descriptive_stats', 'calculate_percentile',
  'calculate_quartiles', 'detect_outliers', 'aggregate_by_group',
  'calculate_running_total', 'calculate_period_over_period', 'convert_units',
  'check_tolerance', 'calculate_rate', 'calculate_date_difference',
  'calculate_rolling_average', 'calculate_growth_rates', 'calculate_days_until',
];

// =============================================================================
// SERVICE
// =============================================================================

export class MathOrchestratorService {
  private readonly client: AxiosInstance;
  private readonly logger: Console;
  private readonly mathEngineUrl: string;
  private isEngineAvailable: boolean = false;
  private lastHealthCheck: Date | null = null;

  constructor(options?: {
    mathEngineUrl?: string;
    logger?: Console;
    timeout?: number;
  }) {
    this.mathEngineUrl = options?.mathEngineUrl || process.env.MATH_ENGINE_URL || 'http://localhost:5050';
    this.logger = options?.logger || console;

    this.client = axios.create({
      baseURL: this.mathEngineUrl,
      timeout: options?.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // ===========================================================================
  // HEALTH & STATUS
  // ===========================================================================

  /**
   * Check if the Python Math Engine is healthy and available.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      this.isEngineAvailable = response.data?.status === 'healthy';
      this.lastHealthCheck = new Date();
      return this.isEngineAvailable;
    } catch (error) {
      this.isEngineAvailable = false;
      this.lastHealthCheck = new Date();
      this.logger.warn('[MathOrchestrator] Math Engine health check failed:', error);
      return false;
    }
  }

  /**
   * Get the current status of the math orchestrator.
   */
  getStatus(): {
    engineAvailable: boolean;
    lastHealthCheck: Date | null;
    engineUrl: string;
  } {
    return {
      engineAvailable: this.isEngineAvailable,
      lastHealthCheck: this.lastHealthCheck,
      engineUrl: this.mathEngineUrl,
    };
  }

  // ===========================================================================
  // MATH INTENT DETECTION
  // ===========================================================================

  /**
   * Detect if a query requires mathematical calculation.
   * This is a lightweight check to determine if the math engine should be invoked.
   */
  requiresMathCalculation(query: string): {
    requiresMath: boolean;
    confidence: number;
    matchedPatterns: string[];
    suggestedCategory?: string;
  } {
    const matches: string[] = [];
    let categoryHits: Record<string, number> = {
      financial: 0,
      accounting: 0,
      statistical: 0,
      aggregation: 0,
      engineering: 0,
      time: 0,
    };

    // Check patterns
    for (const pattern of MATH_TRIGGER_PATTERNS) {
      if (pattern.test(query)) {
        matches.push(pattern.source);

        // Categorize the match
        const patternStr = pattern.source.toLowerCase();
        if (/roi|irr|npv|cagr|margin|return|interest|break.?even/.test(patternStr)) {
          categoryHits.financial++;
        } else if (/roll.?forward|reconcil|variance|depreciat|debit|credit/.test(patternStr)) {
          categoryHits.accounting++;
        } else if (/average|mean|median|percentile|quartile|std|outlier|sum|total|count/.test(patternStr)) {
          categoryHits.statistical++;
          categoryHits.aggregation++;
        } else if (/convert|tolerance|rate/.test(patternStr)) {
          categoryHits.engineering++;
        } else if (/days?|weeks?|months?|years?|rolling|growth/.test(patternStr)) {
          categoryHits.time++;
        }
      }
    }

    // Calculate confidence based on matches
    const confidence = Math.min(matches.length * 0.25, 1.0);

    // Find dominant category
    const topCategory = Object.entries(categoryHits)
      .sort(([, a], [, b]) => b - a)
      .find(([, count]) => count > 0)?.[0];

    return {
      requiresMath: matches.length > 0,
      confidence,
      matchedPatterns: matches,
      suggestedCategory: topCategory,
    };
  }

  // ===========================================================================
  // CALCULATION EXECUTION
  // ===========================================================================

  /**
   * Execute a single calculation plan.
   *
   * @param plan - The calculation plan from the LLM
   * @returns The calculation result from Python Math Engine
   */
  async executeCalculation(plan: CalculationPlan): Promise<CalculationResult> {
    // Validate the plan structure
    if (!plan.operation) {
      return {
        success: false,
        error: 'Missing operation in calculation plan',
      };
    }

    if (!CALCULATION_OPERATIONS.includes(plan.operation)) {
      return {
        success: false,
        error: `Unknown operation: ${plan.operation}. Available: ${CALCULATION_OPERATIONS.join(', ')}`,
      };
    }

    try {
      const response = await this.client.post<CalculationResult>('/calculate', plan);
      this.logger.info(`[MathOrchestrator] Executed ${plan.operation} successfully`);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      const errorMessage = axiosError.response?.data?.detail || axiosError.message;
      this.logger.error(`[MathOrchestrator] Calculation failed:`, errorMessage);
      return {
        success: false,
        error: `Calculation failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute multiple calculation plans in batch.
   *
   * @param plans - Array of calculation plans
   * @returns Batch results from Python Math Engine
   */
  async executeBatchCalculations(plans: CalculationPlan[]): Promise<BatchCalculationResult> {
    if (!plans.length) {
      return {
        success: true,
        results: [],
        summary: {
          total: 0,
          success_count: 0,
          error_count: 0,
          total_time_ms: 0,
        },
      };
    }

    try {
      const response = await this.client.post<BatchCalculationResult>('/calculate/batch', { plans });
      this.logger.info(`[MathOrchestrator] Executed batch of ${plans.length} calculations`);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      const errorMessage = axiosError.response?.data?.detail || axiosError.message;
      this.logger.error(`[MathOrchestrator] Batch calculation failed:`, errorMessage);
      return {
        success: false,
        results: [],
        summary: {
          total: plans.length,
          success_count: 0,
          error_count: plans.length,
          total_time_ms: 0,
        },
      };
    }
  }

  /**
   * Validate a calculation plan without executing it.
   * Useful for checking LLM-generated plans before execution.
   */
  async validatePlan(plan: CalculationPlan): Promise<{
    valid: boolean;
    error?: string;
    available_operations?: string[];
    required?: string[];
  }> {
    try {
      const response = await this.client.post('/validate', plan);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      return {
        valid: false,
        error: axiosError.response?.data?.detail || axiosError.message,
      };
    }
  }

  // ===========================================================================
  // OPERATION DISCOVERY
  // ===========================================================================

  /**
   * List all available math operations.
   * Useful for LLM to know what calculations are supported.
   */
  async listOperations(category?: string): Promise<{
    operations: string[];
    categories: string[];
    total_count: number;
    selected_category?: string;
  }> {
    try {
      const params = category ? { category } : {};
      const response = await this.client.get('/operations', { params });
      return response.data;
    } catch (error) {
      this.logger.error('[MathOrchestrator] Failed to list operations:', error);
      return {
        operations: CALCULATION_OPERATIONS,
        categories: ['financial', 'accounting', 'statistical', 'aggregation', 'engineering', 'time'],
        total_count: CALCULATION_OPERATIONS.length,
      };
    }
  }

  /**
   * Get the schema for a specific operation.
   * Returns input/output specifications for the LLM.
   */
  async getOperationSchema(operation: string): Promise<OperationSchema | null> {
    try {
      const response = await this.client.get<OperationSchema>(`/operations/${operation}`);
      return response.data;
    } catch (error) {
      this.logger.error(`[MathOrchestrator] Failed to get schema for ${operation}:`, error);
      return null;
    }
  }

  // ===========================================================================
  // LLM INTEGRATION HELPERS
  // ===========================================================================

  /**
   * Format calculation results for LLM explanation.
   * Converts raw math results into a format the LLM can easily explain.
   */
  formatResultsForLLM(result: CalculationResult): string {
    if (!result.success) {
      return `Calculation error: ${result.error}`;
    }

    const lines: string[] = [
      `Operation: ${result.operation}`,
      'Results:',
    ];

    if (result.result) {
      for (const [key, value] of Object.entries(result.result)) {
        const formattedValue = typeof value === 'number'
          ? this.formatNumber(value)
          : JSON.stringify(value);
        lines.push(`  ${key}: ${formattedValue}`);
      }
    }

    if (result.metadata) {
      lines.push(`\n(Computed in ${result.metadata.execution_time_ms}ms)`);
    }

    return lines.join('\n');
  }

  /**
   * Generate a calculation plan prompt for the LLM.
   * Guides the LLM on how to structure calculation requests.
   */
  getCalculationPromptGuidance(category?: string): string {
    const operations = category
      ? CALCULATION_OPERATIONS.filter(op => op.includes(category))
      : CALCULATION_OPERATIONS;

    return `
To perform calculations, generate a JSON plan with this structure:
{
  "operation": "<operation_name>",
  "inputs": { <required_inputs> }
}

Available operations: ${operations.join(', ')}

Example for CAGR calculation:
{
  "operation": "calculate_cagr",
  "inputs": {
    "start_value": 2300000,
    "end_value": 3450000,
    "periods": 12
  }
}

The math engine will execute this and return exact results.
`.trim();
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private formatNumber(value: number): string {
    // Format percentages
    if (Math.abs(value) <= 1 && value !== 0 && value !== 1) {
      return `${(value * 100).toFixed(2)}%`;
    }
    // Format large numbers with commas
    if (Math.abs(value) >= 1000) {
      return value.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
    }
    // Format small decimals
    return value.toFixed(4).replace(/\.?0+$/, '');
  }
}

// Singleton instance
export const mathOrchestratorService = new MathOrchestratorService();

export default MathOrchestratorService;
