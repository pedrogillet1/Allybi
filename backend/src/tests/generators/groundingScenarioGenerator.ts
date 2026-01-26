/**
 * Grounding Scenario Generator
 *
 * Generates test scenarios for answer grounding testing:
 * - Citation existence (answers must cite sources)
 * - Numeric grounding (numbers must come from documents)
 * - No false 'not found' (don't claim data missing when it exists)
 *
 * Used to test that answers are properly grounded in source material.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type GroundingScenarioType =
  | 'citation_required'    // Answer must cite source
  | 'numeric_grounding'    // Numbers must match source
  | 'data_exists'          // Data is present, shouldn't say "not found"
  | 'data_missing'         // Data truly missing, "not found" is valid
  | 'partial_data';        // Some data exists, some doesn't

export interface SourceDocument {
  name: string;
  content: string;
  metadata: {
    revenue?: number;
    expenses?: number;
    profit?: number;
    date?: string;
    employees?: number;
    pages?: number;
  };
}

export interface GroundingExpectation {
  requiresCitation: boolean;
  mustNotSayNotFound: boolean;
  numericValues?: { field: string; value: number }[];
  allowedResponses?: string[];
}

export interface GroundingScenario {
  id: string;
  query: string;
  type: GroundingScenarioType;
  sourceDocuments: SourceDocument[];
  expectations: GroundingExpectation;
}

export interface GroundedAnswer {
  content: string;
  citations: string[];
  containsNumeric: boolean;
  saysNotFound: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE DOCUMENT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const FINANCIAL_DOCS: SourceDocument[] = [
  {
    name: 'Q3_Financial_Report.pdf',
    content: 'Revenue for Q3 2024 was $2.5M, with expenses of $1.8M resulting in a profit of $700K.',
    metadata: { revenue: 2500000, expenses: 1800000, profit: 700000, date: '2024-09-30' },
  },
  {
    name: 'Annual_Report_2023.pdf',
    content: 'Total annual revenue reached $8.5M. Operating expenses were $6.2M. Net profit was $2.3M.',
    metadata: { revenue: 8500000, expenses: 6200000, profit: 2300000, date: '2023-12-31' },
  },
  {
    name: 'Budget_2024.xlsx',
    content: 'Projected budget: Marketing $500K, R&D $800K, Operations $600K. Total: $1.9M.',
    metadata: { expenses: 1900000 },
  },
];

const PROJECT_DOCS: SourceDocument[] = [
  {
    name: 'Project_Plan.docx',
    content: 'Project timeline: Phase 1 (Jan-Mar), Phase 2 (Apr-Jun), Phase 3 (Jul-Sep). Team size: 12.',
    metadata: { employees: 12 },
  },
  {
    name: 'Team_Roster.xlsx',
    content: 'Current team members: 15 developers, 5 designers, 3 PMs. Total headcount: 23.',
    metadata: { employees: 23 },
  },
];

const EMPTY_DOCS: SourceDocument[] = [
  {
    name: 'Template.docx',
    content: '[Document template - no data]',
    metadata: {},
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const CITATION_REQUIRED_QUERIES = [
  { query: 'What was the revenue in Q3 2024?', docs: FINANCIAL_DOCS, field: 'revenue', value: 2500000 },
  { query: 'How much profit did we make last year?', docs: FINANCIAL_DOCS, field: 'profit', value: 2300000 },
  { query: 'What is the marketing budget for 2024?', docs: FINANCIAL_DOCS, field: 'expenses', value: 500000 },
  { query: 'How many people are on the team?', docs: PROJECT_DOCS, field: 'employees', value: 23 },
];

const NUMERIC_GROUNDING_QUERIES = [
  { query: 'What are the Q3 financials?', docs: FINANCIAL_DOCS, values: [{ field: 'revenue', value: 2500000 }, { field: 'expenses', value: 1800000 }] },
  { query: 'Summarize the 2023 annual report', docs: FINANCIAL_DOCS, values: [{ field: 'revenue', value: 8500000 }, { field: 'profit', value: 2300000 }] },
  { query: 'What is the team size?', docs: PROJECT_DOCS, values: [{ field: 'employees', value: 23 }] },
];

const DATA_EXISTS_QUERIES = [
  { query: 'Do we have revenue data?', docs: FINANCIAL_DOCS },
  { query: 'Is there a project timeline?', docs: PROJECT_DOCS },
  { query: 'Can you find the budget information?', docs: FINANCIAL_DOCS },
];

const DATA_MISSING_QUERIES = [
  { query: 'What is the customer satisfaction score?', docs: FINANCIAL_DOCS },
  { query: 'What are the sales targets for Q4?', docs: PROJECT_DOCS },
  { query: 'Find the competitor analysis', docs: EMPTY_DOCS },
];

const PARTIAL_DATA_QUERIES = [
  { query: 'What are the revenue and customer count?', docs: FINANCIAL_DOCS, hasRevenue: true, hasCustomer: false },
  { query: 'Show the profit and market share', docs: FINANCIAL_DOCS, hasProfit: true, hasMarketShare: false },
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCitationRequiredScenario(): GroundingScenario {
  const template = pickRandom(CITATION_REQUIRED_QUERIES);
  return {
    id: `citation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'citation_required',
    sourceDocuments: template.docs,
    expectations: {
      requiresCitation: true,
      mustNotSayNotFound: true,
      numericValues: [{ field: template.field, value: template.value }],
    },
  };
}

function generateNumericGroundingScenario(): GroundingScenario {
  const template = pickRandom(NUMERIC_GROUNDING_QUERIES);
  return {
    id: `numeric-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'numeric_grounding',
    sourceDocuments: template.docs,
    expectations: {
      requiresCitation: true,
      mustNotSayNotFound: true,
      numericValues: template.values,
    },
  };
}

function generateDataExistsScenario(): GroundingScenario {
  const template = pickRandom(DATA_EXISTS_QUERIES);
  return {
    id: `exists-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'data_exists',
    sourceDocuments: template.docs,
    expectations: {
      requiresCitation: false,
      mustNotSayNotFound: true,
    },
  };
}

function generateDataMissingScenario(): GroundingScenario {
  const template = pickRandom(DATA_MISSING_QUERIES);
  return {
    id: `missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'data_missing',
    sourceDocuments: template.docs,
    expectations: {
      requiresCitation: false,
      mustNotSayNotFound: false, // "not found" IS valid here
      allowedResponses: ['not found', 'no data', 'not available', 'couldn\'t find'],
    },
  };
}

function generatePartialDataScenario(): GroundingScenario {
  const template = pickRandom(PARTIAL_DATA_QUERIES);
  return {
    id: `partial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'partial_data',
    sourceDocuments: template.docs,
    expectations: {
      requiresCitation: true,
      mustNotSayNotFound: false, // Partial "not found" is OK
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface GroundingGenerationConfig {
  count: number;
  distribution: {
    citation_required: number;
    numeric_grounding: number;
    data_exists: number;
    data_missing: number;
    partial_data: number;
  };
}

const DEFAULT_CONFIG: GroundingGenerationConfig = {
  count: 5000,
  distribution: {
    citation_required: 0.30,
    numeric_grounding: 0.25,
    data_exists: 0.20,
    data_missing: 0.15,
    partial_data: 0.10,
  },
};

export function generateGroundingBatch(
  config: Partial<GroundingGenerationConfig> = {}
): GroundingScenario[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const scenarios: GroundingScenario[] = [];
  const dist = fullConfig.distribution;

  const types: { type: GroundingScenarioType; weight: number }[] = [
    { type: 'citation_required', weight: dist.citation_required },
    { type: 'numeric_grounding', weight: dist.numeric_grounding },
    { type: 'data_exists', weight: dist.data_exists },
    { type: 'data_missing', weight: dist.data_missing },
    { type: 'partial_data', weight: dist.partial_data },
  ];

  for (let i = 0; i < fullConfig.count; i++) {
    const rand = Math.random();
    let cumulative = 0;
    let selectedType: GroundingScenarioType = 'citation_required';

    for (const { type, weight } of types) {
      cumulative += weight;
      if (rand < cumulative) {
        selectedType = type;
        break;
      }
    }

    switch (selectedType) {
      case 'citation_required':
        scenarios.push(generateCitationRequiredScenario());
        break;
      case 'numeric_grounding':
        scenarios.push(generateNumericGroundingScenario());
        break;
      case 'data_exists':
        scenarios.push(generateDataExistsScenario());
        break;
      case 'data_missing':
        scenarios.push(generateDataMissingScenario());
        break;
      case 'partial_data':
        scenarios.push(generatePartialDataScenario());
        break;
    }
  }

  return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export function getGroundingStats(scenarios: GroundingScenario[]): {
  total: number;
  byType: Record<string, number>;
} {
  const stats = {
    total: scenarios.length,
    byType: {} as Record<string, number>,
  };

  for (const scenario of scenarios) {
    stats.byType[scenario.type] = (stats.byType[scenario.type] || 0) + 1;
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface GroundingValidationResult {
  passed: boolean;
  failures: string[];
  scenario: GroundingScenario;
  answer: GroundedAnswer;
}

/**
 * Format number for comparison (handles various formats like $2.5M, 2500000, etc.)
 */
function normalizeNumber(value: number): string[] {
  const variants: string[] = [];
  variants.push(value.toString());
  variants.push(value.toLocaleString());

  // Millions format
  if (value >= 1000000) {
    const millions = value / 1000000;
    variants.push(`${millions}M`);
    variants.push(`$${millions}M`);
    variants.push(`${millions} million`);
  }

  // Thousands format
  if (value >= 1000) {
    const thousands = value / 1000;
    variants.push(`${thousands}K`);
    variants.push(`$${thousands}K`);
    variants.push(`${thousands} thousand`);
  }

  return variants;
}

/**
 * Check if answer contains the expected numeric value
 */
function containsNumericValue(content: string, value: number): boolean {
  const variants = normalizeNumber(value);
  const lowerContent = content.toLowerCase();

  for (const variant of variants) {
    if (lowerContent.includes(variant.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Check if answer says "not found" or similar
 */
function detectsNotFound(content: string): boolean {
  const notFoundPatterns = [
    /not found/i,
    /couldn['']t find/i,
    /no (data|information|results)/i,
    /not available/i,
    /doesn['']t (have|contain|include)/i,
    /no mention/i,
    /unable to (find|locate)/i,
  ];

  return notFoundPatterns.some(p => p.test(content));
}

/**
 * Check if answer has citations
 */
function hasCitations(citations: string[]): boolean {
  return citations.length > 0;
}

/**
 * Validate a grounded answer against expectations
 */
export function validateGroundingResult(
  scenario: GroundingScenario,
  answer: GroundedAnswer
): GroundingValidationResult {
  const failures: string[] = [];
  const exp = scenario.expectations;

  // Check citation requirement
  if (exp.requiresCitation && !hasCitations(answer.citations)) {
    failures.push('Missing required citation');
  }

  // Check "not found" constraint
  if (exp.mustNotSayNotFound && detectsNotFound(answer.content)) {
    failures.push('Incorrectly says data not found when data exists');
  }

  // Check numeric values
  if (exp.numericValues) {
    for (const { field, value } of exp.numericValues) {
      if (!containsNumericValue(answer.content, value)) {
        failures.push(`Missing or incorrect numeric value for ${field}: expected ${value}`);
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    scenario,
    answer,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  generateCitationRequiredScenario,
  generateNumericGroundingScenario,
  generateDataExistsScenario,
  generateDataMissingScenario,
  generatePartialDataScenario,
  containsNumericValue,
  detectsNotFound,
  hasCitations,
};
