/**
 * Schema: Examples
 * User query examples for intent classification training
 */

import { LanguageCode, SUPPORTED_LANGUAGES } from './patterns.schema.js';
import { IntentName, ExampleVariation, GENERATION_TARGETS } from './intents.schema.js';

// =============================================================================
// EXAMPLE ENTRY
// =============================================================================

export interface Example {
  /** The example query text */
  text: string;
  /** Language of the example */
  language: LanguageCode;
  /** Parent intent */
  intent: IntentName;
  /** Specific sub-intent */
  subIntent: string;
  /** Example variation type */
  variation: ExampleVariation;
  /** Confidence this example represents the intent (0.0-1.0) */
  confidence?: number;
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

export const EXAMPLE_VARIATION_DESCRIPTIONS: Record<ExampleVariation, string> = {
  short: 'Brief, concise queries (3-8 words). Direct and to the point.',
  medium: 'Standard length queries (8-20 words). Natural conversational style.',
  long: 'Detailed queries (20-50 words). Include context, background, or multiple requirements.',
  messy: 'Realistic "messy" queries with typos, grammar errors, incomplete sentences, or informal language.',
  ambiguous: 'Queries that could match this intent but need clarification. Edge cases and boundary examples.'
};

// Distribution guidance for generation
export const EXAMPLE_DISTRIBUTION = {
  short: 0.25,      // 25% short
  medium: 0.35,     // 35% medium
  long: 0.15,       // 15% long
  messy: 0.15,      // 15% messy
  ambiguous: 0.10   // 10% ambiguous
} as const;

// =============================================================================
// DATASET STRUCTURE
// =============================================================================

export interface ExampleDataset {
  schemaVersion: '1.0';
  type: 'examples';
  generatedAt: string;
  params: {
    intent: IntentName;
    subIntent: string;
    language: LanguageCode;
    targetCount: number;
    variations: ExampleVariation[];
  };
  examples: Example[];
}

// =============================================================================
// JSON SCHEMA FOR VALIDATION
// =============================================================================

export const exampleJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'examples'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'examples' },
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
          items: { enum: [...GENERATION_TARGETS.examples.variations] }
        }
      }
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'language', 'intent', 'subIntent', 'variation'],
        properties: {
          text: { type: 'string', minLength: 2 },
          language: { enum: [...SUPPORTED_LANGUAGES] },
          intent: { type: 'string' },
          subIntent: { type: 'string' },
          variation: { enum: [...GENERATION_TARGETS.examples.variations] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
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
