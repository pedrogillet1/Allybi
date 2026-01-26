/**
 * Schema: Intent Definitions
 * Complete intent/sub-intent hierarchy for KODA
 */

import { LanguageCode, SUPPORTED_LANGUAGES } from './patterns.schema.js';

// =============================================================================
// INTENT HIERARCHY DEFINITION
// =============================================================================

export const INTENT_HIERARCHY = {
  documents: {
    description: 'Document-related queries and operations',
    subIntents: ['factual', 'summary', 'compare', 'analytics', 'extract', 'manage'] as const
  },
  help: {
    description: 'Help and guidance requests',
    subIntents: ['tutorial', 'feature', 'product'] as const
  },
  conversation: {
    description: 'Conversational and meta queries about the AI',
    subIntents: ['capabilities', 'limitations', 'privacy', 'honesty'] as const
  },
  edit: {
    description: 'Text editing and transformation requests',
    subIntents: ['rewrite', 'simplify', 'expand', 'translate', 'format'] as const
  },
  reasoning: {
    description: 'Reasoning and analytical tasks',
    subIntents: ['explain', 'compare', 'calculate', 'scenario', 'decision'] as const
  },
  memory: {
    description: 'Memory and context management',
    subIntents: ['store', 'recall', 'update'] as const
  },
  error: {
    description: 'Error states and edge cases',
    subIntents: ['no_document', 'not_found', 'limitation', 'ambiguous'] as const
  },
  preferences: {
    description: 'User preference management',
    subIntents: ['language', 'style', 'format', 'focus', 'persistence'] as const
  },
  extraction: {
    description: 'Structured data extraction',
    subIntents: ['table', 'list', 'reference', 'numbers'] as const
  },
  domain_specialized: {
    description: 'Domain-specific queries',
    subIntents: ['finance', 'legal', 'medical', 'accounting', 'engineering', 'excel'] as const
  }
} as const;

export type IntentName = keyof typeof INTENT_HIERARCHY;
export type SubIntentName<T extends IntentName> = typeof INTENT_HIERARCHY[T]['subIntents'][number];

// Flattened list of all intents
export const ALL_INTENTS = Object.keys(INTENT_HIERARCHY) as IntentName[];

// Get all sub-intents for an intent
export function getSubIntents<T extends IntentName>(intent: T): readonly SubIntentName<T>[] {
  return INTENT_HIERARCHY[intent].subIntents;
}

// Get all intent:subintent combinations
export function getAllCombinations(): Array<{ intent: IntentName; subIntent: string }> {
  const combinations: Array<{ intent: IntentName; subIntent: string }> = [];
  for (const intent of ALL_INTENTS) {
    for (const subIntent of INTENT_HIERARCHY[intent].subIntents) {
      combinations.push({ intent, subIntent });
    }
  }
  return combinations;
}

// =============================================================================
// SUB-INTENT DESCRIPTIONS (for prompts)
// =============================================================================

export const SUB_INTENT_DESCRIPTIONS: Record<string, Record<string, string>> = {
  documents: {
    factual: 'Direct factual questions answered from document content (who, what, when, where)',
    summary: 'Requests to summarize documents or sections',
    compare: 'Compare information across multiple documents',
    analytics: 'Counts, statistics, metrics about documents',
    extract: 'Extract specific information or quotes from documents',
    manage: 'Document management actions (delete, rename, organize, tag)'
  },
  help: {
    tutorial: 'Step-by-step guidance on how to do something',
    feature: 'Questions about specific features and capabilities',
    product: 'General product questions and information'
  },
  conversation: {
    capabilities: 'Questions about what the AI can do',
    limitations: 'Questions about what the AI cannot do',
    privacy: 'Questions about data privacy and security',
    honesty: 'Questions about AI honesty, accuracy, and trustworthiness'
  },
  edit: {
    rewrite: 'Rewrite text in a different style or tone',
    simplify: 'Make text simpler or easier to understand',
    expand: 'Add more detail or elaboration to text',
    translate: 'Translate text between languages',
    format: 'Format or restructure text (bullets, tables, etc.)'
  },
  reasoning: {
    explain: 'Explain concepts or provide clarification',
    compare: 'Compare and contrast ideas or options',
    calculate: 'Perform calculations or math operations',
    scenario: 'Analyze hypothetical scenarios or what-if questions',
    decision: 'Help with decision-making or recommendations'
  },
  memory: {
    store: 'Save information for later recall',
    recall: 'Retrieve previously stored information',
    update: 'Update or modify stored information'
  },
  error: {
    no_document: 'User has no documents uploaded',
    not_found: 'Requested document or information not found',
    limitation: 'Request exceeds system limitations',
    ambiguous: 'Request is too vague or unclear'
  },
  preferences: {
    language: 'Language preference settings',
    style: 'Response style preferences (formal, casual, etc.)',
    format: 'Output format preferences (markdown, plain text, etc.)',
    focus: 'Topic or domain focus preferences',
    persistence: 'Preference persistence and memory settings'
  },
  extraction: {
    table: 'Extract or create tables from document content',
    list: 'Extract or create lists from document content',
    reference: 'Extract citations, references, or sources',
    numbers: 'Extract numerical data, figures, or statistics'
  },
  domain_specialized: {
    finance: 'Financial analysis, reports, and calculations',
    legal: 'Legal document analysis and terminology',
    medical: 'Medical document analysis and terminology',
    accounting: 'Accounting documents, ledgers, and financial statements',
    engineering: 'Technical and engineering documentation',
    excel: 'Excel/spreadsheet specific queries and operations'
  }
};

// =============================================================================
// GENERATION TARGETS
// =============================================================================

export const GENERATION_TARGETS = {
  examples: {
    min: 200,
    max: 500,
    default: 350,
    variations: ['short', 'medium', 'long', 'messy', 'ambiguous'] as const
  },
  keywords: {
    min: 50,
    max: 150,
    default: 100,
    variations: ['core', 'synonyms', 'domain', 'colloquial', 'misspellings'] as const
  },
  patterns: {
    min: 10,
    max: 30,
    default: 20,
    variations: ['anchored', 'question_forms', 'command_forms'] as const
  },
  validationRules: {
    min: 5,
    max: 10,
    default: 7,
    variations: ['required_context', 'exclusions', 'confidence_modifiers'] as const
  }
} as const;

export type ExampleVariation = typeof GENERATION_TARGETS.examples.variations[number];
export type KeywordVariation = typeof GENERATION_TARGETS.keywords.variations[number];
export type PatternVariation = typeof GENERATION_TARGETS.patterns.variations[number];
export type ValidationVariation = typeof GENERATION_TARGETS.validationRules.variations[number];
