/**
 * Schema: Classification Tests
 * Test cases for validating intent classification accuracy
 */

import { LanguageCode, IntentType, PatternCategory, SUPPORTED_LANGUAGES, SUPPORTED_INTENTS, PATTERN_CATEGORIES } from './patterns.schema.js';

export interface ClassificationTest {
  /** The test query (concrete, realistic user input) */
  query: string;
  /** Language of the query */
  language: LanguageCode;
  /** Expected primary intent */
  expectedIntent: IntentType;
  /** Category being tested */
  category: PatternCategory;
  /** Expected confidence range (optional) */
  expectedConfidence?: {
    min: number;
    max: number;
  };
  /** Intents that should NOT be matched */
  negativeIntents?: IntentType[];
  /** Test metadata */
  meta?: {
    source?: 'seed' | 'generated';
    batchId?: string;
    createdAt?: string;
    /** Descriptive name for the test */
    testName?: string;
    /** Why this test case is important */
    rationale?: string;
  };
}

export interface TestDataset {
  schemaVersion: '1.0';
  type: 'tests';
  generatedAt: string;
  params: {
    targetCount: number;
    languages: LanguageCode[];
    categories: PatternCategory[];
    intents: IntentType[];
  };
  tests: ClassificationTest[];
}

// Concrete test values for generation
export const TEST_VALUES = {
  topics: [
    'finance', 'security', 'tax', 'compliance', 'marketing', 'sales',
    'HR', 'legal', 'engineering', 'product', 'operations', 'budget'
  ],
  folders: [
    '/clients/acme/2024', '/projects/alpha', '/legal/contracts',
    '/finance/reports', '/hr/policies', '/marketing/campaigns'
  ],
  filenames: [
    'invoice_jan.pdf', 'quarterly_report.xlsx', 'contract_v2.docx',
    'budget_2024.xlsx', 'meeting_notes.pdf', 'proposal_final.pptx'
  ],
  types: ['PDF', 'Excel', 'Word', 'PowerPoint', 'image', 'spreadsheet'],
  sizes: ['5MB', '10MB', '100KB', '1GB'],
  pages: ['10 pages', '50 pages', '100+ pages', '5 pages or less'],
  timeframes: [
    'last week', 'yesterday', 'last month', 'this year',
    'past 30 days', 'recent', 'today', 'last quarter'
  ]
};

export const testJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['schemaVersion', 'type', 'generatedAt', 'params', 'tests'],
  properties: {
    schemaVersion: { const: '1.0' },
    type: { const: 'tests' },
    generatedAt: { type: 'string', format: 'date-time' },
    params: {
      type: 'object',
      required: ['targetCount', 'languages', 'categories', 'intents'],
      properties: {
        targetCount: { type: 'number', minimum: 1 },
        languages: { type: 'array', items: { enum: SUPPORTED_LANGUAGES } },
        categories: { type: 'array', items: { enum: PATTERN_CATEGORIES } },
        intents: { type: 'array', items: { enum: SUPPORTED_INTENTS } },
      },
    },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['query', 'language', 'expectedIntent', 'category'],
        properties: {
          query: { type: 'string', minLength: 5 },
          language: { enum: SUPPORTED_LANGUAGES },
          expectedIntent: { enum: SUPPORTED_INTENTS },
          category: { enum: PATTERN_CATEGORIES },
          expectedConfidence: {
            type: 'object',
            properties: {
              min: { type: 'number', minimum: 0, maximum: 1 },
              max: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          negativeIntents: {
            type: 'array',
            items: { enum: SUPPORTED_INTENTS },
          },
          meta: {
            type: 'object',
            properties: {
              source: { enum: ['seed', 'generated'] },
              batchId: { type: 'string' },
              createdAt: { type: 'string' },
              testName: { type: 'string' },
              rationale: { type: 'string' },
            },
          },
        },
      },
    },
  },
};
