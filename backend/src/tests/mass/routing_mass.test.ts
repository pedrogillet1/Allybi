/**
 * Routing Mass Test Suite
 *
 * Tests routing accuracy on 20k+ generated queries using the REAL router.
 *
 * Scoring:
 * - Exact match: intentFamily + operator + scopeMode all correct
 * - Partial match: some correct
 * - Miss: all wrong
 *
 * Target: >=95% exact match on clean queries, >=90% under mutations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateBatch,
  getGenerationStats,
  GeneratedQuery,
  GenerationConfig,
} from '../generators/queryGenerator';
import { validateAgainstBaseline } from '../baseline/config_snapshot';
import { testConfig } from '../utils/testModes';
import { router, RoutingRequest, RoutingResult as RealRoutingResult } from '../../services/core/router.service';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface RoutingResult {
  intentFamily: string;
  operator: string;
  scopeMode: string;
  confidence: number;
}

interface TestResult {
  query: GeneratedQuery;
  actual: RoutingResult | null;
  exactMatch: boolean;
  partialMatch: {
    intentFamily: boolean;
    operator: boolean;
    scopeMode: boolean;
  };
  error?: string;
}

interface BatchResults {
  total: number;
  exactMatches: number;
  partialMatches: number;
  misses: number;
  errors: number;
  exactMatchRate: number;
  byMutation: Record<string, { total: number; exact: number; rate: number }>;
  byIntentFamily: Record<string, { total: number; exact: number; rate: number }>;
  failures: TestResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL ROUTER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulated document context for routing tests
 * The router needs to know if user has documents to make proper routing decisions
 */
const MOCK_AVAILABLE_DOCS = [
  { id: 'doc1', filename: 'financial_report.pdf', mimeType: 'application/pdf' },
  { id: 'doc2', filename: 'project_plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'doc3', filename: 'budget_2024.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'doc4', filename: 'presentation.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

/**
 * Map docScope.mode from real router to test expected format
 */
function mapScopeMode(mode: string): string {
  const mapping: Record<string, string> = {
    'none': 'none',
    'single_doc': 'single',
    'multi_doc': 'multi',
    'workspace': 'all',
  };
  return mapping[mode] || mode;
}

/**
 * Map operator names for compatibility (some operators have different names)
 */
function mapOperator(operator: string): string {
  const mapping: Record<string, string> = {
    'locate_file': 'locate',
    'locate_content': 'locate_content',
  };
  return mapping[operator] || operator;
}

/**
 * Routes a query using the REAL router service
 */
async function routeQuery(query: string): Promise<RoutingResult> {
  const request: RoutingRequest = {
    text: query,
    userId: 'test-user',
    conversationId: 'test-conv',
    hasDocuments: true,
    availableDocs: MOCK_AVAILABLE_DOCS,
  };

  try {
    const result = await router.route(request);

    return {
      intentFamily: result.intentFamily,
      operator: mapOperator(result.operator),
      scopeMode: mapScopeMode(result.docScope.mode),
      confidence: result.confidence,
    };
  } catch (error) {
    console.error(`Router error for query "${query}":`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function runRoutingTest(query: GeneratedQuery): Promise<TestResult> {
  try {
    const actual = await routeQuery(query.query);

    const partialMatch = {
      intentFamily: actual.intentFamily === query.expected.intentFamily,
      operator: actual.operator === query.expected.operator,
      scopeMode: actual.scopeMode === query.expected.scopeMode,
    };

    const exactMatch = partialMatch.intentFamily && partialMatch.operator && partialMatch.scopeMode;

    return {
      query,
      actual,
      exactMatch,
      partialMatch,
    };
  } catch (error) {
    return {
      query,
      actual: null,
      exactMatch: false,
      partialMatch: { intentFamily: false, operator: false, scopeMode: false },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function runBatch(queries: GeneratedQuery[]): Promise<BatchResults> {
  const results: TestResult[] = [];
  const byMutation: Record<string, { total: number; exact: number }> = { clean: { total: 0, exact: 0 } };
  const byIntentFamily: Record<string, { total: number; exact: number }> = {};

  for (const query of queries) {
    const result = await runRoutingTest(query);
    results.push(result);

    // Track by mutation
    const mutKey = query.mutations.length === 0 ? 'clean' : query.mutations.join('+');
    if (!byMutation[mutKey]) byMutation[mutKey] = { total: 0, exact: 0 };
    byMutation[mutKey].total++;
    if (result.exactMatch) byMutation[mutKey].exact++;

    // Track by intent family
    const ifKey = query.expected.intentFamily;
    if (!byIntentFamily[ifKey]) byIntentFamily[ifKey] = { total: 0, exact: 0 };
    byIntentFamily[ifKey].total++;
    if (result.exactMatch) byIntentFamily[ifKey].exact++;
  }

  const exactMatches = results.filter(r => r.exactMatch).length;
  const partialMatches = results.filter(r =>
    !r.exactMatch && (r.partialMatch.intentFamily || r.partialMatch.operator)
  ).length;
  const errors = results.filter(r => r.error).length;
  const misses = results.length - exactMatches - partialMatches - errors;

  // Calculate rates
  const byMutationWithRate = Object.fromEntries(
    Object.entries(byMutation).map(([k, v]) => [k, { ...v, rate: v.exact / v.total }])
  );
  const byIntentFamilyWithRate = Object.fromEntries(
    Object.entries(byIntentFamily).map(([k, v]) => [k, { ...v, rate: v.exact / v.total }])
  );

  return {
    total: results.length,
    exactMatches,
    partialMatches,
    misses,
    errors,
    exactMatchRate: exactMatches / results.length,
    byMutation: byMutationWithRate,
    byIntentFamily: byIntentFamilyWithRate,
    failures: results.filter(r => !r.exactMatch).slice(0, 50), // Keep first 50 failures for debugging
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VITEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('Routing Mass Tests', () => {
  let allQueries: GeneratedQuery[];
  let results: BatchResults;

  beforeAll(async () => {
    // Validate baseline first
    const baselineCheck = validateAgainstBaseline(process.cwd());
    if (!baselineCheck.valid) {
      console.warn(`⚠️  Baseline warning: ${baselineCheck.message}`);
    }

    // Generate queries
    console.log('\n[Routing Mass Test] Generating queries...');
    allQueries = generateBatch({ count: 20000 });

    const stats = getGenerationStats(allQueries);
    console.log(`  Generated: ${stats.total} queries`);
    console.log(`  Clean: ${stats.cleanCount} (${((stats.cleanCount / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  Mutated: ${stats.mutatedCount} (${((stats.mutatedCount / stats.total) * 100).toFixed(1)}%)`);
    console.log(`  By Intent Family:`, stats.byIntentFamily);

    // Run all tests
    console.log('\n[Routing Mass Test] Running routing tests...');
    results = await runBatch(allQueries);
  }, 120000); // 2 minute timeout for generation + testing

  afterAll(() => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' ROUTING MASS TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total Queries: ${results.total}`);
    console.log(`  Exact Matches: ${results.exactMatches} (${(results.exactMatchRate * 100).toFixed(2)}%)`);
    console.log(`  Partial Matches: ${results.partialMatches}`);
    console.log(`  Misses: ${results.misses}`);
    console.log(`  Errors: ${results.errors}`);
    console.log('');
    console.log('  By Mutation Type:');
    for (const [mut, data] of Object.entries(results.byMutation)) {
      console.log(`    ${mut}: ${data.exact}/${data.total} (${(data.rate * 100).toFixed(1)}%)`);
    }
    console.log('');
    console.log('  By Intent Family:');
    for (const [family, data] of Object.entries(results.byIntentFamily)) {
      console.log(`    ${family}: ${data.exact}/${data.total} (${(data.rate * 100).toFixed(1)}%)`);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');
  });

  describe('Overall Accuracy', () => {
    it('should achieve >=90% exact match rate overall', () => {
      expect(results.exactMatchRate).toBeGreaterThanOrEqual(0.90);
    });

    it('should have less than 1% errors', () => {
      const errorRate = results.errors / results.total;
      expect(errorRate).toBeLessThan(0.01);
    });
  });

  describe('Clean Query Accuracy', () => {
    it('should achieve >=95% exact match on clean (unmutated) queries', () => {
      const cleanResults = results.byMutation['clean'];
      if (cleanResults) {
        expect(cleanResults.rate).toBeGreaterThanOrEqual(0.95);
      }
    });
  });

  describe('Mutation Stability', () => {
    it('should maintain >=85% accuracy under typos', () => {
      const typoResults = results.byMutation['typos'];
      if (typoResults && typoResults.total > 100) {
        expect(typoResults.rate).toBeGreaterThanOrEqual(0.85);
      }
    });

    it('should maintain >=85% accuracy under slang', () => {
      const slangResults = results.byMutation['slang'];
      if (slangResults && slangResults.total > 100) {
        expect(slangResults.rate).toBeGreaterThanOrEqual(0.85);
      }
    });

    it('should maintain >=90% accuracy under casing variations', () => {
      for (const [key, data] of Object.entries(results.byMutation)) {
        if (key.startsWith('casing:') && data.total > 50) {
          expect(data.rate).toBeGreaterThanOrEqual(0.90);
        }
      }
    });
  });

  describe('Intent Family Coverage', () => {
    const INTENT_FAMILIES = ['file_actions', 'documents', 'doc_stats', 'conversation', 'help'];

    for (const family of INTENT_FAMILIES) {
      it(`should achieve >=85% accuracy for ${family}`, () => {
        const familyResults = results.byIntentFamily[family];
        if (familyResults && familyResults.total > 50) {
          expect(familyResults.rate).toBeGreaterThanOrEqual(0.85);
        }
      });
    }
  });

  describe('Sample Failures Analysis', () => {
    it('should log sample failures for debugging', () => {
      if (results.failures.length > 0) {
        console.log('\n  Sample Failures (first 10):');
        for (const failure of results.failures.slice(0, 10)) {
          console.log(`    Query: "${failure.query.query}"`);
          console.log(`    Expected: ${failure.query.expected.intentFamily}/${failure.query.expected.operator}/${failure.query.expected.scopeMode}`);
          console.log(`    Actual: ${failure.actual?.intentFamily}/${failure.actual?.operator}/${failure.actual?.scopeMode}`);
          console.log(`    Mutations: [${failure.query.mutations.join(', ')}]`);
          console.log('');
        }
      }
      // This test always passes - it's just for logging
      expect(true).toBe(true);
    });
  });
});
