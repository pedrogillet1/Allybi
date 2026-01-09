/**
 * PHASE 2 — DOMAIN ACTIVATION TEST (POST-INTENT)
 * Verify domain classification activates correctly after intent
 */

import { classifyIntent, getDomainService } from './helpers';

interface TestCase {
  query: string;
  expectedDomain: string | null; // null = no domain should activate
  description?: string;
}

interface TestResult {
  query: string;
  intent: string;
  expectedDomain: string | null;
  actualDomain: string | null;
  isDomainSpecific: boolean;
  passed: boolean;
}

// Test cases from the playbook
const TEST_CASES: TestCase[] = [
  // Finance domain
  { query: 'calculate EBITDA from this table', expectedDomain: 'finance', description: 'Finance calculation' },
  { query: 'what is the revenue growth rate?', expectedDomain: 'finance', description: 'Finance metric' },
  { query: 'analyze the P&L statement', expectedDomain: 'finance', description: 'Finance analysis' },

  // Accounting domain
  { query: 'debit credit mismatch', expectedDomain: 'accounting', description: 'Accounting balance' },
  { query: 'journal entry for this transaction', expectedDomain: 'accounting', description: 'Accounting entry' },
  { query: 'reconcile the ledger', expectedDomain: 'accounting', description: 'Accounting reconciliation' },

  // Legal domain
  { query: 'contract termination clause', expectedDomain: 'legal', description: 'Legal clause' },
  { query: 'liability provisions in section 5', expectedDomain: 'legal', description: 'Legal provision' },
  { query: 'indemnification requirements', expectedDomain: 'legal', description: 'Legal requirement' },

  // Medical domain
  { query: 'blood pressure dosage', expectedDomain: 'medical', description: 'Medical dosage' },
  { query: 'patient diagnosis summary', expectedDomain: 'medical', description: 'Medical diagnosis' },
  { query: 'medication interactions', expectedDomain: 'medical', description: 'Medical interaction' },

  // Engineering domain
  { query: 'tolerance in mm', expectedDomain: 'engineering', description: 'Engineering tolerance' },
  { query: 'specification for component A', expectedDomain: 'engineering', description: 'Engineering spec' },
  { query: 'ISO compliance requirements', expectedDomain: 'engineering', description: 'Engineering standard' },

  // No domain should activate
  { query: 'hello', expectedDomain: null, description: 'Conversation - no domain' },
  { query: 'how do I upload files?', expectedDomain: null, description: 'Help - no domain' },
  { query: 'thanks for your help', expectedDomain: null, description: 'Conversation - no domain' },
  { query: 'remember my preference', expectedDomain: null, description: 'Memory - no domain' },
];

async function runDomainActivationTests(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2 — DOMAIN ACTIVATION TEST');
  console.log('='.repeat(60) + '\n');

  const domainService = getDomainService();
  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    try {
      // First classify intent
      const prediction = await classifyIntent(testCase.query);

      // Then check domain activation
      const isDomainSpecific = domainService.isDomainSpecificIntent(prediction.primaryIntent);
      const domainContext = domainService.getDomainContext(prediction.primaryIntent);

      const actualDomain = isDomainSpecific ? domainContext.domain || null : null;

      const result: TestResult = {
        query: testCase.query,
        intent: prediction.primaryIntent,
        expectedDomain: testCase.expectedDomain,
        actualDomain,
        isDomainSpecific,
        passed: actualDomain === testCase.expectedDomain,
      };

      results.push(result);

      const icon = result.passed ? '✓' : '✗';
      console.log(`${icon} "${testCase.query}"`);
      console.log(`    Intent: ${result.intent}`);
      console.log(`    Expected domain: ${testCase.expectedDomain || 'none'}`);
      console.log(`    Actual domain: ${actualDomain || 'none'}`);
      if (!result.passed) {
        console.log(`    MISMATCH!`);
      }
      console.log('');

    } catch (error: any) {
      console.log(`✗ "${testCase.query}" — ERROR: ${error.message}`);
      results.push({
        query: testCase.query,
        intent: 'ERROR',
        expectedDomain: testCase.expectedDomain,
        actualDomain: null,
        isDomainSpecific: false,
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
    console.log('\n❌ DOMAIN ACTIVATION FAILED');
    console.log('\nFailed cases:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - "${r.query}": expected ${r.expectedDomain || 'none'}, got ${r.actualDomain || 'none'}`);
    });

    // Check for domain collision (finance vs accounting)
    const financeAccountingCollision = results.filter(r =>
      !r.passed &&
      ((r.expectedDomain === 'finance' && r.actualDomain === 'accounting') ||
       (r.expectedDomain === 'accounting' && r.actualDomain === 'finance'))
    );

    if (financeAccountingCollision.length > 0) {
      console.log('\n⚠️  CRITICAL: Finance/Accounting domain collision detected!');
    }

    // Check for domain activating on non-document intents
    const invalidActivation = results.filter(r =>
      r.expectedDomain === null && r.actualDomain !== null
    );

    if (invalidActivation.length > 0) {
      console.log('\n⚠️  CRITICAL: Domain activating for conversation/help intents!');
    }

    process.exit(1);
  }

  console.log('\n✅ All domain activation tests passed');

  // Domain distribution
  const domainCounts: Record<string, number> = {};
  results.forEach(r => {
    const domain = r.actualDomain || 'none';
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });

  console.log('\nDomain distribution:');
  Object.entries(domainCounts).forEach(([domain, count]) => {
    console.log(`  ${domain}: ${count}`);
  });

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run
runDomainActivationTests().catch(err => {
  console.error('Domain activation test error:', err);
  process.exit(1);
});
