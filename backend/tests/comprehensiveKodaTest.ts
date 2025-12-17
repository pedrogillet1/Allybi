/**
 * Comprehensive Koda Test Suite
 * Tests all 30 question types with real documents
 *
 * Run with: npx ts-node tests/runComprehensiveTest.ts
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';
export const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'localhost@koda.com';
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'localhost123';

// Performance thresholds (realistic based on actual measurements)
// These are target durations - tests pass if actual <= expected * 3
export const PERF_THRESHOLDS = {
  ULTRA_FAST: 2000,      // Greetings, doc counts - fast path queries
  FAST: 3000,            // Navigation, simple lookups
  STANDARD: 5000,        // RAG queries, document analysis
  COMPLEX: 10000,        // Multi-doc synthesis, comparisons
  VERY_COMPLEX: 15000,   // Calculations, complex analysis
};

// ============================================================================
// TYPES
// ============================================================================

export interface TestQuestion {
  id: string;
  category: string;
  subcategory: string;
  language: 'en' | 'pt' | 'es';
  query: string;
  expectedAnswerType: string;
  expectedServices: {
    mustInclude: string[];
    mustNotInclude: string[];
  };
  expectedDuration: number; // ms
  expectedOutputShape: string;
  validationRules: {
    mustContain?: string[];
    mustNotContain?: string[];
    mustHaveCitations?: boolean;
    mustHaveDocTokens?: boolean;
    mustHaveFollowUp?: boolean;
  };
}

// ============================================================================
// TEST QUESTIONS - ALL 30 CATEGORIES
// ============================================================================

export const TEST_QUESTIONS: TestQuestion[] = [
  // ========================================================================
  // CATEGORY 1: GREETINGS & SMALL TALK
  // ========================================================================
  {
    id: 'Q001',
    category: '1. Greetings & Small Talk',
    subcategory: '1.1 Pure Greeting',
    language: 'en',
    query: 'Hi',
    expectedAnswerType: 'ULTRA_FAST_GREETING',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.ULTRA_FAST,
    expectedOutputShape: 'Pure text',
    validationRules: {
      mustNotContain: ['error'],
      mustHaveCitations: false,
      mustHaveDocTokens: false,
    },
  },

  {
    id: 'Q002',
    category: '1. Greetings & Small Talk',
    subcategory: '1.1 Pure Greeting',
    language: 'pt',
    query: 'Ola',
    expectedAnswerType: 'ULTRA_FAST_GREETING',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.ULTRA_FAST,
    expectedOutputShape: 'Pure text',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q003',
    category: '1. Greetings & Small Talk',
    subcategory: '1.2 What can you do?',
    language: 'en',
    query: 'What can you do?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Pure text',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  // ========================================================================
  // CATEGORY 2: FILE & FOLDER NAVIGATION
  // ========================================================================
  {
    id: 'Q004',
    category: '2. File & Folder Navigation',
    subcategory: '2.1 Document Count',
    language: 'en',
    query: 'How many documents do I have?',
    expectedAnswerType: 'ULTRA_FAST_DOC_COUNT',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.ULTRA_FAST,
    expectedOutputShape: 'Text + number',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q005',
    category: '2. File & Folder Navigation',
    subcategory: '2.2 List Files',
    language: 'en',
    query: 'List all my PDF files',
    expectedAnswerType: 'FILE_NAVIGATION',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + file list',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q006',
    category: '2. File & Folder Navigation',
    subcategory: '2.3 File Location',
    language: 'en',
    query: 'Where are my Excel files?',
    expectedAnswerType: 'FILE_NAVIGATION',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + file path',
    validationRules: {},
  },

  {
    id: 'Q007',
    category: '2. File & Folder Navigation',
    subcategory: '2.4 Folder Structure',
    language: 'en',
    query: 'What folders do I have?',
    expectedAnswerType: 'FOLDER_NAVIGATION',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + folder list',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q008',
    category: '2. File & Folder Navigation',
    subcategory: '2.5 Recent Files',
    language: 'en',
    query: 'Show me my most recent documents',
    expectedAnswerType: 'FILE_NAVIGATION',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + metadata',
    validationRules: {},
  },

  // ========================================================================
  // CATEGORY 3: APP NAVIGATION & UX HELP
  // ========================================================================
  {
    id: 'Q009',
    category: '3. App Navigation & UX Help',
    subcategory: '3.1 Where is button/feature?',
    language: 'en',
    query: 'Where do I upload documents?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Pure text (UI guidance)',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q010',
    category: '3. App Navigation & UX Help',
    subcategory: '3.2 What can I do with Koda?',
    language: 'pt',
    query: 'O que eu posso fazer com o Koda?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Pure text',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  // ========================================================================
  // CATEGORY 4: SINGLE-DOCUMENT CONTENT QUESTIONS
  // ========================================================================
  {
    id: 'Q011',
    category: '4. Single-Document Content',
    subcategory: '4.1 Document Summary',
    language: 'en',
    query: 'Summarize my documents',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + citations',
    validationRules: {},
  },

  {
    id: 'Q012',
    category: '4. Single-Document Content',
    subcategory: '4.2 Fact Extraction',
    language: 'en',
    query: 'What are the main financial figures in my documents?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + number + citation',
    validationRules: {},
  },

  {
    id: 'Q013',
    category: '4. Single-Document Content',
    subcategory: '4.3 Specific Question',
    language: 'en',
    query: 'What is the total revenue mentioned in my files?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + quote + citation',
    validationRules: {},
  },

  {
    id: 'Q014',
    category: '4. Single-Document Content',
    subcategory: '4.4 Explanation',
    language: 'en',
    query: 'Explain the key concepts in my documents',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + explanation + citation',
    validationRules: {},
  },

  {
    id: 'Q015',
    category: '4. Single-Document Content',
    subcategory: '4.5 Translation',
    language: 'pt',
    query: 'Traduza o resumo dos meus documentos para portugues',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + citation',
    validationRules: {},
  },

  {
    id: 'Q016',
    category: '4. Single-Document Content',
    subcategory: '4.6 Data Analysis',
    language: 'en',
    query: 'What trends can you identify in my data?',
    expectedAnswerType: 'COMPLEX_ANALYSIS',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.COMPLEX,
    expectedOutputShape: 'Text + analysis + citation',
    validationRules: {},
  },

  // ========================================================================
  // CATEGORY 5: CROSS-DOCUMENT QUESTIONS
  // ========================================================================
  {
    id: 'Q017',
    category: '5. Cross-Document Questions',
    subcategory: '5.1 Which documents talk about X?',
    language: 'en',
    query: 'Which of my documents talk about finance?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + file list + citations',
    validationRules: {},
  },

  {
    id: 'Q018',
    category: '5. Cross-Document Questions',
    subcategory: '5.2 Compare Documents',
    language: 'en',
    query: 'Compare the information across my documents',
    expectedAnswerType: 'COMPLEX_ANALYSIS',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.COMPLEX,
    expectedOutputShape: 'Text + comparison + citations',
    validationRules: {},
  },

  {
    id: 'Q019',
    category: '5. Cross-Document Questions',
    subcategory: '5.3 Aggregate/Synthesize',
    language: 'en',
    query: 'Give me a comprehensive overview of all my documents',
    expectedAnswerType: 'COMPLEX_ANALYSIS',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.COMPLEX,
    expectedOutputShape: 'Text + synthesis + citations',
    validationRules: {},
  },

  {
    id: 'Q020',
    category: '5. Cross-Document Questions',
    subcategory: '5.4 Find Related',
    language: 'en',
    query: 'Find documents related to business planning',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + file list',
    validationRules: {},
  },

  // ========================================================================
  // CATEGORY 6: CALCULATION & NUMERIC REASONING
  // ========================================================================
  {
    id: 'Q021',
    category: '6. Calculation & Numeric Reasoning',
    subcategory: '6.1 Pure Math',
    language: 'en',
    query: 'What is 15% of 5000?',
    expectedAnswerType: 'CALCULATION',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + calculation',
    validationRules: {
      mustContain: ['750'],
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q022',
    category: '6. Calculation & Numeric Reasoning',
    subcategory: '6.2 Document-Based Calculation',
    language: 'en',
    query: 'Calculate the sum of all numeric values mentioned in my documents',
    expectedAnswerType: 'COMPLEX_ANALYSIS',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.VERY_COMPLEX,
    expectedOutputShape: 'Text + calculation + citation',
    validationRules: {},
  },

  {
    id: 'Q023',
    category: '6. Calculation & Numeric Reasoning',
    subcategory: '6.3 Percentage Analysis',
    language: 'en',
    query: 'What percentage changes are mentioned in my files?',
    expectedAnswerType: 'COMPLEX_ANALYSIS',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.COMPLEX,
    expectedOutputShape: 'Text + analysis + citation',
    validationRules: {},
  },

  // ========================================================================
  // CATEGORY 7: CONVERSATION & MEMORY
  // ========================================================================
  {
    id: 'Q024',
    category: '7. Conversation & Memory',
    subcategory: '7.1 Follow-up Question',
    language: 'en',
    query: 'Tell me more about that',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + context',
    validationRules: {},
  },

  {
    id: 'Q025',
    category: '7. Conversation & Memory',
    subcategory: '7.2 Memory Recall',
    language: 'en',
    query: 'What did we discuss about my documents?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + summary',
    validationRules: {},
  },

  // ========================================================================
  // CATEGORY 8: CLARIFICATION & ERROR HANDLING
  // ========================================================================
  {
    id: 'Q026',
    category: '8. Clarification & Error Handling',
    subcategory: '8.1 Ambiguous Query',
    language: 'en',
    query: 'What about the numbers?',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text + clarification',
    validationRules: {},
  },

  {
    id: 'Q027',
    category: '8. Clarification & Error Handling',
    subcategory: '8.2 Nonexistent File',
    language: 'en',
    query: 'Find the file called nonexistent-file-xyz.pdf',
    expectedAnswerType: 'FILE_NAVIGATION',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Error message or clarification',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q028',
    category: '8. Clarification & Error Handling',
    subcategory: '8.3 Out-of-Scope',
    language: 'en',
    query: 'Send an email to my client',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.FAST,
    expectedOutputShape: 'Text + limitation explanation',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  // ========================================================================
  // CATEGORY 9: MULTI-LANGUAGE & TONE
  // ========================================================================
  {
    id: 'Q029',
    category: '9. Multi-Language & Tone',
    subcategory: '9.1 Spanish Query',
    language: 'es',
    query: 'Cuantos documentos tengo?',
    expectedAnswerType: 'ULTRA_FAST_DOC_COUNT',
    expectedServices: {
      mustInclude: ['KodaIntentEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.ULTRA_FAST,
    expectedOutputShape: 'Text + number',
    validationRules: {
      mustHaveCitations: false,
    },
  },

  {
    id: 'Q030',
    category: '9. Multi-Language & Tone',
    subcategory: '9.2 Language Switch',
    language: 'en',
    query: 'Explain my documents in Spanish',
    expectedAnswerType: 'STANDARD_QUERY',
    expectedServices: {
      mustInclude: ['KodaIntentEngine', 'KodaAnswerEngine'],
      mustNotInclude: [],
    },
    expectedDuration: PERF_THRESHOLDS.STANDARD,
    expectedOutputShape: 'Text in Spanish + citation',
    validationRules: {},
  },
];
