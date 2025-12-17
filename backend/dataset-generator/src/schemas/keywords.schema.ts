/**
 * Schema: Keywords
 * Keywords and phrases for intent matching
 */

import { LanguageCode, SUPPORTED_LANGUAGES } from './patterns.schema.js';
import { IntentName, KeywordVariation, GENERATION_TARGETS } from './intents.schema.js';

// =============================================================================
// KEYWORD ENTRY
// =============================================================================

export interface Keyword {
  /** The keyword or phrase */
  text: string;
  /** Language of the keyword */
  language: LanguageCode;
  /** Parent intent */
  intent: IntentName;
  /** Specific sub-intent */
  subIntent: string;
  /** Keyword variation type */
  variation: KeywordVariation;
  /** Weight/importance for matching (0.0-1.0) */
  weight?: number;
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

export const KEYWORD_VARIATION_DESCRIPTIONS: Record<KeywordVariation, string> = {
  core: 'Primary keywords that strongly indicate this intent. High-signal terms.',
  synonyms: 'Synonyms and alternative phrasings for core keywords.',
  domain: 'Domain-specific terminology and jargon related to this intent.',
  colloquial: 'Informal, conversational, or slang terms users might use.',
  misspellings: 'Common misspellings and typos of important keywords.'
};

// Distribution guidance for generation
export const KEYWORD_DISTRIBUTION = {
  core: 0.30,        // 30% core keywords
  synonyms: 0.25,    // 25% synonyms
  domain: 0.20,      // 20% domain-specific
  colloquial: 0.15,  // 15% colloquial
  misspellings: 0.10 // 10% misspellings
} as const;

// =============================================================================
// DATASET STRUCTURE
// =============================================================================

export interface KeywordDataset {
  schemaVersion: '1.0';
  type: 'keywords';
  generatedAt: string;
  params: {
    intent: IntentName;
    subIntent: string;
    language: LanguageCode;
    targetCount: number;
    variations: KeywordVariation[];
  };
  keywords: Keyword[];
}

// =============================================================================
// JSON SCHEMA FOR VALIDATION
// =============================================================================

export const keywordJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'keywords'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'keywords' },
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
          items: { enum: [...GENERATION_TARGETS.keywords.variations] }
        }
      }
    },
    keywords: {
      type: 'array',
      items: {
        type: 'object',
        required: ['text', 'language', 'intent', 'subIntent', 'variation'],
        properties: {
          text: { type: 'string', minLength: 1 },
          language: { enum: [...SUPPORTED_LANGUAGES] },
          intent: { type: 'string' },
          subIntent: { type: 'string' },
          variation: { enum: [...GENERATION_TARGETS.keywords.variations] },
          weight: { type: 'number', minimum: 0, maximum: 1 },
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
