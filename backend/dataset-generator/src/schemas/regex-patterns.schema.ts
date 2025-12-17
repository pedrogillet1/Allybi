/**
 * Schema: Regex Patterns
 * Regex patterns for intent matching
 */

import { LanguageCode, SUPPORTED_LANGUAGES } from './patterns.schema.js';
import { IntentName, PatternVariation, GENERATION_TARGETS } from './intents.schema.js';

// =============================================================================
// PATTERN ENTRY
// =============================================================================

export interface RegexPattern {
  /** The regex pattern */
  pattern: string;
  /** Language of the pattern */
  language: LanguageCode;
  /** Parent intent */
  intent: IntentName;
  /** Specific sub-intent */
  subIntent: string;
  /** Pattern variation type */
  variation: PatternVariation;
  /** Priority for matching (higher = checked first) */
  priority?: number;
  /** Description of what this pattern matches */
  description?: string;
  /** Metadata */
  meta?: {
    source?: 'seed' | 'generated';
    batchId?: string;
    createdAt?: string;
  };
}

// =============================================================================
// VARIATION DESCRIPTIONS (for prompts)
// =============================================================================

export const PATTERN_VARIATION_DESCRIPTIONS: Record<PatternVariation, string> = {
  anchored: 'Patterns anchored to start/end of query. High precision matching.',
  question_forms: 'Patterns for question-style queries (what, how, why, can you, etc.).',
  command_forms: 'Patterns for command/imperative queries (show me, find, list, etc.).'
};

// Distribution guidance for generation
export const PATTERN_DISTRIBUTION = {
  anchored: 0.30,       // 30% anchored patterns
  question_forms: 0.40, // 40% question forms
  command_forms: 0.30   // 30% command forms
} as const;

// =============================================================================
// DATASET STRUCTURE
// =============================================================================

export interface RegexPatternDataset {
  schemaVersion: '1.0';
  type: 'regex_patterns';
  generatedAt: string;
  params: {
    intent: IntentName;
    subIntent: string;
    language: LanguageCode;
    targetCount: number;
    variations: PatternVariation[];
  };
  patterns: RegexPattern[];
}

// =============================================================================
// JSON SCHEMA FOR VALIDATION
// =============================================================================

export const regexPatternJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'patterns'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'regex_patterns' },
    generatedAt: { type: 'string', format: 'date-time' },
    params: {
      type: 'object',
      required: ['intent', 'subIntent', 'language', 'targetCount', 'variations'],
      properties: {
        intent: { type: 'string' },
        subIntent: { type: 'string' },
        language: { enum: [...SUPPORTED_LANGUAGES] },
        targetCount: { type: 'number', minimum: 1 },
        variations: {
          type: 'array',
          items: { enum: [...GENERATION_TARGETS.patterns.variations] }
        }
      }
    },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'language', 'intent', 'subIntent', 'variation'],
        properties: {
          pattern: { type: 'string', minLength: 3 },
          language: { enum: [...SUPPORTED_LANGUAGES] },
          intent: { type: 'string' },
          subIntent: { type: 'string' },
          variation: { enum: [...GENERATION_TARGETS.patterns.variations] },
          priority: { type: 'number', minimum: 0, maximum: 100 },
          description: { type: 'string' },
          meta: {
            type: 'object',
            properties: {
              source: { enum: ['seed', 'generated'] },
              batchId: { type: 'string' },
              createdAt: { type: 'string' }
            }
          }
        }
      }
    }
  }
};
