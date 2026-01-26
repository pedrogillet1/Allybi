/**
 * Prompt Templates: Keywords Generation
 * Generate keywords and phrases for intent matching
 */

import { LanguageCode } from '../schemas/patterns.schema.js';
import {
  IntentName,
  KeywordVariation,
  INTENT_HIERARCHY,
  SUB_INTENT_DESCRIPTIONS,
  GENERATION_TARGETS
} from '../schemas/intents.schema.js';
import {
  KEYWORD_VARIATION_DESCRIPTIONS,
  KEYWORD_DISTRIBUTION
} from '../schemas/keywords.schema.js';

export interface KeywordsPromptParams {
  intent: IntentName;
  subIntent: string;
  language: LanguageCode;
  count: number;
  existingKeywords?: string[];
}

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish'
};

const LANGUAGE_KEYWORD_NOTES: Record<LanguageCode, string> = {
  en: 'Include American English terms, common abbreviations, and business jargon.',
  pt: 'Include Brazilian expressions, common abbreviations (like "doc" for documento), and informal terms.',
  es: 'Include Latin American terms, common abbreviations, and regional variations.'
};

export function buildKeywordsPrompt(params: KeywordsPromptParams): string {
  const { intent, subIntent, language, count, existingKeywords } = params;

  const intentDesc = INTENT_HIERARCHY[intent].description;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;

  // Calculate distribution
  const coreCount = Math.round(count * KEYWORD_DISTRIBUTION.core);
  const synonymsCount = Math.round(count * KEYWORD_DISTRIBUTION.synonyms);
  const domainCount = Math.round(count * KEYWORD_DISTRIBUTION.domain);
  const colloquialCount = Math.round(count * KEYWORD_DISTRIBUTION.colloquial);
  const misspellingsCount = count - coreCount - synonymsCount - domainCount - colloquialCount;

  const existingSection = existingKeywords?.length
    ? `\n\n## Existing Keywords (DO NOT duplicate)\n${existingKeywords.slice(0, 30).map(k => `- "${k}"`).join('\n')}\n${existingKeywords.length > 30 ? `... and ${existingKeywords.length - 30} more` : ''}`
    : '';

  return `You are generating keywords for an intent classification system. Generate words and phrases that signal this intent.

## Target
- **Intent**: ${intent} - ${intentDesc}
- **Sub-intent**: ${subIntent} - ${subIntentDesc}
- **Language**: ${LANGUAGE_NAMES[language]}
- **Total keywords needed**: ${count}

## Language Notes
${LANGUAGE_KEYWORD_NOTES[language]}

## Distribution Required
Generate keywords in these proportions:
- **core** (${coreCount}): ${KEYWORD_VARIATION_DESCRIPTIONS.core}
- **synonyms** (${synonymsCount}): ${KEYWORD_VARIATION_DESCRIPTIONS.synonyms}
- **domain** (${domainCount}): ${KEYWORD_VARIATION_DESCRIPTIONS.domain}
- **colloquial** (${colloquialCount}): ${KEYWORD_VARIATION_DESCRIPTIONS.colloquial}
- **misspellings** (${misspellingsCount}): ${KEYWORD_VARIATION_DESCRIPTIONS.misspellings}

## Keyword Quality Guidelines
1. **High-signal**: Each keyword should strongly indicate this intent/sub-intent
2. **Varied length**: Mix single words and multi-word phrases
3. **Action verbs**: Include verbs that trigger this intent
4. **Nouns**: Include objects/concepts specific to this intent
5. **Modifiers**: Include adjectives/adverbs that signal intent

## Examples by Variation Type
For a "documents:summary" intent:
- **core**: "summarize", "summary", "overview", "brief"
- **synonyms**: "sum up", "recap", "outline", "gist"
- **domain**: "executive summary", "abstract", "synopsis"
- **colloquial**: "give me the tldr", "cliff notes", "quick rundown"
- **misspellings**: "sumary", "sumarize", "summery"${existingSection}

## Output Format
Return ONLY a JSON array with this structure:
[
  {
    "text": "the keyword or phrase",
    "variation": "core|synonyms|domain|colloquial|misspellings",
    "weight": 0.0-1.0 (how strongly it signals this intent)
  }
]

Generate exactly ${count} diverse keywords now:`;
}

export function buildBatchKeywordsPrompt(params: {
  intent: IntentName;
  subIntents: string[];
  language: LanguageCode;
  countPerSubIntent: number;
}): string {
  const { intent, subIntents, language, countPerSubIntent } = params;

  const intentDesc = INTENT_HIERARCHY[intent].description;
  const subIntentDescs = subIntents.map(si =>
    `- **${si}**: ${SUB_INTENT_DESCRIPTIONS[intent]?.[si] || si}`
  ).join('\n');

  return `You are generating keywords for an intent classification system.

## Task
Generate ${countPerSubIntent} keywords for EACH sub-intent listed below.

## Intent: ${intent}
${intentDesc}

## Sub-intents to cover:
${subIntentDescs}

## Language: ${LANGUAGE_NAMES[language]}
${LANGUAGE_KEYWORD_NOTES[language]}

## Distribution per sub-intent
For each sub-intent, include:
- 30% core (primary high-signal keywords)
- 25% synonyms (alternative phrasings)
- 20% domain (technical/jargon terms)
- 15% colloquial (informal terms)
- 10% misspellings (common typos)

## Quality Guidelines
1. Each keyword should strongly signal its sub-intent
2. Mix single words and phrases
3. Include verbs, nouns, and modifiers
4. Assign weight 0.7-1.0 for core, 0.5-0.7 for others

## Output Format
{
  "keywords": [
    {
      "text": "keyword",
      "subIntent": "the sub-intent",
      "variation": "core|synonyms|domain|colloquial|misspellings",
      "weight": 0.0-1.0
    }
  ]
}

Generate ${countPerSubIntent * subIntents.length} total keywords now:`;
}
