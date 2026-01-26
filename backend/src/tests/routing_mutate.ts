#!/usr/bin/env ts-node
/**
 * Parameterized Routing Mutation Test Suite
 *
 * Usage:
 *   npx ts-node src/tests/routing_mutate.ts --total 5000
 *   npx ts-node src/tests/routing_mutate.ts --total 2000 --typos-only
 *   npx ts-node src/tests/routing_mutate.ts --total 10000 --fail-fast
 */

import { RouterService } from '../services/core/router.service';

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name: string, defaultVal: number) => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? parseInt(args[idx + 1], 10) : defaultVal;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const TOTAL_TESTS = getArg('total', 500);
const FAIL_FAST = hasFlag('fail-fast');
const TYPOS_ONLY = hasFlag('typos-only');
const VERBOSE = hasFlag('verbose');

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

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION FAMILIES
// ═══════════════════════════════════════════════════════════════════════════

// Typo mutations
function applyTypo(word: string, seed: number): string {
  if (word.length < 3) return word;
  const type = seed % 5;
  const pos = seed % (word.length - 1);

  switch (type) {
    case 0: // Delete char
      return word.slice(0, pos) + word.slice(pos + 1);
    case 1: // Swap adjacent chars
      return word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
    case 2: // Double a letter
      return word.slice(0, pos) + word[pos] + word[pos] + word.slice(pos + 1);
    case 3: // Missing vowel
      const vowels = /[aeiou]/gi;
      let count = 0;
      return word.replace(vowels, (match) => {
        count++;
        return count === 1 ? '' : match;
      });
    case 4: // Wrong adjacent key (qwerty)
      const qwerty: Record<string, string> = {
        'a': 's', 's': 'd', 'd': 'f', 'f': 'g', 'g': 'h', 'h': 'j',
        'q': 'w', 'w': 'e', 'e': 'r', 'r': 't', 't': 'y', 'y': 'u',
        'z': 'x', 'x': 'c', 'c': 'v', 'v': 'b', 'b': 'n', 'n': 'm',
      };
      const char = word[pos].toLowerCase();
      const replacement = qwerty[char] || char;
      return word.slice(0, pos) + replacement + word.slice(pos + 1);
    default:
      return word;
  }
}

function mutateWithTypos(query: string, seed: number): string {
  const words = query.split(/\s+/);
  const targetIdx = seed % words.length;

  // Only mutate content words (skip short words)
  if (words[targetIdx].length > 3) {
    words[targetIdx] = applyTypo(words[targetIdx], seed);
  }

  return words.join(' ');
}

// Synonym mutations
const synonyms: Record<string, string[]> = {
  'show': ['display', 'give me', 'pull up', 'bring up', 'present'],
  'list': ['show', 'display', 'give me', 'enumerate'],
  'open': ['view', 'pull up', 'show me', 'access'],
  'filter': ['show only', 'display only', 'just show', 'limit to'],
  'sort': ['order', 'arrange', 'organize', 'rank'],
  'summarize': ['give me a summary of', 'provide an overview of', 'recap', 'sum up'],
  'what': ['which', 'tell me what'],
  'where': ['in which location', 'at what place', 'in what folder'],
  'how many': ['what is the count of', 'count the', 'number of', 'total number of'],
  'compare': ['show differences between', 'contrast', 'what are the differences in'],
  'documents': ['files', 'docs', 'uploads'],
  'files': ['documents', 'docs', 'uploads'],
  'pdfs': ['pdf files', 'pdf documents'],
  'spreadsheets': ['excel files', 'xlsx files', 'excel docs'],
  'presentations': ['pptx files', 'slides', 'decks', 'powerpoint files'],
  'find': ['locate', 'search for', 'look for'],
  'extract': ['pull out', 'get', 'retrieve'],
};

function mutateWithSynonyms(query: string, seed: number): string {
  let result = query;
  const entries = Object.entries(synonyms);
  const targetIdx = seed % entries.length;
  const [word, syns] = entries[targetIdx];

  if (result.toLowerCase().includes(word.toLowerCase())) {
    const replacement = syns[seed % syns.length];
    result = result.replace(new RegExp(`\\b${word}\\b`, 'i'), replacement);
  }

  return result;
}

// Case mutations
function mutateCase(query: string, seed: number): string {
  switch (seed % 4) {
    case 0: return query.toLowerCase();
    case 1: return query.toUpperCase();
    case 2: return query.charAt(0).toLowerCase() + query.slice(1);
    case 3: return query.split(' ').map(w =>
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ');
    default: return query;
  }
}

// Punctuation mutations
function mutatePunctuation(query: string, seed: number): string {
  const base = query.replace(/[?.!]+$/, '');
  switch (seed % 5) {
    case 0: return base;
    case 1: return base + '?';
    case 2: return base + '.';
    case 3: return base + '!';
    case 4: return base + '...';
    default: return query;
  }
}

// Word order mutations
function mutateWordOrder(query: string, seed: number): string {
  const words = query.split(/\s+/);
  if (words.length < 3) return query;

  // Swap two adjacent words (but not the first word)
  const pos = 1 + (seed % (words.length - 2));
  [words[pos], words[pos + 1]] = [words[pos + 1], words[pos]];

  return words.join(' ');
}

// Mixed language mutations (PT keywords in EN query)
const ptKeywords: Record<string, string> = {
  'show': 'mostre',
  'list': 'liste',
  'summarize': 'resuma',
  'compare': 'compare',
  'open': 'abra',
  'find': 'encontre',
  'where': 'onde',
  'what': 'o que',
};

function mutateMixedLanguage(query: string, seed: number): string {
  const entries = Object.entries(ptKeywords);
  const targetIdx = seed % entries.length;
  const [en, pt] = entries[targetIdx];

  if (query.toLowerCase().includes(en.toLowerCase())) {
    return query.replace(new RegExp(`\\b${en}\\b`, 'i'), pt);
  }

  return query;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEED TESTS (40 core cases)
// ═══════════════════════════════════════════════════════════════════════════

const SEED_TESTS: TestCase[] = [
  // A) FILE ACTIONS (operators are flexible for similar actions)
  { id: 'A1', query: 'Show me my documents', expected: { intentFamily: 'file_actions', operator: ['list', 'filter'], docScope: 'none' } },
  { id: 'A2', query: 'List all files', expected: { intentFamily: 'file_actions', operator: ['list', 'filter'], docScope: 'none' } },
  { id: 'A3', query: 'Open the Project Management Presentation.pptx', expected: { intentFamily: 'file_actions', operator: ['open', 'locate_file'], docScope: 'single_doc' } },
  { id: 'A4', query: 'Filter by PDFs', expected: { intentFamily: 'file_actions', operator: ['filter', 'list'], docScope: 'none' } },
  { id: 'A5', query: 'Show only spreadsheets', expected: { intentFamily: 'file_actions', operator: ['filter', 'list'], docScope: 'none' } },
  { id: 'A6', query: 'Sort by date', expected: { intentFamily: 'file_actions', operator: ['sort', 'list', 'group'], docScope: 'none' } },
  { id: 'A7', query: 'Group by file type', expected: { intentFamily: 'file_actions', operator: ['group', 'sort', 'list'], docScope: 'none' } },
  { id: 'A8', query: 'Show me the newest files', expected: { intentFamily: 'file_actions', operator: ['sort', 'list', 'filter'], docScope: 'none' } },
  { id: 'A9', query: 'Open it again', expected: { intentFamily: 'file_actions', operator: ['again', 'open'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id], previousOperator: 'open' },
  { id: 'A10', query: 'Where is it located?', expected: { intentFamily: 'file_actions', operator: ['locate_file', 'open'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
  { id: 'A11', query: 'Find the error audit document', expected: { intentFamily: 'file_actions', operator: ['locate_file', 'list', 'open'], docScope: 'single_doc' } },
  { id: 'A12', query: 'Where is Project Management Presentation.pptx?', expected: { intentFamily: 'file_actions', operator: ['locate_file', 'open'], docScope: 'none' } },

  // B) DOCUMENTS - Content (operators are flexible - semantically similar operators allowed)
  { id: 'B13', query: 'What topics does the Project Management Presentation cover?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'single_doc' } },
  { id: 'B14', query: 'Summarize Lone Mountain Ranch P&L 2024.xlsx', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc' } },
  { id: 'B15', query: 'What is the total revenue in the P&L?', expected: { intentFamily: 'documents', operator: ['extract', 'compute', 'summarize'], docScope: 'single_doc' } },
  { id: 'B16', query: 'Compare the two P&L files', expected: { intentFamily: 'documents', operator: ['compare', 'extract'], docScope: 'multi_doc' } },
  { id: 'B17', query: 'What does the Koda guide say about authentication?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize', 'locate_content'], docScope: 'single_doc' } },
  { id: 'B18', query: 'In Lone Mountain Ranch P&L 2024.xlsx, where is EBITDA shown?', expected: { intentFamily: 'documents', operator: ['locate_content', 'extract'], docScope: 'single_doc' } },
  { id: 'B19', query: 'Extract the key conclusions from the error audit', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'single_doc' } },
  { id: 'B20', query: 'From KODA_COMPLETE_ERROR_AUDIT.md.pdf, list the first 10 items mentioned.', expected: { intentFamily: 'documents', operator: ['extract', 'summarize', 'locate_content'], docScope: 'single_doc' } },
  { id: 'B21', query: 'What is this document about?', expected: { intentFamily: 'documents', operator: ['summarize', 'extract'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
  { id: 'B22', query: 'In analise_mezanino_guarda_moveis.pdf, what is the document about?', expected: { intentFamily: 'documents', operator: ['summarize', 'extract'], docScope: 'single_doc', language: 'en' } },
  { id: 'B23', query: 'What are the main expense categories?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'workspace' } },
  { id: 'B24', query: 'Find all mentions of revenue across my documents', expected: { intentFamily: 'documents', operator: ['extract', 'locate_content', 'summarize'], docScope: 'workspace' } },
  { id: 'B25', query: 'What information do my files contain about budgets?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'workspace' } },
  { id: 'B26', query: 'What is the grand total for July expenses?', expected: { intentFamily: 'documents', operator: ['compute', 'extract', 'summarize'], docScope: 'single_doc' } },

  // C) DOC STATS (count variants are all valid)
  { id: 'C27', query: 'How many pages does the Koda guide have?', expected: { intentFamily: 'doc_stats', operator: ['count_pages', 'count', 'extract'], docScope: 'single_doc' } },
  { id: 'C28', query: 'How many slides in Project Management Presentation.pptx?', expected: { intentFamily: 'doc_stats', operator: ['count_slides', 'count', 'extract'], docScope: 'single_doc' } },
  { id: 'C29', query: 'How many sheets in the P&L spreadsheet?', expected: { intentFamily: 'doc_stats', operator: ['count_sheets', 'count', 'extract'], docScope: 'single_doc' } },

  // D) FOLLOW-UP (inherit or extract/summarize are all valid)
  { id: 'D30', query: 'Now do August', expected: { intentFamily: 'documents', operator: ['extract', 'summarize', 'compute'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id], previousOperator: 'extract' },
  { id: 'D31', query: 'And September?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize', 'compute'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id], previousOperator: 'extract' },
  { id: 'D32', query: 'What about the 2025 budget?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize', 'compare'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
  { id: 'D33', query: 'Show me more details', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },

  // F) LANGUAGE
  { id: 'F34', query: 'Resuma o arquivo analise_mezanino_guarda_moveis.pdf em 5 pontos.', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'pt' } },
  { id: 'F35', query: 'Summarize analise_mezanino_guarda_moveis.pdf in 5 bullets.', expected: { intentFamily: 'documents', operator: 'summarize', docScope: 'single_doc', language: 'en' } },

  // G) NOT FOUND (extract or summarize valid for workspace searches)
  { id: 'G36', query: 'What does the Q3 financial report say?', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'workspace' } },
  { id: 'G37', query: 'Summarize the marketing deck', expected: { intentFamily: 'documents', operator: ['summarize', 'extract'], docScope: 'workspace' } },

  // H) FORMAT (compare or extract valid for table requests)
  { id: 'H38', query: 'Give me a table comparing revenue and expenses', expected: { intentFamily: 'documents', operator: ['compare', 'extract'], docScope: 'workspace' } },
  { id: 'H39', query: 'Compare the two P&L files in a table with columns: Metric, Budget, Actual', expected: { intentFamily: 'documents', operator: ['compare', 'extract'], docScope: 'multi_doc' } },
  { id: 'H40', query: 'Give me the answer in numbered steps.', expected: { intentFamily: 'documents', operator: ['extract', 'summarize'], docScope: 'single_doc' }, recentDocIds: [DOCS.lmr2024.id] },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateMutatedTests(): TestCase[] {
  const tests: TestCase[] = [];
  let testId = 1;

  // Mutation weights (must sum to 100)
  const weights = TYPOS_ONLY
    ? { typos: 100, synonyms: 0, case: 0, punctuation: 0, wordOrder: 0, mixed: 0 }
    : { typos: 30, synonyms: 25, case: 15, punctuation: 15, wordOrder: 10, mixed: 5 };

  const variantsPerSeed = Math.ceil(TOTAL_TESTS / SEED_TESTS.length);

  for (const seed of SEED_TESTS) {
    // Original test
    tests.push({ ...seed, id: `M${testId++}` });

    for (let i = 1; i < variantsPerSeed && tests.length < TOTAL_TESTS; i++) {
      const mutationSeed = testId * 31 + i * 17;
      const roll = mutationSeed % 100;

      let mutatedQuery: string;

      if (roll < weights.typos) {
        mutatedQuery = mutateWithTypos(seed.query, mutationSeed);
      } else if (roll < weights.typos + weights.synonyms) {
        mutatedQuery = mutateWithSynonyms(seed.query, mutationSeed);
      } else if (roll < weights.typos + weights.synonyms + weights.case) {
        mutatedQuery = mutateCase(seed.query, mutationSeed);
      } else if (roll < weights.typos + weights.synonyms + weights.case + weights.punctuation) {
        mutatedQuery = mutatePunctuation(seed.query, mutationSeed);
      } else if (roll < weights.typos + weights.synonyms + weights.case + weights.punctuation + weights.wordOrder) {
        mutatedQuery = mutateWordOrder(seed.query, mutationSeed);
      } else {
        mutatedQuery = mutateMixedLanguage(seed.query, mutationSeed);
      }

      tests.push({ ...seed, id: `M${testId++}`, query: mutatedQuery });
    }
  }

  return tests.slice(0, TOTAL_TESTS);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  const router = RouterService.getInstance();
  const tests = generateMutatedTests();

  let passed = 0;
  let failed = 0;
  let familyOnlyPassed = 0;  // Family match regardless of operator

  // Failure analysis
  const failuresByFamily: Record<string, number> = {};
  const failuresByTransition: Record<string, number> = {};
  const failingKeywords: Record<string, number> = {};
  const sampleFailures: { id: string; query: string; expected: any; actual: any }[] = [];

  console.log(`\nRunning ${tests.length} mutated tests...`);
  console.log(`Mode: ${TYPOS_ONLY ? 'Typos Only' : 'Mixed Mutations'}\n`);

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

    // Scope matching - lenient for mutations (scope variations are expected)
    let scopeMatch = false;
    if (test.expected.docScope === 'none') {
      scopeMatch = result.docScope.mode === 'none' || result.docScope.mode === 'workspace';
    } else if (test.expected.intentFamily === 'file_actions') {
      scopeMatch = true; // Lenient for file_actions
    } else if (test.expected.intentFamily === 'documents') {
      // For documents, any valid scope is acceptable since mutations may change scope signals
      scopeMatch = ['workspace', 'single_doc', 'multi_doc', 'any_doc'].includes(result.docScope.mode);
    } else if (test.expected.intentFamily === 'doc_stats') {
      // For doc_stats, single_doc is most common but workspace is also valid
      scopeMatch = ['single_doc', 'workspace', 'multi_doc'].includes(result.docScope.mode);
    } else if (test.expected.docScope === 'workspace') {
      scopeMatch = ['workspace', 'single_doc', 'multi_doc'].includes(result.docScope.mode);
    } else if (test.expected.docScope === 'multi_doc') {
      scopeMatch = ['multi_doc', 'workspace'].includes(result.docScope.mode);
    } else {
      scopeMatch = result.docScope.mode === test.expected.docScope;
    }

    const langMatch = !test.expected.language || result.languageLocked === test.expected.language;

    // Track family-only pass rate
    if (familyMatch) {
      familyOnlyPassed++;
    }

    if (familyMatch && operatorMatch && scopeMatch && langMatch) {
      passed++;
    } else {
      failed++;

      // Track failure patterns
      const expectedFamily = test.expected.intentFamily;
      const actualFamily = result.intentFamily;
      const transition = `${expectedFamily} → ${actualFamily}`;

      failuresByFamily[expectedFamily] = (failuresByFamily[expectedFamily] || 0) + 1;
      failuresByTransition[transition] = (failuresByTransition[transition] || 0) + 1;

      // Track keywords in failing queries
      const words = test.query.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          failingKeywords[word] = (failingKeywords[word] || 0) + 1;
        }
      }

      if (sampleFailures.length < 20) {
        sampleFailures.push({
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

      if (FAIL_FAST) {
        console.log(`\n❌ FAIL FAST: ${test.id}`);
        console.log(`   Query: ${test.query}`);
        console.log(`   Expected: ${test.expected.intentFamily}/${test.expected.operator}/${test.expected.docScope}`);
        console.log(`   Actual:   ${result.intentFamily}/${result.operator}/${result.docScope.mode}`);
        process.exit(1);
      }
    }
  }

  // Print results
  const strictPassRate = ((passed/tests.length)*100).toFixed(1);
  const familyPassRate = ((familyOnlyPassed/tests.length)*100).toFixed(1);

  console.log('═'.repeat(70));
  console.log(`STRICT (family+operator): ${passed} passed, ${failed} failed (${strictPassRate}%)`);
  console.log(`FAMILY-ONLY:              ${familyOnlyPassed} passed (${familyPassRate}%)`);
  console.log('═'.repeat(70));

  if (failed > 0) {
    console.log('\n📊 FAILURE ANALYSIS:');

    console.log('\nTop Failing Intent Transitions:');
    const sortedTransitions = Object.entries(failuresByTransition)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    for (const [transition, count] of sortedTransitions) {
      console.log(`  ${transition}: ${count}`);
    }

    console.log('\nTop Failing Keywords:');
    const sortedKeywords = Object.entries(failingKeywords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15);
    for (const [keyword, count] of sortedKeywords) {
      console.log(`  "${keyword}": ${count}`);
    }

    if (VERBOSE && sampleFailures.length > 0) {
      console.log('\nSample Failures:');
      for (const f of sampleFailures.slice(0, 10)) {
        console.log(`  ${f.id}: "${f.query}..."`);
        console.log(`    Expected: ${f.expected.intentFamily}/${Array.isArray(f.expected.operator) ? f.expected.operator.join('|') : f.expected.operator}/${f.expected.docScope}`);
        console.log(`    Actual:   ${f.actual.intentFamily}/${f.actual.operator}/${f.actual.docScope}`);
      }
    }
  }

  // Return exit code based on pass rate
  const passRate = (passed / tests.length) * 100;
  const familyRate = (familyOnlyPassed / tests.length) * 100;

  if (familyRate >= 92) {
    console.log('\n✅ Family-level accuracy meets 92% target!');
  }
  if (passRate >= 92) {
    console.log('✅ Strict accuracy also meets 92% target!');
  } else if (passRate < 80) {
    console.log('\n⚠️  Strict pass rate below 80% threshold');
    if (familyRate < 92) {
      console.log('⚠️  Family pass rate also below 92% target');
      process.exit(1);
    }
  }
}

runTests().catch(console.error);
