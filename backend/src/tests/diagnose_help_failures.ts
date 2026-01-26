/**
 * Diagnose help query failures - show actual vs expected
 */

import { router, RoutingRequest } from '../services/core/router.service';

async function diagnoseHelp() {
  const helpQueries = [
    { q: 'what can you do', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'help', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'what file types do you support', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'how do i use this', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'features', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'supported file formats', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'how do i get started', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'teach me to search documents', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
    { q: 'what are your capabilities', expected: { intentFamily: 'help', operator: 'capabilities', scopeMode: 'all' } },
  ];

  console.log('=== HELP QUERY DIAGNOSIS ===\n');

  let correct = 0;
  let intentMatch = 0;

  for (const { q, expected } of helpQueries) {
    const request: RoutingRequest = {
      text: q,
      userId: 'test-user',
      hasDocuments: true,
    };

    const result = await router.route(request);

    const rawScopeMode = result.docScope?.mode as string || 'unknown';
    const scopeMode = rawScopeMode === 'none' ? 'all' :
                      rawScopeMode === 'single_doc' ? 'single' :
                      rawScopeMode === 'multi_doc' ? 'multi' :
                      rawScopeMode === 'workspace' ? 'all' : rawScopeMode;

    const intentOk = result.intentFamily === expected.intentFamily;
    const operatorOk = result.operator === expected.operator;
    const scopeOk = scopeMode === expected.scopeMode;

    const exactMatch = intentOk && operatorOk && scopeOk;

    if (exactMatch) correct++;
    if (intentOk) intentMatch++;

    const status = exactMatch ? '✓' : intentOk ? '~' : '✗';
    console.log(`${status} "${q}"`);
    console.log(`   Expected: ${expected.intentFamily}/${expected.operator} [${expected.scopeMode}]`);
    console.log(`   Actual:   ${result.intentFamily}/${result.operator} [${scopeMode}]`);
    if (!exactMatch) {
      if (!intentOk) console.log(`   ❌ Intent mismatch`);
      if (!operatorOk) console.log(`   ❌ Operator mismatch: got ${result.operator}, wanted ${expected.operator}`);
      if (!scopeOk) console.log(`   ❌ Scope mismatch: got ${scopeMode}, wanted ${expected.scopeMode}`);
    }
    console.log('');
  }

  console.log(`\nSummary: ${correct}/${helpQueries.length} exact, ${intentMatch}/${helpQueries.length} intent matches`);
}

diagnoseHelp().catch(console.error);
