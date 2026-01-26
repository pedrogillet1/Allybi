/**
 * Schema: Intent Patterns
 * Used to match user queries to intents
 */

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'] as const;
export type LanguageCode = typeof SUPPORTED_LANGUAGES[number];

export const SUPPORTED_INTENTS = [
  'DOC_SEARCH',
  'DOC_ANALYTICS',
  'DOC_QA',
  'DOC_SUMMARIZE'
] as const;
export type IntentType = typeof SUPPORTED_INTENTS[number];

export const PATTERN_CATEGORIES = [
  'TIME',              // time-based queries (recent, last week, etc.)
  'TOPIC_SEMANTIC',    // topic/mention queries (about finance, mentions security)
  'FOLDER_TAG',        // folder/path/tag queries (/clients/acme, tagged:urgent)
  'TYPE_MIME',         // file type queries (PDFs, Excel files, images)
  'SIZE_PAGES',        // size/page queries (larger than 5MB, 10+ pages)
  'VERSION',           // version/comparison queries (latest, compare v1 vs v2)
  'FUZZY_FILENAME',    // fuzzy filename/alias queries (invoice jan, quarterly report)
  'RECENCY_BIAS',      // recency preference (newest, most recent)
  'METADATA',          // metadata queries (created by, modified date)
  'STRUCTURED_TABLES', // table/structured data queries (spreadsheet, columns)
  'DISAMBIGUATION',    // disambiguation/clarification (which one, be more specific)
  'SNIPPET_CITATIONS', // quote/citation requests (exact quote, page number)
  'ERROR_EMPTY_STATE'  // error/no results handling
] as const;
export type PatternCategory = typeof PATTERN_CATEGORIES[number];

export interface IntentPattern {
  /** The pattern text (can include {placeholder} tokens for patterns, concrete values for tests) */
  pattern: string;
  /** Language code: en, pt, es */
  language: LanguageCode;
  /** Target intent this pattern should match */
  intent: IntentType;
  /** Pattern category for organization */
  category: PatternCategory;
  /** Confidence score 0.0-1.0 for pattern strength */
  confidence?: number;
  /** Optional metadata */
  meta?: {
    /** Human-authored vs generated */
    source?: 'seed' | 'generated';
    /** Generation batch ID */
    batchId?: string;
    /** Timestamp of creation */
    createdAt?: string;
  };
}

export interface PatternDataset {
  /** Schema version for compatibility */
  schemaVersion: '1.0';
  /** Dataset type identifier */
  type: 'patterns';
  /** When this dataset was generated */
  generatedAt: string;
  /** Generation parameters */
  params: {
    targetCount: number;
    languages: LanguageCode[];
    categories: PatternCategory[];
    intents: IntentType[];
  };
  /** The pattern entries */
  patterns: IntentPattern[];
}

// JSON Schema for validation
export const patternJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'patterns'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'patterns' },
    generatedAt: { type: 'string', format: 'date-time' },
    params: {
      type: 'object',
      required: ['targetCount', 'languages', 'categories', 'intents'],
      properties: {
        targetCount: { type: 'number', minimum: 1 },
        languages: { type: 'array', items: { enum: ['en', 'pt', 'es'] } },
        categories: { type: 'array', items: { type: 'string' } },
        intents: { type: 'array', items: { type: 'string' } },
      },
    },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'language', 'intent', 'category'],
        properties: {
          pattern: { type: 'string', minLength: 3 },
          language: { enum: ['en', 'pt', 'es'] },
          intent: { enum: ['DOC_SEARCH', 'DOC_ANALYTICS', 'DOC_QA', 'DOC_SUMMARIZE'] },
          category: {
            enum: [
              'TIME', 'TOPIC_SEMANTIC', 'FOLDER_TAG', 'TYPE_MIME', 'SIZE_PAGES',
              'VERSION', 'FUZZY_FILENAME', 'RECENCY_BIAS', 'METADATA',
              'STRUCTURED_TABLES', 'DISAMBIGUATION', 'SNIPPET_CITATIONS', 'ERROR_EMPTY_STATE'
            ],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
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
