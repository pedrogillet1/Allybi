/**
 * Test script to validate intent pattern loading
 * Runs the IntentConfigService to ensure patterns load cleanly
 */

const fs = require('fs');
const path = require('path');

// Simple mock logger
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

// Load and validate patterns (mimicking IntentConfigService behavior)
async function testIntentLoader() {
  const configPath = path.join(__dirname, '../src/data/intent_patterns.json');

  console.log('=== Intent Pattern Loader Test ===\n');
  console.log('Loading from:', configPath);

  try {
    // Read JSON file
    const rawData = fs.readFileSync(configPath, 'utf-8');
    const patternsJson = JSON.parse(rawData);

    console.log('\n--- Validation Results ---\n');

    const validIntents = [
      'DOC_QA', 'DOC_ANALYTICS', 'DOC_MANAGEMENT', 'DOC_SEARCH', 'DOC_SUMMARIZE',
      'PREFERENCE_UPDATE', 'MEMORY_STORE', 'MEMORY_RECALL', 'ANSWER_REWRITE',
      'ANSWER_EXPAND', 'ANSWER_SIMPLIFY', 'FEEDBACK_POSITIVE', 'FEEDBACK_NEGATIVE',
      'PRODUCT_HELP', 'ONBOARDING_HELP', 'FEATURE_REQUEST', 'GENERIC_KNOWLEDGE',
      'REASONING_TASK', 'TEXT_TRANSFORM', 'CHITCHAT', 'META_AI', 'OUT_OF_SCOPE',
      'AMBIGUOUS', 'SAFETY_CONCERN', 'MULTI_INTENT', 'UNKNOWN'
    ];

    const validLanguages = ['en', 'pt', 'es'];

    let successCount = 0;
    let failCount = 0;
    let warningCount = 0;
    let totalKeywords = 0;
    let totalPatterns = 0;
    const stats = { en: { keywords: 0, patterns: 0 }, pt: { keywords: 0, patterns: 0 }, es: { keywords: 0, patterns: 0 } };

    // Skip metadata fields
    const metadataFields = ['version', 'lastUpdated', 'description'];

    for (const [intentName, rawPattern] of Object.entries(patternsJson)) {
      // Skip metadata
      if (metadataFields.includes(intentName)) continue;

      // Validate intent name
      if (!validIntents.includes(intentName)) {
        console.warn(`⚠️  Unknown intent: ${intentName}`);
        warningCount++;
        continue;
      }

      // Process keywords
      if (rawPattern.keywords) {
        for (const [lang, keywords] of Object.entries(rawPattern.keywords)) {
          if (validLanguages.includes(lang) && Array.isArray(keywords)) {
            stats[lang].keywords += keywords.length;
            totalKeywords += keywords.length;
          }
        }
      }

      // Process and compile patterns
      if (rawPattern.patterns) {
        for (const [lang, patterns] of Object.entries(rawPattern.patterns)) {
          if (validLanguages.includes(lang) && Array.isArray(patterns)) {
            for (const patternStr of patterns) {
              try {
                // Clean pattern (remove markdown fences if any)
                let cleanPattern = patternStr
                  .replace(/```regex\s*/g, '')
                  .replace(/```\s*/g, '')
                  .trim();

                if (cleanPattern.length > 0) {
                  new RegExp(cleanPattern, 'i');
                  stats[lang].patterns++;
                  totalPatterns++;
                }
              } catch (e) {
                console.error(`❌ Regex compile error in ${intentName}/${lang}: "${patternStr}"`);
                console.error(`   Error: ${e.message}`);
                failCount++;
              }
            }
          }
        }
      }

      successCount++;
    }

    // Check critical intents coverage
    console.log('--- Critical Intents Coverage ---');
    const criticalIntents = ['DOC_QA', 'DOC_ANALYTICS', 'PRODUCT_HELP', 'CHITCHAT', 'OUT_OF_SCOPE', 'AMBIGUOUS', 'SAFETY_CONCERN'];
    const loadedIntents = Object.keys(patternsJson).filter(k => !metadataFields.includes(k));

    for (const intent of criticalIntents) {
      const present = loadedIntents.includes(intent);
      console.log(`  ${present ? '✅' : '❌'} ${intent}`);
      if (!present) failCount++;
    }

    // Summary
    console.log('\n--- Statistics ---');
    console.log(`Intents loaded: ${successCount}`);
    console.log(`Total keywords: ${totalKeywords}`);
    console.log(`Total patterns: ${totalPatterns}`);
    console.log('\nBy language:');
    for (const [lang, s] of Object.entries(stats)) {
      console.log(`  ${lang}: ${s.keywords} keywords, ${s.patterns} patterns`);
    }

    console.log('\n--- Final Result ---');
    if (failCount === 0) {
      console.log('✅ All patterns loaded successfully!');
      console.log(`   ${successCount} intents, ${warningCount} warnings`);
      process.exit(0);
    } else {
      console.log(`❌ ${failCount} errors found`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Failed to load intent patterns:', error.message);
    process.exit(1);
  }
}

testIntentLoader();
