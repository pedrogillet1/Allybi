/**
 * Failure Analysis Script
 * Analyzes specific query patterns to identify root causes of routing mismatches
 */

import { generateBatch, GeneratedQuery } from '../generators/queryGenerator';
import { router } from '../../services/core/router.service';

interface FailureCategory {
  name: string;
  count: number;
  examples: { query: string; expected: string; actual: string }[];
}

interface TestCase extends GeneratedQuery {
  context: { hasDocuments: boolean };
}

async function analyzeFailures() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' FAILURE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Generate test queries
  const testCases: TestCase[] = generateBatch(2000).map(q => ({
    ...q,
    context: { hasDocuments: true },
  }));

  const categories: Record<string, FailureCategory> = {
    intent_mismatch: { name: 'Intent Family Mismatch', count: 0, examples: [] },
    operator_mismatch: { name: 'Operator Mismatch (same intent)', count: 0, examples: [] },
    scope_mismatch: { name: 'Scope Mismatch (same intent+operator)', count: 0, examples: [] },
  };

  // Track specific pattern failures
  const patternFailures: Record<string, { count: number; samples: string[] }> = {};

  for (const testCase of testCases) {
    // Skip invalid test cases
    if (!testCase.query || typeof testCase.query !== 'string') {
      continue;
    }

    const result = await router.route({
      query: testCase.query,
      lang: 'en',
      hasDocuments: testCase.context.hasDocuments,
      uploadedDocs: [],
    });

    const actualIntent = result.intentFamily;
    const actualOperator = result.operator;
    const actualScope = result.scope?.mode === 'workspace' ? 'all' :
                        result.scope?.mode === 'multi_doc' ? 'multi' :
                        result.scope?.mode === 'single_doc' ? 'single' : 'none';

    const expectedIntent = testCase.expected.intentFamily;
    const expectedOperator = testCase.expected.operator;
    const expectedScope = testCase.expected.scopeMode;

    const actualKey = `${actualIntent}/${actualOperator}/${actualScope}`;
    const expectedKey = `${expectedIntent}/${expectedOperator}/${expectedScope}`;

    if (actualKey !== expectedKey) {
      // Categorize the failure
      if (actualIntent !== expectedIntent) {
        categories.intent_mismatch.count++;
        if (categories.intent_mismatch.examples.length < 30) {
          categories.intent_mismatch.examples.push({
            query: testCase.query,
            expected: expectedKey,
            actual: actualKey,
          });
        }

        // Track pattern: expected_intent -> actual_intent
        const patternKey = `${expectedIntent} → ${actualIntent}`;
        if (!patternFailures[patternKey]) {
          patternFailures[patternKey] = { count: 0, samples: [] };
        }
        patternFailures[patternKey].count++;
        if (patternFailures[patternKey].samples.length < 5) {
          patternFailures[patternKey].samples.push(testCase.query);
        }
      } else if (actualOperator !== expectedOperator) {
        categories.operator_mismatch.count++;
        if (categories.operator_mismatch.examples.length < 30) {
          categories.operator_mismatch.examples.push({
            query: testCase.query,
            expected: expectedKey,
            actual: actualKey,
          });
        }

        // Track pattern: expected_operator -> actual_operator
        const patternKey = `${expectedIntent}: ${expectedOperator} → ${actualOperator}`;
        if (!patternFailures[patternKey]) {
          patternFailures[patternKey] = { count: 0, samples: [] };
        }
        patternFailures[patternKey].count++;
        if (patternFailures[patternKey].samples.length < 5) {
          patternFailures[patternKey].samples.push(testCase.query);
        }
      } else if (actualScope !== expectedScope) {
        categories.scope_mismatch.count++;
        if (categories.scope_mismatch.examples.length < 30) {
          categories.scope_mismatch.examples.push({
            query: testCase.query,
            expected: expectedKey,
            actual: actualKey,
          });
        }

        // Track pattern: expected_scope -> actual_scope
        const patternKey = `${expectedIntent}/${expectedOperator}: ${expectedScope} → ${actualScope}`;
        if (!patternFailures[patternKey]) {
          patternFailures[patternKey] = { count: 0, samples: [] };
        }
        patternFailures[patternKey].count++;
        if (patternFailures[patternKey].samples.length < 5) {
          patternFailures[patternKey].samples.push(testCase.query);
        }
      }
    }
  }

  // Print category breakdown
  console.log('FAILURE CATEGORIES:');
  console.log('───────────────────────────────────────────────────────────────');
  for (const cat of Object.values(categories)) {
    console.log(`\n${cat.name}: ${cat.count} failures`);
    if (cat.examples.length > 0) {
      console.log('  Sample failures:');
      cat.examples.slice(0, 10).forEach(ex => {
        console.log(`    "${ex.query}"`);
        console.log(`      Expected: ${ex.expected}`);
        console.log(`      Actual:   ${ex.actual}`);
      });
    }
  }

  // Print pattern failures (sorted by count)
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(' TOP FAILURE PATTERNS (by count)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const sortedPatterns = Object.entries(patternFailures)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 20);

  for (const [pattern, data] of sortedPatterns) {
    console.log(`\n${pattern}: ${data.count} failures`);
    console.log('  Samples:');
    data.samples.forEach(s => console.log(`    - "${s}"`));
  }

  // Print actionable insights
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log(' ACTIONABLE INSIGHTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const intentMismatches = Object.entries(patternFailures)
    .filter(([key]) => key.includes(' → ') && !key.includes(':'))
    .sort(([, a], [, b]) => b.count - a.count);

  const operatorMismatches = Object.entries(patternFailures)
    .filter(([key]) => key.includes(': ') && key.split(': ')[1]?.includes(' → '))
    .sort(([, a], [, b]) => b.count - a.count);

  console.log('TOP INTENT MISMATCHES (fix in router priority chain):');
  intentMismatches.slice(0, 10).forEach(([pattern, data]) => {
    console.log(`  ${pattern}: ${data.count}`);
  });

  console.log('\nTOP OPERATOR MISMATCHES (fix in pattern bank):');
  operatorMismatches.slice(0, 10).forEach(([pattern, data]) => {
    console.log(`  ${pattern}: ${data.count}`);
  });
}

analyzeFailures().catch(console.error);
