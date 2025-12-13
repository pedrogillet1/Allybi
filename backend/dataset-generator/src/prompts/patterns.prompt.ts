/**
 * Prompt Templates: Intent Patterns
 * Templates for generating intent classification patterns
 */

import { LanguageCode, IntentType, PatternCategory } from '../schemas/index.js';

export interface PatternPromptParams {
  language: LanguageCode;
  intent: IntentType;
  category: PatternCategory;
  count: number;
  existingPatterns?: string[];
}

const CATEGORY_DESCRIPTIONS: Record<PatternCategory, string> = {
  TIME: 'Time-based document queries (e.g., "documents from last week", "files uploaded yesterday", "reports from Q4 2024")',
  TOPIC_SEMANTIC: 'Topic or semantic content queries (e.g., "documents about finance", "files mentioning security", "reports on compliance")',
  FOLDER_TAG: 'Folder path or tag-based queries (e.g., "files in /clients/acme", "documents tagged urgent", "reports in marketing folder")',
  TYPE_MIME: 'File type queries (e.g., "all PDFs", "Excel spreadsheets", "Word documents", "image files")',
  SIZE_PAGES: 'Size or page count queries (e.g., "files larger than 5MB", "documents with 10+ pages", "small files under 1MB")',
  VERSION: 'Version or comparison queries (e.g., "latest version of contract", "compare v1 vs v2", "most recent draft")',
  FUZZY_FILENAME: 'Fuzzy filename or alias queries (e.g., "the invoice from January", "quarterly report", "that budget spreadsheet")',
  RECENCY_BIAS: 'Recency preference queries (e.g., "newest files", "most recently uploaded", "latest documents")',
  METADATA: 'Metadata queries (e.g., "files created by John", "documents modified today", "uploaded this morning")',
  STRUCTURED_TABLES: 'Table or structured data queries (e.g., "spreadsheet with sales data", "table showing revenue", "Excel with columns")',
  DISAMBIGUATION: 'Disambiguation queries when multiple matches exist (e.g., "the 2024 version", "the one from marketing")',
  SNIPPET_CITATIONS: 'Quote or citation requests (e.g., "exact quote about pricing", "citation from page 5", "verbatim text")',
  ERROR_EMPTY_STATE: 'Error handling and empty state queries (for testing fallback paths)'
};

const INTENT_DESCRIPTIONS: Record<IntentType, string> = {
  DOC_SEARCH: 'Search/find documents - user wants to locate or list documents matching criteria',
  DOC_ANALYTICS: 'Analytics/statistics - user wants counts, metrics, or statistics about their documents',
  DOC_QA: 'Question answering - user wants to ask questions about document content',
  DOC_SUMMARIZE: 'Summarization - user wants summaries or overviews of document content'
};

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish'
};

export function buildPatternPrompt(params: PatternPromptParams): string {
  const { language, intent, category, count, existingPatterns } = params;

  const existingSection = existingPatterns?.length
    ? `\n\n## Existing Patterns (DO NOT duplicate these)\n${existingPatterns.map(p => `- "${p}"`).join('\n')}`
    : '';

  return `You are a dataset generator for an intent classification system. Generate ${count} unique regex-compatible patterns for document-related queries.

## Task
Generate ${count} PATTERNS (not test cases) in ${LANGUAGE_NAMES[language]} for:
- **Intent**: ${intent} - ${INTENT_DESCRIPTIONS[intent]}
- **Category**: ${category} - ${CATEGORY_DESCRIPTIONS[category]}

## Pattern Format Rules
1. Use regex syntax with capture groups where appropriate
2. Use placeholders like .+ for variable parts (filenames, topics, etc.)
3. Use alternation (a|b|c) for synonyms
4. Use optional groups (word )? for optional words
5. Keep patterns general enough to match many queries
6. Patterns should be lowercase

## Examples of Good Patterns
For DOC_SEARCH + TIME in English:
- "(documents|files) from (last|the past) (week|month|year)"
- "(show|find|list) .+ (uploaded|created) (yesterday|today)"
- "(recent|latest) (documents|files|uploads)"

For DOC_QA + TOPIC_SEMANTIC in Portuguese:
- "(o que|quais) .+ (diz|fala|menciona) sobre .+"
- "(informações|detalhes) sobre .+ (no|em) .+"

## CRITICAL CONSTRAINTS
- NO PRODUCT_HELP patterns (how to use Koda, upload instructions, etc.)
- NO AMBIGUOUS patterns (generic greetings, unclear requests)
- ALL patterns must be document-related
- Patterns should work as regex (escape special chars if needed)
- Generate DIVERSE patterns covering different phrasings${existingSection}

## Output Format
Return ONLY a JSON array of pattern strings. No explanations, no markdown, just the JSON array.

Example output:
["pattern one", "pattern two", "pattern three"]

Generate exactly ${count} patterns now:`;
}

export function buildBatchPatternPrompt(params: {
  languages: LanguageCode[];
  intents: IntentType[];
  categories: PatternCategory[];
  countPerCombo: number;
}): string {
  const { languages, intents, categories, countPerCombo } = params;

  return `You are a dataset generator for an intent classification system. Generate patterns for document-related queries.

## Task
Generate ${countPerCombo} patterns for EACH combination of:
- Languages: ${languages.join(', ')}
- Intents: ${intents.map(i => `${i} (${INTENT_DESCRIPTIONS[i]})`).join(', ')}
- Categories: ${categories.map(c => `${c} (${CATEGORY_DESCRIPTIONS[c]})`).join(', ')}

## Pattern Format Rules
1. Use regex syntax with capture groups
2. Use .+ for variable parts
3. Use (a|b) for alternation
4. Patterns should be lowercase
5. Keep patterns general enough to match many queries

## CRITICAL CONSTRAINTS
- NO PRODUCT_HELP patterns (how to use the app)
- NO AMBIGUOUS patterns (unclear requests)
- ALL patterns must be document-related
- Generate DIVERSE patterns

## Output Format
Return a JSON object with this structure:
{
  "patterns": [
    {
      "pattern": "the regex pattern",
      "language": "en|pt|es",
      "intent": "DOC_SEARCH|DOC_ANALYTICS|DOC_QA|DOC_SUMMARIZE",
      "category": "TIME|TOPIC_SEMANTIC|..."
    }
  ]
}

Generate patterns now:`;
}
