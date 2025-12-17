/**
 * Prompt Templates: Regex Patterns Generation
 * Generate regex patterns for intent matching
 */

import { LanguageCode } from '../schemas/patterns.schema.js';
import {
  IntentName,
  PatternVariation,
  INTENT_HIERARCHY,
  SUB_INTENT_DESCRIPTIONS,
  GENERATION_TARGETS
} from '../schemas/intents.schema.js';
import {
  PATTERN_VARIATION_DESCRIPTIONS,
  PATTERN_DISTRIBUTION
} from '../schemas/regex-patterns.schema.js';

export interface RegexPatternsPromptParams {
  intent: IntentName;
  subIntent: string;
  language: LanguageCode;
  count: number;
  existingPatterns?: string[];
}

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish'
};

const LANGUAGE_PATTERN_NOTES: Record<LanguageCode, string> = {
  en: 'Account for contractions (what\'s, can\'t), question words (what, how, why), and imperative forms.',
  pt: 'Account for verb conjugations, reflexive pronouns (me, se), and common contractions (tá, pra).',
  es: 'Account for verb conjugations, question marks (¿), reflexive forms, and regional variations.'
};

export function buildRegexPatternsPrompt(params: RegexPatternsPromptParams): string {
  const { intent, subIntent, language, count, existingPatterns } = params;

  const intentDesc = INTENT_HIERARCHY[intent].description;
  const subIntentDesc = SUB_INTENT_DESCRIPTIONS[intent]?.[subIntent] || subIntent;

  // Calculate distribution
  const anchoredCount = Math.round(count * PATTERN_DISTRIBUTION.anchored);
  const questionCount = Math.round(count * PATTERN_DISTRIBUTION.question_forms);
  const commandCount = count - anchoredCount - questionCount;

  const existingSection = existingPatterns?.length
    ? `\n\n## Existing Patterns (DO NOT duplicate)\n${existingPatterns.slice(0, 15).map(p => `- \`${p}\``).join('\n')}\n${existingPatterns.length > 15 ? `... and ${existingPatterns.length - 15} more` : ''}`
    : '';

  return `You are generating regex patterns for an intent classification system.

## Target
- **Intent**: ${intent} - ${intentDesc}
- **Sub-intent**: ${subIntent} - ${subIntentDesc}
- **Language**: ${LANGUAGE_NAMES[language]}
- **Total patterns needed**: ${count}

## Language Notes
${LANGUAGE_PATTERN_NOTES[language]}

## Distribution Required
Generate patterns in these proportions:
- **anchored** (${anchoredCount}): ${PATTERN_VARIATION_DESCRIPTIONS.anchored}
- **question_forms** (${questionCount}): ${PATTERN_VARIATION_DESCRIPTIONS.question_forms}
- **command_forms** (${commandCount}): ${PATTERN_VARIATION_DESCRIPTIONS.command_forms}

## Regex Syntax Guidelines
1. Use \`.+\` for variable parts (names, topics, etc.)
2. Use \`(word1|word2)\` for alternation
3. Use \`(word )?\` for optional words
4. Use \`^pattern\` for start-anchored
5. Use \`pattern$\` for end-anchored
6. Keep patterns lowercase
7. Escape special regex chars: \\. \\? \\( \\)

## Pattern Quality Guidelines
1. **Specific**: Each pattern should match only this intent
2. **General**: Pattern should match many query variations
3. **Efficient**: Avoid overly complex or slow patterns
4. **Tested**: Ensure pattern is valid regex syntax

## Examples by Variation Type
For "documents:summary" in English:
- **anchored**: \`^summarize (the |my |)\`, \`summary$\`, \`^give me .+ summary\`
- **question_forms**: \`(what is|what's) the (summary|gist|overview)\`, \`can you summarize\`
- **command_forms**: \`summarize (this|the|my)\`, \`give me (a |the |)(summary|overview)\`

## Common Question Starters (${language})
${language === 'en' ? '- what, how, why, can, could, would, is, are, do, does' : ''}
${language === 'pt' ? '- o que, como, por que, pode, poderia, qual, quais, é, são' : ''}
${language === 'es' ? '- qué, cómo, por qué, puede, podría, cuál, cuáles, es, son' : ''}

## Common Command Starters (${language})
${language === 'en' ? '- show, find, get, list, give, tell, explain, summarize' : ''}
${language === 'pt' ? '- mostre, encontre, busque, liste, me dê, explique, resuma' : ''}
${language === 'es' ? '- muestra, encuentra, busca, lista, dame, explica, resume' : ''}${existingSection}

## Output Format
Return ONLY a JSON array with this structure:
[
  {
    "pattern": "the regex pattern",
    "variation": "anchored|question_forms|command_forms",
    "description": "brief description of what this matches",
    "priority": 1-100 (higher = checked first)
  }
]

Generate exactly ${count} valid regex patterns now:`;
}

export function buildBatchRegexPatternsPrompt(params: {
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

  return `You are generating regex patterns for an intent classification system.

## Task
Generate ${countPerSubIntent} regex patterns for EACH sub-intent listed below.

## Intent: ${intent}
${intentDesc}

## Sub-intents to cover:
${subIntentDescs}

## Language: ${LANGUAGE_NAMES[language]}
${LANGUAGE_PATTERN_NOTES[language]}

## Distribution per sub-intent
For each sub-intent, include:
- 30% anchored (start/end anchored patterns)
- 40% question_forms (what, how, why, can you)
- 30% command_forms (show me, find, list)

## Regex Syntax
- Use .+ for variable parts
- Use (a|b) for alternation
- Use (word )? for optional
- Keep patterns lowercase
- Escape special chars

## Output Format
{
  "patterns": [
    {
      "pattern": "regex pattern",
      "subIntent": "the sub-intent",
      "variation": "anchored|question_forms|command_forms",
      "description": "what it matches",
      "priority": 1-100
    }
  ]
}

Generate ${countPerSubIntent * subIntents.length} total patterns now:`;
}
