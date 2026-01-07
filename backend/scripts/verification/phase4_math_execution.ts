/**
 * PHASE 4 — PYTHON MATH ENGINE INTEGRATION
 * Verify math engine is CALLED (not bypassed) for numerical operations
 */

import { getMathOrchestrator, classifyIntent } from './helpers';

interface TestCase {
  query: string;
  expectsPythonCall: boolean;
  expectedCategory?: string;
  description?: string;
}

interface TestResult {
  query: string;
  expectsPythonCall: boolean;
  actualPythonCall: boolean;
  confidence: number;
  category: string | null;
  matchedPatterns: string[];
  passed: boolean;
}

// Test cases from the playbook
const TEST_CASES: TestCase[] = [
  // Should call Python Math Engine
  { query: 'calculate average of 10, 20, 30', expectsPythonCall: true, expectedCategory: 'statistical', description: 'Average calculation' },
  { query: 'sum column A', expectsPythonCall: true, expectedCategory: 'aggregation', description: 'Column sum' },
  { query: 'standard deviation', expectsPythonCall: true, expectedCategory: 'statistical', description: 'Std dev' },
  { query: 'what is the ROI?', expectsPythonCall: true, expectedCategory: 'financial', description: 'ROI calculation' },
  { query: 'calculate CAGR from 100 to 150 over 3 years', expectsPythonCall: true, expectedCategory: 'financial', description: 'CAGR calculation' },
  { query: 'compute the margin', expectsPythonCall: true, expectedCategory: 'financial', description: 'Margin calculation' },
  { query: 'calculate variance between budget and actual', expectsPythonCall: true, expectedCategory: 'accounting', description: 'Variance calculation' },
  { query: 'rollforward the balance', expectsPythonCall: true, expectedCategory: 'accounting', description: 'Rollforward' },
  { query: 'convert 100 mm to meters', expectsPythonCall: true, expectedCategory: 'engineering', description: 'Unit conversion' },
  { query: 'days until December 31', expectsPythonCall: true, expectedCategory: 'time', description: 'Date calculation' },

  // Should NOT call Python Math Engine
  { query: 'what is this document about', expectsPythonCall: false, description: 'Document question' },
  { query: 'hello', expectsPythonCall: false, description: 'Greeting' },
  { query: 'summarize the report', expectsPythonCall: false, description: 'Summarization' },
  { query: 'find the contract termination clause', expectsPythonCall: false, description: 'Document search' },
  { query: 'explain the methodology', expectsPythonCall: false, description: 'Explanation' },
];

async function runMathExecutionTests(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 4 — PYTHON MATH ENGINE INTEGRATION');
  console.log('='.repeat(60) + '\n');

  const mathOrchestrator = getMathOrchestrator();
  const results: TestResult[] = [];

  // First check if math engine is healthy
  console.log('Checking Math Engine health...');
  const isHealthy = await mathOrchestrator.checkHealth();
  console.log(`Math Engine status: ${isHealthy ? '✓ Healthy' : '✗ Not available'}\n`);

  for (const testCase of TEST_CASES) {
    try {
      // Check if query requires math
      const mathCheck = mathOrchestrator.requiresMathCalculation(testCase.query);

      const result: TestResult = {
        query: testCase.query,
        expectsPythonCall: testCase.expectsPythonCall,
        actualPythonCall: mathCheck.requiresMath && mathCheck.confidence >= 0.25,
        confidence: mathCheck.confidence,
        category: mathCheck.suggestedCategory || null,
        matchedPatterns: mathCheck.matchedPatterns,
        passed: (mathCheck.requiresMath && mathCheck.confidence >= 0.25) === testCase.expectsPythonCall,
      };

      results.push(result);

      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} "${testCase.query}"`);
      console.log(`    Expected Python call: ${testCase.expectsPythonCall}`);
      console.log(`    Actual Python call: ${result.actualPythonCall}`);
      console.log(`    Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      if (result.category) {
        console.log(`    Category: ${result.category}`);
      }
      if (result.matchedPatterns.length > 0) {
        console.log(`    Patterns: ${result.matchedPatterns.slice(0, 2).join(', ')}`);
      }
      if (!result.passed) {
        console.log(`    MISMATCH!`);
      }
      console.log('');

    } catch (error: any) {
      console.log(`✗ "${testCase.query}" — ERROR: ${error.message}`);
      results.push({
        query: testCase.query,
        expectsPythonCall: testCase.expectsPythonCall,
        actualPythonCall: false,
        confidence: 0,
        category: null,
        matchedPatterns: [],
        passed: false,
      });
    }
  }

  // Summary
  console.log('-'.repeat(60));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed}/${results.length} passed (${failed} failed)`);

  if (failed > 0) {
    console.log('\n❌ MATH EXECUTION FAILED');
    console.log('\nFailed cases:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - "${r.query}": expected Python=${r.expectsPythonCall}, got Python=${r.actualPythonCall}`);
    });

    // Critical failure: math answered without Python
    const mathWithoutPython = results.filter(r =>
      r.expectsPythonCall && !r.actualPythonCall
    );

    if (mathWithoutPython.length > 0) {
      console.log('\n⚠️  CRITICAL: Math queries NOT routing to Python engine!');
    }

    process.exit(1);
  }

  console.log('\n✅ All math execution tests passed');

  // Test actual calculation if engine is healthy
  if (isHealthy) {
    console.log('\n--- Live Calculation Test ---');

    const testPlan = {
      operation: 'calculate_roi',
      inputs: { initial_investment: 10000, final_value: 12500 }
    };

    const calcResult = await mathOrchestrator.executeCalculation(testPlan);

    if (calcResult.success) {
      console.log('✓ Live calculation successful');
      console.log(`  Result: ${JSON.stringify(calcResult.result)}`);
    } else {
      console.log('✗ Live calculation failed');
      console.log(`  Error: ${calcResult.error}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run
runMathExecutionTests().catch(err => {
  console.error('Math execution test error:', err);
  process.exit(1);
});
