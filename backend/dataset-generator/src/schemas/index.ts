/**
 * Schema Exports
 * Central export point for all dataset schemas
 */

export * from './patterns.schema.js';
export * from './tests.schema.js';
export * from './fallbacks.schema.js';

// Dataset type union
export type DatasetType = 'patterns' | 'tests' | 'fallbacks';

// Generic dataset interface
export interface BaseDataset {
  schemaVersion: '1.0';
  type: DatasetType;
  generatedAt: string;
  params: Record<string, unknown>;
}
