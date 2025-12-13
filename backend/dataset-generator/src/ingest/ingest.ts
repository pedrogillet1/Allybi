/**
 * Dataset Ingest
 * Merges validated datasets into existing application data files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  IntentPattern,
  PatternDataset,
  TestDataset,
  ClassificationTest,
  LanguageCode,
  IntentType,
  SUPPORTED_LANGUAGES
} from '../schemas/index.js';

export interface IngestConfig {
  /** Path to the validated JSON directory */
  validatedDir: string;
  /** Path to the backend/src/data directory */
  targetDir: string;
  /** Whether to create backups before modifying */
  backup?: boolean;
  /** Whether to do a dry run (no actual writes) */
  dryRun?: boolean;
}

export interface IngestResult {
  success: boolean;
  filesModified: string[];
  entriesAdded: number;
  errors: string[];
  backupPath?: string;
}

export class DatasetIngest {
  private config: IngestConfig;

  constructor(config: IngestConfig) {
    this.config = {
      backup: true,
      dryRun: false,
      ...config
    };
  }

  /**
   * Ingest patterns into intent_patterns.json
   */
  async ingestPatterns(dataset: PatternDataset): Promise<IngestResult> {
    const targetFile = path.join(this.config.targetDir, 'intent_patterns.json');
    const errors: string[] = [];
    let entriesAdded = 0;

    try {
      // Read existing patterns
      const existingContent = await fs.readFile(targetFile, 'utf-8');
      const existingData = JSON.parse(existingContent);

      // Create backup if enabled
      let backupPath: string | undefined;
      if (this.config.backup && !this.config.dryRun) {
        backupPath = `${targetFile}.backup.${Date.now()}`;
        await fs.copyFile(targetFile, backupPath);
      }

      // Group new patterns by intent
      const patternsByIntent = this.groupPatternsByIntent(dataset.patterns);

      // Merge patterns into existing data
      for (const [intent, patterns] of Object.entries(patternsByIntent)) {
        if (!existingData[intent]) {
          existingData[intent] = {
            priority: 50,
            description: `${intent} patterns`,
            keywords: { en: [], pt: [], es: [] },
            patterns: { en: [], pt: [], es: [] }
          };
        }

        // Add patterns by language
        for (const pattern of patterns) {
          const lang = pattern.language;
          const existingPatterns = existingData[intent].patterns[lang] || [];

          // Check for duplicates
          if (!existingPatterns.includes(pattern.pattern)) {
            existingPatterns.push(pattern.pattern);
            entriesAdded++;
          }

          existingData[intent].patterns[lang] = existingPatterns;
        }
      }

      // Update metadata
      existingData.lastUpdated = new Date().toISOString().split('T')[0];

      // Write back
      if (!this.config.dryRun) {
        await fs.writeFile(
          targetFile,
          JSON.stringify(existingData, null, 2),
          'utf-8'
        );
      }

      return {
        success: true,
        filesModified: [targetFile],
        entriesAdded,
        errors,
        backupPath
      };
    } catch (error) {
      errors.push(`Failed to ingest patterns: ${error}`);
      return {
        success: false,
        filesModified: [],
        entriesAdded: 0,
        errors
      };
    }
  }

  /**
   * Ingest test cases (creates/updates a test file)
   */
  async ingestTests(dataset: TestDataset): Promise<IngestResult> {
    const targetFile = path.join(this.config.targetDir, 'intent_tests.json');
    const errors: string[] = [];
    let entriesAdded = 0;

    try {
      // Read existing tests or create new structure
      let existingData: { version: string; tests: ClassificationTest[] };
      try {
        const existingContent = await fs.readFile(targetFile, 'utf-8');
        existingData = JSON.parse(existingContent);
      } catch {
        existingData = { version: '1.0', tests: [] };
      }

      // Create backup if enabled
      let backupPath: string | undefined;
      if (this.config.backup && !this.config.dryRun) {
        try {
          await fs.access(targetFile);
          backupPath = `${targetFile}.backup.${Date.now()}`;
          await fs.copyFile(targetFile, backupPath);
        } catch {
          // File doesn't exist, no backup needed
        }
      }

      // Deduplicate and merge tests
      const existingKeys = new Set(
        existingData.tests.map(t => `${t.language}:${t.query.toLowerCase()}`)
      );

      for (const test of dataset.tests) {
        const key = `${test.language}:${test.query.toLowerCase()}`;
        if (!existingKeys.has(key)) {
          existingData.tests.push(test);
          existingKeys.add(key);
          entriesAdded++;
        }
      }

      // Write back
      if (!this.config.dryRun) {
        await fs.writeFile(
          targetFile,
          JSON.stringify(existingData, null, 2),
          'utf-8'
        );
      }

      return {
        success: true,
        filesModified: [targetFile],
        entriesAdded,
        errors,
        backupPath
      };
    } catch (error) {
      errors.push(`Failed to ingest tests: ${error}`);
      return {
        success: false,
        filesModified: [],
        entriesAdded: 0,
        errors
      };
    }
  }

  /**
   * Process all validated files in the validated directory
   */
  async processValidatedFiles(): Promise<IngestResult[]> {
    const results: IngestResult[] = [];

    try {
      const files = await fs.readdir(this.config.validatedDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.config.validatedDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        if (data.type === 'patterns') {
          results.push(await this.ingestPatterns(data as PatternDataset));
        } else if (data.type === 'tests') {
          results.push(await this.ingestTests(data as TestDataset));
        }
        // Add fallbacks ingest if needed
      }
    } catch (error) {
      results.push({
        success: false,
        filesModified: [],
        entriesAdded: 0,
        errors: [`Failed to process validated files: ${error}`]
      });
    }

    return results;
  }

  /**
   * Move validated file to archive after successful ingest
   */
  async archiveValidatedFile(filename: string): Promise<void> {
    const sourcePath = path.join(this.config.validatedDir, filename);
    const archiveDir = path.join(this.config.validatedDir, 'archive');
    const archivePath = path.join(archiveDir, `${Date.now()}_${filename}`);

    await fs.mkdir(archiveDir, { recursive: true });
    await fs.rename(sourcePath, archivePath);
  }

  private groupPatternsByIntent(patterns: IntentPattern[]): Record<IntentType, IntentPattern[]> {
    const grouped: Record<string, IntentPattern[]> = {};

    for (const pattern of patterns) {
      if (!grouped[pattern.intent]) {
        grouped[pattern.intent] = [];
      }
      grouped[pattern.intent].push(pattern);
    }

    return grouped as Record<IntentType, IntentPattern[]>;
  }
}
