/**
 * Follow-up Suppression Service
 *
 * Strict rules for when follow-up suggestions should NEVER appear.
 * Ensures ChatGPT-like experience with appropriate follow-ups only.
 *
 * Usage:
 * ```typescript
 * const suppressor = getFollowupSuppressor();
 * const shouldSuppress = suppressor.shouldSuppress(operator, context);
 * const followups = suppressor.getAllowedFollowups(operator, docScope, language);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { OperatorType } from './operatorResolver.service';

// ============================================================================
// Types
// ============================================================================

export type FollowupType =
  | 'filter'
  | 'sort'
  | 'open'
  | 'summarize'
  | 'extract_specific'
  | 'compare'
  | 'expand'
  | 'breakdown'
  | 'show_source'
  | 'list_files'
  | 'search'
  | 'recent'
  | 'refine_filter'
  | 'clear_filter'
  | 'reverse_sort'
  | 'extract_related'
  | 'compare_values'
  | 'show_context'
  | 'detailed_diff'
  | 'summarize_diff'
  | 'open_both'
  | 'compare_periods'
  | 'export'
  | 'simplify'
  | 'elaborate'
  | 'open_first'
  | 'summarize_same';

export type DocScope = 'single' | 'multi' | 'none';

export type ResponseType =
  | 'button_only'
  | 'clarification'
  | 'disambiguation'
  | 'confirmation'
  | 'error'
  | 'answer'
  | 'list';

export type ErrorType =
  | 'not_found'
  | 'no_data'
  | 'access_denied'
  | 'rate_limited'
  | 'timeout'
  | 'parsing_error'
  | 'ambiguous';

export type ActionType =
  | 'OPEN_FILE'
  | 'SELECT_FILE'
  | 'CONFIRM_DELETE'
  | 'SHOW_CLARIFY'
  | 'SHOW_DISAMBIGUATE'
  | 'NONE';

export interface SuppressionContext {
  operator: OperatorType;
  intent?: string;
  docScope?: DocScope;
  responseType?: ResponseType;
  errorType?: ErrorType;
  actionType?: ActionType;
  responseLength?: number;
  hasSourceButtons?: boolean;
  language?: 'en' | 'pt' | 'es';
}

export interface FollowupSuggestion {
  type: FollowupType;
  label: string;
  action?: string;
  metadata?: Record<string, any>;
}

export interface SuppressionResult {
  suppress: boolean;
  reason?: string;
  allowedFollowups?: FollowupType[];
}

interface SuppressionPolicy {
  always_suppress: {
    operators: OperatorType[];
    reason: string;
  };
  suppress_on_error: {
    error_types: ErrorType[];
    reason: string;
  };
  suppress_on_action: {
    action_types: ActionType[];
    reason: string;
  };
  suppress_on_response_type: {
    response_types: ResponseType[];
  };
  conditional_suppress: {
    rules: Array<{
      id: string;
      condition: string;
      suppress: boolean;
      allow_followups?: FollowupType[];
      reason?: string;
    }>;
  };
  allowed_operators: Record<
    string,
    {
      max_followups: number;
      allowed_types: FollowupType[];
    }
  >;
  followup_templates: Record<string, Record<string, string>>;
  chatgpt_style_phrases: Record<string, string[]>;
}

// ============================================================================
// Service
// ============================================================================

export class FollowupSuppressionService {
  private policy: SuppressionPolicy | null = null;

  // Always-suppress operators (hardcoded for reliability)
  private readonly alwaysSuppressOperators: Set<OperatorType> = new Set<OperatorType>([
    'open',
    'locate_file',
    'locate_content',
    'clarify',
    'disambiguate',
    'confirm',
    'delete',
  ] as OperatorType[]);

  // Always-suppress error types
  private readonly alwaysSuppressErrors: Set<ErrorType> = new Set<ErrorType>([
    'not_found',
    'no_data',
    'access_denied',
    'rate_limited',
    'timeout',
    'parsing_error',
    'ambiguous',
  ] as ErrorType[]);

  // Always-suppress action types
  private readonly alwaysSuppressActions: Set<ActionType> = new Set<ActionType>([
    'OPEN_FILE',
    'SELECT_FILE',
    'CONFIRM_DELETE',
    'SHOW_CLARIFY',
    'SHOW_DISAMBIGUATE',
  ] as ActionType[]);

  // Always-suppress response types
  private readonly alwaysSuppressResponseTypes: Set<ResponseType> = new Set<ResponseType>([
    'button_only',
    'clarification',
    'disambiguation',
    'confirmation',
    'error',
  ] as ResponseType[]);

  constructor() {
    this.loadPolicy();
  }

  private loadPolicy(): void {
    try {
      const policyPath = path.join(
        __dirname,
        '../../data_banks/formatting/followup_suppression.json'
      );

      if (fs.existsSync(policyPath)) {
        this.policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
        console.log('✅ [FollowupSuppression] Policy loaded');
      } else {
        console.warn('⚠️ [FollowupSuppression] Policy not found, using defaults');
      }
    } catch (error: any) {
      console.error('❌ [FollowupSuppression] Load failed:', error.message);
    }
  }

  /**
   * Check if follow-ups should be suppressed
   */
  public shouldSuppress(context: SuppressionContext): SuppressionResult {
    const { operator, errorType, actionType, responseType, responseLength } = context;

    // CHECK 1: Always-suppress operators
    if (this.alwaysSuppressOperators.has(operator)) {
      return {
        suppress: true,
        reason: `Operator '${operator}' never has follow-ups`,
      };
    }

    // CHECK 2: Error types
    if (errorType && this.alwaysSuppressErrors.has(errorType)) {
      return {
        suppress: true,
        reason: `Error type '${errorType}' never has follow-ups`,
      };
    }

    // CHECK 3: Action types
    if (actionType && this.alwaysSuppressActions.has(actionType)) {
      return {
        suppress: true,
        reason: `Action type '${actionType}' never has follow-ups`,
      };
    }

    // CHECK 4: Response types
    if (responseType && this.alwaysSuppressResponseTypes.has(responseType)) {
      return {
        suppress: true,
        reason: `Response type '${responseType}' never has follow-ups`,
      };
    }

    // CHECK 5: Very short responses (< 50 chars)
    if (responseLength !== undefined && responseLength < 50) {
      return {
        suppress: true,
        reason: 'Response too short for follow-ups',
      };
    }

    // CHECK 6: Get allowed follow-ups for this operator
    const allowedTypes = this.getAllowedTypes(operator);
    if (allowedTypes.length === 0) {
      return {
        suppress: true,
        reason: `No follow-ups configured for '${operator}'`,
      };
    }

    return {
      suppress: false,
      allowedFollowups: allowedTypes,
    };
  }

  /**
   * Get allowed follow-up types for an operator
   */
  public getAllowedTypes(operator: OperatorType): FollowupType[] {
    const config = this.policy?.allowed_operators[operator];
    return config?.allowed_types || [];
  }

  /**
   * Get max follow-ups for an operator
   */
  public getMaxFollowups(operator: OperatorType): number {
    const config = this.policy?.allowed_operators[operator];
    return config?.max_followups || 0;
  }

  /**
   * Get follow-up suggestions for context
   */
  public getFollowups(
    context: SuppressionContext
  ): FollowupSuggestion[] {
    const result = this.shouldSuppress(context);

    if (result.suppress) {
      return [];
    }

    const language = context.language || 'en';
    const allowedTypes = result.allowedFollowups || [];
    const maxFollowups = this.getMaxFollowups(context.operator);
    const templates = this.policy?.followup_templates[language] || {};

    const suggestions: FollowupSuggestion[] = [];

    for (const type of allowedTypes.slice(0, maxFollowups)) {
      const label = templates[type] || this.getDefaultLabel(type, language);
      suggestions.push({
        type,
        label,
      });
    }

    return suggestions;
  }

  /**
   * Get ChatGPT-style short phrases
   */
  public getChatGPTStylePhrases(language: 'en' | 'pt' | 'es' = 'en'): string[] {
    const lang = language === 'es' ? 'en' : language; // Fallback ES to EN
    return this.policy?.chatgpt_style_phrases[lang] || [];
  }

  /**
   * Get default label for a follow-up type
   */
  private getDefaultLabel(type: FollowupType, language: string): string {
    const defaults: Record<string, Record<string, string>> = {
      en: {
        filter: 'Filter',
        sort: 'Sort',
        open: 'Open',
        summarize: 'Summarize',
        extract_specific: 'Extract',
        compare: 'Compare',
        expand: 'More details',
        breakdown: 'Breakdown',
        show_source: 'Show source',
        list_files: 'List files',
        search: 'Search',
        recent: 'Recent',
        refine_filter: 'Refine filter',
        clear_filter: 'Clear filter',
        reverse_sort: 'Reverse order',
        extract_related: 'Related data',
        compare_values: 'Compare values',
        show_context: 'Show context',
        detailed_diff: 'Detailed diff',
        summarize_diff: 'Summarize diff',
        open_both: 'Open both',
        compare_periods: 'Compare periods',
        export: 'Export',
        simplify: 'Simplify',
        elaborate: 'Elaborate',
        open_first: 'Open first',
        summarize_same: 'Summarize',
      },
      pt: {
        filter: 'Filtrar',
        sort: 'Ordenar',
        open: 'Abrir',
        summarize: 'Resumir',
        extract_specific: 'Extrair',
        compare: 'Comparar',
        expand: 'Mais detalhes',
        breakdown: 'Detalhamento',
        show_source: 'Ver fonte',
        list_files: 'Listar arquivos',
        search: 'Buscar',
        recent: 'Recentes',
        refine_filter: 'Refinar filtro',
        clear_filter: 'Limpar filtro',
        reverse_sort: 'Inverter ordem',
        extract_related: 'Dados relacionados',
        compare_values: 'Comparar valores',
        show_context: 'Ver contexto',
        detailed_diff: 'Diferenças detalhadas',
        summarize_diff: 'Resumo das diferenças',
        open_both: 'Abrir ambos',
        compare_periods: 'Comparar períodos',
        export: 'Exportar',
        simplify: 'Simplificar',
        elaborate: 'Elaborar',
        open_first: 'Abrir primeiro',
        summarize_same: 'Resumir',
      },
    };

    return defaults[language]?.[type] || defaults.en[type] || type;
  }

  /**
   * Check if operator is in always-suppress list
   */
  public isAlwaysSuppressed(operator: OperatorType): boolean {
    return this.alwaysSuppressOperators.has(operator);
  }

  /**
   * Check if error type suppresses follow-ups
   */
  public isErrorSuppressed(errorType: ErrorType): boolean {
    return this.alwaysSuppressErrors.has(errorType);
  }

  /**
   * Get DocScope-aware follow-ups
   */
  public getDocScopeFollowups(
    operator: OperatorType,
    docScope: DocScope,
    language: 'en' | 'pt' | 'es' = 'en'
  ): FollowupSuggestion[] {
    // Don't show follow-ups for 'none' scope
    if (docScope === 'none') {
      return [];
    }

    const result = this.shouldSuppress({ operator, docScope, language });
    if (result.suppress) {
      return [];
    }

    const templates = this.policy?.followup_templates[language] || {};
    const allowedTypes = result.allowedFollowups || [];

    // Filter based on docScope
    const scopeAppropriate = allowedTypes.filter((type) => {
      if (docScope === 'single') {
        // Single doc: focus on that document
        return ['expand', 'extract_specific', 'show_source', 'summarize'].includes(type);
      } else {
        // Multi doc: focus on navigation/comparison
        return ['filter', 'sort', 'compare', 'open'].includes(type);
      }
    });

    const maxFollowups = this.getMaxFollowups(operator);
    return scopeAppropriate.slice(0, maxFollowups).map((type) => ({
      type,
      label: templates[type] || this.getDefaultLabel(type, language),
    }));
  }

  /**
   * Get service stats
   */
  public getStats(): {
    alwaysSuppressCount: number;
    errorSuppressCount: number;
    actionSuppressCount: number;
    allowedOperatorCount: number;
  } {
    return {
      alwaysSuppressCount: this.alwaysSuppressOperators.size,
      errorSuppressCount: this.alwaysSuppressErrors.size,
      actionSuppressCount: this.alwaysSuppressActions.size,
      allowedOperatorCount: Object.keys(this.policy?.allowed_operators || {}).length,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: FollowupSuppressionService | null = null;

export function getFollowupSuppressor(): FollowupSuppressionService {
  if (!instance) {
    instance = new FollowupSuppressionService();
  }
  return instance;
}

export default FollowupSuppressionService;
