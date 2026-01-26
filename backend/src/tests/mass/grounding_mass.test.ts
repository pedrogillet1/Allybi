/**
 * Answer Grounding Mass Test Suite
 *
 * Tests that answers are properly grounded in source material:
 * - Citations exist when required
 * - Numeric values match sources
 * - No false "not found" claims
 *
 * Uses simulated answers for fast testing.
 * Replace with actual answer service integration for E2E testing.
 *
 * Target: >=95% grounding accuracy
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateGroundingBatch,
  getGroundingStats,
  validateGroundingResult,
  GroundingScenario,
  GroundedAnswer,
  GroundingValidationResult,
} from '../generators/groundingScenarioGenerator';
import { validateAgainstBaseline } from '../baseline/config_snapshot';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface BatchResults {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  byType: Record<string, { total: number; passed: number; rate: number }>;
  failures: GroundingValidationResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK ANSWER GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulates answer generation based on scenario type.
 * Generates "correct" answers that should pass validation.
 *
 * TODO: Replace with actual answer generation service for E2E testing:
 * import { KodaAnswerEngineV3Service } from '../../services/core/kodaAnswerEngineV3.service';
 */
function mockGenerateAnswer(scenario: GroundingScenario): GroundedAnswer {
  const exp = scenario.expectations;
  const docs = scenario.sourceDocuments;

  switch (scenario.type) {
    case 'citation_required':
    case 'numeric_grounding': {
      // Generate answer with citations and correct numbers
      const doc = docs[0];
      let content = `Based on ${doc.name}, `;

      if (exp.numericValues && exp.numericValues.length > 0) {
        const values = exp.numericValues.map(v => {
          if (v.value >= 1000000) return `$${v.value / 1000000}M`;
          if (v.value >= 1000) return `$${v.value / 1000}K`;
          return v.value.toString();
        });
        content += `the values are: ${values.join(', ')}.`;
      } else {
        content += 'the requested information has been found.';
      }

      return {
        content,
        citations: [doc.name],
        containsNumeric: !!exp.numericValues,
        saysNotFound: false,
      };
    }

    case 'data_exists': {
      // Confirm data exists without saying "not found"
      const doc = docs[0];
      return {
        content: `Yes, the ${scenario.query.replace(/\?/g, '')} is available in ${doc.name}. The document contains the relevant information.`,
        citations: [doc.name],
        containsNumeric: false,
        saysNotFound: false,
      };
    }

    case 'data_missing': {
      // Correctly report data as not found
      return {
        content: 'I couldn\'t find that information in the available documents. The requested data does not appear to be present.',
        citations: [],
        containsNumeric: false,
        saysNotFound: true,
      };
    }

    case 'partial_data': {
      // Report what was found and what wasn't
      const doc = docs[0];
      let content = `Based on ${doc.name}, I found some of the requested information. `;
      if (exp.numericValues && exp.numericValues.length > 0) {
        const value = exp.numericValues[0];
        if (value.value >= 1000000) {
          content += `The ${value.field} is $${value.value / 1000000}M. `;
        } else {
          content += `The ${value.field} is ${value.value}. `;
        }
      }
      content += 'However, some requested data was not available in the documents.';

      return {
        content,
        citations: [doc.name],
        containsNumeric: !!exp.numericValues,
        saysNotFound: false, // Partial not found is OK
      };
    }

    default:
      return {
        content: 'Unable to process the request.',
        citations: [],
        containsNumeric: false,
        saysNotFound: false,
      };
  }
}

/**
 * Simulates BAD answers for negative testing.
 */
function mockBadAnswer(scenario: GroundingScenario): GroundedAnswer {
  switch (scenario.type) {
    case 'citation_required':
    case 'numeric_grounding':
      // Missing citation and wrong numbers
      return {
        content: 'The revenue is approximately $5M based on my analysis.',
        citations: [], // Missing!
        containsNumeric: true,
        saysNotFound: false,
      };

    case 'data_exists':
      // Incorrectly says not found
      return {
        content: 'I couldn\'t find any information about that in your documents.',
        citations: [],
        containsNumeric: false,
        saysNotFound: true, // Wrong!
      };

    case 'data_missing':
      // Claims to have data that doesn't exist
      return {
        content: 'The customer satisfaction score is 95% based on the financial report.',
        citations: ['Q3_Financial_Report.pdf'],
        containsNumeric: true,
        saysNotFound: false, // Should say not found!
      };

    default:
      return {
        content: 'Error generating answer.',
        citations: [],
        containsNumeric: false,
        saysNotFound: false,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

function runGroundingTest(
  scenario: GroundingScenario,
  useBadAnswer: boolean = false
): GroundingValidationResult {
  const answer = useBadAnswer
    ? mockBadAnswer(scenario)
    : mockGenerateAnswer(scenario);
  return validateGroundingResult(scenario, answer);
}

function runBatch(scenarios: GroundingScenario[]): BatchResults {
  const results: GroundingValidationResult[] = [];
  const byType: Record<string, { total: number; passed: number }> = {};

  for (const scenario of scenarios) {
    const result = runGroundingTest(scenario);
    results.push(result);

    // Track by type
    if (!byType[scenario.type]) byType[scenario.type] = { total: 0, passed: 0 };
    byType[scenario.type].total++;
    if (result.passed) byType[scenario.type].passed++;
  }

  const passed = results.filter(r => r.passed).length;

  // Calculate rates
  const byTypeWithRate = Object.fromEntries(
    Object.entries(byType).map(([k, v]) => [k, { ...v, rate: v.passed / v.total }])
  );

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: passed / results.length,
    byType: byTypeWithRate,
    failures: results.filter(r => !r.passed).slice(0, 50),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VITEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('Answer Grounding Mass Tests', () => {
  let allScenarios: GroundingScenario[];
  let results: BatchResults;

  beforeAll(async () => {
    // Validate baseline first
    const baselineCheck = validateAgainstBaseline(process.cwd());
    if (!baselineCheck.valid) {
      console.warn(`⚠️  Baseline warning: ${baselineCheck.message}`);
    }

    // Generate scenarios
    console.log('\n[Grounding Mass Test] Generating scenarios...');
    allScenarios = generateGroundingBatch({ count: 5000 });

    const stats = getGroundingStats(allScenarios);
    console.log(`  Generated: ${stats.total} scenarios`);
    console.log(`  By Type:`, stats.byType);

    // Run all tests
    console.log('\n[Grounding Mass Test] Running validation...');
    results = runBatch(allScenarios);
  }, 60000);

  afterAll(() => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' ANSWER GROUNDING MASS TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total Scenarios: ${results.total}`);
    console.log(`  Passed: ${results.passed} (${(results.passRate * 100).toFixed(2)}%)`);
    console.log(`  Failed: ${results.failed}`);
    console.log('');
    console.log('  By Scenario Type:');
    for (const [type, data] of Object.entries(results.byType)) {
      console.log(`    ${type}: ${data.passed}/${data.total} (${(data.rate * 100).toFixed(1)}%)`);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
  });

  describe('Overall Pass Rate', () => {
    it('should achieve >=95% pass rate overall', () => {
      expect(results.passRate).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('Citation Requirements', () => {
    it('should achieve >=95% pass rate for citation required scenarios', () => {
      const citationRequired = results.byType['citation_required'];
      if (citationRequired && citationRequired.total > 100) {
        expect(citationRequired.rate).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should always include citations when required', () => {
      const citationScenarios = allScenarios.filter(s => s.type === 'citation_required');
      for (const scenario of citationScenarios.slice(0, 100)) {
        const result = runGroundingTest(scenario);
        expect(result.answer.citations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Numeric Grounding', () => {
    it('should achieve >=95% pass rate for numeric grounding scenarios', () => {
      const numericGrounding = results.byType['numeric_grounding'];
      if (numericGrounding && numericGrounding.total > 100) {
        expect(numericGrounding.rate).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should include correct numeric values in answers', () => {
      const numericScenarios = allScenarios.filter(s => s.type === 'numeric_grounding');
      for (const scenario of numericScenarios.slice(0, 50)) {
        const result = runGroundingTest(scenario);
        expect(result.passed).toBe(true);
      }
    });
  });

  describe('No False Not Found', () => {
    it('should achieve >=95% pass rate for data exists scenarios', () => {
      const dataExists = results.byType['data_exists'];
      if (dataExists && dataExists.total > 100) {
        expect(dataExists.rate).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should not say "not found" when data exists', () => {
      const existsScenarios = allScenarios.filter(s => s.type === 'data_exists');
      for (const scenario of existsScenarios.slice(0, 100)) {
        const result = runGroundingTest(scenario);
        expect(result.answer.saysNotFound).toBe(false);
      }
    });
  });

  describe('Correct Not Found', () => {
    it('should correctly report "not found" when data is missing', () => {
      const missingScenarios = allScenarios.filter(s => s.type === 'data_missing');
      for (const scenario of missingScenarios.slice(0, 50)) {
        const result = runGroundingTest(scenario);
        expect(result.answer.saysNotFound).toBe(true);
      }
    });
  });

  describe('Negative Tests (Bad Answers)', () => {
    it('should correctly flag missing citations', () => {
      const citationScenarios = allScenarios.filter(s => s.type === 'citation_required').slice(0, 10);
      for (const scenario of citationScenarios) {
        const result = runGroundingTest(scenario, true);
        expect(result.passed).toBe(false);
        expect(result.failures.some(f => f.includes('citation'))).toBe(true);
      }
    });

    it('should correctly flag false "not found" claims', () => {
      const existsScenarios = allScenarios.filter(s => s.type === 'data_exists').slice(0, 10);
      for (const scenario of existsScenarios) {
        const result = runGroundingTest(scenario, true);
        expect(result.passed).toBe(false);
        expect(result.failures.some(f => f.includes('not found'))).toBe(true);
      }
    });
  });

  describe('Sample Failures Analysis', () => {
    it('should log sample failures for debugging', () => {
      if (results.failures.length > 0) {
        console.log('\n  Sample Failures (first 10):');
        for (const failure of results.failures.slice(0, 10)) {
          console.log(`    Query: "${failure.scenario.query}"`);
          console.log(`    Type: ${failure.scenario.type}`);
          console.log(`    Failures: [${failure.failures.join(', ')}]`);
          console.log(`    Answer: "${failure.answer.content.slice(0, 100)}..."`);
          console.log('');
        }
      }
      expect(true).toBe(true);
    });
  });
});
