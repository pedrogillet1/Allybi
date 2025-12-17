/**
 * Intent Patterns Validation Script
 *
 * Validates:
 * 1. JSON syntax is valid
 * 2. All regex patterns compile correctly
 * 3. No duplicate keywords
 * 4. All required intents are present
 * 5. Pattern statistics
 *
 * Usage: npx ts-node --transpile-only scripts/validate_intent_patterns.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface RawIntentPattern {
  priority: number;
  description: string;
  keywords: Record<string, string[]>;
  patterns?: Record<string, string[]>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalIntents: number;
    totalKeywords: number;
    totalPatterns: number;
    compiledPatterns: number;
    failedPatterns: number;
    byLanguage: Record<string, { keywords: number; patterns: number }>;
  };
}

const REQUIRED_INTENTS = [
  'DOC_QA',
  'DOC_ANALYTICS',
  'DOC_MANAGEMENT',
  'DOC_SEARCH',
  'DOC_SUMMARIZE',
  'PREFERENCE_UPDATE',
  'MEMORY_STORE',
  'MEMORY_RECALL',
  'ANSWER_REWRITE',
  'ANSWER_EXPAND',
  'ANSWER_SIMPLIFY',
  'FEEDBACK_POSITIVE',
  'FEEDBACK_NEGATIVE',
  'PRODUCT_HELP',
  'ONBOARDING_HELP',
  'FEATURE_REQUEST',
  'GENERIC_KNOWLEDGE',
  'REASONING_TASK',
  'TEXT_TRANSFORM',
  'CHITCHAT',
  'META_AI',
  'OUT_OF_SCOPE',
  'AMBIGUOUS',
  'SAFETY_CONCERN',
  'MULTI_INTENT',
];

const VALID_LANGUAGES = ['en', 'pt', 'es'];

function validatePatterns(filePath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    stats: {
      totalIntents: 0,
      totalKeywords: 0,
      totalPatterns: 0,
      compiledPatterns: 0,
      failedPatterns: 0,
      byLanguage: {
        en: { keywords: 0, patterns: 0 },
        pt: { keywords: 0, patterns: 0 },
        es: { keywords: 0, patterns: 0 },
      },
    },
  };

  // Step 1: Check file exists
  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  // Step 2: Parse JSON
  let patternsJson: Record<string, RawIntentPattern>;
  try {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    patternsJson = JSON.parse(rawData);
    console.log('✅ JSON syntax valid');
  } catch (error: any) {
    result.valid = false;
    result.errors.push(`JSON parse error: ${error.message}`);
    return result;
  }

  // Step 3: Check for metadata fields (skip them in validation)
  const metadataFields = ['version', 'lastUpdated', 'description'];
  const intentEntries = Object.entries(patternsJson).filter(
    ([key]) => !metadataFields.includes(key)
  );

  result.stats.totalIntents = intentEntries.length;
  console.log(`📊 Found ${result.stats.totalIntents} intents`);

  // Step 4: Validate each intent
  const foundIntents = new Set<string>();

  for (const [intentName, rawPattern] of intentEntries) {
    foundIntents.add(intentName);

    // Validate intent has required fields
    if (typeof rawPattern.priority !== 'number') {
      result.warnings.push(`${intentName}: missing or invalid priority`);
    }

    if (!rawPattern.description) {
      result.warnings.push(`${intentName}: missing description`);
    }

    // Validate keywords
    if (rawPattern.keywords) {
      for (const [lang, keywords] of Object.entries(rawPattern.keywords)) {
        if (!VALID_LANGUAGES.includes(lang)) {
          result.warnings.push(`${intentName}: unknown language code '${lang}'`);
          continue;
        }

        if (!Array.isArray(keywords)) {
          result.errors.push(`${intentName}/${lang}: keywords must be an array`);
          result.valid = false;
          continue;
        }

        // Count keywords
        result.stats.totalKeywords += keywords.length;
        result.stats.byLanguage[lang].keywords += keywords.length;

        // Check for duplicates
        const seen = new Set<string>();
        for (const kw of keywords) {
          const normalized = kw.toLowerCase().trim();
          if (seen.has(normalized)) {
            result.warnings.push(`${intentName}/${lang}: duplicate keyword '${kw}'`);
          }
          seen.add(normalized);
        }
      }
    }

    // Validate regex patterns
    if (rawPattern.patterns) {
      for (const [lang, patterns] of Object.entries(rawPattern.patterns)) {
        if (!VALID_LANGUAGES.includes(lang)) {
          result.warnings.push(`${intentName}: unknown language code '${lang}' in patterns`);
          continue;
        }

        if (!Array.isArray(patterns)) {
          result.errors.push(`${intentName}/${lang}: patterns must be an array`);
          result.valid = false;
          continue;
        }

        result.stats.totalPatterns += patterns.length;
        result.stats.byLanguage[lang].patterns += patterns.length;

        // Compile each regex
        for (const patternStr of patterns) {
          try {
            // Clean pattern (same as IntentConfigService)
            let cleaned = patternStr
              .replace(/```regex\s*/g, '')
              .replace(/```\s*/g, '')
              .trim();

            if (cleaned.length === 0) {
              result.warnings.push(`${intentName}/${lang}: empty pattern found`);
              continue;
            }

            // Try to compile
            new RegExp(cleaned, 'i');
            result.stats.compiledPatterns++;

          } catch (error: any) {
            result.valid = false;
            result.stats.failedPatterns++;
            result.errors.push(
              `${intentName}/${lang}: invalid regex "${patternStr.substring(0, 50)}..." - ${error.message}`
            );
          }
        }
      }
    }
  }

  // Step 5: Check all required intents are present
  for (const required of REQUIRED_INTENTS) {
    if (!foundIntents.has(required)) {
      result.warnings.push(`Missing required intent: ${required}`);
    }
  }

  // Check for unknown intents
  for (const found of foundIntents) {
    if (!REQUIRED_INTENTS.includes(found) && found !== 'UNKNOWN') {
      result.warnings.push(`Unknown intent (not in standard list): ${found}`);
    }
  }

  return result;
}

function main() {
  console.log('🔍 Validating intent_patterns.json...\n');

  const filePath = path.join(__dirname, '../src/data/intent_patterns.json');
  const result = validatePatterns(filePath);

  // Print statistics
  console.log('\n📈 Statistics:');
  console.log(`   Total intents: ${result.stats.totalIntents}`);
  console.log(`   Total keywords: ${result.stats.totalKeywords}`);
  console.log(`   Total patterns: ${result.stats.totalPatterns}`);
  console.log(`   Compiled patterns: ${result.stats.compiledPatterns}`);
  console.log(`   Failed patterns: ${result.stats.failedPatterns}`);
  console.log('\n   By language:');
  for (const [lang, stats] of Object.entries(result.stats.byLanguage)) {
    console.log(`     ${lang}: ${stats.keywords} keywords, ${stats.patterns} patterns`);
  }

  // Print errors
  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const error of result.errors) {
      console.log(`   - ${error}`);
    }
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of result.warnings.slice(0, 20)) {
      console.log(`   - ${warning}`);
    }
    if (result.warnings.length > 20) {
      console.log(`   ... and ${result.warnings.length - 20} more`);
    }
  }

  // Final verdict
  console.log('\n' + '='.repeat(50));
  if (result.valid) {
    console.log('✅ VALIDATION PASSED - All patterns compile correctly');
  } else {
    console.log('❌ VALIDATION FAILED - Fix errors before proceeding');
    process.exit(1);
  }
}

main();
