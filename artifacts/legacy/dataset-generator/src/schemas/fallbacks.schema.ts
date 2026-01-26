/**
 * Schema: Fallback Responses
 * Fallback templates for error states and edge cases
 */

import { LanguageCode, SUPPORTED_LANGUAGES } from './patterns.schema.js';

export const FALLBACK_SCENARIOS = [
  'NO_DOCUMENTS',
  'DOC_NOT_FOUND',
  'DOC_NOT_PROCESSED_YET',
  'NO_RELEVANT_CONTENT',
  'AMBIGUOUS_QUERY',
  'MULTIPLE_DOCS_MATCH',
  'ERROR_RETRIEVAL',
  'ERROR_GENERATION',
  'NO_RELEVANT_DOCS',
  'UNSUPPORTED_INTENT',
  'FEATURE_NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
  'RATE_LIMIT',
  'UPLOAD_IN_PROGRESS',
  'LLM_ERROR',
  'AMBIGUOUS',
  'AMBIGUOUS_QUESTION',
  'OUT_OF_SCOPE',
  'SAFETY_CONCERN',
  'LOW_CONFIDENCE',
  'EMPTY_QUERY'
] as const;
export type FallbackScenario = typeof FALLBACK_SCENARIOS[number];

export const FALLBACK_CATEGORIES = [
  'workspace_empty',
  'doc_name_not_found',
  'processing',
  'no_match',
  'unclear_intent',
  'ambiguous_doc_name',
  'technical_error',
  'capability_limit',
  'throttling',
  'safety',
  'retrieval_quality',
  'input_validation'
] as const;
export type FallbackCategory = typeof FALLBACK_CATEGORIES[number];

export const FALLBACK_STYLES = [
  'one_liner',
  'short_guidance',
  'detailed_explainer',
  'friendly_redirect',
  'technical_error'
] as const;
export type FallbackStyle = typeof FALLBACK_STYLES[number];

export const SEVERITY_LEVELS = ['info', 'warning', 'error', 'critical'] as const;
export type SeverityLevel = typeof SEVERITY_LEVELS[number];

export interface FallbackTemplate {
  /** Template text with {{placeholder}} tokens */
  template: string;
  /** Placeholders used in the template */
  placeholders: string[];
}

export interface FallbackStyleConfig {
  id: FallbackStyle;
  maxLength: number;
  structure: string[];
  tone: string;
  renderHint: {
    layout: 'inline' | 'card';
    showIcon: boolean;
    icon: string;
    emphasisLevel: 'low' | 'medium' | 'high';
  };
  languages: Record<LanguageCode, FallbackTemplate>;
}

export interface FallbackEntry {
  /** Unique key for the fallback scenario */
  key: FallbackScenario;
  /** Category for grouping */
  category: FallbackCategory;
  /** Human-readable description */
  description: string;
  /** Default style to use */
  defaultStyleId: FallbackStyle;
  /** Severity level */
  severity: SeverityLevel;
  /** Tags for filtering/search */
  tags: string[];
  /** Version for tracking changes */
  version: number;
  /** Last updated timestamp */
  lastUpdated: string;
  /** A/B testing experiment ID */
  experiment: string | null;
  /** Style variations */
  styles: FallbackStyleConfig[];
  /** Metadata */
  meta?: {
    source?: 'seed' | 'generated';
    batchId?: string;
    createdAt?: string;
  };
}

export interface FallbackDataset {
  schemaVersion: '1.0';
  type: 'fallbacks';
  generatedAt: string;
  params: {
    targetCount: number;
    languages: LanguageCode[];
    scenarios: FallbackScenario[];
    styles: FallbackStyle[];
  };
  fallbacks: FallbackEntry[];
}

export const fallbackJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'fallbacks'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'fallbacks' },
    generatedAt: { type: 'string', format: 'date-time' },
    params: {
      type: 'object',
      required: ['targetCount', 'languages', 'scenarios', 'styles'],
      properties: {
        targetCount: { type: 'number', minimum: 1 },
        languages: { type: 'array', items: { enum: SUPPORTED_LANGUAGES } },
        scenarios: { type: 'array', items: { enum: FALLBACK_SCENARIOS } },
        styles: { type: 'array', items: { enum: FALLBACK_STYLES } },
      },
    },
    fallbacks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'category', 'description', 'defaultStyleId', 'severity', 'tags', 'version', 'lastUpdated', 'styles'],
        properties: {
          key: { enum: FALLBACK_SCENARIOS },
          category: { enum: FALLBACK_CATEGORIES },
          description: { type: 'string', minLength: 10 },
          defaultStyleId: { enum: FALLBACK_STYLES },
          severity: { enum: SEVERITY_LEVELS },
          tags: { type: 'array', items: { type: 'string' } },
          version: { type: 'number', minimum: 1 },
          lastUpdated: { type: 'string' },
          experiment: { type: ['string', 'null'] },
          styles: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'maxLength', 'structure', 'tone', 'renderHint', 'languages'],
              properties: {
                id: { enum: FALLBACK_STYLES },
                maxLength: { type: 'number', minimum: 50 },
                structure: { type: 'array', items: { type: 'string' } },
                tone: { type: 'string' },
                renderHint: {
                  type: 'object',
                  required: ['layout', 'showIcon', 'icon', 'emphasisLevel'],
                  properties: {
                    layout: { enum: ['inline', 'card'] },
                    showIcon: { type: 'boolean' },
                    icon: { type: 'string' },
                    emphasisLevel: { enum: ['low', 'medium', 'high'] },
                  },
                },
                languages: {
                  type: 'object',
                  required: ['en', 'pt', 'es'],
                  additionalProperties: {
                    type: 'object',
                    required: ['template', 'placeholders'],
                    properties: {
                      template: { type: 'string', minLength: 5 },
                      placeholders: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
          meta: {
            type: 'object',
            properties: {
              source: { enum: ['seed', 'generated'] },
              batchId: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
  },
};
