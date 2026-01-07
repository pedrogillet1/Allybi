/**
 * V3 Intent Schema Definitions
 * 11 intents × 52 sub-intents
 */

export const SUPPORTED_LANGUAGES = ['en', 'pt', 'es'];

export const INTENT_HIERARCHY = {
  documents: {
    description: 'Document-related queries and operations',
    subIntents: ['factual', 'summary', 'compare', 'analytics', 'extract', 'manage']
  },
  help: {
    description: 'Help and guidance requests',
    subIntents: ['tutorial', 'feature', 'product']
  },
  conversation: {
    description: 'Conversational and meta queries about the AI',
    subIntents: ['capabilities', 'limitations', 'privacy', 'honesty']
  },
  edit: {
    description: 'Text editing and transformation requests',
    subIntents: ['rewrite', 'simplify', 'expand', 'translate', 'format']
  },
  reasoning: {
    description: 'Reasoning and analytical tasks',
    subIntents: ['explain', 'compare', 'calculate', 'scenario', 'decision']
  },
  memory: {
    description: 'Memory and context management',
    subIntents: ['store', 'recall', 'update']
  },
  preferences: {
    description: 'User preference management',
    subIntents: ['language', 'style', 'format', 'focus', 'persistence']
  },
  extraction: {
    description: 'Structured data extraction',
    subIntents: ['table', 'list', 'reference', 'numbers']
  },
  domain_specialized: {
    description: 'Domain-specific queries',
    subIntents: ['finance', 'legal', 'medical', 'accounting', 'engineering', 'excel']
  },
  file_actions: {
    description: 'File management and operations',
    subIntents: ['upload', 'delete', 'rename', 'move', 'download', 'share', 'organize']
  },
  error: {
    description: 'Error states and edge cases',
    subIntents: ['no_document', 'not_found', 'limitation', 'ambiguous']
  }
};

export const SUB_INTENT_DESCRIPTIONS = {
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
  },
  file_actions: {
    upload: 'Upload new files or documents',
    delete: 'Delete files or documents',
    rename: 'Rename files or documents',
    move: 'Move files to different folders or locations',
    download: 'Download files or documents',
    share: 'Share files with others',
    organize: 'Organize, tag, or categorize files'
  }
};

// Tier 2 Generation Targets (per sub-intent)
// Total per sub-intent: 485 items
// For 52 sub-intents: ~25,220 total items
export const TIER2_TARGETS = {
  keywords:    { total: 200, batchSize: 25, batches: 8 },
  patterns:    { total: 40,  batchSize: 20, batches: 2 },
  examples:    { total: 150, batchSize: 30, batches: 5 },
  edge_cases:  { total: 50,  batchSize: 25, batches: 2 },
  negatives:   { total: 30,  batchSize: 15, batches: 2 },
  validation:  { total: 15,  batchSize: 15, batches: 1 }
};

export const DATA_TYPES = ['keywords', 'patterns', 'examples', 'edge_cases', 'negatives', 'validation'];

// Calculate total Lambda invocations needed
// 20 calls per sub-intent × 45 sub-intents = 900 invocations
export function calculateTotalInvocations() {
  const callsPerSubIntent = Object.values(TIER2_TARGETS).reduce((sum, t) => sum + t.batches, 0);
  const totalSubIntents = getAllCombinations().length;
  return {
    callsPerSubIntent,
    totalSubIntents,
    totalInvocations: callsPerSubIntent * totalSubIntents
  };
}

// Generate all batch jobs for orchestration
export function generateAllJobs(language = 'en') {
  const jobs = [];
  const combinations = getAllCombinations();

  for (const { intent, subIntent } of combinations) {
    for (const [dataType, config] of Object.entries(TIER2_TARGETS)) {
      for (let batch = 0; batch < config.batches; batch++) {
        jobs.push({
          intent,
          subIntent,
          dataType,
          language,
          batchIndex: batch,
          batchSize: config.batchSize,
          jobId: `${intent}_${subIntent}_${dataType}_${language}_${String(batch).padStart(3, '0')}`
        });
      }
    }
  }

  return jobs;
}

export function getAllIntents() {
  return Object.keys(INTENT_HIERARCHY);
}

export function getSubIntents(intent) {
  return INTENT_HIERARCHY[intent]?.subIntents || [];
}

export function getAllCombinations() {
  const combinations = [];
  for (const [intent, config] of Object.entries(INTENT_HIERARCHY)) {
    for (const subIntent of config.subIntents) {
      combinations.push({ intent, subIntent });
    }
  }
  return combinations;
}
