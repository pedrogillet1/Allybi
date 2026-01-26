/**
 * Follow-up Generator Service
 *
 * Generates ChatGPT-quality follow-up suggestions based on:
 * - Current conversation state
 * - Latest response
 * - Capability registry
 * - Policy table
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConversationState, OperatorType } from '../../types/conversationState.types';
import { getCapabilityRegistry, FollowUpActionType } from './capabilityRegistry.service';

export interface FollowUpSuggestion {
  id: string;
  action: FollowUpActionType;
  label: string;
  priority: number;
  // Optional prefilled prompt
  prompt?: string;
  // Optional direct action payload
  payload?: Record<string, any>;
}

export interface FollowUpContext {
  state: ConversationState;
  latestResult: LatestResult;
  userLanguage: 'en' | 'pt' | 'es';
}

export interface LatestResult {
  intent: string;
  operator: OperatorType;
  hasSourceButtons: boolean;
  sourcesUsed: string[];
  documentCount: number;
  hasAmbiguity: boolean;
  ambiguityType?: 'multiple_files' | 'missing_period' | 'unclear_metric';
  matchingFiles?: Array<{ id: string; filename: string; mimeType: string }>;
  topicEntities?: string[];
  outputShape?: string;
  spreadsheetContext?: {
    docId: string;
    metric?: string;
    period?: string;
  };
}

interface PolicyEntry {
  action: string;
  priority: number;
  condition: string;
  labels: Record<string, string>;
}

interface PolicyConfig {
  operators: string[];
  allowed_followups: PolicyEntry[];
  disallowed: string[];
}

class FollowUpGenerator {
  private static instance: FollowUpGenerator;
  private policyTable: Record<string, PolicyConfig> = {};
  private capabilities = getCapabilityRegistry();

  private constructor() {
    this.loadPolicyTable();
  }

  static getInstance(): FollowUpGenerator {
    if (!FollowUpGenerator.instance) {
      FollowUpGenerator.instance = new FollowUpGenerator();
    }
    return FollowUpGenerator.instance;
  }

  private loadPolicyTable(): void {
    try {
      const policyPath = path.join(__dirname, '../../data_banks/templates/followup_policy.json');
      const content = fs.readFileSync(policyPath, 'utf-8');
      const data = JSON.parse(content);
      this.policyTable = data.policies || {};
    } catch (e) {
      console.error('[FollowUpGenerator] Failed to load policy table:', e);
      this.policyTable = {};
    }
  }

  /**
   * Generate follow-up suggestions (0-3)
   */
  generate(context: FollowUpContext): FollowUpSuggestion[] {
    const { state, latestResult, userLanguage } = context;
    const suggestions: FollowUpSuggestion[] = [];

    // 1. Determine which policy applies
    const policyKey = this.getPolicyKey(latestResult.intent, latestResult.operator);
    const policy = this.policyTable[policyKey];

    if (!policy) {
      return [];
    }

    // 2. Filter by conditions and capabilities
    for (const entry of policy.allowed_followups) {
      if (suggestions.length >= 3) break;

      // Check capability
      if (!this.capabilities.isActionFeasible(entry.action as FollowUpActionType)) {
        continue;
      }

      // Check condition
      if (!this.evaluateCondition(entry.condition, latestResult, state)) {
        continue;
      }

      // Build suggestion
      const suggestion = this.buildSuggestion(entry, userLanguage, latestResult, state);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    // 3. Apply max rules based on answer quality
    const maxFollowups = this.getMaxFollowups(latestResult);
    return suggestions.slice(0, maxFollowups);
  }

  private getPolicyKey(intent: string, operator: OperatorType): string {
    // Map intent/operator to policy key
    if (intent === 'documents' && ['summarize', 'extract', 'qa'].includes(operator)) {
      return 'documents_qa';
    }
    if (intent === 'documents' && ['locate', 'search'].includes(operator)) {
      return 'documents_locate';
    }
    if (['finance', 'excel', 'accounting'].includes(intent)) {
      return 'finance_excel';
    }
    if (intent === 'file_actions' && ['list', 'filter', 'inventory'].includes(operator)) {
      return 'file_list';
    }
    if (intent === 'file_actions' && ['open', 'show', 'locate'].includes(operator)) {
      return 'file_open';
    }
    if (operator === 'unknown') {
      return 'ambiguous';
    }
    return 'documents_qa'; // default
  }

  private evaluateCondition(condition: string, result: LatestResult, state: ConversationState): boolean {
    switch (condition) {
      case 'always':
        return true;

      case 'has_sources':
        return result.hasSourceButtons || result.sourcesUsed.length > 0;

      case 'single_doc_answer':
        return result.documentCount === 1;

      case 'has_topic_entities':
        return (result.topicEntities?.length || 0) > 0;

      case 'multiple_docs_available':
        return result.documentCount > 1;

      case 'has_location':
        return result.sourcesUsed.length > 0;

      case 'has_more_results':
        return result.documentCount > 3;

      case 'has_spreadsheet_context':
        return !!result.spreadsheetContext;

      case 'has_period_data':
        return !!result.spreadsheetContext?.period;

      case 'has_outlier':
        // Would need actual data analysis
        return !!result.spreadsheetContext;

      case 'has_metric':
        return !!result.spreadsheetContext?.metric;

      case 'has_files':
        return (result.matchingFiles?.length || 0) > 0;

      case 'has_single_match':
        return (result.matchingFiles?.length || 0) === 1;

      case 'mixed_types':
        if (!result.matchingFiles) return false;
        const types = new Set(result.matchingFiles.map(f => f.mimeType));
        return types.size > 1;

      case 'multiple_folders':
        // Would need folder data
        return false;

      case 'file_opened':
        return !!state.lastReferencedFileId;

      case 'similar_files_exist':
        // Would need file similarity check
        return false;

      case 'multiple_file_matches':
        return result.ambiguityType === 'multiple_files';

      case 'missing_period':
        return result.ambiguityType === 'missing_period';

      case 'unclear_metric':
        return result.ambiguityType === 'unclear_metric';

      default:
        return false;
    }
  }

  private buildSuggestion(
    entry: PolicyEntry,
    language: 'en' | 'pt' | 'es',
    result: LatestResult,
    state: ConversationState
  ): FollowUpSuggestion | null {
    const label = entry.labels[language] || entry.labels['en'];
    if (!label) return null;

    const suggestion: FollowUpSuggestion = {
      id: `followup_${entry.action}_${Date.now()}`,
      action: entry.action as FollowUpActionType,
      label,
      priority: entry.priority,
    };

    // Add action-specific payloads
    switch (entry.action) {
      case 'summarize_file':
        if (state.lastReferencedFileId) {
          suggestion.prompt = `Summarize ${state.lastReferencedFilename || 'this file'}`;
          suggestion.payload = { fileId: state.lastReferencedFileId };
        }
        break;

      case 'open_section':
      case 'open_newest':
        if (result.matchingFiles?.[0]) {
          suggestion.payload = {
            action: 'open',
            fileId: result.matchingFiles[0].id,
          };
        }
        break;

      case 'compare_periods':
        if (result.spreadsheetContext) {
          suggestion.prompt = 'Compare Q1 vs Q2';
        }
        break;

      case 'extract_related':
        if (result.topicEntities?.[0]) {
          suggestion.prompt = `Extract information about ${result.topicEntities[0]}`;
        }
        break;

      case 'clarify_file':
        if (result.matchingFiles) {
          suggestion.payload = {
            action: 'select_file',
            files: result.matchingFiles,
          };
        }
        break;
    }

    return suggestion;
  }

  private getMaxFollowups(result: LatestResult): number {
    if (result.hasAmbiguity) {
      return 3; // Ambiguity - offer more help
    }
    if (['summarize', 'extract'].includes(result.operator)) {
      return 2; // Broad query
    }
    return 1; // Direct answer - minimal followups
  }

  /**
   * Reload policy table (for hot reload during development)
   */
  reload(): void {
    this.loadPolicyTable();
  }
}

export function getFollowUpGenerator(): FollowUpGenerator {
  return FollowUpGenerator.getInstance();
}

/**
 * Convenience function to generate follow-ups
 */
export function generateFollowUps(context: FollowUpContext): FollowUpSuggestion[] {
  return getFollowUpGenerator().generate(context);
}
