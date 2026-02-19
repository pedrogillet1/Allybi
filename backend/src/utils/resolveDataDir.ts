/**
 * DATA_DIR Resolver
 *
 * Single source of truth for resolving the data_banks directory path.
 * Prevents fragile __dirname usage and supports both dev and production (dist).
 *
 * RULES:
 * 1. If process.env.KODA_BANKS_DIR exists -> use it
 * 2. Else resolve relative to compiled location
 * 3. Validate required files exist before starting server
 */

import * as path from "path";
import * as fs from "fs";

/**
 * Resolve the data_banks directory path
 *
 * @returns Absolute path to data_banks directory
 */
export function resolveDataDir(): string {
  // Rule 1: Use environment variable if set
  if (process.env.KODA_BANKS_DIR) {
    const dataDir = path.resolve(process.env.KODA_BANKS_DIR);
    if (!fs.existsSync(dataDir)) {
      throw new Error(
        `KODA_BANKS_DIR environment variable points to non-existent directory: ${dataDir}`,
      );
    }
    return dataDir;
  }

  // Legacy support: check DATA_DIR env var
  if (process.env.DATA_DIR) {
    const dataDir = path.resolve(process.env.DATA_DIR);
    if (fs.existsSync(dataDir)) {
      return dataDir;
    }
  }

  // Rule 2: Resolve relative to runtime location
  // In dev: backend/src/utils -> backend/src/data_banks
  // In prod (dist): backend/dist/utils -> backend/src/data_banks

  const possiblePaths = [
    path.resolve(__dirname, "../data_banks"), // dev: src/utils -> src/data_banks
    path.resolve(__dirname, "../../data_banks"), // dev alt: src/services/core -> src/data_banks
    path.resolve(__dirname, "../../src/data_banks"), // prod: dist/utils -> src/data_banks
    path.resolve(__dirname, "../../../src/data_banks"), // prod: dist/services/core -> src/data_banks
  ];

  for (const dataDir of possiblePaths) {
    if (fs.existsSync(dataDir)) {
      return dataDir;
    }
  }

  throw new Error(
    `Could not resolve data_banks directory. Tried:\n${possiblePaths.map((p) => `  - ${p}`).join("\n")}\n` +
      `Set KODA_BANKS_DIR environment variable to specify location explicitly.`,
  );
}

/**
 * Assert that required data files exist
 *
 * @param dataDir - Data directory path
 * @param requiredFiles - List of required file names
 * @throws Error if any required file is missing
 */
export function assertDataFilesExist(
  dataDir: string,
  requiredFiles: string[],
): void {
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
        missingFiles.map((f) => `  - ${f}`).join("\n") +
        `\nEnsure all required JSON files are present before starting the server.`,
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

  return fs
    .readdirSync(dataDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
}

/**
 * Required data files for PromptConfig (paths relative to data_banks/)
 */
export const REQUIRED_PROMPT_CONFIG_FILES = [
  "policies/system_prompts.any.json",
  "rendering/answer_styles.any.json",
  "quality/answer_examples.any.json",
  "rendering/markdown_components.any.json",
  "rendering/table_presets.any.json",
  "policies/validation_policies.any.json",
  "policies/retrieval_policies.any.json",
  "microcopy/error_messages.any.json",
];

/**
 * Optional data files (won't fail if missing)
 */
export const OPTIONAL_PROMPT_CONFIG_FILES = [
  "normalizers/language_profiles.any.json",
  "quality/debug_labels.any.json",
  "policies/capabilities_catalog.any.json",
  "routing/fallback_router.any.json",
  "routing/intent_patterns.any.json",
  "microcopy/koda_product_help.any.json",
];
