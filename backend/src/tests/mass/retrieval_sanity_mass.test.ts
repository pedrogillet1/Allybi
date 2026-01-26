/**
 * Retrieval Sanity Mass Test Suite
 *
 * Tests that retrieval behavior matches expectations:
 * - Single doc queries return chunks from 1 doc
 * - Compare queries return chunks from 2+ docs
 * - Scoped queries only return chunks from specified doc
 *
 * Uses simulated retrieval results for fast testing.
 * Replace with actual retrieval service integration for E2E testing.
 *
 * Target: >=95% sanity check pass rate
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  generateRetrievalBatch,
  getRetrievalStats,
  validateRetrievalResult,
  RetrievalScenario,
  RetrievalResult,
  RetrievalValidationResult,
} from '../generators/retrievalScenarioGenerator';
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
  failures: RetrievalValidationResult[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK RETRIEVAL SERVICE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simulates retrieval results based on scenario type.
 * This mock generates "correct" results that should pass validation.
 *
 * TODO: Replace with actual retrieval service for E2E testing:
 * import { KodaHybridSearchService } from '../../services/retrieval/kodaHybridSearch.service';
 */
function mockRetrieve(scenario: RetrievalScenario): RetrievalResult {
  const docs = scenario.documentContext || [];
  const exp = scenario.expectations;

  // Generate appropriate results based on scenario type
  switch (scenario.type) {
    case 'single_doc':
    case 'scoped': {
      // Return chunks from only the required doc
      const targetDoc = exp.requiresSpecificDoc || docs[0];
      const chunkCount = Math.floor(Math.random() * 5) + 2; // 2-6 chunks
      return {
        chunks: Array(chunkCount).fill(null).map((_, i) => ({
          docName: targetDoc,
          content: `Chunk ${i + 1} from ${targetDoc}`,
          score: 0.9 - (i * 0.05),
        })),
        docCount: 1,
        uniqueDocs: [targetDoc],
      };
    }

    case 'compare': {
      // Return chunks from exactly 2 docs
      const doc1 = docs[0] || 'doc1.pdf';
      const doc2 = docs[1] || 'doc2.pdf';
      return {
        chunks: [
          { docName: doc1, content: `Chunk from ${doc1}`, score: 0.95 },
          { docName: doc1, content: `Another chunk from ${doc1}`, score: 0.88 },
          { docName: doc2, content: `Chunk from ${doc2}`, score: 0.92 },
          { docName: doc2, content: `Another chunk from ${doc2}`, score: 0.85 },
        ],
        docCount: 2,
        uniqueDocs: [doc1, doc2],
      };
    }

    case 'multi_doc': {
      // Return chunks from 2+ docs
      const numDocs = Math.min(Math.floor(Math.random() * 2) + 2, docs.length); // 2-3 docs
      const selectedDocs = docs.slice(0, numDocs);
      const chunks = selectedDocs.flatMap((doc, i) => [
        { docName: doc, content: `Chunk from ${doc}`, score: 0.9 - (i * 0.1) },
        { docName: doc, content: `Another chunk from ${doc}`, score: 0.85 - (i * 0.1) },
      ]);
      return {
        chunks,
        docCount: numDocs,
        uniqueDocs: selectedDocs,
      };
    }

    case 'search_all': {
      // Return chunks from various docs (or none for list queries)
      if (scenario.query.toLowerCase().includes('list') ||
          scenario.query.toLowerCase().includes('show me all') ||
          scenario.query.toLowerCase().includes('what documents')) {
        // File listing query - might not have chunks
        return {
          chunks: [],
          docCount: docs.length,
          uniqueDocs: docs,
        };
      }
      // Search query - return from multiple docs
      const numDocs = Math.min(Math.floor(Math.random() * 2) + 1, docs.length);
      const selectedDocs = docs.slice(0, numDocs);
      return {
        chunks: selectedDocs.map((doc, i) => ({
          docName: doc,
          content: `Search result from ${doc}`,
          score: 0.8 - (i * 0.1),
        })),
        docCount: numDocs,
        uniqueDocs: selectedDocs,
      };
    }

    default:
      return { chunks: [], docCount: 0, uniqueDocs: [] };
  }
}

/**
 * Simulates BAD retrieval results for negative testing.
 * Used to verify that validation correctly catches issues.
 */
function mockBadRetrieve(scenario: RetrievalScenario): RetrievalResult {
  const docs = scenario.documentContext || [];

  switch (scenario.type) {
    case 'single_doc':
    case 'scoped':
      // Return chunks from MULTIPLE docs (wrong!)
      return {
        chunks: docs.slice(0, 2).map(doc => ({
          docName: doc,
          content: `Chunk from ${doc}`,
          score: 0.8,
        })),
        docCount: 2,
        uniqueDocs: docs.slice(0, 2),
      };

    case 'compare':
      // Return chunks from only 1 doc (wrong!)
      return {
        chunks: [
          { docName: docs[0], content: 'Only doc', score: 0.9 },
        ],
        docCount: 1,
        uniqueDocs: [docs[0]],
      };

    default:
      return { chunks: [], docCount: 0, uniqueDocs: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

function runRetrievalTest(
  scenario: RetrievalScenario,
  useBadRetrieval: boolean = false
): RetrievalValidationResult {
  const result = useBadRetrieval
    ? mockBadRetrieve(scenario)
    : mockRetrieve(scenario);
  return validateRetrievalResult(scenario, result);
}

function runBatch(scenarios: RetrievalScenario[]): BatchResults {
  const results: RetrievalValidationResult[] = [];
  const byType: Record<string, { total: number; passed: number }> = {};

  for (const scenario of scenarios) {
    const result = runRetrievalTest(scenario);
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

describe('Retrieval Sanity Mass Tests', () => {
  let allScenarios: RetrievalScenario[];
  let results: BatchResults;

  beforeAll(async () => {
    // Validate baseline first
    const baselineCheck = validateAgainstBaseline(process.cwd());
    if (!baselineCheck.valid) {
      console.warn(`⚠️  Baseline warning: ${baselineCheck.message}`);
    }

    // Generate scenarios
    console.log('\n[Retrieval Sanity Mass Test] Generating scenarios...');
    allScenarios = generateRetrievalBatch({ count: 10000 });

    const stats = getRetrievalStats(allScenarios);
    console.log(`  Generated: ${stats.total} scenarios`);
    console.log(`  By Type:`, stats.byType);

    // Run all tests
    console.log('\n[Retrieval Sanity Mass Test] Running validation...');
    results = runBatch(allScenarios);
  }, 60000);

  afterAll(() => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(' RETRIEVAL SANITY MASS TEST RESULTS');
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

  describe('Single Doc Queries', () => {
    it('should achieve >=95% pass rate for single doc queries', () => {
      const singleDoc = results.byType['single_doc'];
      if (singleDoc && singleDoc.total > 100) {
        expect(singleDoc.rate).toBeGreaterThanOrEqual(0.95);
      }
    });
  });

  describe('Compare Queries', () => {
    it('should achieve >=95% pass rate for compare queries', () => {
      const compare = results.byType['compare'];
      if (compare && compare.total > 100) {
        expect(compare.rate).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should always return chunks from 2+ docs for compare queries', () => {
      const compareScenarios = allScenarios.filter(s => s.type === 'compare');
      for (const scenario of compareScenarios.slice(0, 100)) {
        const result = runRetrievalTest(scenario);
        expect(result.result.docCount).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Scoped Queries', () => {
    it('should achieve >=95% pass rate for scoped queries', () => {
      const scoped = results.byType['scoped'];
      if (scoped && scoped.total > 100) {
        expect(scoped.rate).toBeGreaterThanOrEqual(0.95);
      }
    });

    it('should only return chunks from specified doc for scoped queries', () => {
      const scopedScenarios = allScenarios.filter(s => s.type === 'scoped');
      for (const scenario of scopedScenarios.slice(0, 100)) {
        const result = runRetrievalTest(scenario);
        expect(result.result.docCount).toBe(1);
        if (scenario.expectations.requiresSpecificDoc) {
          expect(result.result.uniqueDocs).toContain(scenario.expectations.requiresSpecificDoc);
        }
      }
    });
  });

  describe('Multi-Doc Queries', () => {
    it('should achieve >=95% pass rate for multi-doc queries', () => {
      const multiDoc = results.byType['multi_doc'];
      if (multiDoc && multiDoc.total > 100) {
        expect(multiDoc.rate).toBeGreaterThanOrEqual(0.95);
      }
    });
  });

  describe('Negative Tests (Bad Retrieval)', () => {
    it('should correctly flag single-doc queries returning multiple docs', () => {
      const singleDocScenarios = allScenarios.filter(s => s.type === 'single_doc').slice(0, 10);
      for (const scenario of singleDocScenarios) {
        const result = runRetrievalTest(scenario, true); // Use bad retrieval
        expect(result.passed).toBe(false);
        expect(result.failures.some(f => f.includes('Too many docs'))).toBe(true);
      }
    });

    it('should correctly flag compare queries returning only 1 doc', () => {
      const compareScenarios = allScenarios.filter(s => s.type === 'compare').slice(0, 10);
      for (const scenario of compareScenarios) {
        const result = runRetrievalTest(scenario, true); // Use bad retrieval
        expect(result.passed).toBe(false);
        expect(result.failures.some(f => f.includes('Too few docs'))).toBe(true);
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
          console.log(`    Got: ${failure.result.docCount} docs, ${failure.result.chunks.length} chunks`);
          console.log('');
        }
      }
      expect(true).toBe(true);
    });
  });
});
