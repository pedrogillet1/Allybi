/**
 * Retrieval Scenario Generator
 *
 * Generates test scenarios for retrieval sanity testing:
 * - Single doc queries (should return chunks from 1 doc)
 * - Multi-doc/compare queries (should return chunks from 2+ docs)
 * - Scoped queries (should only return chunks from specified doc)
 *
 * Used to test retrieval behavior matches expectations.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type RetrievalScenarioType =
  | 'single_doc'       // Query targeting a single document
  | 'multi_doc'        // Query spanning multiple documents
  | 'compare'          // Explicit comparison query
  | 'scoped'           // Query with explicit document scope
  | 'search_all';      // Search across all documents

export interface RetrievalExpectation {
  minChunks: number;
  maxChunks: number;
  minDocs: number;
  maxDocs: number;
  requiresSpecificDoc?: string;  // If set, must include this doc
}

export interface RetrievalScenario {
  id: string;
  query: string;
  type: RetrievalScenarioType;
  expectations: RetrievalExpectation;
  documentContext?: string[];  // Simulated available documents
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const SINGLE_DOC_TEMPLATES = [
  { query: 'What is the total revenue in the {doc}?', doc: 'financial_report.pdf' },
  { query: 'Summarize the {doc}', doc: 'project_plan.docx' },
  { query: 'How many pages does {doc} have?', doc: 'annual_report.pdf' },
  { query: 'Extract the key dates from {doc}', doc: 'contract.pdf' },
  { query: 'What are the main points in {doc}?', doc: 'meeting_notes.docx' },
  { query: 'Find the budget breakdown in {doc}', doc: 'budget_2024.xlsx' },
  { query: 'What does {doc} say about deliverables?', doc: 'project_plan.docx' },
  { query: 'Get the executive summary from {doc}', doc: 'quarterly_report.pdf' },
];

const MULTI_DOC_TEMPLATES = [
  { query: 'What do my documents say about revenue?', minDocs: 2 },
  { query: 'Find all mentions of project timeline across my files', minDocs: 2 },
  { query: 'Search for budget information in all documents', minDocs: 2 },
  { query: 'What is discussed about team structure in my files?', minDocs: 2 },
  { query: 'Find risk factors mentioned in any document', minDocs: 2 },
  { query: 'Show me all references to Q4 goals', minDocs: 2 },
];

const COMPARE_TEMPLATES = [
  { query: 'Compare the revenue between {doc1} and {doc2}', docs: ['report_q1.pdf', 'report_q2.pdf'] },
  { query: 'What are the differences between {doc1} and {doc2}?', docs: ['version1.docx', 'version2.docx'] },
  { query: 'Compare {doc1} vs {doc2}', docs: ['budget_2023.xlsx', 'budget_2024.xlsx'] },
  { query: 'How does {doc1} differ from {doc2}?', docs: ['proposal_a.pdf', 'proposal_b.pdf'] },
  { query: 'Contrast the findings in {doc1} with {doc2}', docs: ['study_a.pdf', 'study_b.pdf'] },
  { query: 'Which document has better metrics, {doc1} or {doc2}?', docs: ['team_a.xlsx', 'team_b.xlsx'] },
];

const SCOPED_TEMPLATES = [
  { query: 'In {doc}, what is the conclusion?', doc: 'research_paper.pdf', scope: 'exclusive' },
  { query: 'From {doc} only, extract the key metrics', doc: 'dashboard.xlsx', scope: 'exclusive' },
  { query: 'Looking at {doc} specifically, what are the risks?', doc: 'risk_assessment.pdf', scope: 'exclusive' },
  { query: 'Based solely on {doc}, what is the recommendation?', doc: 'analysis.docx', scope: 'exclusive' },
  { query: 'Within {doc}, find the action items', doc: 'meeting_notes.docx', scope: 'exclusive' },
];

const SEARCH_ALL_TEMPLATES = [
  { query: 'What documents do I have?', minDocs: 1 },
  { query: 'Show me all my files', minDocs: 1 },
  { query: 'List all uploaded documents', minDocs: 1 },
  { query: 'Search for the word "revenue"', minDocs: 1 },
  { query: 'Find anything about marketing', minDocs: 1 },
  { query: 'What files mention "deadline"?', minDocs: 1 },
];

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATED DOCUMENT SETS
// ═══════════════════════════════════════════════════════════════════════════

const DOCUMENT_SETS = [
  ['financial_report.pdf', 'budget_2024.xlsx', 'expenses.xlsx'],
  ['project_plan.docx', 'timeline.xlsx', 'resources.docx'],
  ['annual_report.pdf', 'quarterly_report.pdf', 'monthly_summary.pdf'],
  ['contract_a.pdf', 'contract_b.pdf', 'amendments.docx'],
  ['meeting_notes.docx', 'action_items.xlsx', 'decisions.pdf'],
  ['proposal_v1.docx', 'proposal_v2.docx', 'feedback.pdf'],
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSingleDocScenario(): RetrievalScenario {
  const template = pickRandom(SINGLE_DOC_TEMPLATES);
  const docSet = pickRandom(DOCUMENT_SETS);
  const doc = template.doc || pickRandom(docSet);

  return {
    id: `single-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query.replace('{doc}', doc),
    type: 'single_doc',
    expectations: {
      minChunks: 1,
      maxChunks: 10,
      minDocs: 1,
      maxDocs: 1,
      requiresSpecificDoc: doc,
    },
    documentContext: docSet.includes(doc) ? docSet : [doc, ...docSet.slice(1)],
  };
}

function generateMultiDocScenario(): RetrievalScenario {
  const template = pickRandom(MULTI_DOC_TEMPLATES);
  const docSet = pickRandom(DOCUMENT_SETS);

  return {
    id: `multi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'multi_doc',
    expectations: {
      minChunks: 2,
      maxChunks: 20,
      minDocs: template.minDocs,
      maxDocs: docSet.length,
    },
    documentContext: docSet,
  };
}

function generateCompareScenario(): RetrievalScenario {
  const template = pickRandom(COMPARE_TEMPLATES);
  const [doc1, doc2] = template.docs;

  return {
    id: `compare-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query.replace('{doc1}', doc1).replace('{doc2}', doc2),
    type: 'compare',
    expectations: {
      minChunks: 2,
      maxChunks: 20,
      minDocs: 2,
      maxDocs: 2,
    },
    documentContext: [doc1, doc2],
  };
}

function generateScopedScenario(): RetrievalScenario {
  const template = pickRandom(SCOPED_TEMPLATES);
  const docSet = pickRandom(DOCUMENT_SETS);
  const doc = template.doc || pickRandom(docSet);

  return {
    id: `scoped-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query.replace('{doc}', doc),
    type: 'scoped',
    expectations: {
      minChunks: 1,
      maxChunks: 10,
      minDocs: 1,
      maxDocs: 1,
      requiresSpecificDoc: doc,
    },
    documentContext: docSet.includes(doc) ? docSet : [doc, ...docSet.slice(1)],
  };
}

function generateSearchAllScenario(): RetrievalScenario {
  const template = pickRandom(SEARCH_ALL_TEMPLATES);
  const docSet = pickRandom(DOCUMENT_SETS);

  return {
    id: `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    type: 'search_all',
    expectations: {
      minChunks: 0,
      maxChunks: 30,
      minDocs: template.minDocs,
      maxDocs: docSet.length,
    },
    documentContext: docSet,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface RetrievalGenerationConfig {
  count: number;
  distribution: {
    single_doc: number;
    multi_doc: number;
    compare: number;
    scoped: number;
    search_all: number;
  };
}

const DEFAULT_CONFIG: RetrievalGenerationConfig = {
  count: 10000,
  distribution: {
    single_doc: 0.30,   // 30% single doc queries
    multi_doc: 0.25,    // 25% multi-doc queries
    compare: 0.15,      // 15% compare queries
    scoped: 0.15,       // 15% scoped queries
    search_all: 0.15,   // 15% search all queries
  },
};

export function generateRetrievalBatch(
  config: Partial<RetrievalGenerationConfig> = {}
): RetrievalScenario[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const scenarios: RetrievalScenario[] = [];
  const dist = fullConfig.distribution;

  const types: { type: RetrievalScenarioType; weight: number }[] = [
    { type: 'single_doc', weight: dist.single_doc },
    { type: 'multi_doc', weight: dist.multi_doc },
    { type: 'compare', weight: dist.compare },
    { type: 'scoped', weight: dist.scoped },
    { type: 'search_all', weight: dist.search_all },
  ];

  for (let i = 0; i < fullConfig.count; i++) {
    const rand = Math.random();
    let cumulative = 0;
    let selectedType: RetrievalScenarioType = 'single_doc';

    for (const { type, weight } of types) {
      cumulative += weight;
      if (rand < cumulative) {
        selectedType = type;
        break;
      }
    }

    switch (selectedType) {
      case 'single_doc':
        scenarios.push(generateSingleDocScenario());
        break;
      case 'multi_doc':
        scenarios.push(generateMultiDocScenario());
        break;
      case 'compare':
        scenarios.push(generateCompareScenario());
        break;
      case 'scoped':
        scenarios.push(generateScopedScenario());
        break;
      case 'search_all':
        scenarios.push(generateSearchAllScenario());
        break;
    }
  }

  return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export function getRetrievalStats(scenarios: RetrievalScenario[]): {
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
// VALIDATION (Mock - would be replaced with actual retrieval service)
// ═══════════════════════════════════════════════════════════════════════════

export interface RetrievalResult {
  chunks: { docName: string; content: string; score: number }[];
  docCount: number;
  uniqueDocs: string[];
}

export interface RetrievalValidationResult {
  passed: boolean;
  failures: string[];
  scenario: RetrievalScenario;
  result: RetrievalResult;
}

/**
 * Validate retrieval results against expectations
 */
export function validateRetrievalResult(
  scenario: RetrievalScenario,
  result: RetrievalResult
): RetrievalValidationResult {
  const failures: string[] = [];
  const exp = scenario.expectations;

  // Check chunk count
  if (result.chunks.length < exp.minChunks) {
    failures.push(`Too few chunks: got ${result.chunks.length}, expected >=${exp.minChunks}`);
  }
  if (result.chunks.length > exp.maxChunks) {
    failures.push(`Too many chunks: got ${result.chunks.length}, expected <=${exp.maxChunks}`);
  }

  // Check doc count
  if (result.docCount < exp.minDocs) {
    failures.push(`Too few docs: got ${result.docCount}, expected >=${exp.minDocs}`);
  }
  if (result.docCount > exp.maxDocs) {
    failures.push(`Too many docs: got ${result.docCount}, expected <=${exp.maxDocs}`);
  }

  // Check specific doc requirement
  if (exp.requiresSpecificDoc && !result.uniqueDocs.includes(exp.requiresSpecificDoc)) {
    failures.push(`Missing required doc: ${exp.requiresSpecificDoc}`);
  }

  return {
    passed: failures.length === 0,
    failures,
    scenario,
    result,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  generateSingleDocScenario,
  generateMultiDocScenario,
  generateCompareScenario,
  generateScopedScenario,
  generateSearchAllScenario,
};
