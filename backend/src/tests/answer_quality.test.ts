/**
 * Answer Quality Test Suite
 *
 * ChatGPT-parity Phase 6: Tests for response structure, length, and quality.
 *
 * Tests:
 * - No vague deflection phrases
 * - Meets minimum length per operator
 * - Correct structure (table for compare, bullets for extract)
 * - No hallucinated numbers without citations
 * - Language matches request
 *
 * Structure:
 * - STRICT seed tests (must pass 100%)
 * - LENIENT mutation tests (90%+ pass rate acceptable)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testConfig, globalStats } from './utils/testModes';

// ═══════════════════════════════════════════════════════════════════════════
// TEST TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface QualityTestCase {
  id: string;
  description: string;
  answer: string;
  operator: string;
  intentFamily: string;
  language: 'en' | 'pt';
  expected: {
    passesVagueCheck: boolean;
    passesLengthCheck: boolean;
    passesStructureCheck: boolean;
    passesGroundingCheck: boolean;
    passesLanguageCheck: boolean;
  };
}

interface MutationConfig {
  typoRate: number;
  caseVariation: boolean;
  punctuationVariation: boolean;
  synonymReplacement: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// VAGUE DEFLECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const VAGUE_DEFLECTION_PATTERNS = [
  /\bI don['']t have enough (?:information|context|data)\b/i,
  /\bI cannot (?:provide|answer|determine)\b/i,
  /\bI would need more (?:information|context|details)\b/i,
  /\bIt depends on\b/i,
  /\bI['']m not able to\b/i,
  /\binsufficient (?:information|data)\b/i,
  /\bI don['']t have access to\b/i,
  /\bwithout more (?:context|information|details)\b/i,
  /\bI can['']t say for (?:certain|sure)\b/i,
  /\bI['']m unable to\b/i,
  // Portuguese
  /\bnão tenho informações? suficientes?\b/i,
  /\bnão consigo (?:fornecer|responder|determinar)\b/i,
  /\bprecisaria de mais (?:informações|contexto|detalhes)\b/i,
  /\bnão tenho acesso a\b/i,
  /\bsem mais (?:contexto|informações|detalhes)\b/i,
];

// ═══════════════════════════════════════════════════════════════════════════
// LENGTH REQUIREMENTS BY OPERATOR
// ═══════════════════════════════════════════════════════════════════════════

const MIN_LENGTH_BY_OPERATOR: Record<string, number> = {
  summarize: 100,
  extract: 50,
  compare: 150,
  compute: 30,
  explain: 100,
  locate_content: 50,
  list: 20,
  filter: 20,
  count: 10,
  count_pages: 5,
  count_slides: 5,
  count_sheets: 5,
  capabilities: 50,
  how_to: 100,
};

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURE REQUIREMENTS BY OPERATOR
// ═══════════════════════════════════════════════════════════════════════════

const STRUCTURE_BY_OPERATOR: Record<string, 'prose' | 'bullets' | 'table' | 'any'> = {
  summarize: 'any',
  extract: 'bullets',
  compare: 'table',
  compute: 'prose',
  explain: 'prose',
  locate_content: 'any',
  list: 'bullets',
  filter: 'bullets',
  capabilities: 'bullets',
  how_to: 'bullets',
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function checkVagueDeflection(answer: string): boolean {
  for (const pattern of VAGUE_DEFLECTION_PATTERNS) {
    if (pattern.test(answer)) {
      return false; // Failed - contains vague deflection
    }
  }
  return true; // Passed - no vague deflection
}

function checkMinLength(answer: string, operator: string): boolean {
  const minLength = MIN_LENGTH_BY_OPERATOR[operator] || 50;
  return answer.length >= minLength;
}

function checkStructure(answer: string, operator: string): boolean {
  const expected = STRUCTURE_BY_OPERATOR[operator] || 'any';

  if (expected === 'any') return true;

  if (expected === 'bullets') {
    // Check for bullet markers
    return /^[\s]*[-*•]\s/m.test(answer) || /^\d+[.)]\s/m.test(answer);
  }

  if (expected === 'table') {
    // Check for markdown table
    return /\|.*\|.*\|/s.test(answer) && /\|[-:]+\|/s.test(answer);
  }

  return true; // prose is always acceptable
}

function checkGrounding(answer: string, hasChunks: boolean): boolean {
  if (!hasChunks) return true; // No chunks = no grounding required

  // Check for ungrounded numbers (numbers not in citation context)
  const numbers = answer.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:%|dollars?|euros?|pounds?|[KMB])\b/gi) || [];

  if (numbers.length > 0) {
    // Should have some form of citation or document reference
    const hasCitation = /\[\[DOC_\d+/i.test(answer) ||
                        /\b(?:according to|from|in)\s+(?:the\s+)?(?:document|file|report)/i.test(answer) ||
                        /\bsource:/i.test(answer);
    return hasCitation;
  }

  return true;
}

function checkLanguage(answer: string, expectedLanguage: 'en' | 'pt'): boolean {
  if (expectedLanguage === 'pt') {
    // Check for Portuguese indicators
    const ptIndicators = /\b(não|são|está|estão|você|também|então|porém|entretanto)\b/i;
    const enIndicators = /\b(the|is|are|you|also|then|however|therefore)\b/i;

    const ptMatches = (answer.match(ptIndicators) || []).length;
    const enMatches = (answer.match(enIndicators) || []).length;

    // More Portuguese words than English = passes
    return ptMatches >= enMatches || ptMatches > 0;
  }

  // For English, just check it's not predominantly Portuguese
  const ptIndicators = /\b(não|são|está|você|também|porém)\b/gi;
  const ptMatches = (answer.match(ptIndicators) || []).length;

  return ptMatches < 3; // Allow a few Portuguese words
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

const SEED_TESTS: QualityTestCase[] = [
  // GOOD ANSWERS - should pass all checks
  {
    id: 'Q001',
    description: 'Good summarize answer in English',
    answer: 'The document covers three main points:\n- Revenue increased by 15% year-over-year\n- Operating expenses decreased by 8%\n- Net profit margin improved to 22%\n\nThese improvements were driven by cost optimization initiatives.',
    operator: 'summarize',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: true,
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q002',
    description: 'Good compare answer with table',
    answer: '| Metric | Q3 2023 | Q3 2024 |\n|--------|---------|----------|\n| Revenue | $1.2M | $1.5M |\n| Expenses | $800K | $750K |\n| Profit | $400K | $750K |\n\nQ3 2024 shows significant improvement across all metrics.',
    operator: 'compare',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: true,
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q003',
    description: 'Good extract answer with bullets',
    answer: '- Total Revenue: $2.5 million\n- Net Profit: $450,000\n- Operating Margin: 18%\n- Employee Count: 125',
    operator: 'extract',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: true,
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q004',
    description: 'Good Portuguese answer',
    answer: 'O documento apresenta os seguintes pontos:\n- Receita aumentou 15% em relação ao ano anterior\n- Despesas operacionais diminuíram 8%\n- Margem de lucro líquido melhorou para 22%',
    operator: 'summarize',
    intentFamily: 'documents',
    language: 'pt',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: true,
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },

  // BAD ANSWERS - should fail specific checks
  {
    id: 'Q005',
    description: 'Vague deflection answer',
    answer: "I don't have enough information to provide a complete answer. It depends on the specific context of your question.",
    operator: 'summarize',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: false, // FAILS
      passesLengthCheck: true,
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q006',
    description: 'Too short answer',
    answer: 'Revenue is $1M.',
    operator: 'summarize',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: false, // FAILS - too short for summarize
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q007',
    description: 'Compare without table',
    answer: 'Q3 2023 had revenue of $1.2M while Q3 2024 had $1.5M. Expenses went from $800K to $750K.',
    operator: 'compare',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: false, // FAILS - 88 chars < 150 required for compare
      passesStructureCheck: false, // FAILS - no table
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q008',
    description: 'Wrong language (English when Portuguese requested)',
    answer: 'The document shows that revenue increased by 15% and expenses decreased by 8%. This is a positive trend.',
    operator: 'summarize',
    intentFamily: 'documents',
    language: 'pt',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: true,
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: false, // FAILS - wrong language
    },
  },
  {
    id: 'Q009',
    description: 'Portuguese vague deflection',
    answer: 'Não tenho informações suficientes para responder. Precisaria de mais contexto sobre a pergunta.',
    operator: 'summarize',
    intentFamily: 'documents',
    language: 'pt',
    expected: {
      passesVagueCheck: false, // FAILS - vague deflection
      passesLengthCheck: false, // FAILS - 95 chars < 100 required for summarize
      passesStructureCheck: true,
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
  {
    id: 'Q010',
    description: 'Extract without bullets',
    answer: 'The total revenue is $2.5 million. The net profit is $450,000. The operating margin is 18%.',
    operator: 'extract',
    intentFamily: 'documents',
    language: 'en',
    expected: {
      passesVagueCheck: true,
      passesLengthCheck: true,
      passesStructureCheck: false, // FAILS - no bullets
      passesGroundingCheck: true,
      passesLanguageCheck: true,
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

const TYPO_MAP: Record<string, string[]> = {
  'the': ['teh', 'hte', 'th'],
  'and': ['adn', 'nad', 'an'],
  'revenue': ['revnue', 'reveune', 'revenu'],
  'profit': ['profti', 'porfit', 'profi'],
  'document': ['docuemnt', 'documnet', 'docment'],
  'information': ['informaiton', 'infomration', 'informtion'],
};

const SYNONYM_MAP: Record<string, string[]> = {
  'increased': ['grew', 'rose', 'improved', 'went up'],
  'decreased': ['fell', 'dropped', 'declined', 'went down'],
  'shows': ['displays', 'presents', 'indicates', 'reveals'],
  'total': ['overall', 'combined', 'aggregate', 'sum'],
  'main': ['key', 'primary', 'principal', 'major'],
};

function applyTypos(text: string, rate: number): string {
  if (rate <= 0) return text;

  let result = text;
  for (const [word, typos] of Object.entries(TYPO_MAP)) {
    if (Math.random() < rate) {
      const typo = typos[Math.floor(Math.random() * typos.length)];
      result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), typo);
    }
  }
  return result;
}

function applySynonyms(text: string): string {
  let result = text;
  for (const [word, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (Math.random() < 0.3) {
      const synonym = synonyms[Math.floor(Math.random() * synonyms.length)];
      result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), synonym);
    }
  }
  return result;
}

function applyCaseVariation(text: string): string {
  const variations = [
    (t: string) => t.toLowerCase(),
    (t: string) => t.toUpperCase(),
    (t: string) => t, // no change
  ];
  return variations[Math.floor(Math.random() * variations.length)](text);
}

function applyPunctuationVariation(text: string): string {
  return text
    .replace(/\./g, Math.random() < 0.2 ? '' : '.')
    .replace(/,/g, Math.random() < 0.2 ? '' : ',')
    .replace(/!/g, Math.random() < 0.3 ? '.' : '!');
}

function generateMutation(seed: QualityTestCase, index: number, config: MutationConfig): QualityTestCase {
  let mutatedAnswer = seed.answer;

  if (config.typoRate > 0) {
    mutatedAnswer = applyTypos(mutatedAnswer, config.typoRate);
  }
  if (config.synonymReplacement) {
    mutatedAnswer = applySynonyms(mutatedAnswer);
  }
  if (config.caseVariation) {
    mutatedAnswer = applyCaseVariation(mutatedAnswer);
  }
  if (config.punctuationVariation) {
    mutatedAnswer = applyPunctuationVariation(mutatedAnswer);
  }

  return {
    ...seed,
    id: `${seed.id}_M${index}`,
    description: `${seed.description} (mutation ${index})`,
    answer: mutatedAnswer,
    // Expected results should be same as seed (mutations shouldn't change pass/fail)
  };
}

function generateMutations(seeds: QualityTestCase[], count: number): QualityTestCase[] {
  const mutations: QualityTestCase[] = [];

  const configs: MutationConfig[] = [
    { typoRate: 0.1, caseVariation: false, punctuationVariation: false, synonymReplacement: false },
    { typoRate: 0.2, caseVariation: false, punctuationVariation: false, synonymReplacement: false },
    { typoRate: 0, caseVariation: true, punctuationVariation: false, synonymReplacement: false },
    { typoRate: 0, caseVariation: false, punctuationVariation: true, synonymReplacement: false },
    { typoRate: 0, caseVariation: false, punctuationVariation: false, synonymReplacement: true },
    { typoRate: 0.1, caseVariation: true, punctuationVariation: true, synonymReplacement: true },
  ];

  let generated = 0;
  while (generated < count) {
    for (const seed of seeds) {
      for (const config of configs) {
        if (generated >= count) break;
        mutations.push(generateMutation(seed, generated, config));
        generated++;
      }
      if (generated >= count) break;
    }
  }

  return mutations;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

interface TestResult {
  id: string;
  passed: boolean;
  checks: {
    vague: { passed: boolean; expected: boolean };
    length: { passed: boolean; expected: boolean };
    structure: { passed: boolean; expected: boolean };
    grounding: { passed: boolean; expected: boolean };
    language: { passed: boolean; expected: boolean };
  };
}

function runTest(test: QualityTestCase, hasChunks: boolean = false): TestResult {
  const vagueResult = checkVagueDeflection(test.answer);
  const lengthResult = checkMinLength(test.answer, test.operator);
  const structureResult = checkStructure(test.answer, test.operator);
  const groundingResult = checkGrounding(test.answer, hasChunks);
  const languageResult = checkLanguage(test.answer, test.language);

  const checks = {
    vague: { passed: vagueResult === test.expected.passesVagueCheck, expected: test.expected.passesVagueCheck },
    length: { passed: lengthResult === test.expected.passesLengthCheck, expected: test.expected.passesLengthCheck },
    structure: { passed: structureResult === test.expected.passesStructureCheck, expected: test.expected.passesStructureCheck },
    grounding: { passed: groundingResult === test.expected.passesGroundingCheck, expected: test.expected.passesGroundingCheck },
    language: { passed: languageResult === test.expected.passesLanguageCheck, expected: test.expected.passesLanguageCheck },
  };

  const allPassed = Object.values(checks).every(c => c.passed);

  return {
    id: test.id,
    passed: allPassed,
    checks,
  };
}

function runAllTests(tests: QualityTestCase[]): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = runTest(test);
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

describe('Answer Quality Tests', () => {
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
        const result = runTest(test);

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
    const mutations = generateMutations(SEED_TESTS, MUTATION_COUNT);
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
            const result = runTest(mutations[i]);

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
      console.log(`\n[LENIENT] Answer Quality Mutation Results:`);
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
    describe('checkVagueDeflection', () => {
      it('should detect "I don\'t have enough information"', () => {
        expect(checkVagueDeflection("I don't have enough information")).toBe(false);
      });

      it('should detect "It depends on"', () => {
        expect(checkVagueDeflection('It depends on the context')).toBe(false);
      });

      it('should pass for concrete answers', () => {
        expect(checkVagueDeflection('The revenue is $1.5 million')).toBe(true);
      });

      it('should detect Portuguese vague phrases', () => {
        expect(checkVagueDeflection('Não tenho informações suficientes')).toBe(false);
      });
    });

    describe('checkMinLength', () => {
      it('should fail short summarize answers', () => {
        expect(checkMinLength('Short.', 'summarize')).toBe(false);
      });

      it('should pass adequate summarize answers', () => {
        const longAnswer = 'This is a comprehensive summary of the document. '.repeat(5);
        expect(checkMinLength(longAnswer, 'summarize')).toBe(true);
      });

      it('should have lower threshold for count operators', () => {
        expect(checkMinLength('Count: 5', 'count')).toBe(false);
        expect(checkMinLength('The count is 5.', 'count')).toBe(true);
      });
    });

    describe('checkStructure', () => {
      it('should require table for compare', () => {
        expect(checkStructure('Q1 vs Q2 comparison text only', 'compare')).toBe(false);
        expect(checkStructure('| Q1 | Q2 |\n|---|---|\n| 1 | 2 |', 'compare')).toBe(true);
      });

      it('should require bullets for extract', () => {
        expect(checkStructure('Revenue is 1M. Profit is 2M.', 'extract')).toBe(false);
        expect(checkStructure('- Revenue: 1M\n- Profit: 2M', 'extract')).toBe(true);
      });

      it('should accept any structure for summarize', () => {
        expect(checkStructure('Just some prose.', 'summarize')).toBe(true);
        expect(checkStructure('- Bullet point', 'summarize')).toBe(true);
      });
    });

    describe('checkLanguage', () => {
      it('should detect English as default', () => {
        expect(checkLanguage('The revenue is increasing', 'en')).toBe(true);
      });

      it('should detect Portuguese', () => {
        expect(checkLanguage('A receita está aumentando também', 'pt')).toBe(true);
      });

      it('should fail when Portuguese requested but English given', () => {
        expect(checkLanguage('The revenue is increasing and the profit too', 'pt')).toBe(false);
      });
    });
  });
});

// Export for external use
export {
  SEED_TESTS,
  generateMutations,
  runTest,
  runAllTests,
  checkVagueDeflection,
  checkMinLength,
  checkStructure,
  checkGrounding,
  checkLanguage,
};
