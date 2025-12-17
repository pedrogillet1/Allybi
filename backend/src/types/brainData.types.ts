/**
 * Brain Data Type Definitions
 *
 * Type definitions for all brain data loaded by BrainDataLoaderService.
 * These types define the "data contracts" for intent classification data.
 */

import { LanguageCode, IntentName } from './intentV3.types';

// =============================================================================
// CORE ENUMS & BASE TYPES
// =============================================================================

/**
 * Intent family (high-level grouping)
 */
export type IntentFamily =
  | 'documents'
  | 'help'
  | 'conversation'
  | 'edit'
  | 'reasoning'
  | 'memory'
  | 'error'
  | 'preferences'
  | 'extraction'
  | 'domain_specialized';

/**
 * Sub-intent identifiers
 */
export type SubIntent = string; // Flexible for now, can be narrowed per family

/**
 * Base metadata for all brain data entries
 */
export interface BrainDataMeta {
  /** High-level intent family */
  intentFamily: IntentFamily;
  /** Primary intent name */
  intent: IntentName;
  /** Specific sub-intent */
  subIntent: SubIntent;
  /** Language code */
  language: LanguageCode;
  /** Confidence score (0.0-1.0) */
  confidence?: number;
  /** Priority for matching (higher = checked first) */
  priority: number;
  /** Tags for filtering and categorization */
  tags: string[];
}

// =============================================================================
// INTENT PATTERNS (Keywords + Regex + Synonyms)
// =============================================================================

/**
 * Keyword entry for intent matching
 */
export interface BrainKeyword extends BrainDataMeta {
  /** The keyword or phrase */
  text: string;
  /** Keyword variation type */
  variation: 'core' | 'synonyms' | 'domain' | 'colloquial' | 'misspellings';
  /** Weight for scoring (0.0-1.0) */
  weight?: number;
}

/**
 * Regex pattern entry for intent matching
 */
export interface BrainPattern extends BrainDataMeta {
  /** The regex pattern string */
  pattern: string;
  /** Compiled regex (set at runtime) */
  compiledPattern?: RegExp;
  /** Pattern variation type */
  variation: 'anchored' | 'question_forms' | 'command_forms';
  /** Description of what the pattern matches */
  description?: string;
}

/**
 * Synonym mapping for intent matching
 */
export interface BrainSynonym extends BrainDataMeta {
  /** The base/canonical term */
  baseTerm: string;
  /** Synonym of the base term */
  synonym: string;
  /** Similarity score (0.0-1.0) */
  similarity?: number;
}

// =============================================================================
// FALLBACK SCENARIOS
// =============================================================================

/**
 * Fallback style template
 */
export interface FallbackStyleTemplate {
  /** Style ID */
  id: string;
  /** Max response length */
  maxLength?: number;
  /** Response structure hints */
  structure?: string[];
  /** Response tone */
  tone?: string;
  /** Render hints for frontend */
  renderHint?: {
    layout?: string;
    showIcon?: boolean;
    icon?: string;
  };
  /** Localized templates */
  templates: Record<LanguageCode, {
    template: string;
    placeholders?: string[];
  }>;
}

/**
 * Fallback scenario entry
 */
export interface BrainFallback extends BrainDataMeta {
  /** Scenario key (e.g., NO_DOCUMENTS, OUT_OF_SCOPE) */
  scenarioKey: string;
  /** Scenario category */
  category: string;
  /** Description of when this fallback is used */
  description?: string;
  /** Available response styles */
  styles: FallbackStyleTemplate[];
}

// =============================================================================
// VALIDATION RULES
// =============================================================================

/**
 * Validation rule entry
 */
export interface BrainValidationRule extends BrainDataMeta {
  /** Unique rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Detailed description */
  description: string;
  /** Rule variation type */
  variation: 'required_context' | 'exclusions' | 'confidence_modifiers';
  /** Rule definition */
  rule: {
    /** Condition type */
    type: 'requires' | 'excludes' | 'boost' | 'penalize';
    /** What the rule checks for */
    condition: string;
    /** Keywords or patterns to check */
    values?: string[];
    /** Confidence modifier (-1.0 to 1.0) */
    modifier?: number;
  };
}

// =============================================================================
// ANSWER STYLES
// =============================================================================

/**
 * Answer style configuration
 */
export interface BrainAnswerStyle extends BrainDataMeta {
  /** Style name */
  name: string;
  /** Title shown in response */
  title: string;
  /** Description of the style */
  description: string;
  /** Output format (markdown, plain, etc.) */
  format: string;
  /** Response template */
  template: string;
  /** Whether sources are included */
  hasSources: boolean;
  /** Render hints for frontend */
  renderHints?: Record<string, boolean>;
}

// =============================================================================
// DOMAIN VOCABULARY
// =============================================================================

/**
 * Domain-specific vocabulary entry
 */
export interface BrainDomainVocab extends BrainDataMeta {
  /** The domain (finance, legal, medical, accounting, engineering, excel) */
  domain: string;
  /** The term */
  term: string;
  /** Localized definition */
  definition: string;
  /** Related terms */
  relatedTerms?: string[];
  /** Usage examples */
  examples?: string[];
}

// =============================================================================
// EXAMPLE QUERIES
// =============================================================================

/**
 * Example query for testing/training
 */
export interface BrainExample extends BrainDataMeta {
  /** The example query text */
  text: string;
  /** Example variation type */
  variation: 'short' | 'medium' | 'long' | 'messy' | 'ambiguous';
  /** Source of the example */
  source?: 'seed' | 'generated' | 'production';
}

// =============================================================================
// EDGE CASES & AMBIGUITY SAMPLES
// =============================================================================

/**
 * Edge case sample
 */
export interface BrainEdgeCase extends BrainDataMeta {
  /** The edge case query */
  text: string;
  /** Why this is an edge case */
  reason: string;
  /** Expected handling */
  expectedHandling: 'classify' | 'fallback' | 'clarify';
  /** Alternative intents that might match */
  alternativeIntents?: IntentName[];
}

// =============================================================================
// AGGREGATED BRAIN DATA
// =============================================================================

/**
 * Complete brain data loaded by BrainDataLoaderService
 */
export interface BrainData {
  /** Keywords for intent matching */
  keywords: BrainKeyword[];
  /** Regex patterns for intent matching */
  patterns: BrainPattern[];
  /** Synonym mappings */
  synonyms: BrainSynonym[];
  /** Fallback scenarios */
  fallbacks: BrainFallback[];
  /** Validation rules */
  validationRules: BrainValidationRule[];
  /** Answer style configurations */
  answerStyles: BrainAnswerStyle[];
  /** Domain-specific vocabulary */
  domainVocab: BrainDomainVocab[];
  /** Example queries */
  examples: BrainExample[];
  /** Edge cases */
  edgeCases: BrainEdgeCase[];
}

/**
 * Brain data statistics
 */
export interface BrainDataStats {
  keywords: { total: number; byLanguage: Record<LanguageCode, number>; byIntent: Record<string, number> };
  patterns: { total: number; byLanguage: Record<LanguageCode, number>; byIntent: Record<string, number> };
  synonyms: { total: number; byLanguage: Record<LanguageCode, number> };
  fallbacks: { total: number; byCategory: Record<string, number> };
  validationRules: { total: number; byIntent: Record<string, number> };
  answerStyles: { total: number; byIntent: Record<string, number> };
  domainVocab: { total: number; byDomain: Record<string, number> };
  examples: { total: number; byIntent: Record<string, number>; byVariation: Record<string, number> };
  edgeCases: { total: number; byIntent: Record<string, number> };
  loadedAt: string;
  version: string;
}

/**
 * Query options for filtering brain data
 */
export interface BrainDataQuery {
  intentFamily?: IntentFamily;
  intent?: IntentName;
  subIntent?: SubIntent;
  language?: LanguageCode;
  tags?: string[];
  minPriority?: number;
  minConfidence?: number;
}
