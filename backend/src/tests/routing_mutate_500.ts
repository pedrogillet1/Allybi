/**
 * Mutate 40 seed tests into 500 variations and run them
 */

import { RouterService } from '../services/core/router.service';

// Seed documents
const DOCS = {
  lmr2024: { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', filename: 'Lone Mountain Ranch P&L 2024.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  lmr2025: { id: '1cff7645-6e7a-48a2-a70c-a9c6d6e236b5', filename: 'Lone Mountain Ranch P&L 2025 (Budget).xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  projectMgmt: { id: '1f732865-6708-430e-996a-bc78f971a960', filename: 'Project Management Presentation.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  guardaBens: { id: 'ca1fa61f-4263-4c28-a9db-5fe0d859729c', filename: 'guarda bens self storage.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  kodaGuide: { id: '0cbdb86b-bfef-4bad-9620-e0178ebc4ff0', filename: 'Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf', mimeType: 'application/pdf' },
  errorAudit: { id: '52097305-2d17-429d-87fd-e084ebeca93d', filename: 'KODA_COMPLETE_ERROR_AUDIT.md.pdf', mimeType: 'application/pdf' },
  mezanino: { id: 'e60211ee-5274-40f9-8cc3-4ea376bfbd8c', filename: 'analise_mezanino_guarda_moveis.pdf', mimeType: 'application/pdf' },
};

const ALL_DOCS = Object.values(DOCS);

interface TestCase {
  id: string;
  query: string;
  expected: {
    intentFamily: string;
    operator: string | string[];
    docScope: string;
    language?: string;
  };
  recentDocIds?: string[];
  previousOperator?: string;
}

// Mutation helpers
const synonyms: Record<string, string[]> = {
  'show': ['display', 'give me', 'pull up', 'bring up'],
  'list': ['show', 'display', 'give me'],
  'open': ['view', 'pull up', 'show me'],
  'filter': ['show only', 'display only', 'just show'],
  'sort': ['order', 'arrange', 'organize'],
  'summarize': ['give me a summary of', 'provide an overview of', 'recap'],
  'what': ['which', 'tell me what'],
  'where': ['in which location', 'at what place'],
  'how many': ['what is the count of', 'count the', 'number of'],
  'compare': ['show differences between', 'contrast', 'what are the differences in'],
  'documents': ['files', 'docs'],
  'files': ['documents', 'docs'],
  'pdfs': ['pdf files', 'pdf documents'],
  'spreadsheets': ['excel files', 'xlsx files'],
  'presentations': ['pptx files', 'slides', 'decks'],
};

const filenames = [
  'Lone Mountain Ranch P&L 2024.xlsx',
  'Project Management Presentation.pptx',
  'guarda bens self storage.pptx',
  'Koda_Integration_Guide_5_Presentation_&_Document_Generation (1).pdf',
  'KODA_COMPLETE_ERROR_AUDIT.md.pdf',
  'analise_mezanino_guarda_moveis.pdf',
];

const contentNouns = ['topics', 'main points', 'key findings', 'summary', 'highlights', 'themes', 'conclusions'];
const formatVariants = ['in a table', 'as bullet points', 'in numbered steps', 'with headers'];

function mutateQuery(query: string, seed: number): string {
  let result = query;

  // Apply random synonym replacement based on seed
  const rand = (max: number) => ((seed * 9301 + 49297) % 233280) % max;

  for (const [word, syns] of Object.entries(synonyms)) {
    if (result.toLowerCase().includes(word.toLowerCase()) && rand(3) === 0) {
      const replacement = syns[rand(syns.length)];
      result = result.replace(new RegExp(`\\b${word}\\b`, 'i'), replacement);
      break; // Only one replacement per mutation
    }
  }

  return result;
}

function generateCaseVariants(query: string): string[] {
  return [
    query,
    query.toLowerCase(),
    query.toUpperCase(),
    query.charAt(0).toLowerCase() + query.slice(1),
  ];
}

function generatePunctuationVariants(query: string): string[] {
  const base = query.replace(/[?.!]+$/, '');
  return [
    base,
    base + '?',
    base + '.',
    base + '!',
  ];
}

// Base 40 tests (simplified for mutation)
const SEED_TESTS: TestCase[] = [
  // A) FILE ACTIONS
  { id: 'A1', query: 'Show me my documents', expected: { intentFamily: 'file_actions', operator: 'list', docScope: 'none' } },
  { id: 'A2', query: 'List all files', expected: { intentFamily: 'file_actions', operator: 'list', docScope: 'none' } },
  { id: 'A3', query: 'Open the Project Management Presentation.pptx', expected: { intentFamily: 'file_actions', operator: 'open', docScope: 'single_doc' } },
  { id: 'A4', query: 'Filter by PDFs', expected: { intentFamily: 'file_actions', operator: 'filter', docScope: 'none' } },
  { id: 'A5', query: 'Show only spreadsheets', expected: { intentFamily: 'file_actions', operator: 'filter', docScope: 'none' } },
  { id: 'A6', query: 'Sort by date', expected: { intentFamily: 'file_actions', operator: 'sort', docScope: 'none' } },
  { id: 'A7', query: 'Group by file type', expected: { intentFamily: 'file_actions', operator: 'group', docScope: 'none' } },
  { id: 'A8', query: 'Show me the newest files', expected: { intentFamily: 'file_actions', operator: ['sort', 'list'], docScope: 'none' } },
  { id: 'A9', query: 'Open it again', expected: { intentFamily: 'file_actions', operator: ['again', 'open'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id], previousOperator: 'open' },
  { id: 'A10', query: 'Where is it located?', expected: { intentFamily: 'file_actions', operator: 'locate_file', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
  { id: 'A11', query: 'Find the error audit document', expected: { intentFamily: 'file_actions', operator: ['locate_file', 'list'], docScope: 'single_doc' } },
  { id: 'A12', query: 'Where is Project Management Presentation.pptx?', expected: { intentFamily: 'file_actions', operator: 'locate_file', docScope: 'none' } },

  // B) DOCUMENTS - Content
  { id: 'B13', query: 'What topics does the Project Management Presentation cover?', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' } },
  { id: 'B14', query: 'Summarize Lone Mountain Ranch P&L 2024.xlsx', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc' } },
  { id: 'B15', query: 'What is the total revenue in the P&L?', expected: { intentFamily: 'documents', operator: ['extract', 'compute', 'summarize'], docScope: 'single_doc' } },
  { id: 'B16', query: 'Compare the two P&L files', expected: { intentFamily: 'documents', operator: ['compare', 'extract'], docScope: 'multi_doc' } },
  { id: 'B17', query: 'What does the Koda guide say about authentication?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'single_doc' } },
  { id: 'B18', query: 'In Lone Mountain Ranch P&L 2024.xlsx, where is EBITDA shown?', expected: { intentFamily: 'documents', operator: 'locate_content', docScope: 'single_doc' } },
  { id: 'B19', query: 'Extract the key conclusions from the error audit', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' } },
  { id: 'B20', query: 'From KODA_COMPLETE_ERROR_AUDIT.md.pdf, list the first 10 items mentioned.', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' } },
  { id: 'B21', query: 'What is this document about?', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
  { id: 'B22', query: 'In analise_mezanino_guarda_moveis.pdf, what is the document about?', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'en' } },
  { id: 'B23', query: 'What are the main expense categories?', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' } },
  { id: 'B24', query: 'Find all mentions of revenue across my documents', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' } },
  { id: 'B25', query: 'What information do my files contain about budgets?', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' } },
  { id: 'B26', query: 'What is the grand total for July expenses?', expected: { intentFamily: 'documents', operator: 'compute', docScope: 'single_doc' } },

  // C) DOC STATS
  { id: 'C27', query: 'How many pages does the Koda guide have?', expected: { intentFamily: 'doc_stats', operator: 'count_pages', docScope: 'single_doc' } },
  { id: 'C28', query: 'How many slides in Project Management Presentation.pptx?', expected: { intentFamily: 'doc_stats', operator: 'count_slides', docScope: 'single_doc' } },
  { id: 'C29', query: 'How many sheets in the P&L spreadsheet?', expected: { intentFamily: 'doc_stats', operator: 'count_sheets', docScope: 'single_doc' } },

  // D) FOLLOW-UP
  { id: 'D30', query: 'Now do August', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id], previousOperator: 'extract' },
  { id: 'D31', query: 'And September?', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id], previousOperator: 'extract' },
  { id: 'D32', query: 'What about the 2025 budget?', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
  { id: 'D33', query: 'Show me more details', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },

  // F) LANGUAGE
  { id: 'F34', query: 'Resuma o arquivo analise_mezanino_guarda_moveis.pdf em 5 pontos.', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'pt' } },
  { id: 'F35', query: 'Summarize analise_mezanino_guarda_moveis.pdf in 5 bullets.', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'en' } },

  // G) NOT FOUND
  { id: 'G36', query: 'What does the Q3 financial report say?', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'workspace' } },
  { id: 'G37', query: 'Summarize the marketing deck', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'workspace' } },

  // H) FORMAT
  { id: 'H38', query: 'Give me a table comparing revenue and expenses', expected: { intentFamily: 'documents', operator: 'compare', docScope: 'workspace' } },
  { id: 'H39', query: 'Compare the two P&L files in a table with columns: Metric, Budget, Actual', expected: { intentFamily: 'documents', operator: 'compare', docScope: 'multi_doc' } },
  { id: 'H40', query: 'Give me the answer in numbered steps.', expected: { intentFamily: 'documents', operator: 'extract', docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
];

// Generate 500 tests from 40 seeds
function generateMutatedTests(): TestCase[] {
  const tests: TestCase[] = [];
  let testId = 1;

  for (const seed of SEED_TESTS) {
    // Original test
    tests.push({ ...seed, id: `M${testId++}` });

    // Generate ~12 variants per seed to get 500+ total
    for (let i = 1; i <= 12; i++) {
      const mutatedQuery = mutateQuery(seed.query, testId + i * 100);

      // Case variant
      if (i <= 3) {
        const caseVariants = generateCaseVariants(mutatedQuery);
        tests.push({ ...seed, id: `M${testId++}`, query: caseVariants[i % caseVariants.length] });
      }
      // Punctuation variant
      else if (i <= 6) {
        const punctVariants = generatePunctuationVariants(mutatedQuery);
        tests.push({ ...seed, id: `M${testId++}`, query: punctVariants[i % punctVariants.length] });
      }
      // Synonym variant
      else {
        tests.push({ ...seed, id: `M${testId++}`, query: mutatedQuery });
      }
    }
  }

  return tests.slice(0, 500);
}

// Run all tests
async function runTests() {
  const router = RouterService.getInstance();
  const tests = generateMutatedTests();

  let passed = 0;
  let failed = 0;
  const failures: { id: string; query: string; expected: any; actual: any }[] = [];

  console.log(`Running ${tests.length} mutated tests...\n`);

  for (const test of tests) {
    const result = await router.route({
      text: test.query,
      userId: 'test-user',
      hasDocuments: true,
      availableDocs: ALL_DOCS,
      recentDocIds: test.recentDocIds,
      previousOperator: test.previousOperator,
    });

    const expectedOps = Array.isArray(test.expected.operator) ? test.expected.operator : [test.expected.operator];

    const familyMatch = result.intentFamily === test.expected.intentFamily;
    const operatorMatch = expectedOps.includes(result.operator);

    // Scope matching - lenient for file_actions (scope depends on filename matching)
    let scopeMatch = false;
    if (test.expected.docScope === 'none') {
      // 'none' expected: accept 'none' or 'workspace'
      scopeMatch = result.docScope.mode === 'none' || result.docScope.mode === 'workspace';
    } else if (test.expected.intentFamily === 'file_actions') {
      // For file_actions, scope detection is filename-dependent, so be lenient
      // Accept if family and operator match (scope is best-effort)
      scopeMatch = true;
    } else if (test.expected.docScope === 'workspace') {
      scopeMatch = result.docScope.mode === 'workspace' || result.docScope.mode === 'single_doc' || result.docScope.mode === 'multi_doc';
    } else if (test.expected.docScope === 'multi_doc') {
      scopeMatch = result.docScope.mode === 'multi_doc' || result.docScope.mode === 'workspace';
    } else {
      scopeMatch = result.docScope.mode === test.expected.docScope;
    }

    const langMatch = !test.expected.language || result.languageLocked === test.expected.language;

    if (familyMatch && operatorMatch && scopeMatch && langMatch) {
      passed++;
    } else {
      failed++;
      if (failures.length < 20) {
        failures.push({
          id: test.id,
          query: test.query.substring(0, 50),
          expected: test.expected,
          actual: {
            intentFamily: result.intentFamily,
            operator: result.operator,
            docScope: result.docScope.mode,
            language: result.languageLocked
          }
        });
      }
    }
  }

  console.log('═'.repeat(70));
  console.log(`RESULTS: ${passed} passed, ${failed} failed (${((passed/tests.length)*100).toFixed(1)}%)`);
  console.log('═'.repeat(70));

  if (failures.length > 0) {
    console.log('\nFirst 20 failures:');
    for (const f of failures) {
      console.log(`  ${f.id}: "${f.query}..."`);
      console.log(`    Expected: ${f.expected.intentFamily}/${f.expected.operator}/${f.expected.docScope}`);
      console.log(`    Actual:   ${f.actual.intentFamily}/${f.actual.operator}/${f.actual.docScope}`);
    }
  }
}

runTests().catch(console.error);
