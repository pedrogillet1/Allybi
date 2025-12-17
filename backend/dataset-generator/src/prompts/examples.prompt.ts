/**
 * Prompt Templates: Examples Generation
 * Generate user query examples for intent classification
 */

import { LanguageCode } from '../schemas/patterns.schema.js';
import {
  IntentName,
  ExampleVariation,
  INTENT_HIERARCHY,
  SUB_INTENT_DESCRIPTIONS,
  GENERATION_TARGETS
} from '../schemas/intents.schema.js';
import {
  EXAMPLE_VARIATION_DESCRIPTIONS,
  EXAMPLE_DISTRIBUTION
} from '../schemas/examples.schema.js';

export interface ExamplesPromptParams {
  intent: IntentName;
  subIntent: string;
  language: LanguageCode;
  count: number;
  existingExamples?: string[];
}

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish'
};

const LANGUAGE_CULTURAL_NOTES: Record<LanguageCode, string> = {
  en: 'Use American English spelling and idioms. Include both formal and casual registers.',
  pt: 'Use Brazilian Portuguese (not European). Include common Brazilian expressions and informal language.',
  es: 'Use Latin American Spanish (neutral). Include regional variations where natural.'
};

export function buildExamplesPrompt(params: ExamplesPromptParams): string {
  const { intent, subIntent, language, count, existingExamples } = params;

  const intentDesc = INTENT_HIERARCHY[intent].description;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;

  // Calculate distribution
  const shortCount = Math.round(count * EXAMPLE_DISTRIBUTION.short);
  const mediumCount = Math.round(count * EXAMPLE_DISTRIBUTION.medium);
  const longCount = Math.round(count * EXAMPLE_DISTRIBUTION.long);
  const messyCount = Math.round(count * EXAMPLE_DISTRIBUTION.messy);
  const ambiguousCount = count - shortCount - mediumCount - longCount - messyCount;

  const existingSection = existingExamples?.length
    ? `\n\n## Existing Examples (DO NOT duplicate)\n${existingExamples.slice(0, 20).map(e => `- "${e}"`).join('\n')}\n${existingExamples.length > 20 ? `... and ${existingExamples.length - 20} more` : ''}`
    : '';

  return `You are generating training examples for an intent classification system. Generate realistic user queries.

## Target
- **Intent**: ${intent} - ${intentDesc}
- **Sub-intent**: ${subIntent} - ${subIntentDesc}
- **Language**: ${LANGUAGE_NAMES[language]}
- **Total examples needed**: ${count}

## Language Notes
${LANGUAGE_CULTURAL_NOTES[language]}

## Distribution Required
Generate examples in these proportions:
- **short** (${shortCount}): ${EXAMPLE_VARIATION_DESCRIPTIONS.short}
- **medium** (${mediumCount}): ${EXAMPLE_VARIATION_DESCRIPTIONS.medium}
- **long** (${longCount}): ${EXAMPLE_VARIATION_DESCRIPTIONS.long}
- **messy** (${messyCount}): ${EXAMPLE_VARIATION_DESCRIPTIONS.messy}
- **ambiguous** (${ambiguousCount}): ${EXAMPLE_VARIATION_DESCRIPTIONS.ambiguous}

## Example Quality Guidelines
1. **Realistic**: Write queries real users would actually type
2. **Diverse**: Vary vocabulary, structure, formality, and phrasing
3. **Intent-specific**: Each example must clearly relate to ${intent}:${subIntent}
4. **Natural**: Include natural language variations (contractions, filler words)
5. **Context-aware**: Some examples can reference documents, others be general

## Concrete Values to Use
Include specific values where appropriate:
- Document types: PDF, Excel, Word, PowerPoint, contract, report, invoice, memo
- Topics: finance, legal, security, compliance, marketing, HR, sales, operations
- Time references: yesterday, last week, Q4 2024, this month, recent
- Names: invoice_jan.pdf, quarterly_report.xlsx, contract_v2.docx
- Folders: /clients/acme, /finance/2024, /legal/contracts${existingSection}

## Output Format
Return ONLY a JSON array with this structure:
[
  {
    "text": "the example query in ${LANGUAGE_NAMES[language]}",
    "variation": "short|medium|long|messy|ambiguous"
  }
]

Generate exactly ${count} diverse examples now:`;
}

export function buildBatchExamplesPrompt(params: {
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

  return `You are generating training examples for an intent classification system.

## Task
Generate ${countPerSubIntent} examples for EACH sub-intent listed below.

## Intent: ${intent}
${intentDesc}

## Sub-intents to cover:
${subIntentDescs}

## Language: ${LANGUAGE_NAMES[language]}
${LANGUAGE_CULTURAL_NOTES[language]}

## Distribution per sub-intent
For each sub-intent, include:
- 25% short (3-8 words)
- 35% medium (8-20 words)
- 15% long (20-50 words)
- 15% messy (typos, incomplete)
- 10% ambiguous (edge cases)

## Quality Guidelines
1. Realistic queries users would actually type
2. Diverse vocabulary and structure
3. Include document references where natural
4. Mix formal and informal registers

## Output Format
{
  "examples": [
    {
      "text": "the query",
      "subIntent": "the sub-intent",
      "variation": "short|medium|long|messy|ambiguous"
    }
  ]
}

Generate ${countPerSubIntent * subIntents.length} total examples now:`;
}
