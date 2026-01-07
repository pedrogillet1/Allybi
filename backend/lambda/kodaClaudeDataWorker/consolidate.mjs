/**
 * Consolidate all generated data into intent_patterns.json
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = './output/master';
const TIERS = ['tier-0', 'tier-1', 'tier-2'];
const OUTPUT_FILE = '/Users/pg/Desktop/koda-webapp/backend/src/data/intent_patterns.json';

const consolidated = {
  metadata: {
    generatedAt: new Date().toISOString(),
    version: '6.0',
    description: 'KODA Intent Classification Dataset - 10 intents x 3 languages'
  },
  intents: {}
};

let totalKeywords = 0;
let totalPatterns = 0;
let filesProcessed = 0;

for (const tier of TIERS) {
  const tierDir = join(OUTPUT_DIR, tier);
  let files;
  try {
    files = readdirSync(tierDir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  } catch (e) {
    console.log(`Skipping ${tier}: ${e.message}`);
    continue;
  }

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(tierDir, file), 'utf8'));
      const intent = data.intent;
      const language = data.language;
      const layer = data.layer;
      const target = data.target;
      const items = data.items || [];

      if (!consolidated.intents[intent]) {
        consolidated.intents[intent] = { keywords: {}, patterns: {} };
      }

      // Determine if keywords or patterns based on items structure
      const isPattern = items[0]?.pattern !== undefined;
      const category = isPattern ? 'patterns' : 'keywords';

      if (!consolidated.intents[intent][category][language]) {
        consolidated.intents[intent][category][language] = [];
      }

      // Add items with metadata
      for (const item of items) {
        if (isPattern) {
          consolidated.intents[intent][category][language].push({
            pattern: item.pattern,
            layer,
            target,
            description: item.description,
            precision: item.precision
          });
          totalPatterns++;
        } else {
          consolidated.intents[intent][category][language].push({
            keyword: item.keyword,
            layer,
            target,
            variants: item.variants,
            register: item.register
          });
          totalKeywords++;
        }
      }

      filesProcessed++;
      if (filesProcessed % 1000 === 0) {
        console.log(`Processed ${filesProcessed} files...`);
      }
    } catch (e) {
      // Skip invalid files
    }
  }
}

// Add counts
consolidated.metadata.totalKeywords = totalKeywords;
consolidated.metadata.totalPatterns = totalPatterns;
consolidated.metadata.filesProcessed = filesProcessed;

// Write output
writeFileSync(OUTPUT_FILE, JSON.stringify(consolidated, null, 2));
console.log(`\nConsolidation complete!`);
console.log(`Files processed: ${filesProcessed}`);
console.log(`Total keywords: ${totalKeywords.toLocaleString()}`);
console.log(`Total patterns: ${totalPatterns.toLocaleString()}`);
console.log(`Output: ${OUTPUT_FILE}`);
