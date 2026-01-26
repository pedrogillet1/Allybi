#!/usr/bin/env ts-node
/**
 * Tier 3: Shadow Behavior Tests (Safety Invariants)
 *
 * These tests don't assert exact routing, they assert the system
 * NEVER does something obviously wrong.
 *
 * Must be 100% pass rate.
 */

import { RouterService } from '../services/core/router.service';

const DOCS = [
  { id: '1', filename: 'Financial Report 2024.pdf', mimeType: 'application/pdf' },
  { id: '2', filename: 'Project Plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: '3', filename: 'Sales Data.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
];

interface ShadowTest {
  id: string;
  query: string;
  rule: 'never_file_actions' | 'never_documents' | 'never_doc_stats' | 'never_help';
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHADOW TESTS: What the system should NEVER do
// ═══════════════════════════════════════════════════════════════════════════

const SHADOW_TESTS: ShadowTest[] = [
  // OBVIOUS CONTENT QUESTIONS - should NEVER route to file_actions
  { id: 'S1', query: 'What topics does the report cover?', rule: 'never_file_actions', description: 'Content question about topics' },
  { id: 'S2', query: 'Summarize the main findings', rule: 'never_file_actions', description: 'Summarization request' },
  { id: 'S3', query: 'What does the document say about revenue?', rule: 'never_file_actions', description: 'Content extraction' },
  { id: 'S4', query: 'Explain the conclusions', rule: 'never_file_actions', description: 'Explanation request' },
  { id: 'S5', query: 'What are the key points?', rule: 'never_file_actions', description: 'Key points extraction' },
  { id: 'S6', query: 'Compare the two reports', rule: 'never_file_actions', description: 'Comparison request' },
  { id: 'S7', query: 'What is mentioned about costs?', rule: 'never_file_actions', description: 'Specific content lookup' },
  { id: 'S8', query: 'Give me an overview of the project plan', rule: 'never_file_actions', description: 'Overview request' },
  { id: 'S9', query: 'What claims does the author make?', rule: 'never_file_actions', description: 'Claims extraction' },
  { id: 'S10', query: 'Extract the main arguments', rule: 'never_file_actions', description: 'Arguments extraction' },
  { id: 'S11', query: 'What information is provided about Q3?', rule: 'never_file_actions', description: 'Information query' },
  { id: 'S12', query: 'Analyze the data trends', rule: 'never_file_actions', description: 'Analysis request' },
  { id: 'S13', query: 'What does it conclude about profitability?', rule: 'never_file_actions', description: 'Conclusion query' },
  { id: 'S14', query: 'Highlight the important sections', rule: 'never_file_actions', description: 'Highlight request' },
  { id: 'S15', query: 'What is discussed in chapter 3?', rule: 'never_file_actions', description: 'Chapter content query' },

  // OBVIOUS FILE ACTIONS - should NEVER route to documents
  { id: 'S16', query: 'Show me my files', rule: 'never_documents', description: 'File listing' },
  { id: 'S17', query: 'List all documents', rule: 'never_documents', description: 'Document listing' },
  { id: 'S18', query: 'Open the PDF', rule: 'never_documents', description: 'File open' },
  { id: 'S19', query: 'Filter by spreadsheets', rule: 'never_documents', description: 'File filtering' },
  { id: 'S20', query: 'Sort by date', rule: 'never_documents', description: 'File sorting' },
  { id: 'S21', query: 'Show only PDFs', rule: 'never_documents', description: 'Type filtering' },
  { id: 'S22', query: 'Group files by type', rule: 'never_documents', description: 'File grouping' },
  { id: 'S23', query: 'Display my uploads', rule: 'never_documents', description: 'Upload listing' },
  { id: 'S24', query: 'Show the newest files', rule: 'never_documents', description: 'Recent files' },
  { id: 'S25', query: 'List all spreadsheets', rule: 'never_documents', description: 'Spreadsheet listing' },

  // FINANCIAL COMPUTATION - should NEVER route to doc_stats
  { id: 'S26', query: 'What is the total revenue?', rule: 'never_doc_stats', description: 'Revenue computation' },
  { id: 'S27', query: 'Calculate the sum of expenses', rule: 'never_doc_stats', description: 'Expense calculation' },
  { id: 'S28', query: 'What is the profit margin?', rule: 'never_doc_stats', description: 'Margin calculation' },
  { id: 'S29', query: 'Total cost for January', rule: 'never_doc_stats', description: 'Cost total' },
  { id: 'S30', query: 'What is the EBITDA?', rule: 'never_doc_stats', description: 'Financial metric' },
  { id: 'S31', query: 'Sum of all transactions', rule: 'never_doc_stats', description: 'Transaction sum' },
  { id: 'S32', query: 'Average sales per month', rule: 'never_doc_stats', description: 'Average calculation' },
  { id: 'S33', query: 'What is the grand total?', rule: 'never_doc_stats', description: 'Grand total' },

  // DOC STATS - should NEVER route to documents content
  { id: 'S34', query: 'How many pages?', rule: 'never_documents', description: 'Page count' },
  { id: 'S35', query: 'How many slides in the presentation?', rule: 'never_documents', description: 'Slide count' },
  { id: 'S36', query: 'Number of sheets in the workbook', rule: 'never_documents', description: 'Sheet count' },
  { id: 'S37', query: 'Page count of the PDF', rule: 'never_documents', description: 'Page count' },

  // HELP/CAPABILITIES - should NEVER route to documents
  { id: 'S38', query: 'What can you do?', rule: 'never_documents', description: 'Capabilities query' },
  { id: 'S39', query: 'What are your capabilities?', rule: 'never_documents', description: 'Capabilities query' },
  { id: 'S40', query: 'How do I use this?', rule: 'never_documents', description: 'Usage help' },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runShadowTests() {
  const router = RouterService.getInstance();

  let passed = 0;
  let failed = 0;
  const failures: { id: string; query: string; rule: string; actualFamily: string; description: string }[] = [];

  console.log(`\nRunning ${SHADOW_TESTS.length} shadow behavior tests...\n`);

  for (const test of SHADOW_TESTS) {
    const result = await router.route({
      text: test.query,
      userId: 'test-user',
      hasDocuments: true,
      availableDocs: DOCS,
    });

    let violation = false;

    switch (test.rule) {
      case 'never_file_actions':
        violation = result.intentFamily === 'file_actions';
        break;
      case 'never_documents':
        violation = result.intentFamily === 'documents';
        break;
      case 'never_doc_stats':
        violation = result.intentFamily === 'doc_stats';
        break;
      case 'never_help':
        violation = result.intentFamily === 'help';
        break;
    }

    if (violation) {
      failed++;
      failures.push({
        id: test.id,
        query: test.query,
        rule: test.rule,
        actualFamily: result.intentFamily,
        description: test.description,
      });
      console.log(`❌ ${test.id}: "${test.query}"`);
      console.log(`   Rule violated: ${test.rule}`);
      console.log(`   Got: ${result.intentFamily}/${result.operator}`);
    } else {
      passed++;
      console.log(`✅ ${test.id}: ${test.description}`);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`SHADOW TESTS: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(70));

  if (failures.length > 0) {
    console.log('\n⚠️  SAFETY INVARIANT VIOLATIONS:');
    for (const f of failures) {
      console.log(`  ${f.id}: "${f.query}"`);
      console.log(`    Rule: ${f.rule}`);
      console.log(`    Got: ${f.actualFamily}`);
      console.log(`    (${f.description})`);
    }
    console.log('\n❌ CRITICAL: Safety invariants must be 100%. Fix these before deployment.');
    process.exit(1);
  } else {
    console.log('\n✅ All safety invariants pass!');
  }
}

runShadowTests().catch(console.error);
