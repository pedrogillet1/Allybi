/**
 * dataPaths.ts - Centralized Data File Path Configuration
 *
 * Single source of truth for DATA_DIR across dev/prod/Docker/tests.
 * Prevents scattered fs.readFileSync with random relative paths.
 *
 * Usage:
 *   import { loadJsonFile } from '../config/dataPaths';
 *   const config = loadJsonFile<MyConfigType>('answer_styles.json');
 */

import path from 'path';
import fs from 'fs';

/**
 * Known data file names - prevents typos and enables autocomplete
 */
export type DataFileName =
  | 'answer_styles.json'
  | 'system_prompts.json'
  | 'markdown_components.json'
  | 'table_presets.json'
  | 'answer_examples.json'
  | 'retrieval_policies.json'
  | 'doc_query_synonyms.json'
  | 'doc_aliases.json'
  | 'analytics_phrases.json'
  | 'language_profiles.json'
  | 'validation_policies.json'
  | 'error_localization.json'
  | 'capabilities_catalog.json'
  | 'debug_labels.json'
  | 'fallbacks.json'
  | 'koda_product_help.json'
  | 'intent_patterns.json';

/**
 * Base directory for data files
 * Allow override by env, but default to <project-root>/src/data
 */
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../data');

export const DATA_DIR = process.env.KODA_DATA_DIR
  ? path.resolve(process.env.KODA_DATA_DIR)
  : DEFAULT_DATA_DIR;

/**
 * Build full path for a known data file
 */
export function getDataFilePath(fileName: DataFileName): string {
  return path.join(DATA_DIR, fileName);
}

/**
 * Generic JSON loader with validation + helpful error messages
 *
 * @param fileName - The data file to load (type-checked)
 * @returns Parsed JSON content
 * @throws Error with helpful message if file missing or invalid JSON
 */
export function loadJsonFile<T = unknown>(fileName: DataFileName): T {
  const filePath = getDataFilePath(fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[Koda DATA] Missing data file: "${fileName}" at path: ${filePath}. ` +
        `Make sure DATA_DIR is correct and the file exists. DATA_DIR=${DATA_DIR}`,
    );
  }

  const raw = fs.readFileSync(filePath, 'utf-8');

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `[Koda DATA] Invalid JSON in "${fileName}" at ${filePath}: ${(err as Error).message}`,
    );
  }
}

/**
 * Check if a data file exists (without throwing)
 */
export function dataFileExists(fileName: DataFileName): boolean {
  return fs.existsSync(getDataFilePath(fileName));
}

/**
 * List of all required data files for startup verification
 */
export const REQUIRED_DATA_FILES: DataFileName[] = [
  'answer_styles.json',
  'system_prompts.json',
  'markdown_components.json',
  'table_presets.json',
  'answer_examples.json',
  'retrieval_policies.json',
  'doc_query_synonyms.json',
  'doc_aliases.json',
  'analytics_phrases.json',
  'language_profiles.json',
  'validation_policies.json',
  'error_localization.json',
  'capabilities_catalog.json',
  'debug_labels.json',
  'fallbacks.json',
  'koda_product_help.json',
  'intent_patterns.json',
];

/**
 * Verify all required data files exist and are valid JSON
 * Call this at startup to fail fast if any file is missing
 *
 * @returns Object with ok files and problem files
 */
export function verifyAllDataFiles(): {
  ok: string[];
  problems: Array<{ file: string; error: string }>;
} {
  const ok: string[] = [];
  const problems: Array<{ file: string; error: string }> = [];

  for (const file of REQUIRED_DATA_FILES) {
    try {
      loadJsonFile(file);
      ok.push(file);
    } catch (err) {
      problems.push({ file, error: (err as Error).message });
    }
  }

  return { ok, problems };
}

export default {
  DATA_DIR,
  getDataFilePath,
  loadJsonFile,
  dataFileExists,
  verifyAllDataFiles,
  REQUIRED_DATA_FILES,
};
