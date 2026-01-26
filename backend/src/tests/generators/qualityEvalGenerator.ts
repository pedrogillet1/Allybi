/**
 * Quality Evaluation Generator
 *
 * Generates test scenarios for human-like quality evaluation:
 * - Clarity (readable, no jargon, appropriate complexity)
 * - Helpfulness (directly addresses question, actionable)
 * - Structure (well-organized, appropriate format)
 *
 * Uses rubric-based scoring to approximate human evaluation.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type QualityDimension = 'clarity' | 'helpfulness' | 'structure';

export interface QualityRubric {
  clarity: {
    maxScore: number;
    criteria: {
      readable: boolean;       // No overly complex sentences
      noJargon: boolean;       // Avoids unexplained jargon
      concise: boolean;        // Not unnecessarily verbose
      complete: boolean;       // Sentences are complete
    };
  };
  helpfulness: {
    maxScore: number;
    criteria: {
      addressesQuestion: boolean;  // Directly answers the query
      actionable: boolean;         // Provides actionable information
      noIrrelevant: boolean;       // Doesn't include off-topic info
      providesContext: boolean;    // Gives enough context
    };
  };
  structure: {
    maxScore: number;
    criteria: {
      organized: boolean;      // Logical organization
      appropriateFormat: boolean;  // Uses right format (bullets/table/prose)
      consistent: boolean;     // Consistent formatting
      scannable: boolean;      // Easy to scan for key info
    };
  };
}

export interface QualityScores {
  clarity: number;
  helpfulness: number;
  structure: number;
  overall: number;
}

export interface EvalScenario {
  id: string;
  query: string;
  queryType: 'factual' | 'summary' | 'comparison' | 'how_to' | 'list';
  expectedFormat: 'prose' | 'bullets' | 'table' | 'mixed';
  contextDocs: string[];
}

export interface EvaluatedAnswer {
  content: string;
  format: 'prose' | 'bullets' | 'table' | 'mixed';
  wordCount: number;
  sentenceCount: number;
}

export interface EvalResult {
  scenario: EvalScenario;
  answer: EvaluatedAnswer;
  scores: QualityScores;
  rubric: QualityRubric;
  passed: boolean;
  feedback: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY TEMPLATES BY TYPE
// ═══════════════════════════════════════════════════════════════════════════

const FACTUAL_QUERIES = [
  { query: 'What was the total revenue for Q3?', docs: ['financial_report.pdf'] },
  { query: 'How many employees do we have?', docs: ['team_roster.xlsx'] },
  { query: 'When is the project deadline?', docs: ['project_plan.docx'] },
  { query: 'What is the budget for marketing?', docs: ['budget_2024.xlsx'] },
  { query: 'What is the profit margin?', docs: ['financial_report.pdf'] },
];

const SUMMARY_QUERIES = [
  { query: 'Summarize the quarterly report', docs: ['quarterly_report.pdf'] },
  { query: 'Give me an overview of the project plan', docs: ['project_plan.docx'] },
  { query: 'What are the key takeaways from the meeting?', docs: ['meeting_notes.docx'] },
  { query: 'Summarize the contract terms', docs: ['contract.pdf'] },
];

const COMPARISON_QUERIES = [
  { query: 'Compare Q2 and Q3 revenue', docs: ['q2_report.pdf', 'q3_report.pdf'] },
  { query: 'What changed between version 1 and 2?', docs: ['v1.docx', 'v2.docx'] },
  { query: 'Contrast the two proposals', docs: ['proposal_a.pdf', 'proposal_b.pdf'] },
];

const HOW_TO_QUERIES = [
  { query: 'How do I calculate the ROI?', docs: ['financial_guide.pdf'] },
  { query: 'What are the steps to onboard a new employee?', docs: ['hr_manual.docx'] },
  { query: 'How should I format the report?', docs: ['style_guide.pdf'] },
];

const LIST_QUERIES = [
  { query: 'What are all the action items?', docs: ['meeting_notes.docx'] },
  { query: 'List the risk factors', docs: ['risk_assessment.pdf'] },
  { query: 'What are the project milestones?', docs: ['project_plan.docx'] },
  { query: 'Show me all the expenses categories', docs: ['budget_2024.xlsx'] },
];

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getExpectedFormat(queryType: string): 'prose' | 'bullets' | 'table' | 'mixed' {
  switch (queryType) {
    case 'factual': return 'prose';
    case 'summary': return 'prose';
    case 'comparison': return 'table';
    case 'how_to': return 'bullets';
    case 'list': return 'bullets';
    default: return 'prose';
  }
}

function generateScenario(type: 'factual' | 'summary' | 'comparison' | 'how_to' | 'list'): EvalScenario {
  let templates: { query: string; docs: string[] }[];

  switch (type) {
    case 'factual': templates = FACTUAL_QUERIES; break;
    case 'summary': templates = SUMMARY_QUERIES; break;
    case 'comparison': templates = COMPARISON_QUERIES; break;
    case 'how_to': templates = HOW_TO_QUERIES; break;
    case 'list': templates = LIST_QUERIES; break;
  }

  const template = pickRandom(templates);
  return {
    id: `eval-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: template.query,
    queryType: type,
    expectedFormat: getExpectedFormat(type),
    contextDocs: template.docs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface EvalGenerationConfig {
  count: number;
  distribution: {
    factual: number;
    summary: number;
    comparison: number;
    how_to: number;
    list: number;
  };
}

const DEFAULT_CONFIG: EvalGenerationConfig = {
  count: 1000,
  distribution: {
    factual: 0.25,
    summary: 0.20,
    comparison: 0.15,
    how_to: 0.20,
    list: 0.20,
  },
};

export function generateEvalBatch(
  config: Partial<EvalGenerationConfig> = {}
): EvalScenario[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const scenarios: EvalScenario[] = [];
  const dist = fullConfig.distribution;

  const types: { type: 'factual' | 'summary' | 'comparison' | 'how_to' | 'list'; weight: number }[] = [
    { type: 'factual', weight: dist.factual },
    { type: 'summary', weight: dist.summary },
    { type: 'comparison', weight: dist.comparison },
    { type: 'how_to', weight: dist.how_to },
    { type: 'list', weight: dist.list },
  ];

  for (let i = 0; i < fullConfig.count; i++) {
    const rand = Math.random();
    let cumulative = 0;
    let selectedType: 'factual' | 'summary' | 'comparison' | 'how_to' | 'list' = 'factual';

    for (const { type, weight } of types) {
      cumulative += weight;
      if (rand < cumulative) {
        selectedType = type;
        break;
      }
    }

    scenarios.push(generateScenario(selectedType));
  }

  return scenarios;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export function getEvalStats(scenarios: EvalScenario[]): {
  total: number;
  byType: Record<string, number>;
  byFormat: Record<string, number>;
} {
  const stats = {
    total: scenarios.length,
    byType: {} as Record<string, number>,
    byFormat: {} as Record<string, number>,
  };

  for (const scenario of scenarios) {
    stats.byType[scenario.queryType] = (stats.byType[scenario.queryType] || 0) + 1;
    stats.byFormat[scenario.expectedFormat] = (stats.byFormat[scenario.expectedFormat] || 0) + 1;
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if text is readable (no overly complex sentences)
 */
function isReadable(text: string): boolean {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
  return avgWords <= 25; // Average sentence under 25 words
}

/**
 * Check for unexplained jargon
 */
function hasNoJargon(text: string): boolean {
  const jargonPatterns = [
    /\b(synergize|leverage|paradigm|bandwidth|actionable|circle back|deep dive)\b/i,
    /\b[A-Z]{4,}\b/, // Unexplained acronyms (4+ letters)
  ];
  return !jargonPatterns.some(p => p.test(text));
}

/**
 * Check if text is concise
 */
function isConcise(text: string, expectedWords: number = 200): boolean {
  const wordCount = text.split(/\s+/).length;
  return wordCount <= expectedWords * 1.5; // Allow 50% over expected
}

/**
 * Check if sentences are complete
 */
function hasCompleteSentences(text: string): boolean {
  // Check for common truncation patterns
  return !/(^|[.!?]\s+)[a-z]/.test(text) && // No lowercase after period
         !/\s(and|or|but|the|a|an)$/i.test(text.trim()); // No ending with articles
}

/**
 * Check if answer addresses the question
 */
function addressesQuestion(answer: string, query: string): boolean {
  // Simple heuristic: answer should contain keywords from question
  const queryWords = query.toLowerCase().replace(/[?.,!]/g, '').split(/\s+/);
  const keyWords = queryWords.filter(w => w.length > 3 && !['what', 'when', 'where', 'which', 'that', 'this', 'have', 'does', 'from', 'about'].includes(w));
  const answerLower = answer.toLowerCase();

  // At least 30% of key words should appear in answer
  const matchCount = keyWords.filter(w => answerLower.includes(w)).length;
  return matchCount >= keyWords.length * 0.3;
}

/**
 * Check if answer provides actionable information
 */
function isActionable(answer: string, queryType: string): boolean {
  if (queryType === 'how_to') {
    // Should have numbered steps or action verbs
    return /\d+[.)]\s+/m.test(answer) || /\b(first|then|next|finally|step)\b/i.test(answer);
  }
  // For other types, any specific information is actionable
  return /\d/.test(answer) || /\$/.test(answer) || answer.length > 50;
}

/**
 * Check for appropriate format
 */
function hasAppropriateFormat(answer: string, expected: string): boolean {
  const hasBullets = /^[-*•]\s+/m.test(answer) || /^\d+[.)]\s+/m.test(answer);
  const hasTable = answer.includes('|');
  const actual = hasTable ? 'table' : hasBullets ? 'bullets' : 'prose';

  if (expected === 'mixed') {
    return true; // Any format is OK for mixed
  }
  return actual === expected || expected === 'prose'; // Prose is always acceptable
}

/**
 * Calculate quality scores for an answer
 */
export function evaluateAnswer(scenario: EvalScenario, answer: EvaluatedAnswer): EvalResult {
  const clarityRubric = {
    readable: isReadable(answer.content),
    noJargon: hasNoJargon(answer.content),
    concise: isConcise(answer.content),
    complete: hasCompleteSentences(answer.content),
  };

  const helpfulnessRubric = {
    addressesQuestion: addressesQuestion(answer.content, scenario.query),
    actionable: isActionable(answer.content, scenario.queryType),
    noIrrelevant: answer.wordCount < 500, // Keep it focused
    providesContext: answer.content.includes(scenario.contextDocs[0]) || answer.wordCount > 30,
  };

  const structureRubric = {
    organized: answer.sentenceCount > 0 && answer.sentenceCount < 20,
    appropriateFormat: hasAppropriateFormat(answer.content, scenario.expectedFormat),
    consistent: true, // Assume consistent for now
    scannable: scenario.expectedFormat !== 'prose' || answer.wordCount < 150,
  };

  // Calculate scores (each criterion is worth 25% of dimension score)
  const clarityScore = Object.values(clarityRubric).filter(v => v).length / 4 * 100;
  const helpfulnessScore = Object.values(helpfulnessRubric).filter(v => v).length / 4 * 100;
  const structureScore = Object.values(structureRubric).filter(v => v).length / 4 * 100;
  const overallScore = (clarityScore + helpfulnessScore + structureScore) / 3;

  const feedback: string[] = [];
  if (!clarityRubric.readable) feedback.push('Sentences too complex');
  if (!clarityRubric.noJargon) feedback.push('Contains unexplained jargon');
  if (!clarityRubric.concise) feedback.push('Too verbose');
  if (!clarityRubric.complete) feedback.push('Incomplete sentences');
  if (!helpfulnessRubric.addressesQuestion) feedback.push('Does not address question');
  if (!helpfulnessRubric.actionable) feedback.push('Not actionable');
  if (!structureRubric.appropriateFormat) feedback.push('Wrong format for query type');

  return {
    scenario,
    answer,
    scores: {
      clarity: clarityScore,
      helpfulness: helpfulnessScore,
      structure: structureScore,
      overall: overallScore,
    },
    rubric: {
      clarity: { maxScore: 100, criteria: clarityRubric },
      helpfulness: { maxScore: 100, criteria: helpfulnessRubric },
      structure: { maxScore: 100, criteria: structureRubric },
    },
    passed: overallScore >= 70, // 70% is passing threshold
    feedback,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  generateScenario,
  isReadable,
  hasNoJargon,
  isConcise,
  hasCompleteSentences,
  addressesQuestion,
  isActionable,
  hasAppropriateFormat,
};
