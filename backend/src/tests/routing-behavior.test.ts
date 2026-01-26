/**
 * Routing Behavior Tests
 *
 * Tests the actual routing logic to verify ChatGPT-quality behavior:
 * - Attached document scope lock
 * - locate_file vs locate_content separation
 * - compute vs extract decisions
 * - help override vs document content
 * - conversation override
 */

import { RouterService, router } from '../services/core/router.service';

// ============================================================================
// TEST UTILITIES
// ============================================================================

interface RoutingTestCase {
  name: string;
  query: string;
  request: {
    hasDocuments: boolean;
    attachedDocumentIds?: string[];
    availableDocs?: Array<{ id: string; filename: string; mimeType?: string }>;
    recentDocIds?: string[];
    previousIntent?: string;
    previousOperator?: string;
  };
  expected: {
    intentFamily?: string;
    operator?: string;
    scopeMode?: 'single_doc' | 'multi_doc' | 'workspace' | 'none';
    scopeDocIds?: string[];
  };
}

const testCases: RoutingTestCase[] = [
  // ════════════════════════════════════════════════════════════════════════
  // 1.1 Attached document scope lock (P0.1 must be perfect)
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'Attached doc scope lock - single doc',
    query: 'What is the total revenue?',
    request: {
      hasDocuments: true,
      attachedDocumentIds: ['doc-123'],
      availableDocs: [
        { id: 'doc-123', filename: 'Q3_Report.pdf', mimeType: 'application/pdf' },
        { id: 'doc-456', filename: 'Q2_Report.pdf', mimeType: 'application/pdf' },
      ],
    },
    expected: {
      intentFamily: 'documents',
      scopeMode: 'single_doc',
      scopeDocIds: ['doc-123'],
    },
  },
  {
    name: 'Attached doc scope lock - multiple docs',
    query: 'Compare revenue between these documents',
    request: {
      hasDocuments: true,
      attachedDocumentIds: ['doc-123', 'doc-456'],
      availableDocs: [
        { id: 'doc-123', filename: 'Q3_Report.pdf', mimeType: 'application/pdf' },
        { id: 'doc-456', filename: 'Q2_Report.pdf', mimeType: 'application/pdf' },
        { id: 'doc-789', filename: 'Q1_Report.pdf', mimeType: 'application/pdf' },
      ],
    },
    expected: {
      intentFamily: 'documents',
      operator: 'compare',
      scopeMode: 'multi_doc',
      scopeDocIds: ['doc-123', 'doc-456'],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // 1.2 locate_file vs locate_content separation
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'locate_file - file location query',
    query: 'Where is my file located?',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Contract.pdf' }],
    },
    expected: {
      intentFamily: 'file_actions',
      operator: 'locate_file',
    },
  },
  {
    name: 'locate_content - content location query',
    query: 'Where in the document is EBITDA mentioned?',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Financial_Report.pdf' }],
    },
    expected: {
      intentFamily: 'documents',
      operator: 'locate_content',
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // 1.3 compute vs extract collision
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'compute - calculation required',
    query: 'Calculate total Capex across all phases',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Budget.xlsx' }],
    },
    expected: {
      intentFamily: 'documents',
      operator: 'compute',
    },
  },
  {
    name: 'extract - simple value extraction',
    query: "What's the total Capex?",
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Budget.xlsx' }],
    },
    expected: {
      intentFamily: 'documents',
      // Could be extract or compute - both acceptable for this query
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // 1.4 help override vs document content
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'help/capabilities - what can you do',
    query: 'What can you do?',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Manual.pdf' }],
    },
    expected: {
      intentFamily: 'help',
      operator: 'capabilities',
    },
  },
  {
    name: 'help/how_to - upload question',
    query: 'How do I upload a file?',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Manual.pdf' }],
    },
    expected: {
      intentFamily: 'help',
      operator: 'how_to',
    },
  },
  {
    name: 'documents/explain - document content question',
    query: 'Explain the termination clause',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Contract.pdf' }],
    },
    expected: {
      intentFamily: 'documents',
      operator: 'explain',
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // 1.5 conversation override
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'conversation/greet - hi',
    query: 'hi',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Report.pdf' }],
    },
    expected: {
      intentFamily: 'conversation',
      // Note: very short greetings may route to 'unknown' operator, which is acceptable
      // The key is that intentFamily is 'conversation' (no RAG retrieval)
    },
  },
  {
    name: 'conversation/greet - thanks',
    query: 'thanks',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Report.pdf' }],
    },
    expected: {
      intentFamily: 'conversation',
    },
  },
  {
    name: 'conversation/greet - bye',
    query: 'bye',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Report.pdf' }],
    },
    expected: {
      intentFamily: 'conversation',
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // File actions
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'file_actions/list - list files',
    query: 'List my files',
    request: {
      hasDocuments: true,
      availableDocs: [
        { id: 'doc-123', filename: 'Report.pdf' },
        { id: 'doc-456', filename: 'Budget.xlsx' },
      ],
    },
    expected: {
      intentFamily: 'file_actions',
      operator: 'list',
    },
  },
  {
    name: 'file_actions/filter - show only PDFs',
    query: 'Show only PDFs',
    request: {
      hasDocuments: true,
      availableDocs: [
        { id: 'doc-123', filename: 'Report.pdf' },
        { id: 'doc-456', filename: 'Budget.xlsx' },
      ],
    },
    expected: {
      intentFamily: 'file_actions',
      operator: 'filter',
    },
  },
  {
    name: 'file_actions/sort - sort by newest',
    query: 'Sort by newest',
    request: {
      hasDocuments: true,
      availableDocs: [{ id: 'doc-123', filename: 'Report.pdf' }],
    },
    expected: {
      intentFamily: 'file_actions',
      operator: 'sort',
    },
  },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║          ROUTING BEHAVIOR TEST SUITE                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const routerInstance = router;
  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const result = await routerInstance.route({
        text: tc.query,
        userId: 'test-user',
        conversationId: 'test-conversation',
        language: 'en',
        hasDocuments: tc.request.hasDocuments,
        attachedDocumentIds: tc.request.attachedDocumentIds,
        availableDocs: tc.request.availableDocs,
        recentDocIds: tc.request.recentDocIds,
        previousIntent: tc.request.previousIntent,
        previousOperator: tc.request.previousOperator,
      });

      const issues: string[] = [];

      // Check intent family
      if (tc.expected.intentFamily && result.intentFamily !== tc.expected.intentFamily) {
        issues.push(`intentFamily: got ${result.intentFamily}, expected ${tc.expected.intentFamily}`);
      }

      // Check operator
      if (tc.expected.operator && result.operator !== tc.expected.operator) {
        issues.push(`operator: got ${result.operator}, expected ${tc.expected.operator}`);
      }

      // Check scope mode
      if (tc.expected.scopeMode && result.docScope?.mode !== tc.expected.scopeMode) {
        issues.push(`scopeMode: got ${result.docScope?.mode}, expected ${tc.expected.scopeMode}`);
      }

      // Check scope doc IDs
      if (tc.expected.scopeDocIds) {
        const resultIds = result.docScope?.docIds || [];
        const expectedIds = tc.expected.scopeDocIds;
        const idsMatch = expectedIds.every(id => resultIds.includes(id)) &&
                         resultIds.every(id => expectedIds.includes(id));
        if (!idsMatch) {
          issues.push(`scopeDocIds: got [${resultIds.join(',')}], expected [${expectedIds.join(',')}]`);
        }
      }

      if (issues.length === 0) {
        console.log(`✅ ${tc.name}`);
        console.log(`   → ${result.intentFamily}/${result.operator} (confidence: ${result.confidence.toFixed(2)})`);
        if (result.docScope) {
          console.log(`   → scope: ${result.docScope.mode} [${result.docScope.docIds?.join(', ') || 'none'}]`);
        }
        passed++;
      } else {
        console.log(`❌ ${tc.name}`);
        console.log(`   Query: "${tc.query}"`);
        for (const issue of issues) {
          console.log(`   ✗ ${issue}`);
        }
        console.log(`   Actual: ${result.intentFamily}/${result.operator}`);
        if (result.docScope) {
          console.log(`   Scope: ${result.docScope.mode} [${result.docScope.docIds?.join(', ') || 'none'}]`);
        }
        failed++;
      }
    } catch (error: any) {
      console.log(`❌ ${tc.name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`SUMMARY: ${passed}/${passed + failed} passed`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed. Review the issues above.`);
    process.exit(1);
  } else {
    console.log('\n✅ All routing behavior tests passed!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
