/**
 * Merge Job Files into intent_patterns.json
 *
 * Reads all generated job files and merges them into the format
 * expected by BrainDataLoaderService.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const JOBS_DIR = './output/documents/jobs';
const OUTPUT_FILE = './output/documents/intent_patterns.json';
const FINAL_OUTPUT = '../../../src/data/intent_patterns.json';

// Supported languages
const LANGUAGES = ['en', 'pt', 'es'];

// Intent priority mapping
const INTENT_PRIORITIES = {
  DOCUMENTS: 70,
  REASONING: 70,
  HELP: 65,
  CONVERSATION: 60,
  EDIT: 65,
  MEMORY: 60,
  PREFERENCES: 55,
  EXTRACTION: 65,
  ERROR: 50,
  FILE_ACTION: 70,
  FINANCE: 75,
  ACCOUNTING: 75,
  LEGAL: 75,
  MEDICAL: 75,
  ENGINEERING: 70,
};

async function mergeJobFiles() {
  console.log('='.repeat(70));
  console.log('MERGE JOB FILES - Converting to intent_patterns.json');
  console.log('='.repeat(70));
  console.log();

  // Read all job files
  if (!existsSync(JOBS_DIR)) {
    console.error('Jobs directory not found:', JOBS_DIR);
    process.exit(1);
  }

  const files = readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} job files\n`);

  if (files.length === 0) {
    console.error('No job files found!');
    process.exit(1);
  }

  // Parse all job files
  const allJobs = [];
  let parseErrors = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(JOBS_DIR, file), 'utf-8');
      const job = JSON.parse(content);
      allJobs.push(job);
    } catch (err) {
      console.warn(`Failed to parse ${file}:`, err.message);
      parseErrors++;
    }
  }

  console.log(`Parsed ${allJobs.length} jobs (${parseErrors} errors)\n`);

  // Group jobs by intent
  const intentGroups = new Map();

  for (const job of allJobs) {
    const intent = job.intent || 'UNKNOWN';
    if (!intentGroups.has(intent)) {
      intentGroups.set(intent, []);
    }
    intentGroups.get(intent).push(job);
  }

  console.log('Intent groups:');
  for (const [intent, jobs] of intentGroups) {
    console.log(`  ${intent}: ${jobs.length} jobs`);
  }
  console.log();

  // Build intent_patterns.json structure
  const intentPatterns = {
    version: '4.0.0',
    lastUpdated: new Date().toISOString(),
    description: 'KODA Intent Patterns - Multi-layer Cognitive Architecture',
  };

  const stats = {
    totalKeywords: 0,
    totalPatterns: 0,
    byIntent: {},
    byLanguage: { en: 0, pt: 0, es: 0 },
  };

  for (const [intent, jobs] of intentGroups) {
    const intentData = {
      keywords: { en: [], pt: [], es: [] },
      patterns: { en: [], pt: [], es: [] },
      layers: {},
      priority: INTENT_PRIORITIES[intent] || 50,
      description: `${intent} intent with multi-layer cognitive architecture`,
    };

    stats.byIntent[intent] = { keywords: 0, patterns: 0 };

    // Process each job
    for (const job of jobs) {
      const lang = job.language || 'en';
      const layer = job.layer || 'default';
      const target = job.target || 'default';
      const isPattern = job.jobId?.includes('_pat');

      if (!intentData.layers[layer]) {
        intentData.layers[layer] = { en: [], pt: [], es: [] };
      }

      // Extract items
      for (const item of (job.items || [])) {
        if (isPattern) {
          // Pattern item
          const pattern = item.pattern;
          if (pattern && !intentData.patterns[lang].includes(pattern)) {
            intentData.patterns[lang].push(pattern);
            stats.totalPatterns++;
            stats.byIntent[intent].patterns++;
            stats.byLanguage[lang]++;

            // Add to layer
            if (!intentData.layers[layer][lang].includes(pattern)) {
              intentData.layers[layer][lang].push(pattern);
            }
          }
        } else {
          // Keyword item
          const keyword = item.keyword;
          if (keyword && !intentData.keywords[lang].includes(keyword)) {
            intentData.keywords[lang].push(keyword);
            stats.totalKeywords++;
            stats.byIntent[intent].keywords++;
            stats.byLanguage[lang]++;

            // Also add variants
            for (const variant of (item.variants || [])) {
              if (!intentData.keywords[lang].includes(variant)) {
                intentData.keywords[lang].push(variant);
                stats.totalKeywords++;
                stats.byIntent[intent].keywords++;
                stats.byLanguage[lang]++;
              }
            }

            // Add keyword to layer tracking
            if (!intentData.layers[layer][lang].includes(keyword)) {
              intentData.layers[layer][lang].push(keyword);
            }
          }
        }
      }
    }

    intentPatterns[intent] = intentData;
  }

  // Save output
  const outputDir = './output/documents';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(intentPatterns, null, 2));
  console.log(`\nSaved to: ${OUTPUT_FILE}`);

  // Also try to copy to backend/src/data
  try {
    writeFileSync(FINAL_OUTPUT, JSON.stringify(intentPatterns, null, 2));
    console.log(`Copied to: ${FINAL_OUTPUT}`);
  } catch (err) {
    console.warn(`Could not copy to backend/src/data: ${err.message}`);
  }

  // Print stats
  console.log('\n' + '='.repeat(70));
  console.log('MERGE COMPLETE');
  console.log('='.repeat(70));
  console.log(`\nTotal Keywords: ${stats.totalKeywords.toLocaleString()}`);
  console.log(`Total Patterns: ${stats.totalPatterns.toLocaleString()}`);
  console.log(`Total Items: ${(stats.totalKeywords + stats.totalPatterns).toLocaleString()}`);
  console.log('\nBy Language:');
  for (const [lang, count] of Object.entries(stats.byLanguage)) {
    console.log(`  ${lang}: ${count.toLocaleString()} items`);
  }
  console.log('\nBy Intent:');
  for (const [intent, data] of Object.entries(stats.byIntent)) {
    console.log(`  ${intent}: ${data.keywords.toLocaleString()} keywords, ${data.patterns.toLocaleString()} patterns`);
  }

  return { intentPatterns, stats };
}

// Run if called directly
mergeJobFiles().catch(err => {
  console.error('Merge failed:', err);
  process.exit(1);
});
