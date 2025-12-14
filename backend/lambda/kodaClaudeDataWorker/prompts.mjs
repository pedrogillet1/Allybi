/**
 * Tier 2 Batch Prompt Templates
 * Strict JSON output, no explanations
 */

import { INTENT_HIERARCHY, SUB_INTENT_DESCRIPTIONS } from './schemas.mjs';

const LANG_NAMES = { en: 'English', pt: 'Portuguese', es: 'Spanish' };

/**
 * Build prompt for generating keywords batch
 */
export function buildKeywordsPrompt({ intent, subIntent, language, batchSize, batchIndex }) {
  const intentDesc = INTENT_HIERARCHY[intent]?.description || intent;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;
  const langName = LANG_NAMES[language] || 'English';

  const variation = batchIndex === 0 ? 'core high-signal' :
                    batchIndex === 1 ? 'synonyms and alternative phrasings' :
                    batchIndex === 2 ? 'domain-specific terminology' :
                    'colloquial and informal terms';

  return `Generate ${batchSize} ${variation} keywords for intent classification.
Intent: ${intent} - ${intentDesc}
Sub-intent: ${subIntent} - ${subIntentDesc}
Language: ${langName}
Output a JSON array of strings only. No explanations.
["keyword1", "keyword2", ...]`;
}

/**
 * Build prompt for generating regex patterns batch
 */
export function buildPatternsPrompt({ intent, subIntent, language, batchSize, batchIndex }) {
  const intentDesc = INTENT_HIERARCHY[intent]?.description || intent;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;
  const langName = LANG_NAMES[language] || 'English';

  const variation = batchIndex === 0 ? 'question-form patterns (what, how, can you)' :
                    'command-form patterns (show me, find, list)';

  return `Generate ${batchSize} JavaScript regex patterns for ${variation}.
Intent: ${intent} - ${intentDesc}
Sub-intent: ${subIntent} - ${subIntentDesc}
Language: ${langName}
Use \\b for word boundaries. Make patterns specific.
Output a JSON array of regex strings only. No explanations.
["pattern1", "pattern2", ...]`;
}

/**
 * Build prompt for generating examples batch
 */
export function buildExamplesPrompt({ intent, subIntent, language, batchSize, batchIndex }) {
  const intentDesc = INTENT_HIERARCHY[intent]?.description || intent;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;
  const langName = LANG_NAMES[language] || 'English';

  const variation = batchIndex === 0 ? 'short (3-8 words)' :
                    batchIndex === 1 ? 'medium length (8-15 words)' :
                    batchIndex === 2 ? 'longer detailed (15-30 words)' :
                    batchIndex === 3 ? 'with typos and grammar errors' :
                    'conversational and natural';

  return `Generate ${batchSize} ${variation} example user queries.
Intent: ${intent} - ${intentDesc}
Sub-intent: ${subIntent} - ${subIntentDesc}
Language: ${langName}
These should clearly match this intent. Use realistic language.
Output a JSON array of strings only. No explanations.
["example query 1", "example query 2", ...]`;
}

/**
 * Build prompt for generating edge cases batch
 */
export function buildEdgeCasesPrompt({ intent, subIntent, language, batchSize, batchIndex }) {
  const intentDesc = INTENT_HIERARCHY[intent]?.description || intent;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;
  const langName = LANG_NAMES[language] || 'English';

  const variation = batchIndex === 0 ? 'ambiguous queries that might match multiple intents' :
                    'boundary cases that barely qualify for this intent';

  return `Generate ${batchSize} ${variation}.
Intent: ${intent} - ${intentDesc}
Sub-intent: ${subIntent} - ${subIntentDesc}
Language: ${langName}
These are tricky cases for classification testing.
Output a JSON array of strings only. No explanations.
["edge case 1", "edge case 2", ...]`;
}

/**
 * Build prompt for generating negative examples batch
 */
export function buildNegativesPrompt({ intent, subIntent, language, batchSize, batchIndex }) {
  const intentDesc = INTENT_HIERARCHY[intent]?.description || intent;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;
  const langName = LANG_NAMES[language] || 'English';

  const otherIntents = Object.keys(INTENT_HIERARCHY).filter(i => i !== intent).slice(0, 3);

  return `Generate ${batchSize} queries that should NOT match this intent.
Intent to avoid: ${intent} - ${intentDesc}
Sub-intent to avoid: ${subIntent} - ${subIntentDesc}
Language: ${langName}
These should match other intents like: ${otherIntents.join(', ')}
Output a JSON array of strings only. No explanations.
["negative example 1", "negative example 2", ...]`;
}

/**
 * Build prompt for generating validation rules batch
 */
export function buildValidationPrompt({ intent, subIntent, language, batchSize }) {
  const intentDesc = INTENT_HIERARCHY[intent]?.description || intent;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;

  const otherIntents = Object.keys(INTENT_HIERARCHY).filter(i => i !== intent).slice(0, 4);

  return `Generate ${batchSize} validation rules for intent classification.
Intent: ${intent} - ${intentDesc}
Sub-intent: ${subIntent} - ${subIntentDesc}
Other intents to distinguish from: ${otherIntents.join(', ')}
Output JSON array with this structure. No explanations.
[{"type":"requires|excludes|boost|penalize","condition":"description","keywords":["word1"],"modifier":0.1}]`;
}

/**
 * Get the appropriate prompt builder for a data type
 */
export function getPromptBuilder(dataType) {
  const builders = {
    keywords: buildKeywordsPrompt,
    patterns: buildPatternsPrompt,
    examples: buildExamplesPrompt,
    edge_cases: buildEdgeCasesPrompt,
    negatives: buildNegativesPrompt,
    validation: buildValidationPrompt
  };
  return builders[dataType];
}
