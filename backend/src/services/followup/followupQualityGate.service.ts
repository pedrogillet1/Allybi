/**
 * Follow-up Quality Gate Service
 *
 * Validates follow-up suggestions before they reach the UI.
 * Ensures suggestions are:
 * - Relevant to the current context
 * - Feasible (capability-supported)
 * - Non-redundant
 * - High-value
 * - In the correct language
 */

import { FollowUpSuggestion, LatestResult } from './followupGenerator.service';
import { ConversationState } from '../../types/conversationState.types';
import { getCapabilityRegistry, FollowUpActionType } from './capabilityRegistry.service';

export interface QualityGateResult {
  passed: boolean;
  suggestion: FollowUpSuggestion;
  failureReasons: string[];
}

export interface QualityGateConfig {
  requireRelevance: boolean;
  requireFeasibility: boolean;
  requireNonRedundant: boolean;
  requireHighValue: boolean;
  requireLanguageMatch: boolean;
}

const DEFAULT_CONFIG: QualityGateConfig = {
  requireRelevance: true,
  requireFeasibility: true,
  requireNonRedundant: true,
  requireHighValue: true,
  requireLanguageMatch: true,
};

export class FollowUpQualityGate {
  private static instance: FollowUpQualityGate;
  private config: QualityGateConfig;
  private capabilities = getCapabilityRegistry();
  private recentSuggestions: Map<string, number> = new Map(); // action -> timestamp

  private constructor(config: QualityGateConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  static getInstance(): FollowUpQualityGate {
    if (!FollowUpQualityGate.instance) {
      FollowUpQualityGate.instance = new FollowUpQualityGate();
    }
    return FollowUpQualityGate.instance;
  }

  /**
   * Validate a list of suggestions, returning only those that pass
   */
  validate(
    suggestions: FollowUpSuggestion[],
    state: ConversationState,
    result: LatestResult,
    userLanguage: 'en' | 'pt' | 'es'
  ): FollowUpSuggestion[] {
    const passed: FollowUpSuggestion[] = [];

    for (const suggestion of suggestions) {
      const gateResult = this.validateSingle(suggestion, state, result, userLanguage);
      if (gateResult.passed) {
        passed.push(suggestion);
        // Track for redundancy check
        this.recentSuggestions.set(suggestion.action, Date.now());
      }
    }

    // Clean old entries (older than 5 minutes)
    this.cleanOldSuggestions();

    return passed;
  }

  /**
   * Validate a single suggestion
   */
  validateSingle(
    suggestion: FollowUpSuggestion,
    state: ConversationState,
    result: LatestResult,
    userLanguage: 'en' | 'pt' | 'es'
  ): QualityGateResult {
    const failureReasons: string[] = [];

    // 1. Relevance check
    if (this.config.requireRelevance) {
      if (!this.checkRelevance(suggestion, state, result)) {
        failureReasons.push('not_relevant');
      }
    }

    // 2. Feasibility check
    if (this.config.requireFeasibility) {
      if (!this.checkFeasibility(suggestion, result)) {
        failureReasons.push('not_feasible');
      }
    }

    // 3. Non-redundant check
    if (this.config.requireNonRedundant) {
      if (!this.checkNonRedundant(suggestion)) {
        failureReasons.push('redundant');
      }
    }

    // 4. High-value check
    if (this.config.requireHighValue) {
      if (!this.checkHighValue(suggestion, state, result)) {
        failureReasons.push('low_value');
      }
    }

    // 5. Language match check
    if (this.config.requireLanguageMatch) {
      if (!this.checkLanguageMatch(suggestion, userLanguage)) {
        failureReasons.push('language_mismatch');
      }
    }

    return {
      passed: failureReasons.length === 0,
      suggestion,
      failureReasons,
    };
  }

  /**
   * Check if suggestion is relevant to current context
   */
  private checkRelevance(
    suggestion: FollowUpSuggestion,
    state: ConversationState,
    result: LatestResult
  ): boolean {
    // File-related suggestions need a file context
    if (['summarize_file', 'find_mentions', 'extract_key_sections'].includes(suggestion.action)) {
      return !!state.lastReferencedFileId || result.sourcesUsed.length > 0;
    }

    // Spreadsheet suggestions need spreadsheet context
    if (['compare_periods', 'show_table', 'explain_outlier'].includes(suggestion.action)) {
      return !!result.spreadsheetContext;
    }

    // Source-related suggestions need sources
    if (['show_sources', 'open_section'].includes(suggestion.action)) {
      return result.hasSourceButtons || result.sourcesUsed.length > 0;
    }

    // Clarification suggestions need ambiguity
    if (['clarify_file', 'clarify_period', 'clarify_metric'].includes(suggestion.action)) {
      return result.hasAmbiguity;
    }

    return true;
  }

  /**
   * Check if suggestion is technically feasible
   */
  private checkFeasibility(suggestion: FollowUpSuggestion, result: LatestResult): boolean {
    // Check capability registry
    if (!this.capabilities.isActionFeasible(suggestion.action)) {
      return false;
    }

    // Check file type support for file-specific actions
    if (result.matchingFiles?.[0]?.mimeType) {
      const mimeType = result.matchingFiles[0].mimeType;
      if (['summarize', 'extract', 'locate'].includes(suggestion.action)) {
        return this.capabilities.fileTypeSupports(
          mimeType,
          suggestion.action as 'summarize' | 'extract' | 'locate'
        );
      }
    }

    return true;
  }

  /**
   * Check if suggestion is not redundant (not recently shown)
   */
  private checkNonRedundant(suggestion: FollowUpSuggestion): boolean {
    const lastShown = this.recentSuggestions.get(suggestion.action);
    if (!lastShown) return true;

    // Don't show same suggestion within 30 seconds
    const REDUNDANCY_WINDOW_MS = 30000;
    return Date.now() - lastShown > REDUNDANCY_WINDOW_MS;
  }

  /**
   * Check if suggestion provides high value
   */
  private checkHighValue(
    suggestion: FollowUpSuggestion,
    state: ConversationState,
    result: LatestResult
  ): boolean {
    // Ambiguity resolution is always high value
    if (['clarify_file', 'clarify_period', 'clarify_metric'].includes(suggestion.action)) {
      return true;
    }

    // Deepening answer is high value for broad queries
    if (['extract_related', 'show_table', 'compare'].includes(suggestion.action)) {
      return ['summarize', 'extract', 'qa'].includes(result.operator);
    }

    // File opening is high value after file actions
    if (['open_newest', 'open_section', 'open_top_match'].includes(suggestion.action)) {
      return result.matchingFiles && result.matchingFiles.length > 0;
    }

    // Generic suggestions like "list_files" are low value unless stuck
    if (suggestion.action === 'list_files') {
      return result.documentCount === 0;
    }

    return true;
  }

  /**
   * Check if suggestion label matches user language
   */
  private checkLanguageMatch(
    suggestion: FollowUpSuggestion,
    userLanguage: 'en' | 'pt' | 'es'
  ): boolean {
    // Simple heuristics - could be more sophisticated
    const label = suggestion.label.toLowerCase();

    if (userLanguage === 'pt') {
      // Should not contain common English words in PT context
      const englishMarkers = ['show', 'open', 'find', 'extract', 'compare'];
      return !englishMarkers.some(marker => label.includes(marker));
    }

    if (userLanguage === 'es') {
      const englishMarkers = ['show', 'open', 'find', 'extract', 'compare'];
      return !englishMarkers.some(marker => label.includes(marker));
    }

    // English - should not contain PT/ES words
    const nonEnglishMarkers = ['ver', 'abrir', 'encontrar', 'extrair', 'mostrar'];
    return !nonEnglishMarkers.some(marker => label.includes(marker));
  }

  /**
   * Clean suggestions older than 5 minutes
   */
  private cleanOldSuggestions(): void {
    const CLEANUP_AGE_MS = 5 * 60 * 1000;
    const now = Date.now();

    for (const [action, timestamp] of this.recentSuggestions) {
      if (now - timestamp > CLEANUP_AGE_MS) {
        this.recentSuggestions.delete(action);
      }
    }
  }

  /**
   * Reset redundancy tracking (useful for testing)
   */
  resetRedundancyTracking(): void {
    this.recentSuggestions.clear();
  }
}

export function getFollowUpQualityGate(): FollowUpQualityGate {
  return FollowUpQualityGate.getInstance();
}

/**
 * Convenience function to validate follow-ups
 */
export function validateFollowUps(
  suggestions: FollowUpSuggestion[],
  state: ConversationState,
  result: LatestResult,
  userLanguage: 'en' | 'pt' | 'es'
): FollowUpSuggestion[] {
  return getFollowUpQualityGate().validate(suggestions, state, result, userLanguage);
}
