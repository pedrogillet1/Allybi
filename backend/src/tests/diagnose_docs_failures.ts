/**
 * Diagnose documents query failures - show actual vs expected
 */

import { router, RoutingRequest } from '../services/core/router.service';

const MOCK_AVAILABLE_DOCS = [
  { id: 'doc1', filename: 'financial_report.pdf', mimeType: 'application/pdf' },
  { id: 'doc2', filename: 'project_plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'doc3', filename: 'budget_2024.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { id: 'doc4', filename: 'presentation.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
];

async function diagnoseDocs() {
  const docQueries = [
    // Summarize
    { q: 'summarize the report', expected: { intentFamily: 'documents', operator: 'summarize', scopeMode: 'single' } },
    { q: 'summarize all documents', expected: { intentFamily: 'documents', operator: 'summarize', scopeMode: 'all' } },
    { q: 'what is this document about', expected: { intentFamily: 'documents', operator: 'summarize', scopeMode: 'single' } },
    // Extract
    { q: 'what is the revenue in the report', expected: { intentFamily: 'documents', operator: 'extract', scopeMode: 'single' } },
    { q: 'what is the total revenue', expected: { intentFamily: 'documents', operator: 'extract', scopeMode: 'all' } },
    { q: 'find the deadline', expected: { intentFamily: 'documents', operator: 'extract', scopeMode: 'all' } },
    // Compare
    { q: 'compare Q1 and Q2 reports', expected: { intentFamily: 'documents', operator: 'compare', scopeMode: 'multi' } },
    { q: 'what are the differences between the two files', expected: { intentFamily: 'documents', operator: 'compare', scopeMode: 'multi' } },
    // Compute
    { q: 'calculate the total expenses', expected: { intentFamily: 'documents', operator: 'compute', scopeMode: 'all' } },
    { q: 'what is the sum of all revenue', expected: { intentFamily: 'documents', operator: 'compute', scopeMode: 'all' } },
    // Explain
    { q: 'explain section 3', expected: { intentFamily: 'documents', operator: 'explain', scopeMode: 'single' } },
    { q: 'what does EBITDA mean', expected: { intentFamily: 'documents', operator: 'explain', scopeMode: 'all' } },
  ];

  console.log('=== DOCUMENTS QUERY DIAGNOSIS ===\n');

  let correct = 0;
  let intentMatch = 0;
  let operatorMatch = 0;

  for (const { q, expected } of docQueries) {
    const request: RoutingRequest = {
      text: q,
      userId: 'test-user',
      hasDocuments: true,
      availableDocs: MOCK_AVAILABLE_DOCS,
    };

    const result = await router.route(request);

    const rawScopeMode = result.docScope?.mode as string || 'unknown';
    console.log(`   RAW docScope.mode: ${rawScopeMode}, scopeSource: ${(result.docScope as any)?.scopeSource || 'N/A'}`);
    const scopeMode = rawScopeMode === 'none' ? 'all' :
                      rawScopeMode === 'single_doc' ? 'single' :
                      rawScopeMode === 'multi_doc' ? 'multi' :
                      rawScopeMode === 'workspace' ? 'all' :
                      rawScopeMode === 'any_doc' ? 'all' :
                      rawScopeMode === 'needs_clarification' ? 'all' : rawScopeMode;

    const intentOk = result.intentFamily === expected.intentFamily;
    const operatorOk = result.operator === expected.operator;
    const scopeOk = scopeMode === expected.scopeMode;

    const exactMatch = intentOk && operatorOk && scopeOk;

    if (exactMatch) correct++;
    if (intentOk) intentMatch++;
    if (operatorOk) operatorMatch++;

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

  console.log(`\nSummary: ${correct}/${docQueries.length} exact, ${intentMatch}/${docQueries.length} intent, ${operatorMatch}/${docQueries.length} operator`);
}

diagnoseDocs().catch(console.error);
