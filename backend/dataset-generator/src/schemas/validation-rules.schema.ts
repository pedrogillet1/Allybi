/**
 * Schema: Validation Rules
 * Rules for validating and refining intent classification
 */

import { LanguageCode, SUPPORTED_LANGUAGES } from './patterns.schema.js';
import { IntentName, ValidationVariation, GENERATION_TARGETS } from './intents.schema.js';

// =============================================================================
// VALIDATION RULE ENTRY
// =============================================================================

export interface ValidationRule {
  /** Unique rule identifier */
  id: string;
  /** Rule name/title */
  name: string;
  /** Detailed description of the rule */
  description: string;
  /** Parent intent */
  intent: IntentName;
  /** Specific sub-intent */
  subIntent: string;
  /** Rule type/variation */
  variation: ValidationVariation;
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
  /** Languages this rule applies to (empty = all) */
  languages?: LanguageCode[];
  /** Priority (higher = applied first) */
  priority?: number;
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

export const VALIDATION_VARIATION_DESCRIPTIONS: Record<ValidationVariation, string> = {
  required_context: 'Rules that require certain context to be present for the intent to match.',
  exclusions: 'Rules that exclude certain patterns or contexts that indicate a different intent.',
  confidence_modifiers: 'Rules that boost or penalize confidence based on specific signals.'
};

// Distribution guidance for generation
export const VALIDATION_DISTRIBUTION = {
  required_context: 0.35,     // 35% required context rules
  exclusions: 0.35,           // 35% exclusion rules
  confidence_modifiers: 0.30  // 30% confidence modifiers
} as const;

// =============================================================================
// DATASET STRUCTURE
// =============================================================================

export interface ValidationRuleDataset {
  schemaVersion: '1.0';
  type: 'validation_rules';
  generatedAt: string;
  params: {
    intent: IntentName;
    subIntent: string;
    targetCount: number;
    variations: ValidationVariation[];
  };
  rules: ValidationRule[];
}

// =============================================================================
// JSON SCHEMA FOR VALIDATION
// =============================================================================

export const validationRuleJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'rules'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'validation_rules' },
    generatedAt: { type: 'string', format: 'date-time' },
    params: {
      type: 'object',
      required: ['intent', 'subIntent', 'targetCount', 'variations'],
      properties: {
        intent: { type: 'string' },
        subIntent: { type: 'string' },
        targetCount: { type: 'number', minimum: 1 },
        variations: {
          type: 'array',
          items: { enum: [...GENERATION_TARGETS.validationRules.variations] }
        }
      }
    },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'description', 'intent', 'subIntent', 'variation', 'rule'],
        properties: {
          id: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 3 },
          description: { type: 'string', minLength: 10 },
          intent: { type: 'string' },
          subIntent: { type: 'string' },
          variation: { enum: [...GENERATION_TARGETS.validationRules.variations] },
          rule: {
            type: 'object',
            required: ['type', 'condition'],
            properties: {
              type: { enum: ['requires', 'excludes', 'boost', 'penalize'] },
              condition: { type: 'string', minLength: 3 },
              values: { type: 'array', items: { type: 'string' } },
              modifier: { type: 'number', minimum: -1, maximum: 1 }
            }
          },
          languages: {
            type: 'array',
            items: { enum: [...SUPPORTED_LANGUAGES] }
          },
          priority: { type: 'number', minimum: 0, maximum: 100 },
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
