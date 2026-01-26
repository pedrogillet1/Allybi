/**
 * Prompt Templates: Classification Tests
 * Templates for generating test cases with concrete values
 */

import { LanguageCode, IntentType, PatternCategory, TEST_VALUES } from '../schemas/index.js';

export interface TestPromptParams {
  language: LanguageCode;
  intent: IntentType;
  category: PatternCategory;
  count: number;
  existingQueries?: string[];
}

const CATEGORY_TEST_GUIDANCE: Record<PatternCategory, string> = {
  TIME: `Use concrete time references like: ${TEST_VALUES.timeframes.join(', ')}`,
  TOPIC_SEMANTIC: `Use concrete topics like: ${TEST_VALUES.topics.join(', ')}`,
  FOLDER_TAG: `Use concrete folder paths like: ${TEST_VALUES.folders.join(', ')}`,
  TYPE_MIME: `Use concrete file types like: ${TEST_VALUES.types.join(', ')}`,
  SIZE_PAGES: `Use concrete sizes like: ${TEST_VALUES.sizes.join(', ')} and pages like: ${TEST_VALUES.pages.join(', ')}`,
  VERSION: 'Use concrete version references like: v1, v2, latest, draft, final, revision 3',
  FUZZY_FILENAME: `Use concrete filenames like: ${TEST_VALUES.filenames.join(', ')}`,
  RECENCY_BIAS: 'Use recency indicators like: newest, most recent, latest, just uploaded',
  METADATA: 'Use concrete metadata like: created by John, modified yesterday, uploaded by admin',
  STRUCTURED_TABLES: 'Reference tables, spreadsheets, columns, rows, cells with concrete data types',
  DISAMBIGUATION: 'Create queries that need clarification between similar documents',
  SNIPPET_CITATIONS: 'Request specific quotes, page numbers, exact text citations',
  ERROR_EMPTY_STATE: 'Create queries that would result in no matches (for testing fallbacks)'
};

const INTENT_DESCRIPTIONS: Record<IntentType, string> = {
  DOC_SEARCH: 'Search/find documents - user wants to locate or list documents',
  DOC_ANALYTICS: 'Analytics/statistics - user wants counts or metrics about documents',
  DOC_QA: 'Question answering - user asks questions about document content',
  DOC_SUMMARIZE: 'Summarization - user wants summaries of documents'
};

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish'
};

export function buildTestPrompt(params: TestPromptParams): string {
  const { language, intent, category, count, existingQueries } = params;

  const existingSection = existingQueries?.length
    ? `\n\n## Existing Test Queries (DO NOT duplicate)\n${existingQueries.map(q => `- "${q}"`).join('\n')}`
    : '';

  return `You are a dataset generator for testing an intent classification system. Generate ${count} realistic test queries.

## Task
Generate ${count} TEST QUERIES (concrete, realistic user inputs) in ${LANGUAGE_NAMES[language]} for:
- **Intent**: ${intent} - ${INTENT_DESCRIPTIONS[intent]}
- **Category**: ${category} - ${CATEGORY_TEST_GUIDANCE[category]}

## Test Query Requirements
1. Use CONCRETE values, not placeholders (real filenames, dates, topics)
2. Write natural, realistic queries a user would actually type
3. Vary phrasing, formality, and structure
4. Include common typos/variations where natural
5. Mix short and longer queries

## Examples of Good Test Queries
For DOC_SEARCH + TIME in English:
- "show me files from last week"
- "documents uploaded yesterday"
- "what did I upload in the past month"
- "find reports from Q4 2024"

For DOC_QA + TOPIC_SEMANTIC in Portuguese:
- "o que o relatório financeiro diz sobre vendas"
- "informações sobre compliance no contrato"
- "quais documentos mencionam orçamento"

## CRITICAL CONSTRAINTS
- NO PRODUCT_HELP queries (how to upload, how to use Koda)
- NO AMBIGUOUS queries (just "hello", "help me")
- ALL queries must be document-related
- Use realistic concrete values
- Generate DIVERSE queries covering different phrasings${existingSection}

## Output Format
Return ONLY a JSON array of objects. No explanations, no markdown.

[
  {
    "query": "the test query",
    "expectedIntent": "${intent}",
    "category": "${category}",
    "language": "${language}"
  }
]

Generate exactly ${count} test queries now:`;
}

export function buildBatchTestPrompt(params: {
  languages: LanguageCode[];
  intents: IntentType[];
  categories: PatternCategory[];
  countPerCombo: number;
}): string {
  const { languages, intents, categories, countPerCombo } = params;

  return `You are a dataset generator for testing an intent classification system.

## Task
Generate ${countPerCombo} realistic test queries for EACH combination of:
- Languages: ${languages.join(', ')}
- Intents: ${intents.join(', ')}
- Categories: ${categories.join(', ')}

## Test Values to Use
- Topics: ${TEST_VALUES.topics.join(', ')}
- Folders: ${TEST_VALUES.folders.join(', ')}
- Filenames: ${TEST_VALUES.filenames.join(', ')}
- Types: ${TEST_VALUES.types.join(', ')}
- Sizes: ${TEST_VALUES.sizes.join(', ')}
- Timeframes: ${TEST_VALUES.timeframes.join(', ')}

## Requirements
1. Use CONCRETE values (not placeholders)
2. Natural, realistic user queries
3. Vary phrasing and formality
4. NO PRODUCT_HELP or AMBIGUOUS queries
5. ALL must be document-related

## Output Format
{
  "tests": [
    {
      "query": "the test query",
      "language": "en|pt|es",
      "expectedIntent": "DOC_SEARCH|DOC_ANALYTICS|DOC_QA|DOC_SUMMARIZE",
      "category": "TIME|TOPIC_SEMANTIC|..."
    }
  ]
}

Generate tests now:`;
}
