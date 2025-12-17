/**
 * Fast Local Generator - Direct Claude API calls with large batches
 * Generates all data in minutes, not hours
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { INTENT_HIERARCHY, SUB_INTENT_DESCRIPTIONS } from './schemas.mjs';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
const OUTPUT_DIR = './output';

// Batch sizes - generate everything in fewer, larger calls
const BATCH_CONFIG = {
  keywords: 200,
  patterns: 100,
  examples: 150,
  edge_cases: 50,
  negatives: 30
};

/**
 * Generate a single large batch directly from Claude
 */
async function generateBatch(intent, subIntent, dataType, count, language = 'en') {
  const description = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;

  const prompts = {
    keywords: `Generate exactly ${count} unique trigger keywords/phrases for intent detection.

Intent: ${intent} → ${subIntent}
Description: ${description}
Language: ${language}

Requirements:
- Single words or short phrases (1-4 words)
- Natural user language, not technical
- Include typos, slang, abbreviations
- No duplicates
- Mix of formal and casual

Return ONLY a JSON array of strings, nothing else:
["keyword1", "keyword2", ...]`,

    patterns: `Generate exactly ${count} regex patterns for intent detection.

Intent: ${intent} → ${subIntent}
Description: ${description}
Language: ${language}

Requirements:
- Valid JavaScript regex patterns
- Use \\b for word boundaries
- Use (?:...) for non-capturing groups
- Include variations with optional words
- Patterns should match real user queries

Return ONLY a JSON array of pattern strings:
["pattern1", "pattern2", ...]`,

    examples: `Generate exactly ${count} realistic user query examples.

Intent: ${intent} → ${subIntent}
Description: ${description}
Language: ${language}

Requirements:
- Natural conversational language
- Vary length (short to medium)
- Include questions, commands, statements
- Mix formal and casual tones
- Include typos and incomplete sentences

Return ONLY a JSON array of example strings:
["example1", "example2", ...]`,

    edge_cases: `Generate exactly ${count} edge case queries that are ambiguous or tricky.

Intent: ${intent} → ${subIntent}
Description: ${description}
Language: ${language}

Requirements:
- Queries that could be misclassified
- Unusual phrasings
- Mixed intent signals
- Incomplete or vague requests

Return ONLY a JSON array:
["edge1", "edge2", ...]`,

    negatives: `Generate exactly ${count} negative examples - queries that should NOT match this intent.

Intent: ${intent} → ${subIntent}
Description: ${description}
Language: ${language}

Requirements:
- Queries that look similar but have different intent
- Common false positives to avoid
- Related but distinct requests

Return ONLY a JSON array:
["negative1", "negative2", ...]`
  };

  const prompt = prompts[dataType];
  if (!prompt) throw new Error(`Unknown dataType: ${dataType}`);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn(`No JSON array found for ${intent}/${subIntent}/${dataType}`);
      return [];
    }

    const data = JSON.parse(jsonMatch[0]);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Error generating ${intent}/${subIntent}/${dataType}:`, error.message);
    return [];
  }
}

/**
 * Generate all data for a single sub-intent (all data types)
 */
async function generateSubIntent(intent, subIntent, language = 'en') {
  console.log(`\n  Generating ${intent}/${subIntent}...`);

  const results = {};
  const startTime = Date.now();

  // Generate all data types in parallel
  const promises = Object.entries(BATCH_CONFIG).map(async ([dataType, count]) => {
    const data = await generateBatch(intent, subIntent, dataType, count, language);
    results[dataType] = data;
    console.log(`    ✓ ${dataType}: ${data.length} items`);
  });

  await Promise.all(promises);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`    Done in ${duration}s`);

  return {
    intent,
    subIntent,
    language,
    ...results,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Generate all data for an entire intent (all sub-intents)
 */
async function generateIntent(intent, language = 'en', concurrency = 3) {
  const subIntents = INTENT_HIERARCHY[intent]?.subIntents || [];
  console.log(`\n[${ intent.toUpperCase() }] Generating ${subIntents.length} sub-intents...`);

  const results = [];

  // Process sub-intents in batches for controlled concurrency
  for (let i = 0; i < subIntents.length; i += concurrency) {
    const batch = subIntents.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(sub => generateSubIntent(intent, sub, language))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Generate everything
 */
async function generateAll(language = 'en', concurrency = 3) {
  console.log('='.repeat(60));
  console.log('FAST GENERATOR - Direct Claude API');
  console.log('='.repeat(60));
  console.log(`Language: ${language}`);
  console.log(`Concurrency: ${concurrency} sub-intents in parallel`);

  const intents = Object.keys(INTENT_HIERARCHY);
  console.log(`\nIntents to process: ${intents.length}`);
  console.log(`Total sub-intents: ${intents.reduce((sum, i) => sum + INTENT_HIERARCHY[i].subIntents.length, 0)}`);

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const allResults = [];
  const startTime = Date.now();

  for (const intent of intents) {
    const intentResults = await generateIntent(intent, language, concurrency);
    allResults.push(...intentResults);

    // Save progress after each intent
    const outputPath = `${OUTPUT_DIR}/dataset_${language}_progress.json`;
    writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  }

  // Final save
  const finalPath = `${OUTPUT_DIR}/dataset_${language}_complete.json`;
  writeFileSync(finalPath, JSON.stringify(allResults, null, 2));

  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

  // Calculate totals
  const totals = {
    keywords: 0,
    patterns: 0,
    examples: 0,
    edge_cases: 0,
    negatives: 0
  };

  for (const result of allResults) {
    for (const type of Object.keys(totals)) {
      totals[type] += result[type]?.length || 0;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Duration: ${totalDuration} minutes`);
  console.log(`Sub-intents processed: ${allResults.length}`);
  console.log(`\nTotals generated:`);
  for (const [type, count] of Object.entries(totals)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log(`\nTotal items: ${Object.values(totals).reduce((a, b) => a + b, 0)}`);
  console.log(`\nSaved to: ${finalPath}`);
}

// CLI
const args = process.argv.slice(2);
const langIdx = args.indexOf('--language');
const concurrencyIdx = args.indexOf('--concurrency');
const intentIdx = args.indexOf('--intent');

const language = langIdx !== -1 ? args[langIdx + 1] : 'en';
const concurrency = concurrencyIdx !== -1 ? parseInt(args[concurrencyIdx + 1]) : 3;
const singleIntent = intentIdx !== -1 ? args[intentIdx + 1] : null;

if (singleIntent) {
  generateIntent(singleIntent, language, concurrency)
    .then(results => {
      const outputPath = `${OUTPUT_DIR}/${singleIntent}_${language}.json`;
      if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\nSaved to: ${outputPath}`);
    })
    .catch(console.error);
} else {
  generateAll(language, concurrency).catch(console.error);
}
