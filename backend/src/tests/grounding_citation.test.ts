/**
 * Grounding & Citation Test Suite
 *
 * ChatGPT-parity Phase 6: Tests for citation correctness and grounding.
 *
 * Tests:
 * - Citations exist when chunks provided
 * - Numeric claims have sources
 * - Doc names match available docs
 * - No citations to non-existent pages/sections
 * - Numbers in answers are grounded in source chunks
 *
 * Structure:
 * - STRICT seed tests (must pass 100%)
 * - LENIENT mutation tests (90%+ pass rate acceptable)
 */

import { describe, it, expect, afterAll } from 'vitest';
import { testConfig, globalStats } from './utils/testModes';

// ═══════════════════════════════════════════════════════════════════════════
// TEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ChunkInfo {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  pageNumber?: number;
  numbers: string[]; // Numbers that appear in this chunk
}

interface CitationTestCase {
  id: string;
  description: string;
  answer: string;
  chunks: ChunkInfo[];
  availableDocs: Array<{ id: string; name: string; pageCount?: number }>;
  expected: {
    hasCitationsWhenNeeded: boolean;
    numbersAreGrounded: boolean;
    docNamesMatch: boolean;
    pageRefsValid: boolean;
    overallPasses: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CITATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract citation markers from text
 * Supports: [[DOC_1]], [1], (source: doc.pdf), "according to Document.pdf"
 */
function extractCitations(text: string): Array<{ type: string; reference: string }> {
  const citations: Array<{ type: string; reference: string }> = [];

  // [[DOC_N]] format
  const docMarkers = text.match(/\[\[DOC_(\d+)(?:_P(\d+))?\]\]/gi) || [];
  for (const marker of docMarkers) {
    citations.push({ type: 'doc_marker', reference: marker });
  }

  // [N] format (numbered citations)
  const numberedCitations = text.match(/\[(\d+)\]/g) || [];
  for (const citation of numberedCitations) {
    citations.push({ type: 'numbered', reference: citation });
  }

  // Document name references
  const docNameRefs = text.match(/(?:from|in|according to|source:)\s*["']?([^"'\n,]+\.(?:pdf|xlsx?|docx?|pptx?))/gi) || [];
  for (const ref of docNameRefs) {
    citations.push({ type: 'doc_name', reference: ref });
  }

  return citations;
}

/**
 * Extract numbers from text (monetary values, percentages, plain numbers)
 */
function extractNumbers(text: string): string[] {
  const numbers: string[] = [];

  // Currency amounts: $1.2M, €500K, etc. - must have currency symbol or suffix
  const currencyMatches = text.match(/[$€£¥]\s?[\d,]+(?:\.\d+)?\s?[KMB]?/gi) || [];
  numbers.push(...currencyMatches.map(m => m.trim()));

  // Numbers with K/M/B suffix (without currency symbol): 2.5M, 500K
  const suffixMatches = text.match(/\b[\d,]+(?:\.\d+)?\s?[KMB]\b/gi) || [];
  numbers.push(...suffixMatches.map(m => m.trim()));

  // Percentages: 45%, 12.5%
  const percentMatches = text.match(/\b\d+(?:\.\d+)?%/g) || [];
  numbers.push(...percentMatches);

  // Plain large numbers with commas: 1,234,567
  const plainNumbers = text.match(/\b\d{1,3}(?:,\d{3})+\b/g) || [];
  numbers.push(...plainNumbers);

  // Filter out single-digit numbers and document markers (DOC_1, P3, etc.)
  const filtered = numbers.filter(n => {
    const cleaned = n.replace(/[$€£¥%,\s]/g, '');
    // Must be at least 2 chars or have a suffix/symbol
    return cleaned.length >= 2 || /[KMB%$€£¥]/.test(n);
  });

  return [...new Set(filtered)]; // Dedupe
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if citations exist when chunks are provided
 */
function checkCitationsExist(answer: string, chunks: ChunkInfo[]): boolean {
  if (chunks.length === 0) return true; // No chunks = no citations needed

  const citations = extractCitations(answer);

  // If answer contains factual claims, should have citations
  const hasFactualClaims = /\b(?:is|are|was|were|equals?|totals?|shows?)\s+\$?[\d,]+/i.test(answer) ||
                          /\d+(?:\.\d+)?%/i.test(answer);

  if (hasFactualClaims && citations.length === 0) {
    // Check for implicit attribution ("according to the document", "the report shows")
    const hasImplicitAttribution = /\b(?:the\s+)?(?:document|report|file|spreadsheet)\s+(?:shows?|states?|indicates?|contains?)/i.test(answer);
    return hasImplicitAttribution;
  }

  return true;
}

/**
 * Normalize a number string for comparison
 */
function normalizeNumber(num: string): string {
  return num
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/[$€£¥r\$]/gi, '')  // Remove currency symbols
    .replace(/,/g, '')
    .replace(/\.0+$/, '')  // Remove trailing zeros
    .trim();
}

/**
 * Check if two numbers are equivalent
 */
function numbersMatch(num1: string, num2: string): boolean {
  const n1 = normalizeNumber(num1);
  const n2 = normalizeNumber(num2);

  // Direct match
  if (n1 === n2) return true;

  // Try numeric comparison (e.g., "2.5m" vs "2.5M")
  const parseNum = (s: string): number | null => {
    const match = s.match(/^([\d.]+)([kmb%])?$/i);
    if (!match) return null;
    let val = parseFloat(match[1]);
    const suffix = (match[2] || '').toLowerCase();
    if (suffix === 'k') val *= 1000;
    if (suffix === 'm') val *= 1000000;
    if (suffix === 'b') val *= 1000000000;
    // For percentages, just return the raw value
    return val;
  };

  const v1 = parseNum(n1);
  const v2 = parseNum(n2);

  if (v1 !== null && v2 !== null) {
    // For small numbers (like percentages), use absolute tolerance
    if (Math.max(v1, v2) < 100) {
      return Math.abs(v1 - v2) < 0.1;
    }
    return Math.abs(v1 - v2) < 0.01 * Math.max(v1, v2); // 1% tolerance
  }

  // Try substring match for things like "2.5" matching "2.5m"
  if (n1.includes(n2) || n2.includes(n1)) {
    return true;
  }

  return false;
}

/**
 * Check if numeric claims are grounded in source chunks
 */
function checkNumbersGrounded(answer: string, chunks: ChunkInfo[]): boolean {
  const answerNumbers = extractNumbers(answer);

  if (answerNumbers.length === 0) return true; // No numbers to check

  // Collect all numbers from chunks
  const chunkNumbers: string[] = [];
  for (const chunk of chunks) {
    for (const num of chunk.numbers) {
      chunkNumbers.push(num);
    }
    // Also extract numbers from content
    const contentNumbers = extractNumbers(chunk.content);
    chunkNumbers.push(...contentNumbers);
  }

  // Check each answer number
  let groundedCount = 0;
  for (const ansNum of answerNumbers) {
    const isGrounded = chunkNumbers.some(chunkNum => numbersMatch(ansNum, chunkNum));
    if (isGrounded) {
      groundedCount++;
    }
  }

  // At least 70% of numbers should be grounded
  const groundingRate = groundedCount / answerNumbers.length;
  return groundingRate >= 0.7;
}

/**
 * Check if document names in answer match available docs
 */
function checkDocNamesMatch(answer: string, availableDocs: Array<{ id: string; name: string }>): boolean {
  // Extract document name references from answer - multiple patterns
  const patterns = [
    /["']([^"']+\.(?:pdf|xlsx?|docx?|pptx?|csv|txt))["']/gi,  // Quoted names
    /(?:from|in|according to)\s+["']?([^"'\n,]+\.(?:pdf|xlsx?|docx?|pptx?|csv|txt))["']?/gi,  // Attribution patterns
  ];

  const docRefs: string[] = [];
  for (const pattern of patterns) {
    const matches = answer.match(pattern) || [];
    docRefs.push(...matches);
  }

  if (docRefs.length === 0) return true; // No doc references to validate

  const docNames = availableDocs.map(d => d.name.toLowerCase());

  for (const ref of docRefs) {
    // Extract just the filename part
    const cleanRef = ref
      .replace(/^(?:from|in|according to)\s+/i, '')
      .replace(/["']/g, '')
      .trim()
      .toLowerCase();

    // Skip if it doesn't look like a filename
    if (!cleanRef.match(/\.(pdf|xlsx?|docx?|pptx?|csv|txt)$/i)) continue;

    const matches = docNames.some(name =>
      name === cleanRef ||
      name.includes(cleanRef) ||
      cleanRef.includes(name)
    );

    if (!matches) {
      // Check for fuzzy match - must share significant words, not just characters
      const refWords = cleanRef.replace(/\.[^.]+$/, '').split(/[\s_-]+/).filter(w => w.length > 2);
      const fuzzyMatch = docNames.some(name => {
        const nameWords = name.replace(/\.[^.]+$/, '').split(/[\s_-]+/).filter(w => w.length > 2);
        const sharedWords = refWords.filter(rw => nameWords.some(nw => nw.includes(rw) || rw.includes(nw)));
        return sharedWords.length >= Math.max(1, Math.floor(refWords.length * 0.5));
      });

      if (!fuzzyMatch) return false;
    }
  }

  return true;
}

/**
 * Check if page references are valid (within document page count)
 */
function checkPageRefsValid(answer: string, availableDocs: Array<{ id: string; name: string; pageCount?: number }>): boolean {
  // Extract page references: "page 5", "p. 12", "slide 3"
  const pageRefs = answer.match(/\b(?:page|p\.|slide|sheet)\s*(\d+)/gi) || [];

  if (pageRefs.length === 0) return true;

  // For now, check that page numbers are reasonable (1-1000)
  for (const ref of pageRefs) {
    const pageNum = parseInt(ref.match(/\d+/)?.[0] || '0', 10);
    if (pageNum <= 0 || pageNum > 1000) {
      return false;
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

const SEED_TESTS: CitationTestCase[] = [
  // GOOD CASES - properly grounded
  {
    id: 'G001',
    description: 'Well-cited answer with document markers',
    answer: 'According to the financial report, revenue was $2.5M [[DOC_1_P3]] and expenses were $1.8M [[DOC_1_P5]].',
    chunks: [
      {
        id: 'c1',
        documentId: 'd1',
        documentName: 'Financial Report 2024.pdf',
        content: 'Total revenue for the period: $2.5M. Operating costs reached $1.8M.',
        pageNumber: 3,
        numbers: ['$2.5M', '$1.8M'],
      },
    ],
    availableDocs: [{ id: 'd1', name: 'Financial Report 2024.pdf', pageCount: 10 }],
    expected: {
      hasCitationsWhenNeeded: true,
      numbersAreGrounded: true,
      docNamesMatch: true,
      pageRefsValid: true,
      overallPasses: true,
    },
  },
  {
    id: 'G002',
    description: 'Answer with implicit attribution',
    answer: 'The document shows that profit margin improved to 22%, with total revenue reaching $3.2M.',
    chunks: [
      {
        id: 'c2',
        documentId: 'd2',
        documentName: 'Q3 Summary.xlsx',
        content: 'Profit margin: 22%. Revenue: $3.2M. YoY growth: 15%.',
        numbers: ['22%', '$3.2M', '15%'],
      },
    ],
    availableDocs: [{ id: 'd2', name: 'Q3 Summary.xlsx', pageCount: 5 }],
    expected: {
      hasCitationsWhenNeeded: true,
      numbersAreGrounded: true,
      docNamesMatch: true,
      pageRefsValid: true,
      overallPasses: true,
    },
  },
  {
    id: 'G003',
    description: 'Answer with explicit document name',
    answer: 'From "Budget Report.pdf", the allocated budget is $500K for Q4.',
    chunks: [
      {
        id: 'c3',
        documentId: 'd3',
        documentName: 'Budget Report.pdf',
        content: 'Q4 allocated budget: $500K. Contingency: $50K.',
        numbers: ['$500K', '$50K'],
      },
    ],
    availableDocs: [{ id: 'd3', name: 'Budget Report.pdf', pageCount: 3 }],
    expected: {
      hasCitationsWhenNeeded: true,
      numbersAreGrounded: true,
      docNamesMatch: true,
      pageRefsValid: true,
      overallPasses: true,
    },
  },

  // BAD CASES - grounding issues
  {
    id: 'G004',
    description: 'Ungrounded number (hallucinated)',
    answer: 'The revenue was $5.7M and profit was $2.1M.',
    chunks: [
      {
        id: 'c4',
        documentId: 'd4',
        documentName: 'Report.pdf',
        content: 'Revenue reached $3.2M. Expenses: $2.4M.',
        numbers: ['$3.2M', '$2.4M'],
      },
    ],
    availableDocs: [{ id: 'd4', name: 'Report.pdf', pageCount: 5 }],
    expected: {
      hasCitationsWhenNeeded: false,
      numbersAreGrounded: false, // FAILS - $5.7M and $2.1M not in chunks
      docNamesMatch: true,
      pageRefsValid: true,
      overallPasses: false,
    },
  },
  {
    id: 'G005',
    description: 'Non-existent document reference',
    answer: 'According to "Quarterly Analysis.docx", the growth rate was 18%.',
    chunks: [
      {
        id: 'c5',
        documentId: 'd5',
        documentName: 'Annual Report.pdf',
        content: 'Growth rate: 18%. Market share: 12%.',
        numbers: ['18%', '12%'],
      },
    ],
    availableDocs: [{ id: 'd5', name: 'Annual Report.pdf', pageCount: 20 }],
    expected: {
      hasCitationsWhenNeeded: true,
      numbersAreGrounded: true,
      docNamesMatch: false, // FAILS - "Quarterly Analysis.docx" doesn't exist
      pageRefsValid: true,
      overallPasses: false,
    },
  },
  {
    id: 'G006',
    description: 'No citation for factual claims',
    answer: 'Revenue was $4.5M, expenses $3.1M, and profit margin 31%.',
    chunks: [
      {
        id: 'c6',
        documentId: 'd6',
        documentName: 'Financial Summary.pdf',
        content: 'Revenue: $4.5M. Expenses: $3.1M. Profit margin: 31%.',
        pageNumber: 2,
        numbers: ['$4.5M', '$3.1M', '31%'],
      },
    ],
    availableDocs: [{ id: 'd6', name: 'Financial Summary.pdf', pageCount: 10 }],
    expected: {
      hasCitationsWhenNeeded: false, // FAILS - no citation/attribution
      numbersAreGrounded: true,
      docNamesMatch: true,
      pageRefsValid: true,
      overallPasses: false,
    },
  },
  {
    id: 'G007',
    description: 'Invalid page reference',
    answer: 'On page 9999 of the document, it shows revenue of $2M.',
    chunks: [
      {
        id: 'c7',
        documentId: 'd7',
        documentName: 'Report.pdf',
        content: 'Revenue: $2M.',
        pageNumber: 1,
        numbers: ['$2M'],
      },
    ],
    availableDocs: [{ id: 'd7', name: 'Report.pdf', pageCount: 5 }],
    expected: {
      hasCitationsWhenNeeded: true,
      numbersAreGrounded: true,
      docNamesMatch: true,
      pageRefsValid: false, // FAILS - page 9999 is invalid
      overallPasses: false,
    },
  },
  {
    id: 'G008',
    description: 'Mixed grounded and ungrounded numbers',
    answer: 'Revenue was $2.5M (correct) but also mentions $99M profit (hallucinated).',
    chunks: [
      {
        id: 'c8',
        documentId: 'd8',
        documentName: 'Data.pdf',
        content: 'Total revenue: $2.5M. Net profit: $400K.',
        numbers: ['$2.5M', '$400K'],
      },
    ],
    availableDocs: [{ id: 'd8', name: 'Data.pdf', pageCount: 3 }],
    expected: {
      hasCitationsWhenNeeded: false,
      numbersAreGrounded: false, // FAILS - $99M is hallucinated
      docNamesMatch: true,
      pageRefsValid: true,
      overallPasses: false,
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

function mutateNumbers(text: string, factor: number): string {
  return text.replace(/\$?([\d,]+(?:\.\d+)?)\s*([KMB%])?/gi, (match, num, suffix) => {
    const value = parseFloat(num.replace(/,/g, ''));
    const mutated = value * factor;
    const formatted = mutated.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return `$${formatted}${suffix || ''}`;
  });
}

function mutateDocNames(text: string): string {
  const replacements: Record<string, string> = {
    'Report': 'Analysis',
    'Summary': 'Overview',
    'Financial': 'Fiscal',
    'Annual': 'Yearly',
    'Quarterly': 'Q3',
    '.pdf': '.docx',
    '.xlsx': '.csv',
  };

  let result = text;
  for (const [from, to] of Object.entries(replacements)) {
    if (Math.random() < 0.3) {
      result = result.replace(new RegExp(from, 'gi'), to);
    }
  }
  return result;
}

function mutatePageRefs(text: string): string {
  return text.replace(/\bpage\s*(\d+)/gi, (match, pageNum) => {
    const mutated = Math.random() < 0.5 ? parseInt(pageNum) * 100 : parseInt(pageNum) + 1000;
    return `page ${mutated}`;
  });
}

function generateCitationMutation(seed: CitationTestCase, index: number): CitationTestCase {
  const mutations = [
    // Mutation 1: Change numbers (breaks grounding)
    () => ({
      ...seed,
      id: `${seed.id}_M${index}`,
      description: `${seed.description} (mutated numbers)`,
      answer: mutateNumbers(seed.answer, 1.5 + Math.random()),
      expected: {
        ...seed.expected,
        numbersAreGrounded: false,
        overallPasses: false,
      },
    }),
    // Mutation 2: Change doc names (breaks doc matching)
    () => ({
      ...seed,
      id: `${seed.id}_M${index}`,
      description: `${seed.description} (mutated doc names)`,
      answer: mutateDocNames(seed.answer),
      expected: {
        ...seed.expected,
        docNamesMatch: false,
        overallPasses: false,
      },
    }),
    // Mutation 3: Change page refs (breaks page validation)
    () => ({
      ...seed,
      id: `${seed.id}_M${index}`,
      description: `${seed.description} (mutated page refs)`,
      answer: mutatePageRefs(seed.answer),
      expected: {
        ...seed.expected,
        pageRefsValid: false,
        overallPasses: false,
      },
    }),
    // Mutation 4: Keep original (sanity check)
    () => ({
      ...seed,
      id: `${seed.id}_M${index}`,
      description: `${seed.description} (unchanged)`,
    }),
  ];

  const mutation = mutations[index % mutations.length];
  return mutation();
}

function generateCitationMutations(seeds: CitationTestCase[], count: number): CitationTestCase[] {
  const mutations: CitationTestCase[] = [];
  let generated = 0;

  while (generated < count) {
    for (const seed of seeds) {
      if (generated >= count) break;
      mutations.push(generateCitationMutation(seed, generated));
      generated++;
    }
  }

  return mutations;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

interface CitationTestResult {
  id: string;
  passed: boolean;
  checks: {
    citationsExist: { passed: boolean; expected: boolean };
    numbersGrounded: { passed: boolean; expected: boolean };
    docNamesMatch: { passed: boolean; expected: boolean };
    pageRefsValid: { passed: boolean; expected: boolean };
  };
}

function runCitationTest(test: CitationTestCase): CitationTestResult {
  const citationsExist = checkCitationsExist(test.answer, test.chunks);
  const numbersGrounded = checkNumbersGrounded(test.answer, test.chunks);
  const docNamesMatch = checkDocNamesMatch(test.answer, test.availableDocs);
  const pageRefsValid = checkPageRefsValid(test.answer, test.availableDocs);

  const checks = {
    citationsExist: { passed: citationsExist === test.expected.hasCitationsWhenNeeded, expected: test.expected.hasCitationsWhenNeeded },
    numbersGrounded: { passed: numbersGrounded === test.expected.numbersAreGrounded, expected: test.expected.numbersAreGrounded },
    docNamesMatch: { passed: docNamesMatch === test.expected.docNamesMatch, expected: test.expected.docNamesMatch },
    pageRefsValid: { passed: pageRefsValid === test.expected.pageRefsValid, expected: test.expected.pageRefsValid },
  };

  const allPassed = Object.values(checks).every(c => c.passed);

  return {
    id: test.id,
    passed: allPassed,
    checks,
  };
}

function runAllCitationTests(tests: CitationTestCase[]): { passed: number; failed: number; results: CitationTestResult[] } {
  const results: CitationTestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = runCitationTest(test);
    results.push(result);
    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed, results };
}

// ═══════════════════════════════════════════════════════════════════════════
// VITEST TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════

describe('Grounding & Citation Tests', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // STRICT SEED TESTS (must pass 100%)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('[STRICT] Seed Tests', () => {
    if (!testConfig.strict) {
      it.skip('Strict tests skipped (TEST_MODE !== strict)', () => {});
      return;
    }

    for (const test of SEED_TESTS) {
      it(`${test.id}: ${test.description}`, () => {
        const result = runCitationTest(test);

        if (!result.passed) {
          console.error(`[STRICT FAIL] ${test.id}:`);
          for (const [check, { passed, expected }] of Object.entries(result.checks)) {
            if (!passed) {
              console.error(`  - ${check}: expected ${expected}, got ${!expected}`);
            }
          }
        }

        globalStats.recordStrictResult(result.passed);
        expect(result.passed).toBe(true);
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LENIENT MUTATION TESTS (90%+ pass rate)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('[LENIENT] Mutation Tests', () => {
    if (!testConfig.lenient) {
      it.skip('Lenient tests skipped (TEST_MODE !== lenient)', () => {});
      return;
    }

    const MUTATION_COUNT = 5000;
    const BATCH_SIZE = 500;
    const mutations = generateCitationMutations(SEED_TESTS, MUTATION_COUNT);
    const batches = Math.ceil(mutations.length / BATCH_SIZE);

    let totalPassed = 0;
    let totalFailed = 0;
    const failures: { id: string; checks: Record<string, boolean> }[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, mutations.length);

      describe(`Batch ${batch + 1}/${batches} (${start + 1}-${end})`, () => {
        it(`should pass ≥${(testConfig.lenientPassThreshold * 100).toFixed(0)}% of tests`, () => {
          let batchPassed = 0;
          let batchFailed = 0;

          for (let i = start; i < end; i++) {
            const result = runCitationTest(mutations[i]);

            if (result.passed) {
              batchPassed++;
              totalPassed++;
            } else {
              batchFailed++;
              totalFailed++;
              if (failures.length < 20) {
                failures.push({
                  id: mutations[i].id,
                  checks: Object.fromEntries(
                    Object.entries(result.checks).map(([k, v]) => [k, v.passed])
                  ),
                });
              }
            }

            globalStats.recordLenientResult(result.passed);
          }

          const batchPassRate = batchPassed / (end - start);
          expect(batchPassRate).toBeGreaterThanOrEqual(testConfig.lenientPassThreshold * 0.95);
        });
      });
    }

    afterAll(() => {
      const passRate = totalPassed / (totalPassed + totalFailed);
      console.log(`\n[LENIENT] Grounding Citation Mutation Results:`);
      console.log(`  Total: ${totalPassed + totalFailed}`);
      console.log(`  Passed: ${totalPassed} (${(passRate * 100).toFixed(1)}%)`);
      console.log(`  Failed: ${totalFailed}`);
      console.log(`  Threshold: ${(testConfig.lenientPassThreshold * 100).toFixed(1)}%`);

      if (testConfig.logLenientFailures && failures.length > 0) {
        console.log(`\n  Sample failures:`);
        for (const f of failures.slice(0, 5)) {
          console.log(`    - ${f.id}: ${JSON.stringify(f.checks)}`);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIT TESTS FOR VALIDATION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Validation Functions', () => {
    describe('extractCitations', () => {
      it('should extract [[DOC_N]] markers', () => {
        const citations = extractCitations('According to [[DOC_1]] and [[DOC_2_P5]]');
        expect(citations).toHaveLength(2);
        expect(citations[0].type).toBe('doc_marker');
      });

      it('should extract numbered citations [N]', () => {
        const citations = extractCitations('The revenue was $1M [1] and expenses $500K [2].');
        const numbered = citations.filter(c => c.type === 'numbered');
        expect(numbered).toHaveLength(2);
      });

      it('should extract document name references', () => {
        const citations = extractCitations('According to "Report.pdf", the value is correct.');
        const docRefs = citations.filter(c => c.type === 'doc_name');
        expect(docRefs.length).toBeGreaterThan(0);
      });
    });

    describe('extractNumbers', () => {
      it('should extract currency amounts', () => {
        const numbers = extractNumbers('Revenue was $1.5M and costs were €500K.');
        expect(numbers.some(n => n.includes('1.5M') || n.includes('1.5'))).toBe(true);
        expect(numbers.some(n => n.includes('500K') || n.includes('500'))).toBe(true);
      });

      it('should extract percentages', () => {
        const numbers = extractNumbers('Growth was 25% and margin 18.5%.');
        expect(numbers).toContain('25%');
        expect(numbers).toContain('18.5%');
      });

      it('should extract large plain numbers', () => {
        const numbers = extractNumbers('Total units: 1,234,567 items.');
        expect(numbers).toContain('1,234,567');
      });
    });

    describe('checkNumbersGrounded', () => {
      it('should pass when all numbers are in chunks', () => {
        const chunks: ChunkInfo[] = [{
          id: 'c1',
          documentId: 'd1',
          documentName: 'Report.pdf',
          content: 'Revenue: $2.5M. Profit: $500K.',
          numbers: ['$2.5M', '$500K'],
        }];
        expect(checkNumbersGrounded('Revenue was $2.5M and profit $500K.', chunks)).toBe(true);
      });

      it('should fail when numbers are hallucinated', () => {
        const chunks: ChunkInfo[] = [{
          id: 'c1',
          documentId: 'd1',
          documentName: 'Report.pdf',
          content: 'Revenue: $1M.',
          numbers: ['$1M'],
        }];
        expect(checkNumbersGrounded('Revenue was $99M.', chunks)).toBe(false);
      });
    });

    describe('checkDocNamesMatch', () => {
      const docs = [
        { id: 'd1', name: 'Financial Report 2024.pdf' },
        { id: 'd2', name: 'Budget Summary.xlsx' },
      ];

      it('should pass for exact matches', () => {
        expect(checkDocNamesMatch('According to "Financial Report 2024.pdf"', docs)).toBe(true);
      });

      it('should fail for non-existent documents', () => {
        expect(checkDocNamesMatch('According to "NonExistent.pdf"', docs)).toBe(false);
      });
    });

    describe('checkPageRefsValid', () => {
      const docs = [{ id: 'd1', name: 'Report.pdf', pageCount: 10 }];

      it('should pass for reasonable page numbers', () => {
        expect(checkPageRefsValid('See page 5 for details.', docs)).toBe(true);
      });

      it('should fail for unreasonable page numbers', () => {
        expect(checkPageRefsValid('See page 9999 for details.', docs)).toBe(false);
      });
    });
  });
});

// Export for external use
export {
  SEED_TESTS as GROUNDING_SEED_TESTS,
  generateCitationMutations,
  runCitationTest,
  runAllCitationTests,
  checkCitationsExist,
  checkNumbersGrounded,
  checkDocNamesMatch,
  checkPageRefsValid,
  extractCitations,
  extractNumbers,
};
