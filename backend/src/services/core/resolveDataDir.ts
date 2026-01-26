/**
 * DATA_DIR Resolver
 *
 * Single source of truth for resolving the data directory path.
 * Prevents fragile __dirname usage and supports both dev and production (dist).
 *
 * RULES:
 * 1. If process.env.DATA_DIR exists -> use it
 * 2. Else resolve relative to compiled location
 * 3. Validate required files exist before starting server
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolve the data directory path
 *
 * @returns Absolute path to data directory
 */
export function resolveDataDir(): string {
  // Rule 1: Use environment variable if set
  if (process.env.DATA_DIR) {
    const dataDir = path.resolve(process.env.DATA_DIR);
    if (!fs.existsSync(dataDir)) {
      throw new Error(`DATA_DIR environment variable points to non-existent directory: ${dataDir}`);
    }
    return dataDir;
  }

  // Rule 2: Resolve relative to runtime location
  // In dev: backend/src/services/core -> backend/src/data
  // In prod (dist): backend/dist/services/core -> backend/src/data (or backend/dist/data if copied)

  const possiblePaths = [
    path.resolve(__dirname, '../../data'),           // dev: src/services/core -> src/data
    path.resolve(__dirname, '../../../src/data'),    // prod: dist/services/core -> src/data
    path.resolve(__dirname, '../../../data'),        // prod alt: dist/services/core -> data
  ];

  for (const dataDir of possiblePaths) {
    if (fs.existsSync(dataDir)) {
      return dataDir;
    }
  }

  throw new Error(
    `Could not resolve data directory. Tried:\n${possiblePaths.map(p => `  - ${p}`).join('\n')}\n` +
    `Set DATA_DIR environment variable to specify location explicitly.`
  );
}

/**
 * Assert that required data files exist
 *
 * @param dataDir - Data directory path
 * @param requiredFiles - List of required file names
 * @throws Error if any required file is missing
 */
export function assertDataFilesExist(dataDir: string, requiredFiles: string[]): void {
  const missingFiles: string[] = [];

  for (const fileName of requiredFiles) {
    const filePath = path.join(dataDir, fileName);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(fileName);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing required data files in ${dataDir}:\n` +
      missingFiles.map(f => `  - ${f}`).join('\n') +
      `\nEnsure all required JSON files are present before starting the server.`
    );
  }
}

/**
 * Get list of all JSON files in data directory
 *
 * @param dataDir - Data directory path
 * @returns Array of JSON file names
 */
export function listDataFiles(dataDir: string): string[] {
  if (!fs.existsSync(dataDir)) {
    return [];
  }

  return fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.json'))
    .sort();
}

/**
 * Required data files for PromptConfig
 */
export const REQUIRED_PROMPT_CONFIG_FILES = [
  'system_prompts.json',
  'answer_styles.json',
  'answer_examples.json',
  'markdown_components.json',
  'table_presets.json',
  'validation_policies.json',
  'retrieval_policies.json',
  'error_localization.json',
];

/**
 * Optional data files (won't fail if missing)
 */
export const OPTIONAL_PROMPT_CONFIG_FILES = [
  'language_profiles.json',
  'debug_labels.json',
  'capabilities_catalog.json',
  'fallbacks.json',
  'intent_patterns.json',
  'koda_product_help.json',
  'categories_parsed.json',
];
