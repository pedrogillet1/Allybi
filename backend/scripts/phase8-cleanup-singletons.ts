/**
 * PHASE 8 — Singleton Cleanup Script
 *
 * This script removes singleton exports that bypass the DI container
 * and updates consumers to use the container instead.
 *
 * RUN: npx ts-node scripts/phase8-cleanup-singletons.ts
 *
 * WHAT IT DOES:
 * 1. Removes singleton exports from services that should be container-owned
 * 2. Updates consumers to use getContainer() instead of direct imports
 * 3. Preserves config service singletons (needed for bootstrap/health)
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '..', 'src');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Singletons to KEEP (needed for bootstrap before container init)
 * These are loaded in server.ts BEFORE initializeContainer() and checked by health routes
 */
const KEEP_SINGLETONS = [
  'fallbackConfigService',      // Used by server.ts bootstrap + health.routes.ts
  'kodaProductHelpServiceV3',   // Used by server.ts bootstrap + health.routes.ts
  'intentConfigService',        // Used by server.ts bootstrap + health.routes.ts
];

/**
 * Singletons to REMOVE (should be container-owned)
 */
const REMOVE_SINGLETONS: Array<{
  file: string;
  singleton: string;
  exportLine: RegExp;
  consumers: Array<{
    file: string;
    importPattern: RegExp;
    usagePattern: RegExp;
    containerGetter: string;
  }>;
}> = [
  {
    file: 'services/core/documentResolution.service.ts',
    singleton: 'documentResolutionService',
    exportLine: /^export const documentResolutionService.*$/m,
    consumers: [], // No consumers found
  },
  {
    file: 'services/core/languageDetector.service.ts',
    singleton: 'languageDetectorService',
    exportLine: /^export const languageDetectorService.*$/m,
    consumers: [
      {
        file: 'services/gemini.service.ts',
        importPattern: /import \{ languageDetectorService \} from '\.\/core\/languageDetector\.service';/,
        usagePattern: /languageDetectorService\./g,
        containerGetter: 'getContainer().getLanguageDetector()',
      },
      {
        file: 'services/openai.service.ts',
        importPattern: /import \{ languageDetectorService \} from '\.\/core\/languageDetector\.service';/,
        usagePattern: /languageDetectorService\./g,
        containerGetter: 'getContainer().getLanguageDetector()',
      },
    ],
  },
  {
    file: 'services/retrieval/kodaHybridSearch.service.ts',
    singleton: 'kodaHybridSearchService',
    exportLine: /^export const kodaHybridSearchService.*$/m,
    consumers: [], // Now injected via container
  },
  {
    file: 'services/retrieval/dynamicDocBoost.service.ts',
    singleton: 'dynamicDocBoostService',
    exportLine: /^export const dynamicDocBoostService.*$/m,
    consumers: [], // Now injected via container
  },
  {
    file: 'services/retrieval/kodaRetrievalRanking.service.ts',
    singleton: 'kodaRetrievalRankingService',
    exportLine: /^export const kodaRetrievalRankingService.*$/m,
    consumers: [], // Now injected via container
  },
  {
    file: 'services/ingestion/pptxImageExtractor.service.ts',
    singleton: 'pptxImageExtractorService',
    exportLine: /^export const pptxImageExtractorService.*$/m,
    consumers: [], // Check if used
  },
];

// ============================================================================
// HELPERS
// ============================================================================

function readFile(filePath: string): string {
  const fullPath = path.join(SRC_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function writeFile(filePath: string, content: string): void {
  const fullPath = path.join(SRC_DIR, filePath);
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`✅ Updated: ${filePath}`);
}

function removeSingletonExport(filePath: string, exportLine: RegExp): boolean {
  const content = readFile(filePath);
  if (!content) return false;

  if (!exportLine.test(content)) {
    console.log(`ℹ️  Singleton already removed from: ${filePath}`);
    return false;
  }

  // Remove the export line and any preceding comment
  const newContent = content
    .replace(/\/\/ Singleton instance.*\n/g, '')
    .replace(/\/\/ Export singleton.*\n/g, '')
    .replace(exportLine, '')
    .replace(/\n{3,}/g, '\n\n'); // Clean up extra newlines

  writeFile(filePath, newContent);
  return true;
}

function updateConsumer(consumer: {
  file: string;
  importPattern: RegExp;
  usagePattern: RegExp;
  containerGetter: string;
}): boolean {
  const content = readFile(consumer.file);
  if (!content) return false;

  // Check if already updated
  if (content.includes("from '../bootstrap/container'") ||
      content.includes("from '../../bootstrap/container'")) {
    console.log(`ℹ️  Consumer already updated: ${consumer.file}`);
    return false;
  }

  // Add container import if not present
  let newContent = content;

  // Remove old singleton import
  newContent = newContent.replace(consumer.importPattern, '');

  // Add container import at top (after other imports)
  const containerImport = consumer.file.includes('services/')
    ? "import { getContainer } from '../bootstrap/container';"
    : "import { getContainer } from '../../bootstrap/container';";

  // Find the last import statement and add after it
  const lastImportMatch = newContent.match(/^import .+;$/gm);
  if (lastImportMatch) {
    const lastImport = lastImportMatch[lastImportMatch.length - 1];
    newContent = newContent.replace(lastImport, `${lastImport}\n${containerImport}`);
  }

  // Replace usage pattern
  newContent = newContent.replace(consumer.usagePattern, `${consumer.containerGetter}.`);

  writeFile(consumer.file, newContent);
  return true;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🧹 PHASE 8 — Singleton Cleanup\n');
  console.log('=' .repeat(60));

  // Step 1: Show what we're keeping
  console.log('\n📌 KEEPING these singletons (needed for bootstrap/health):');
  KEEP_SINGLETONS.forEach(s => console.log(`   - ${s}`));

  // Step 2: Remove singleton exports
  console.log('\n🗑️  REMOVING these singleton exports:');
  let removedCount = 0;

  for (const item of REMOVE_SINGLETONS) {
    console.log(`\n   Processing: ${item.file}`);
    console.log(`   Singleton: ${item.singleton}`);

    if (removeSingletonExport(item.file, item.exportLine)) {
      removedCount++;
    }

    // Update consumers
    if (item.consumers.length > 0) {
      console.log(`   Updating ${item.consumers.length} consumer(s)...`);
      for (const consumer of item.consumers) {
        updateConsumer(consumer);
      }
    } else {
      console.log(`   No consumers to update`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log(`\n✅ Phase 8 cleanup complete!`);
  console.log(`   Removed ${removedCount} singleton exports`);
  console.log('\n⚠️  NEXT STEPS:');
  console.log('   1. Run: npx tsc --noEmit');
  console.log('   2. Fix any remaining TypeScript errors');
  console.log('   3. Run tests to verify functionality');
  console.log('   4. Commit changes');
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main, REMOVE_SINGLETONS, KEEP_SINGLETONS };
