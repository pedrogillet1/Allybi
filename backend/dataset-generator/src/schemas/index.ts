/**
 * Schema Exports
 * Central export point for all dataset schemas
 */

// Base schemas (legacy)
export * from './patterns.schema.js';
export * from './tests.schema.js';
export * from './fallbacks.schema.js';

// New V2 schemas
export * from './intents.schema.js';
export * from './examples.schema.js';
export * from './keywords.schema.js';
export * from './regex-patterns.schema.js';
export * from './validation-rules.schema.js';
export * from './formatting-rules.schema.js';

// Dataset type union
export type DatasetType =
  | 'patterns'
  | 'tests'
  | 'fallbacks'
  | 'examples'
  | 'keywords'
  | 'regex_patterns'
  | 'validation_rules';

// Generic dataset interface
export interface BaseDataset {
  schemaVersion: '1.0';
  type: DatasetType;
  generatedAt: string;
  params: Record<string, unknown>;
}
