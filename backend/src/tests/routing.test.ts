/**
 * ChatGPT-like Routing Test Suite
 *
 * Tests the router service against the trabalhos documents.
 * Run with: npx ts-node src/tests/routing.test.ts
 */

import { router, RoutingRequest, RoutingResult, IntentFamily, Operator, DocScopeMode } from '../services/core/router.service';

// Test user and document IDs
const TEST_USER_ID = 'test-user-001';
const DOCS = {
  lmr2024: { id: '7291a269-8395-46bb-9c1d-cb506853835c', filename: 'Lone Mountain Ranch P&L 2024.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  lmr2025: { id: '1cff7645-6e7a-48a2-a70c-a9c6d6e236b5', filename: 'Lone Mountain Ranch P&L 2025 (Budget).xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  projectMgmt: { id: '1f732865-6708-430e-996a-bc78f971a960', filename: 'Project Management Presentation.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  guardaBens: { id: 'ca1fa61f-4263-4c28-a9db-5fe0d859729c', filename: 'guarda bens self storage.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  kodaGuide: { id: '0cbdb86b-bfef-4bad-9620-e0178ebc4ff0', filename: 'Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf', mimeType: 'application/pdf' },
  errorAudit: { id: '52097305-2d17-429d-87fd-e084ebeca93d', filename: 'KODA_COMPLETE_ERROR_AUDIT.md.pdf', mimeType: 'application/pdf' },
  mezanino: { id: 'e60211ee-5274-40f9-8cc3-4ea376bfbd8c', filename: 'analise_mezanino_guarda_moveis.pdf', mimeType: 'application/pdf' },
};

const ALL_DOCS = Object.values(DOCS).map(d => ({ id: d.id, filename: d.filename, mimeType: d.mimeType }));

// Test case interface
interface TestCase {
  id: string;
  query: string;
  expected: {
    intentFamily: IntentFamily;
    operator?: Operator | Operator[];
    docScope?: DocScopeMode;
    language?: 'en' | 'pt';
    flags?: Partial<{
      isInventoryQuery: boolean;
      isContentQuestion: boolean;
      requiresRAG: boolean;
      buttonsOnly: boolean;
    }>;
  };
  context?: {
    recentDocIds?: string[];
    recentDocNames?: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

const TEST_CASES: TestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // A) FILE ACTIONS - List / Inventory
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'A1',
    query: 'List all my files.',
    expected: { intentFamily: 'file_actions', operator: 'list', docScope: 'none', flags: { isInventoryQuery: true } }
  },
  {
    id: 'A2',
    query: 'How many documents do I have?',
    expected: { intentFamily: 'file_actions', operator: 'count', docScope: 'none', flags: { isInventoryQuery: true } }
  },
  {
    id: 'A3',
    query: 'Show my PDFs.',
    expected: { intentFamily: 'file_actions', operator: 'filter', docScope: 'none', flags: { isInventoryQuery: true } }
  },
  {
    id: 'A4',
    query: 'Show only spreadsheets (XLSX).',
    expected: { intentFamily: 'file_actions', operator: 'filter', docScope: 'none', flags: { isInventoryQuery: true } }
  },
  {
    id: 'A5',
    query: 'Group my files by folder.',
    expected: { intentFamily: 'file_actions', operator: 'group', docScope: 'none' }
  },
  {
    id: 'A6',
    query: 'Show my newest file.',
    expected: { intentFamily: 'file_actions', operator: 'sort', docScope: 'none' }
  },
  {
    id: 'A7',
    query: 'Show my largest file.',
    expected: { intentFamily: 'file_actions', operator: 'sort', docScope: 'none' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // A2) FILE ACTIONS - Open / Where / Again
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'A8',
    query: 'Open Lone Mountain Ranch P&L 2024.xlsx.',
    expected: { intentFamily: 'file_actions', operator: 'open', docScope: 'none', flags: { buttonsOnly: true } }
  },
  {
    id: 'A9',
    query: 'Open it again.',
    expected: { intentFamily: 'file_actions', operator: 'again', docScope: 'none' },
    context: { recentDocIds: [DOCS.lmr2024.id], recentDocNames: [DOCS.lmr2024.filename] }
  },
  {
    id: 'A10',
    query: 'Where is Lone Mountain Ranch P&L 2024.xlsx located?',
    expected: { intentFamily: 'file_actions', operator: 'locate_file', docScope: 'none' }
  },
  {
    id: 'A11',
    query: 'Open Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf.',
    expected: { intentFamily: 'file_actions', operator: 'open', docScope: 'none' }
  },
  {
    id: 'A12',
    query: 'Where is Project Management Presentation.pptx?',
    expected: { intentFamily: 'file_actions', operator: 'locate_file', docScope: 'none' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // B) DOCUMENTS - Single Doc Content (explicit filename → single_doc)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'B14',
    query: 'In Lone Mountain Ranch P&L 2024.xlsx, what is Room Revenue in July?',
    expected: { intentFamily: 'documents', operator: ['extract', 'compute'], docScope: 'single_doc', flags: { isContentQuestion: true, requiresRAG: true } }
  },
  {
    id: 'B15',
    query: 'In Lone Mountain Ranch P&L 2024.xlsx, what is Room Revenue in August?',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc', flags: { isContentQuestion: true } }
  },
  {
    id: 'B16',
    query: 'In Lone Mountain Ranch P&L 2024.xlsx, what is the Total Operating Revenue in July?',
    expected: { intentFamily: 'documents', operator: ['extract', 'compute'], docScope: 'single_doc' }
  },
  {
    id: 'B17',
    query: 'In Lone Mountain Ranch P&L 2024.xlsx, what is the Grand Total Room Revenue for Jan–Aug?',
    expected: { intentFamily: 'documents', operator: 'compute', docScope: 'single_doc' }
  },
  {
    id: 'B18',
    query: 'In Lone Mountain Ranch P&L 2024.xlsx, where is EBITDA shown?',
    expected: { intentFamily: 'documents', operator: 'locate_content', docScope: 'single_doc' }
  },
  {
    id: 'B19',
    query: 'Summarize KODA_COMPLETE_ERROR_AUDIT.md.pdf in 5 bullets.',
    expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc' }
  },
  {
    id: 'B20',
    query: 'From KODA_COMPLETE_ERROR_AUDIT.md.pdf, list the first 10 items mentioned.',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }
  },
  {
    id: 'B21',
    query: 'In Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf, what are the main steps of the integration flow?',
    expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'single_doc' }
  },
  {
    id: 'B22',
    query: 'In analise_mezanino_guarda_moveis.pdf, what is the document about?',
    // Query text is English ("what is the document about"), filename is Portuguese but shouldn't override
    expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'en' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // B2) DOCUMENTS - Workspace Content (no filename → workspace)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'B23',
    query: 'Which document mentions presentation generation?',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' }
  },
  {
    id: 'B24',
    query: 'Which document contains error audit content?',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' }
  },
  {
    id: 'B25',
    query: 'Which file is about guarda móveis?',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // B3) DOCUMENTS - Compare (multi_doc)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'B26',
    query: 'Compare Room Revenue for July between Lone Mountain Ranch P&L 2024.xlsx and Lone Mountain Ranch P&L 2025 (Budget).xlsx in a table.',
    expected: { intentFamily: 'documents', operator: 'compare', docScope: 'multi_doc' }
  },
  {
    id: 'B27',
    query: 'Compare the main recommendations in KODA_COMPLETE_ERROR_AUDIT.md.pdf vs Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf.',
    expected: { intentFamily: 'documents', operator: 'compare', docScope: 'multi_doc' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // C) DOC STATS - Page/Slide/Sheet counts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'C28',
    query: 'How many pages are in Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf?',
    expected: { intentFamily: 'doc_stats', operator: 'count_pages', docScope: 'single_doc' }
  },
  {
    id: 'C29',
    query: 'How many slides are in Project Management Presentation.pptx?',
    expected: { intentFamily: 'doc_stats', operator: 'count_slides', docScope: 'single_doc' }
  },
  {
    id: 'C30',
    query: 'How many sheets are in Lone Mountain Ranch P&L 2024.xlsx?',
    expected: { intentFamily: 'doc_stats', operator: 'count_sheets', docScope: 'single_doc' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // D) FOLLOW-UP / PRONOUN TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'D32',
    query: 'What is Room Revenue in July?',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' },
    context: { recentDocIds: [DOCS.lmr2024.id], recentDocNames: [DOCS.lmr2024.filename] }
  },
  {
    id: 'D33',
    query: 'Where is it located?',
    expected: { intentFamily: 'file_actions', operator: 'locate_file', docScope: 'none' },
    context: { recentDocIds: [DOCS.lmr2024.id], recentDocNames: [DOCS.lmr2024.filename] }
  },
  {
    id: 'D34',
    query: 'Compare July Room Revenue in 2024 vs 2025 budget.',
    expected: { intentFamily: 'documents', operator: 'compare', docScope: 'multi_doc' }
  },
  {
    id: 'D35',
    query: 'Now do August.',
    expected: { intentFamily: 'documents', operator: 'compare', docScope: 'multi_doc' },
    context: { recentDocIds: [DOCS.lmr2024.id, DOCS.lmr2025.id], recentDocNames: [DOCS.lmr2024.filename, DOCS.lmr2025.filename] }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // F) LANGUAGE LOCK TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'F39',
    query: 'Resuma o arquivo analise_mezanino_guarda_moveis.pdf em 5 pontos.',
    expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'pt' }
  },
  {
    id: 'F40',
    query: 'Summarize analise_mezanino_guarda_moveis.pdf in 5 bullets.',
    expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'en' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // G) NOT FOUND / NO EVIDENCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'G41',
    query: "In Lone Mountain Ranch P&L 2024.xlsx, what is the CEO's birthday?",
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }
  },
  {
    id: 'G42',
    query: 'Which document states the company was founded in 1802?',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // H) OUTPUT FORMAT TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'H43',
    query: 'From KODA_COMPLETE_ERROR_AUDIT.md.pdf, give me exactly 7 bullets.',
    expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }
  },
  {
    id: 'H44',
    query: 'Compare the two P&L files in a table with columns: Metric | 2024 | 2025 Budget.',
    expected: { intentFamily: 'documents', operator: 'compare', docScope: 'multi_doc' }
  },
  {
    id: 'H45',
    query: 'Give me the answer in numbered steps.',
    expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'workspace' }
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

interface TestResult {
  id: string;
  query: string;
  passed: boolean;
  expected: TestCase['expected'];
  actual: {
    intentFamily: IntentFamily;
    operator: Operator;
    docScope: DocScopeMode;
    language: string;
    flags: any;
  };
  issues: string[];
}

async function runTest(testCase: TestCase): Promise<TestResult> {
  const request: RoutingRequest = {
    text: testCase.query,
    userId: TEST_USER_ID,
    hasDocuments: true,
    availableDocs: ALL_DOCS,
    recentDocIds: testCase.context?.recentDocIds,
    recentDocNames: testCase.context?.recentDocNames,
  };

  const result = await router.route(request);
  const issues: string[] = [];

  // Check intentFamily
  if (result.intentFamily !== testCase.expected.intentFamily) {
    issues.push(`intentFamily: expected ${testCase.expected.intentFamily}, got ${result.intentFamily}`);
  }

  // Check operator (can be single or array of acceptable operators)
  if (testCase.expected.operator) {
    const expectedOps = Array.isArray(testCase.expected.operator)
      ? testCase.expected.operator
      : [testCase.expected.operator];
    if (!expectedOps.includes(result.operator)) {
      issues.push(`operator: expected ${expectedOps.join('|')}, got ${result.operator}`);
    }
  }

  // Check docScope
  if (testCase.expected.docScope && result.docScope.mode !== testCase.expected.docScope) {
    issues.push(`docScope: expected ${testCase.expected.docScope}, got ${result.docScope.mode}`);
  }

  // Check language
  if (testCase.expected.language && result.languageLocked !== testCase.expected.language) {
    issues.push(`language: expected ${testCase.expected.language}, got ${result.languageLocked}`);
  }

  // Check flags
  if (testCase.expected.flags) {
    if (testCase.expected.flags.isInventoryQuery !== undefined &&
        result.flags.isInventoryQuery !== testCase.expected.flags.isInventoryQuery) {
      issues.push(`flags.isInventoryQuery: expected ${testCase.expected.flags.isInventoryQuery}, got ${result.flags.isInventoryQuery}`);
    }
    if (testCase.expected.flags.isContentQuestion !== undefined &&
        result.flags.isContentQuestion !== testCase.expected.flags.isContentQuestion) {
      issues.push(`flags.isContentQuestion: expected ${testCase.expected.flags.isContentQuestion}, got ${result.flags.isContentQuestion}`);
    }
    if (testCase.expected.flags.requiresRAG !== undefined &&
        result.flags.requiresRAG !== testCase.expected.flags.requiresRAG) {
      issues.push(`flags.requiresRAG: expected ${testCase.expected.flags.requiresRAG}, got ${result.flags.requiresRAG}`);
    }
  }

  return {
    id: testCase.id,
    query: testCase.query,
    passed: issues.length === 0,
    expected: testCase.expected,
    actual: {
      intentFamily: result.intentFamily,
      operator: result.operator,
      docScope: result.docScope.mode,
      language: result.languageLocked,
      flags: result.flags,
    },
    issues,
  };
}

async function runAllTests(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                    CHATGPT-LIKE ROUTING TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    try {
      const result = await runTest(testCase);
      results.push(result);

      if (result.passed) {
        passed++;
        console.log(`✅ ${result.id}: ${result.query.substring(0, 50)}...`);
      } else {
        failed++;
        console.log(`❌ ${result.id}: ${result.query.substring(0, 50)}...`);
        result.issues.forEach(issue => console.log(`   └─ ${issue}`));
      }
    } catch (error: any) {
      failed++;
      console.log(`💥 ${testCase.id}: ${testCase.query.substring(0, 50)}...`);
      console.log(`   └─ Error: ${error.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`                    RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Summary by category
  const categories = {
    'A (File Actions)': results.filter(r => r.id.startsWith('A')),
    'B (Documents)': results.filter(r => r.id.startsWith('B')),
    'C (Doc Stats)': results.filter(r => r.id.startsWith('C')),
    'D (Follow-up)': results.filter(r => r.id.startsWith('D')),
    'F (Language)': results.filter(r => r.id.startsWith('F')),
    'G (Not Found)': results.filter(r => r.id.startsWith('G')),
    'H (Format)': results.filter(r => r.id.startsWith('H')),
  };

  console.log('Category Summary:');
  for (const [category, catResults] of Object.entries(categories)) {
    const catPassed = catResults.filter(r => r.passed).length;
    const catTotal = catResults.length;
    const icon = catPassed === catTotal ? '✅' : '⚠️';
    console.log(`  ${icon} ${category}: ${catPassed}/${catTotal}`);
  }

  // List all failures
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('                           FAILURE DETAILS');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    for (const failure of failures) {
      console.log(`${failure.id}: "${failure.query}"`);
      console.log(`  Expected: ${failure.expected.intentFamily}/${failure.expected.operator}/${failure.expected.docScope || 'any'}`);
      console.log(`  Actual:   ${failure.actual.intentFamily}/${failure.actual.operator}/${failure.actual.docScope}`);
      failure.issues.forEach(issue => console.log(`  Issue:    ${issue}`));
      console.log('');
    }
  }
}

// Run tests
runAllTests().catch(console.error);
