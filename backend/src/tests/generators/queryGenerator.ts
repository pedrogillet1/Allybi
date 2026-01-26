/**
 * Query Generator for Mass Testing
 *
 * Generates realistic user queries with mutations for:
 * - Routing accuracy tests (20k+)
 * - Typo stability tests
 * - Semantic paraphrase tests
 *
 * Covers all intent families:
 * - file_actions: list/filter/open/locate/sort/group
 * - documents: summarize/extract/compare/compute/explain/locate_content
 * - doc_stats: count pages/slides/sheets
 * - conversation: hi/thanks/bye
 * - help: capabilities/supported types
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type IntentFamily = 'file_actions' | 'documents' | 'doc_stats' | 'conversation' | 'help';
export type DocScopeMode = 'single' | 'multi' | 'all' | 'none';
export type Language = 'en' | 'pt' | 'mixed';

export interface QueryTemplate {
  id: string;
  intentFamily: IntentFamily;
  operator: string;
  scopeMode: DocScopeMode;
  templates: string[];
  /** Placeholders: {doc}, {docs}, {metric}, {section}, {date}, {number} */
  placeholders?: string[];
}

export interface GeneratedQuery {
  id: string;
  query: string;
  expected: {
    intentFamily: IntentFamily;
    operator: string;
    scopeMode: DocScopeMode;
  };
  mutations: string[];
  language: Language;
  sourceTemplateId: string;
}

export interface MutationConfig {
  typos: boolean;
  typoRate: number;
  slang: boolean;
  punctuationChaos: boolean;
  casing: 'normal' | 'lower' | 'upper' | 'random';
  mixedLanguage: boolean;
  mixedLanguageRate: number;
  shortForm: boolean;
  followUpStyle: boolean;
  ambiguity: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TEMPLATES BY INTENT FAMILY
// ═══════════════════════════════════════════════════════════════════════════

const FILE_ACTION_TEMPLATES: QueryTemplate[] = [
  // List
  {
    id: 'fa-list-1',
    intentFamily: 'file_actions',
    operator: 'list',
    scopeMode: 'none',
    templates: [
      'list all my files',
      'show me all documents',
      'what files do I have',
      'display all my documents',
      'list everything',
      'show all files',
      'what documents are available',
    ],
  },
  {
    id: 'fa-list-2',
    intentFamily: 'file_actions',
    operator: 'list',
    scopeMode: 'none',
    templates: [
      'list all {type} files',
      'show me the {type} documents',
      'what {type} files do I have',
    ],
    placeholders: ['type'],
  },
  // Filter
  {
    id: 'fa-filter-1',
    intentFamily: 'file_actions',
    operator: 'filter',
    scopeMode: 'none',
    templates: [
      'show files from {date}',
      'files uploaded in {date}',
      'documents from {date}',
      'filter by {date}',
      'only show {date} files',
    ],
    placeholders: ['date'],
  },
  {
    id: 'fa-filter-2',
    intentFamily: 'file_actions',
    operator: 'filter',
    scopeMode: 'none',
    templates: [
      'show only PDFs',
      'filter to Excel files',
      'just the spreadsheets',
      'only presentations',
      'Word documents only',
    ],
  },
  // Open - file_actions always have scope 'none' (no RAG)
  {
    id: 'fa-open-1',
    intentFamily: 'file_actions',
    operator: 'open',
    scopeMode: 'none',
    templates: [
      'open {doc}',
      'open the {doc}',
      'show me {doc}',
      'pull up {doc}',
      'bring up {doc}',
      'display {doc}',
      'let me see {doc}',
    ],
    placeholders: ['doc'],
  },
  // Locate
  {
    id: 'fa-locate-1',
    intentFamily: 'file_actions',
    operator: 'locate',
    scopeMode: 'none',
    templates: [
      'find {doc}',
      'where is {doc}',
      'locate {doc}',
      'search for {doc}',
      'find the {doc} file',
    ],
    placeholders: ['doc'],
  },
  // Sort
  {
    id: 'fa-sort-1',
    intentFamily: 'file_actions',
    operator: 'sort',
    scopeMode: 'none',
    templates: [
      'sort by date',
      'sort files by name',
      'order by size',
      'sort alphabetically',
      'newest first',
      'oldest files first',
    ],
  },
  // Group
  {
    id: 'fa-group-1',
    intentFamily: 'file_actions',
    operator: 'group',
    scopeMode: 'none',
    templates: [
      'group by type',
      'group files by category',
      'organize by file type',
      'categorize documents',
    ],
  },
];

const DOCUMENT_TEMPLATES: QueryTemplate[] = [
  // Summarize
  {
    id: 'doc-summarize-1',
    intentFamily: 'documents',
    operator: 'summarize',
    scopeMode: 'single',
    templates: [
      'summarize {doc}',
      'give me a summary of {doc}',
      'what is {doc} about',
      'summarize the {doc}',
      'tldr of {doc}',
      'brief overview of {doc}',
      'what does {doc} say',
    ],
    placeholders: ['doc'],
  },
  {
    id: 'doc-summarize-2',
    intentFamily: 'documents',
    operator: 'summarize',
    scopeMode: 'all',  // Router returns 'workspace' for "all documents" queries
    templates: [
      'summarize all documents',
      'give me an overview of everything',
      'summarize all my files',
      'what do all the documents say',
    ],
  },
  // Extract
  {
    id: 'doc-extract-1',
    intentFamily: 'documents',
    operator: 'extract',
    scopeMode: 'single',
    templates: [
      'what is the {metric} in {doc}',
      'extract the {metric} from {doc}',
      'find the {metric} in {doc}',
      'get the {metric} from {doc}',
      'show me the {metric} in {doc}',
    ],
    placeholders: ['metric', 'doc'],
  },
  {
    id: 'doc-extract-2',
    intentFamily: 'documents',
    operator: 'extract',
    scopeMode: 'all',  // Router returns 'workspace' for ambiguous scope queries
    templates: [
      'what is the {metric}',
      'find the {metric}',
      'extract {metric}',
      'get the {metric}',
      'show me {metric}',
    ],
    placeholders: ['metric'],
  },
  // Compare
  {
    id: 'doc-compare-1',
    intentFamily: 'documents',
    operator: 'compare',
    scopeMode: 'multi',
    templates: [
      'compare {doc1} and {doc2}',
      'compare {doc1} with {doc2}',
      'what are the differences between {doc1} and {doc2}',
      'show differences between {doc1} and {doc2}',
      '{doc1} vs {doc2}',
    ],
    placeholders: ['doc1', 'doc2'],
  },
  {
    id: 'doc-compare-2',
    intentFamily: 'documents',
    operator: 'compare',
    scopeMode: 'all',  // "across documents" triggers workspace scope
    templates: [
      'compare the {metric} across documents',
      'compare {metric} in all files',
      'how does {metric} differ across documents',
    ],
    placeholders: ['metric'],
  },
  // Compute
  {
    id: 'doc-compute-1',
    intentFamily: 'documents',
    operator: 'compute',
    scopeMode: 'single',
    templates: [
      'calculate the total {metric} in {doc}',
      'what is the sum of {metric} in {doc}',
      'compute the average {metric} in {doc}',
      'add up all {metric} in {doc}',
    ],
    placeholders: ['metric', 'doc'],
  },
  {
    id: 'doc-compute-2',
    intentFamily: 'documents',
    operator: 'compute',
    scopeMode: 'all',  // Router returns 'workspace' for ambiguous/all-documents queries
    templates: [
      'calculate total {metric}',
      'what is the total {metric}',
      'sum all {metric}',
      'compute the total {metric} across all documents',
    ],
    placeholders: ['metric'],
  },
  // Explain
  {
    id: 'doc-explain-1',
    intentFamily: 'documents',
    operator: 'explain',
    scopeMode: 'single',
    templates: [
      'explain {section} in {doc}',
      'what does {section} mean in {doc}',
      'help me understand {section} in {doc}',
      'clarify {section} from {doc}',
    ],
    placeholders: ['section', 'doc'],
  },
  // Locate content - searches across all documents
  {
    id: 'doc-locate-1',
    intentFamily: 'documents',
    operator: 'locate_content',
    scopeMode: 'all',  // Router returns 'workspace' for content discovery queries
    templates: [
      'where does it mention {topic}',
      'find mentions of {topic}',
      'which document talks about {topic}',
      'where is {topic} mentioned',
      'search for {topic} in documents',
    ],
    placeholders: ['topic'],
  },
];

const DOC_STATS_TEMPLATES: QueryTemplate[] = [
  // Count pages
  {
    id: 'stats-pages-1',
    intentFamily: 'doc_stats',
    operator: 'count_pages',
    scopeMode: 'single',
    templates: [
      'how many pages in {doc}',
      'page count of {doc}',
      'number of pages in {doc}',
      'how long is {doc}',
      '{doc} page count',
    ],
    placeholders: ['doc'],
  },
  // Count slides
  {
    id: 'stats-slides-1',
    intentFamily: 'doc_stats',
    operator: 'count_slides',
    scopeMode: 'single',
    templates: [
      'how many slides in {doc}',
      'slide count of {doc}',
      'number of slides in {doc}',
      'how many slides does {doc} have',
    ],
    placeholders: ['doc'],
  },
  // Count sheets
  {
    id: 'stats-sheets-1',
    intentFamily: 'doc_stats',
    operator: 'count_sheets',
    scopeMode: 'single',
    templates: [
      'how many sheets in {doc}',
      'sheet count of {doc}',
      'number of tabs in {doc}',
      'how many worksheets in {doc}',
    ],
    placeholders: ['doc'],
  },
];

const CONVERSATION_TEMPLATES: QueryTemplate[] = [
  // Greeting - Real router returns conversation/unknown/workspace (→ 'all')
  {
    id: 'conv-greeting-1',
    intentFamily: 'conversation',
    operator: 'unknown',
    scopeMode: 'all',
    templates: [
      'hi',
      'hello',
      'hey',
      'hi there',
      'hello there',
      'hey koda',
      'hi koda',
      'good morning',
      'good afternoon',
    ],
  },
  // Thanks - Real router returns conversation/unknown/workspace (→ 'all')
  {
    id: 'conv-thanks-1',
    intentFamily: 'conversation',
    operator: 'unknown',
    scopeMode: 'all',
    templates: [
      'thanks',
      'thank you',
      'thanks a lot',
      'thank you so much',
      'thx',
      'ty',
      'appreciated',
      'great thanks',
    ],
  },
  // Goodbye - Real router returns conversation/unknown/workspace (→ 'all')
  {
    id: 'conv-bye-1',
    intentFamily: 'conversation',
    operator: 'unknown',
    scopeMode: 'all',
    templates: [
      'bye',
      'goodbye',
      'see you',
      'later',
      'bye bye',
      'gotta go',
      'talk later',
    ],
  },
];

const HELP_TEMPLATES: QueryTemplate[] = [
  // Capabilities - help queries have 'none' scope (no RAG needed)
  // But router may return 'single' or 'all' depending on context
  {
    id: 'help-caps-1',
    intentFamily: 'help',
    operator: 'capabilities',
    scopeMode: 'single',  // Router returns 'single' when docs available
    templates: [
      'what can you do',
      'help',
      'what are your capabilities',
      'how can you help me',
      'show me what you can do',
      'list your features',
    ],
  },
  // Supported types - maps to 'capabilities' in real router
  {
    id: 'help-types-1',
    intentFamily: 'help',
    operator: 'capabilities',
    scopeMode: 'single',  // Router returns 'single' when docs available
    templates: [
      'what file types do you support',
      'supported file formats',
      'what files can you read',
      'which file types work',
      'can you read PDFs',
      'do you support Excel',
    ],
  },
  // Generic how-to (maps to capabilities in real router)
  {
    id: 'help-howto-1',
    intentFamily: 'help',
    operator: 'capabilities',
    scopeMode: 'single',  // Router returns 'single' when docs available
    templates: [
      'how do I get started',
      'how does this work',
      'teach me how to use this',
      'how to use koda',
      'getting started guide',
    ],
  },
];

// All templates combined
export const ALL_TEMPLATES: QueryTemplate[] = [
  ...FILE_ACTION_TEMPLATES,
  ...DOCUMENT_TEMPLATES,
  ...DOC_STATS_TEMPLATES,
  ...CONVERSATION_TEMPLATES,
  ...HELP_TEMPLATES,
];

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER VALUES
// ═══════════════════════════════════════════════════════════════════════════

const PLACEHOLDER_VALUES: Record<string, string[]> = {
  // MUST match MOCK_AVAILABLE_DOCS filenames exactly or as substrings
  // Mock docs: financial_report.pdf, project_plan.docx, budget_2024.xlsx, presentation.pptx
  doc: [
    'financial_report.pdf',
    'financial_report',
    'financial report',
    'the financial report',
    'project_plan.docx',
    'project_plan',
    'project plan',
    'the project plan',
    'budget_2024.xlsx',
    'budget_2024',
    'budget 2024',
    'the budget',
    'presentation.pptx',
    'presentation',
    'the presentation',
  ],
  // For compare templates - use exact mock doc names
  doc1: ['financial_report.pdf', 'project_plan.docx', 'budget_2024.xlsx', 'presentation.pptx'],
  doc2: ['financial_report.pdf', 'project_plan.docx', 'budget_2024.xlsx', 'presentation.pptx'],
  metric: [
    'revenue',
    'total revenue',
    'net profit',
    'gross margin',
    'expenses',
    'operating costs',
    'EBITDA',
    'growth rate',
    'sales figures',
    'headcount',
    'budget allocation',
  ],
  section: [
    'executive summary',
    'risk factors',
    'financial highlights',
    'methodology',
    'conclusions',
    'recommendations',
  ],
  topic: [
    'revenue growth',
    'cost reduction',
    'market expansion',
    'risk management',
    'employee benefits',
    'Q4 projections',
  ],
  date: [
    'January',
    'last month',
    'this week',
    '2024',
    '2023',
    'Q1',
    'Q2',
    'last year',
    'yesterday',
  ],
  type: ['PDF', 'Excel', 'Word', 'PowerPoint', 'spreadsheet', 'presentation'],
  number: ['10', '5', '100', '50', 'three', 'five'],
};

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const TYPO_MAP: Record<string, string[]> = {
  'the': ['teh', 'hte', 'th'],
  'and': ['adn', 'nad', 'an'],
  'summarize': ['summrize', 'sumarize', 'summarise', 'summerize'],
  'compare': ['compre', 'compar', 'compair'],
  'document': ['docuemnt', 'documnet', 'docment', 'documant'],
  'file': ['fiel', 'fil', 'fille'],
  'show': ['shwo', 'sho', 'hsow'],
  'open': ['opne', 'ope', 'oepn'],
  'what': ['waht', 'wht', 'whta'],
  'revenue': ['revnue', 'reveune', 'revenu'],
  'report': ['reprot', 'repotr', 'reoprt'],
  'extract': ['extrat', 'exract', 'extarct'],
  'total': ['toatl', 'totla', 'tota'],
  'pages': ['paegs', 'pagse', 'pags'],
  'where': ['whre', 'wher', 'wehre'],
  'find': ['fnd', 'fidn', 'fnid'],
  'list': ['lsit', 'lst', 'liist'],
};

const SLANG_REPLACEMENTS: Record<string, string[]> = {
  'show me': ['lemme see', 'gimme', 'pull up', 'bring up'],
  'open': ['pull up', 'bring up', 'get'],
  'summarize': ['tldr', 'sum up', 'break down'],
  'what is': ["what's", 'whats'],
  'find': ['dig up', 'hunt for', 'look for'],
  'give me': ['gimme', 'get me'],
  'list': ['show', 'gimme'],
};

const PT_FILLER_WORDS = [
  'então',
  'por favor',
  'aí',
  'né',
  'tipo',
  'assim',
  'olha',
  'veja',
];

const FOLLOW_UP_PREFIXES = [
  'and ',
  'also ',
  'ok ',
  'then ',
  'now ',
  'alright ',
  'ok so ',
  'and also ',
  'what about ',
  'how about ',
];

function applyTypos(text: string, rate: number): { text: string; applied: boolean } {
  if (rate <= 0) return { text, applied: false };

  let result = text;
  let applied = false;

  for (const [word, typos] of Object.entries(TYPO_MAP)) {
    if (Math.random() < rate) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(result)) {
        const typo = typos[Math.floor(Math.random() * typos.length)];
        result = result.replace(regex, typo);
        applied = true;
      }
    }
  }

  return { text: result, applied };
}

function applySlang(text: string): { text: string; applied: boolean } {
  let result = text;
  let applied = false;

  for (const [phrase, replacements] of Object.entries(SLANG_REPLACEMENTS)) {
    const regex = new RegExp(phrase, 'gi');
    if (regex.test(result) && Math.random() < 0.3) {
      const replacement = replacements[Math.floor(Math.random() * replacements.length)];
      result = result.replace(regex, replacement);
      applied = true;
    }
  }

  return { text: result, applied };
}

function applyPunctuationChaos(text: string): { text: string; applied: boolean } {
  const options = [
    () => text + '??',
    () => text + '!!!',
    () => text + '?!',
    () => text.replace(/\?$/, ''),
    () => text + '...',
    () => text.replace(/,/g, ''),
  ];

  if (Math.random() < 0.3) {
    const fn = options[Math.floor(Math.random() * options.length)];
    return { text: fn(), applied: true };
  }

  return { text, applied: false };
}

function applyCasing(text: string, mode: 'normal' | 'lower' | 'upper' | 'random'): { text: string; applied: boolean } {
  switch (mode) {
    case 'lower':
      return { text: text.toLowerCase(), applied: true };
    case 'upper':
      return { text: text.toUpperCase(), applied: true };
    case 'random':
      return {
        text: text.split('').map(c => Math.random() < 0.5 ? c.toUpperCase() : c.toLowerCase()).join(''),
        applied: true,
      };
    default:
      return { text, applied: false };
  }
}

function applyMixedLanguage(text: string, rate: number): { text: string; applied: boolean } {
  if (Math.random() > rate) return { text, applied: false };

  const filler = PT_FILLER_WORDS[Math.floor(Math.random() * PT_FILLER_WORDS.length)];
  const positions = ['start', 'end', 'middle'];
  const position = positions[Math.floor(Math.random() * positions.length)];

  let result: string;
  switch (position) {
    case 'start':
      result = `${filler} ${text}`;
      break;
    case 'end':
      result = `${text} ${filler}`;
      break;
    case 'middle':
      const words = text.split(' ');
      const mid = Math.floor(words.length / 2);
      words.splice(mid, 0, filler);
      result = words.join(' ');
      break;
    default:
      result = text;
  }

  return { text: result, applied: true };
}

function applyShortForm(text: string): { text: string; applied: boolean } {
  // Remove articles and filler words
  const shortened = text
    .replace(/\b(the|a|an|please|can you|could you)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Also try to make it a fragment (remove verbs in some cases)
  if (Math.random() < 0.3) {
    const fragmented = shortened
      .replace(/^(show me|give me|find|get|display|list)\s+/i, '')
      .trim();
    if (fragmented.length > 3) {
      return { text: fragmented, applied: true };
    }
  }

  return { text: shortened, applied: shortened !== text };
}

function applyFollowUpStyle(text: string): { text: string; applied: boolean } {
  const prefix = FOLLOW_UP_PREFIXES[Math.floor(Math.random() * FOLLOW_UP_PREFIXES.length)];
  return { text: prefix + text.charAt(0).toLowerCase() + text.slice(1), applied: true };
}

function applyAmbiguity(text: string): { text: string; applied: boolean } {
  // Replace specific doc names with ambiguous references
  const ambiguous = text
    .replace(/Q[1-4] Report/gi, 'the report')
    .replace(/Annual Report/gi, 'that file')
    .replace(/Budget \d{4}/gi, 'the budget')
    .replace(/Financial Summary/gi, 'the document');

  return { text: ambiguous, applied: ambiguous !== text };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function fillPlaceholders(template: string, placeholders?: string[]): string {
  let result = template;

  if (placeholders) {
    for (const ph of placeholders) {
      const values = PLACEHOLDER_VALUES[ph] || ['unknown'];
      const value = values[Math.floor(Math.random() * values.length)];
      result = result.replace(new RegExp(`\\{${ph}\\}`, 'g'), value);
    }
  }

  // Also handle any remaining placeholders
  for (const [ph, values] of Object.entries(PLACEHOLDER_VALUES)) {
    const value = values[Math.floor(Math.random() * values.length)];
    result = result.replace(new RegExp(`\\{${ph}\\}`, 'g'), value);
  }

  return result;
}

export function generateQuery(
  template: QueryTemplate,
  config: Partial<MutationConfig> = {}
): GeneratedQuery {
  const fullConfig: MutationConfig = {
    typos: false,
    typoRate: 0.2,
    slang: false,
    punctuationChaos: false,
    casing: 'normal',
    mixedLanguage: false,
    mixedLanguageRate: 0.2,
    shortForm: false,
    followUpStyle: false,
    ambiguity: false,
    ...config,
  };

  // Pick a random template
  const baseTemplate = template.templates[Math.floor(Math.random() * template.templates.length)];

  // Fill placeholders
  let query = fillPlaceholders(baseTemplate, template.placeholders);
  const mutations: string[] = [];
  let language: Language = 'en';

  // Apply mutations
  if (fullConfig.typos) {
    const { text, applied } = applyTypos(query, fullConfig.typoRate);
    if (applied) {
      query = text;
      mutations.push('typos');
    }
  }

  if (fullConfig.slang) {
    const { text, applied } = applySlang(query);
    if (applied) {
      query = text;
      mutations.push('slang');
    }
  }

  if (fullConfig.punctuationChaos) {
    const { text, applied } = applyPunctuationChaos(query);
    if (applied) {
      query = text;
      mutations.push('punctuation');
    }
  }

  if (fullConfig.casing !== 'normal') {
    const { text, applied } = applyCasing(query, fullConfig.casing);
    if (applied) {
      query = text;
      mutations.push(`casing:${fullConfig.casing}`);
    }
  }

  if (fullConfig.mixedLanguage) {
    const { text, applied } = applyMixedLanguage(query, fullConfig.mixedLanguageRate);
    if (applied) {
      query = text;
      mutations.push('mixed_language');
      language = 'mixed';
    }
  }

  if (fullConfig.shortForm) {
    const { text, applied } = applyShortForm(query);
    if (applied) {
      query = text;
      mutations.push('short_form');
    }
  }

  if (fullConfig.followUpStyle) {
    const { text, applied } = applyFollowUpStyle(query);
    if (applied) {
      query = text;
      mutations.push('follow_up');
    }
  }

  if (fullConfig.ambiguity) {
    const { text, applied } = applyAmbiguity(query);
    if (applied) {
      query = text;
      mutations.push('ambiguity');
    }
  }

  return {
    id: `${template.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: query.trim(),
    expected: {
      intentFamily: template.intentFamily,
      operator: template.operator,
      scopeMode: template.scopeMode,
    },
    mutations,
    language,
    sourceTemplateId: template.id,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface GenerationConfig {
  count: number;
  /** Distribution of mutation types (0-1 for each) */
  mutationDistribution: {
    clean: number;      // No mutations
    typos: number;
    slang: number;
    punctuation: number;
    casing: number;
    mixedLang: number;
    shortForm: number;
    followUp: number;
    ambiguity: number;
    combined: number;   // Multiple mutations
  };
}

const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  count: 20000,
  mutationDistribution: {
    clean: 0.20,       // 20% clean
    typos: 0.15,       // 15% typos
    slang: 0.10,       // 10% slang
    punctuation: 0.05, // 5% punctuation
    casing: 0.10,      // 10% casing variations
    mixedLang: 0.05,   // 5% mixed language
    shortForm: 0.10,   // 10% short form
    followUp: 0.05,    // 5% follow-up style
    ambiguity: 0.05,   // 5% ambiguous
    combined: 0.15,    // 15% multiple mutations
  },
};

export function generateBatch(
  config: Partial<GenerationConfig> = {}
): GeneratedQuery[] {
  const fullConfig = { ...DEFAULT_GENERATION_CONFIG, ...config };
  const queries: GeneratedQuery[] = [];

  const dist = fullConfig.mutationDistribution;

  for (let i = 0; i < fullConfig.count; i++) {
    // Pick a random template
    const template = ALL_TEMPLATES[Math.floor(Math.random() * ALL_TEMPLATES.length)];

    // Determine mutation type based on distribution
    const rand = Math.random();
    let cumulative = 0;
    let mutationConfig: Partial<MutationConfig> = {};

    if ((cumulative += dist.clean) > rand) {
      // Clean - no mutations
    } else if ((cumulative += dist.typos) > rand) {
      mutationConfig = { typos: true, typoRate: 0.3 };
    } else if ((cumulative += dist.slang) > rand) {
      mutationConfig = { slang: true };
    } else if ((cumulative += dist.punctuation) > rand) {
      mutationConfig = { punctuationChaos: true };
    } else if ((cumulative += dist.casing) > rand) {
      const casings: ('lower' | 'upper' | 'random')[] = ['lower', 'upper', 'random'];
      mutationConfig = { casing: casings[Math.floor(Math.random() * casings.length)] };
    } else if ((cumulative += dist.mixedLang) > rand) {
      mutationConfig = { mixedLanguage: true, mixedLanguageRate: 0.5 };
    } else if ((cumulative += dist.shortForm) > rand) {
      mutationConfig = { shortForm: true };
    } else if ((cumulative += dist.followUp) > rand) {
      mutationConfig = { followUpStyle: true };
    } else if ((cumulative += dist.ambiguity) > rand) {
      mutationConfig = { ambiguity: true };
    } else {
      // Combined - apply multiple mutations
      mutationConfig = {
        typos: Math.random() < 0.5,
        typoRate: 0.2,
        slang: Math.random() < 0.3,
        punctuationChaos: Math.random() < 0.3,
        casing: Math.random() < 0.3 ? 'lower' : 'normal',
        shortForm: Math.random() < 0.3,
      };
    }

    const generated = generateQuery(template, mutationConfig);
    queries.push(generated);
  }

  return queries;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export function getGenerationStats(queries: GeneratedQuery[]): {
  total: number;
  byIntentFamily: Record<string, number>;
  byOperator: Record<string, number>;
  byMutation: Record<string, number>;
  byLanguage: Record<string, number>;
  cleanCount: number;
  mutatedCount: number;
} {
  const stats = {
    total: queries.length,
    byIntentFamily: {} as Record<string, number>,
    byOperator: {} as Record<string, number>,
    byMutation: {} as Record<string, number>,
    byLanguage: {} as Record<string, number>,
    cleanCount: 0,
    mutatedCount: 0,
  };

  for (const q of queries) {
    // By intent family
    stats.byIntentFamily[q.expected.intentFamily] = (stats.byIntentFamily[q.expected.intentFamily] || 0) + 1;

    // By operator
    stats.byOperator[q.expected.operator] = (stats.byOperator[q.expected.operator] || 0) + 1;

    // By mutation
    if (q.mutations.length === 0) {
      stats.cleanCount++;
    } else {
      stats.mutatedCount++;
      for (const mut of q.mutations) {
        stats.byMutation[mut] = (stats.byMutation[mut] || 0) + 1;
      }
    }

    // By language
    stats.byLanguage[q.language] = (stats.byLanguage[q.language] || 0) + 1;
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT FOR CLI
// ═══════════════════════════════════════════════════════════════════════════

export {
  applyTypos,
  applySlang,
  applyPunctuationChaos,
  applyCasing,
  applyMixedLanguage,
  applyShortForm,
  applyFollowUpStyle,
  applyAmbiguity,
  TYPO_MAP,
  SLANG_REPLACEMENTS,
  PT_FILLER_WORDS,
};
