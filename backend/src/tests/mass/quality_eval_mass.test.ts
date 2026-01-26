/**
 * Human-Like Quality Evaluation Mass Test Suite
 *
 * Tests answer quality across three dimensions:
 * - Clarity (readable, no jargon, concise)
 * - Helpfulness (addresses question, actionable)
 * - Structure (organized, appropriate format)
 *
 * Uses rubric-based scoring to approximate human evaluation.
 *
 * Target: >=90% pass rate (70%+ overall score)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateEvalBatch,
  getEvalStats,
  evaluateAnswer,
  EvalScenario,
  EvaluatedAnswer,
  EvalResult,
} from '../generators/qualityEvalGenerator';
import { validateAgainstBaseline } from '../baseline/config_snapshot';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface BatchResults {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  avgScores: {
    clarity: number;
    helpfulness: number;
    structure: number;
    overall: number;
  };
  byType: Record<string, { total: number; passed: number; rate: number; avgScore: number }>;
  failures: EvalResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK ANSWER GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate mock answers based on scenario type.
 * These simulate "good" answers that should pass quality evaluation.
 *
 * TODO: Replace with actual answer generation service for E2E testing.
 */
function mockGenerateAnswer(scenario: EvalScenario): EvaluatedAnswer {
  switch (scenario.queryType) {
    case 'factual': {
      const answers = [
        `Based on ${scenario.contextDocs[0]}, the total revenue for Q3 was $2.5M. This represents a 15% increase from the previous quarter.`,
        `According to ${scenario.contextDocs[0]}, the company has 125 employees across all departments.`,
        `The project deadline is March 15, 2024, as specified in ${scenario.contextDocs[0]}.`,
        `The marketing budget is $500K for 2024, allocated across digital, events, and content initiatives.`,
        `The profit margin is currently at 28%, which exceeds the target of 25%.`,
      ];
      const content = answers[Math.floor(Math.random() * answers.length)];
      return {
        content,
        format: 'prose',
        wordCount: content.split(/\s+/).length,
        sentenceCount: content.split(/[.!?]+/).filter(s => s.trim()).length,
      };
    }

    case 'summary': {
      const content = `Here's a summary of ${scenario.contextDocs[0]}:

The document covers three main areas:
- Financial performance for the quarter
- Key initiatives and their outcomes
- Strategic priorities for next quarter

Overall, the results exceeded expectations with strong growth in all business units.`;
      return {
        content,
        format: 'mixed',
        wordCount: content.split(/\s+/).length,
        sentenceCount: content.split(/[.!?]+/).filter(s => s.trim()).length,
      };
    }

    case 'comparison': {
      const content = `| Metric | ${scenario.contextDocs[0]} | ${scenario.contextDocs[1] || 'Doc 2'} |
|--------|----------|----------|
| Revenue | $2.1M | $2.5M |
| Expenses | $1.4M | $1.6M |
| Profit | $700K | $900K |

Key differences:
- Revenue increased by 19%
- Profit grew by 28%`;
      return {
        content,
        format: 'table',
        wordCount: content.split(/\s+/).length,
        sentenceCount: content.split(/[.!?]+/).filter(s => s.trim()).length,
      };
    }

    case 'how_to': {
      const content = `To complete this task, follow these steps:

1. First, gather the required documents
2. Review the relevant sections
3. Calculate the metrics using the provided formulas
4. Validate the results against benchmarks
5. Document your findings in the standard template

This process typically takes 2-3 hours depending on complexity.`;
      return {
        content,
        format: 'bullets',
        wordCount: content.split(/\s+/).length,
        sentenceCount: content.split(/[.!?]+/).filter(s => s.trim()).length,
      };
    }

    case 'list': {
      const content = `Based on ${scenario.contextDocs[0]}, here are the items:

- Complete quarterly review
- Submit budget proposal
- Schedule stakeholder meetings
- Update project timeline
- Prepare executive summary

Total: 5 items identified.`;
      return {
        content,
        format: 'bullets',
        wordCount: content.split(/\s+/).length,
        sentenceCount: content.split(/[.!?]+/).filter(s => s.trim()).length,
      };
    }

    default:
      return {
        content: 'Unable to generate answer.',
        format: 'prose',
        wordCount: 4,
        sentenceCount: 1,
      };
  }
}

/**
 * Generate mock BAD answers for negative testing.
 */
function mockBadAnswer(scenario: EvalScenario): EvaluatedAnswer {
  const badAnswers = [
    // Too verbose and jargon-filled
    {
      content: `Let me synergize the paradigm shift here and leverage our bandwidth to circle back on this actionable item. When we deep dive into the holistic approach of this quarter's performance metrics vis-a-vis the previous fiscal period, we can clearly see that the implementation of our strategic initiatives has resulted in a net positive outcome that exceeds our initial projections by a significant margin that warrants further discussion in our next alignment session where we can ideate on potential optimization vectors.`,
      format: 'prose' as const,
    },
    // Incomplete and doesn't address question
    {
      content: `The document mentions various things. There are numbers and dates. Some information is`,
      format: 'prose' as const,
    },
    // Wrong format (prose when bullets expected)
    {
      content: `First you need to do the first thing then do the second thing and after that do the third thing and finally do the last thing.`,
      format: 'prose' as const,
    },
  ];

  const bad = badAnswers[Math.floor(Math.random() * badAnswers.length)];
  return {
    ...bad,
    wordCount: bad.content.split(/\s+/).length,
    sentenceCount: bad.content.split(/[.!?]+/).filter(s => s.trim()).length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

function runEvalTest(
  scenario: EvalScenario,
  useBadAnswer: boolean = false
): EvalResult {
  const answer = useBadAnswer
    ? mockBadAnswer(scenario)
    : mockGenerateAnswer(scenario);
  return evaluateAnswer(scenario, answer);
}

function runBatch(scenarios: EvalScenario[]): BatchResults {
  const results: EvalResult[] = [];
  const byType: Record<string, { total: number; passed: number; scores: number[] }> = {};

  for (const scenario of scenarios) {
    const result = runEvalTest(scenario);
    results.push(result);

    // Track by type
    if (!byType[scenario.queryType]) byType[scenario.queryType] = { total: 0, passed: 0, scores: [] };
    byType[scenario.queryType].total++;
    byType[scenario.queryType].scores.push(result.scores.overall);
    if (result.passed) byType[scenario.queryType].passed++;
  }

  const passed = results.filter(r => r.passed).length;

  // Calculate average scores
  const avgScores = {
    clarity: results.reduce((s, r) => s + r.scores.clarity, 0) / results.length,
    helpfulness: results.reduce((s, r) => s + r.scores.helpfulness, 0) / results.length,
    structure: results.reduce((s, r) => s + r.scores.structure, 0) / results.length,
    overall: results.reduce((s, r) => s + r.scores.overall, 0) / results.length,
  };

  // Calculate by type with rates and avg scores
  const byTypeWithRate = Object.fromEntries(
    Object.entries(byType).map(([k, v]) => [k, {
      total: v.total,
      passed: v.passed,
      rate: v.passed / v.total,
      avgScore: v.scores.reduce((a, b) => a + b, 0) / v.scores.length,
    }])
  );

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: passed / results.length,
    avgScores,
    byType: byTypeWithRate,
    failures: results.filter(r => !r.passed).slice(0, 50),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VITEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('Human-Like Quality Evaluation Mass Tests', () => {
  let allScenarios: EvalScenario[];
  let results: BatchResults;

  beforeAll(async () => {
    // Validate baseline first
    const baselineCheck = validateAgainstBaseline(process.cwd());
    if (!baselineCheck.valid) {
      console.warn(`⚠️  Baseline warning: ${baselineCheck.message}`);
    }

    // Generate scenarios
    console.log('\n[Quality Eval Mass Test] Generating scenarios...');
    allScenarios = generateEvalBatch({ count: 1000 });

    const stats = getEvalStats(allScenarios);
    console.log(`  Generated: ${stats.total} scenarios`);
    console.log(`  By Type:`, stats.byType);
    console.log(`  By Expected Format:`, stats.byFormat);

    // Run all tests
    console.log('\n[Quality Eval Mass Test] Running evaluation...');
    results = runBatch(allScenarios);
  }, 60000);

  afterAll(() => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' QUALITY EVALUATION MASS TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total Scenarios: ${results.total}`);
    console.log(`  Passed (>=70%): ${results.passed} (${(results.passRate * 100).toFixed(2)}%)`);
    console.log(`  Failed: ${results.failed}`);
    console.log('');
    console.log('  Average Scores:');
    console.log(`    Clarity: ${results.avgScores.clarity.toFixed(1)}%`);
    console.log(`    Helpfulness: ${results.avgScores.helpfulness.toFixed(1)}%`);
    console.log(`    Structure: ${results.avgScores.structure.toFixed(1)}%`);
    console.log(`    Overall: ${results.avgScores.overall.toFixed(1)}%`);
    console.log('');
    console.log('  By Query Type:');
    for (const [type, data] of Object.entries(results.byType)) {
      console.log(`    ${type}: ${data.passed}/${data.total} (${(data.rate * 100).toFixed(1)}%) avg=${data.avgScore.toFixed(1)}%`);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
  });

  describe('Overall Quality', () => {
    it('should achieve >=90% pass rate overall', () => {
      expect(results.passRate).toBeGreaterThanOrEqual(0.90);
    });

    it('should achieve >=70% average overall score', () => {
      expect(results.avgScores.overall).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Clarity Dimension', () => {
    it('should achieve >=70% average clarity score', () => {
      expect(results.avgScores.clarity).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Helpfulness Dimension', () => {
    it('should achieve >=70% average helpfulness score', () => {
      expect(results.avgScores.helpfulness).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Structure Dimension', () => {
    it('should achieve >=70% average structure score', () => {
      expect(results.avgScores.structure).toBeGreaterThanOrEqual(70);
    });
  });

  describe('Query Type Coverage', () => {
    const QUERY_TYPES = ['factual', 'summary', 'comparison', 'how_to', 'list'];

    for (const type of QUERY_TYPES) {
      it(`should achieve >=85% pass rate for ${type} queries`, () => {
        const typeResults = results.byType[type];
        if (typeResults && typeResults.total > 50) {
          expect(typeResults.rate).toBeGreaterThanOrEqual(0.85);
        }
      });
    }
  });

  describe('Negative Tests (Bad Answers)', () => {
    it('should produce lower scores for bad answers than good answers', () => {
      const sampleScenarios = allScenarios.slice(0, 20);
      let goodScoreSum = 0;
      let badScoreSum = 0;

      for (const scenario of sampleScenarios) {
        const goodResult = runEvalTest(scenario, false);
        const badResult = runEvalTest(scenario, true);
        goodScoreSum += goodResult.scores.overall;
        badScoreSum += badResult.scores.overall;
      }

      const avgGoodScore = goodScoreSum / sampleScenarios.length;
      const avgBadScore = badScoreSum / sampleScenarios.length;

      // Bad answers should score at least 10% lower than good answers
      expect(avgGoodScore - avgBadScore).toBeGreaterThan(10);
    });
  });

  describe('Sample Failures Analysis', () => {
    it('should log sample failures for debugging', () => {
      if (results.failures.length > 0) {
        console.log('\n  Sample Failures (first 10):');
        for (const failure of results.failures.slice(0, 10)) {
          console.log(`    Query: "${failure.scenario.query}"`);
          console.log(`    Type: ${failure.scenario.queryType}`);
          console.log(`    Score: ${failure.scores.overall.toFixed(1)}%`);
          console.log(`    Feedback: [${failure.feedback.join(', ')}]`);
          console.log('');
        }
      }
      expect(true).toBe(true);
    });
  });
});
