#!/usr/bin/env node
/**
 * KODA Dataset Generator CLI
 *
 * Commands:
 *   generate  - Generate datasets using Claude API
 *   validate  - Validate staged datasets
 *   ingest    - Ingest validated datasets into app
 *   pipeline  - Run full generate -> validate -> ingest pipeline
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { ClaudeClient } from './generator/claude-client.js';
import { DatasetGenerator } from './generator/generator.js';
import { DatasetValidator } from './validator/validator.js';
import { DatasetIngest } from './ingest/ingest.js';
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_INTENTS,
  PATTERN_CATEGORIES,
  DatasetType
} from './schemas/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const program = new Command();

program
  .name('koda-gen')
  .description('KODA Dataset Generator - Generate intent patterns, tests, and fallbacks')
  .version('1.0.0');

// ============================================================================
// GENERATE COMMAND
// ============================================================================
program
  .command('generate')
  .description('Generate datasets using Claude API')
  .option('-t, --type <type>', 'Dataset type: patterns, tests, fallbacks', 'patterns')
  .option('-l, --languages <langs>', 'Languages (comma-separated): en,pt,es', 'en,pt,es')
  .option('-i, --intents <intents>', 'Intents (comma-separated)', SUPPORTED_INTENTS.join(','))
  .option('-c, --categories <cats>', 'Categories (comma-separated)', PATTERN_CATEGORIES.join(','))
  .option('-n, --count <n>', 'Count per category', '10')
  .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-20250514')
  .option('--batch-id <id>', 'Custom batch ID')
  .option('--dry-run', 'Show what would be generated without calling API')
  .action(async (options) => {
    const spinner = ora('Initializing generator...').start();

    try {
      const languages = options.languages.split(',').filter((l: string) =>
        SUPPORTED_LANGUAGES.includes(l as any)
      );
      const intents = options.intents.split(',').filter((i: string) =>
        SUPPORTED_INTENTS.includes(i as any)
      );
      const categories = options.categories.split(',').filter((c: string) =>
        PATTERN_CATEGORIES.includes(c as any)
      );
      const count = parseInt(options.count, 10);

      if (options.dryRun) {
        spinner.info('Dry run mode - no API calls will be made');
        console.log(chalk.cyan('\nGeneration Plan:'));
        console.log(`  Type: ${options.type}`);
        console.log(`  Languages: ${languages.join(', ')}`);
        console.log(`  Intents: ${intents.join(', ')}`);
        console.log(`  Categories: ${categories.join(', ')}`);
        console.log(`  Count per combo: ${count}`);
        console.log(`  Total combinations: ${languages.length * intents.length * categories.length}`);
        console.log(`  Estimated entries: ${languages.length * intents.length * categories.length * count}`);
        return;
      }

      // Check for API key
      if (!process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        spinner.fail('CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable not set');
        process.exit(1);
      }

      const client = new ClaudeClient({ model: options.model });
      const generator = new DatasetGenerator(client, {
        outputDir: ROOT_DIR,
        batchId: options.batchId,
        countPerCategory: count,
        languages,
        intents,
        categories
      });

      spinner.text = 'Generating dataset...';

      let result;
      if (options.type === 'patterns') {
        result = await generator.generateFullPatternDataset((msg) => {
          spinner.text = msg;
        });
      } else if (options.type === 'tests') {
        result = await generator.generateFullTestDataset((msg) => {
          spinner.text = msg;
        });
      } else {
        spinner.fail(`Unknown type: ${options.type}`);
        process.exit(1);
      }

      // Save to staging
      const filename = `${options.type}_${generator.getBatchId()}.json`;
      const outputPath = await generator.saveToStaging(filename, result.dataset);

      spinner.succeed(`Generated ${result.stats.totalGenerated} entries`);
      console.log(chalk.green(`\nOutput saved to: ${outputPath}`));
      console.log(chalk.dim(`  Success: ${result.stats.successCount} batches`));
      console.log(chalk.dim(`  Failed: ${result.stats.failureCount} batches`));
      console.log(chalk.dim(`  Tokens: ${result.stats.tokensUsed.input} in / ${result.stats.tokensUsed.output} out`));
      console.log(chalk.dim(`  Duration: ${(result.stats.duration / 1000).toFixed(1)}s`));
    } catch (error) {
      spinner.fail(`Generation failed: ${error}`);
      process.exit(1);
    }
  });

// ============================================================================
// VALIDATE COMMAND
// ============================================================================
program
  .command('validate')
  .description('Validate staged datasets against schemas')
  .option('-f, --file <file>', 'Specific file to validate (in staging/)')
  .option('-a, --all', 'Validate all files in staging/', true)
  .option('--move', 'Move valid files to validated/', false)
  .action(async (options) => {
    const spinner = ora('Initializing validator...').start();
    const validator = new DatasetValidator();
    const stagingDir = path.join(ROOT_DIR, 'staging');
    const validatedDir = path.join(ROOT_DIR, 'validated');

    try {
      let files: string[] = [];

      if (options.file) {
        files = [options.file];
      } else {
        const allFiles = await fs.readdir(stagingDir);
        files = allFiles.filter(f => f.endsWith('.json'));
      }

      if (files.length === 0) {
        spinner.info('No files to validate in staging/');
        return;
      }

      let totalValid = 0;
      let totalInvalid = 0;

      for (const file of files) {
        spinner.text = `Validating ${file}...`;

        const filePath = path.join(stagingDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        const type = data.type as DatasetType;
        if (!type) {
          console.log(chalk.yellow(`\n${file}: No type field, skipping`));
          continue;
        }

        const result = validator.validate(data, type);

        if (result.valid) {
          totalValid++;
          console.log(chalk.green(`\n${file}: VALID`));
          console.log(chalk.dim(`  Entries: ${result.stats.validEntries}/${result.stats.totalEntries}`));
          console.log(chalk.dim(`  Duplicates removed: ${result.stats.duplicatesRemoved}`));
          console.log(chalk.dim(`  Rejected: ${result.stats.rejectedEntries}`));

          if (result.warnings.length > 0) {
            console.log(chalk.yellow(`  Warnings: ${result.warnings.length}`));
            for (const warning of result.warnings.slice(0, 5)) {
              console.log(chalk.dim(`    - ${warning.message}`));
            }
            if (result.warnings.length > 5) {
              console.log(chalk.dim(`    ... and ${result.warnings.length - 5} more`));
            }
          }

          // Move to validated if requested
          if (options.move && result.cleanedData) {
            await fs.mkdir(validatedDir, { recursive: true });
            const validatedPath = path.join(validatedDir, file);
            await fs.writeFile(
              validatedPath,
              JSON.stringify(result.cleanedData, null, 2),
              'utf-8'
            );
            await fs.unlink(filePath);
            console.log(chalk.green(`  Moved to validated/`));
          }
        } else {
          totalInvalid++;
          console.log(chalk.red(`\n${file}: INVALID`));
          for (const error of result.errors.slice(0, 10)) {
            console.log(chalk.red(`  - ${error.path}: ${error.message}`));
          }
        }
      }

      spinner.succeed(`Validation complete: ${totalValid} valid, ${totalInvalid} invalid`);
    } catch (error) {
      spinner.fail(`Validation failed: ${error}`);
      process.exit(1);
    }
  });

// ============================================================================
// INGEST COMMAND
// ============================================================================
program
  .command('ingest')
  .description('Ingest validated datasets into application data files')
  .option('-f, --file <file>', 'Specific file to ingest (in validated/)')
  .option('-a, --all', 'Ingest all files in validated/', true)
  .option('--no-backup', 'Skip creating backups')
  .option('--dry-run', 'Show what would be modified without writing')
  .option('--target <dir>', 'Target directory for data files', path.join(ROOT_DIR, '..', 'src', 'data'))
  .action(async (options) => {
    const spinner = ora('Initializing ingest...').start();
    const validatedDir = path.join(ROOT_DIR, 'validated');

    try {
      const ingest = new DatasetIngest({
        validatedDir,
        targetDir: options.target,
        backup: options.backup !== false,
        dryRun: options.dryRun
      });

      if (options.dryRun) {
        spinner.info('Dry run mode - no files will be modified');
      }

      let files: string[] = [];

      if (options.file) {
        files = [options.file];
      } else {
        try {
          const allFiles = await fs.readdir(validatedDir);
          files = allFiles.filter(f => f.endsWith('.json'));
        } catch {
          spinner.info('No validated/ directory found');
          return;
        }
      }

      if (files.length === 0) {
        spinner.info('No files to ingest in validated/');
        return;
      }

      let totalEntries = 0;
      let totalFiles = 0;

      for (const file of files) {
        spinner.text = `Ingesting ${file}...`;

        const filePath = path.join(validatedDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        let result;
        if (data.type === 'patterns') {
          result = await ingest.ingestPatterns(data);
        } else if (data.type === 'tests') {
          result = await ingest.ingestTests(data);
        } else {
          console.log(chalk.yellow(`\n${file}: Unknown type ${data.type}, skipping`));
          continue;
        }

        if (result.success) {
          totalEntries += result.entriesAdded;
          totalFiles += result.filesModified.length;
          console.log(chalk.green(`\n${file}: Ingested ${result.entriesAdded} entries`));
          if (result.backupPath) {
            console.log(chalk.dim(`  Backup: ${result.backupPath}`));
          }

          // Archive the file after successful ingest
          if (!options.dryRun) {
            await ingest.archiveValidatedFile(file);
            console.log(chalk.dim(`  Archived validated file`));
          }
        } else {
          console.log(chalk.red(`\n${file}: Ingest failed`));
          for (const error of result.errors) {
            console.log(chalk.red(`  - ${error}`));
          }
        }
      }

      spinner.succeed(`Ingest complete: ${totalEntries} entries added to ${totalFiles} files`);
    } catch (error) {
      spinner.fail(`Ingest failed: ${error}`);
      process.exit(1);
    }
  });

// ============================================================================
// PIPELINE COMMAND
// ============================================================================
program
  .command('pipeline')
  .description('Run full generate -> validate -> ingest pipeline')
  .option('-t, --type <type>', 'Dataset type: patterns, tests', 'patterns')
  .option('-n, --count <n>', 'Count per category', '10')
  .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-20250514')
  .action(async (options) => {
    console.log(chalk.cyan('\n=== KODA Dataset Pipeline ===\n'));

    // Step 1: Generate
    console.log(chalk.blue('Step 1: Generate'));
    await program.parseAsync(['node', 'cli', 'generate', '-t', options.type, '-n', options.count, '-m', options.model]);

    // Step 2: Validate
    console.log(chalk.blue('\nStep 2: Validate'));
    await program.parseAsync(['node', 'cli', 'validate', '--move']);

    // Step 3: Ingest
    console.log(chalk.blue('\nStep 3: Ingest'));
    await program.parseAsync(['node', 'cli', 'ingest']);

    console.log(chalk.green('\n=== Pipeline Complete ===\n'));
  });

// ============================================================================
// STATS COMMAND
// ============================================================================
program
  .command('stats')
  .description('Show statistics about staged and validated datasets')
  .action(async () => {
    const spinner = ora('Gathering statistics...').start();
    const stagingDir = path.join(ROOT_DIR, 'staging');
    const validatedDir = path.join(ROOT_DIR, 'validated');

    try {
      let stagingCount = 0;
      let stagingEntries = 0;
      let validatedCount = 0;
      let validatedEntries = 0;

      // Count staging files
      try {
        const stagingFiles = await fs.readdir(stagingDir);
        for (const file of stagingFiles.filter(f => f.endsWith('.json'))) {
          const content = await fs.readFile(path.join(stagingDir, file), 'utf-8');
          const data = JSON.parse(content);
          stagingCount++;
          stagingEntries += data.patterns?.length || data.tests?.length || data.fallbacks?.length || 0;
        }
      } catch {}

      // Count validated files
      try {
        const validatedFiles = await fs.readdir(validatedDir);
        for (const file of validatedFiles.filter(f => f.endsWith('.json'))) {
          const content = await fs.readFile(path.join(validatedDir, file), 'utf-8');
          const data = JSON.parse(content);
          validatedCount++;
          validatedEntries += data.patterns?.length || data.tests?.length || data.fallbacks?.length || 0;
        }
      } catch {}

      spinner.succeed('Statistics gathered');
      console.log(chalk.cyan('\nDataset Statistics:'));
      console.log(`  Staging: ${stagingCount} files, ${stagingEntries} entries`);
      console.log(`  Validated: ${validatedCount} files, ${validatedEntries} entries`);
    } catch (error) {
      spinner.fail(`Failed to gather stats: ${error}`);
    }
  });

program.parse();
