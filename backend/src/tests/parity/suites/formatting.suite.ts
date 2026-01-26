/**
 * Formatting Correctness Suite
 *
 * Tests output rendering quality:
 * - No broken markdown tables
 * - Correct bullet counts
 * - No dangling list items
 * - No raw markers leaking
 * - Proper whitespace handling
 */

import { writeReport, createResult, SuiteResult } from '../tools/runSuite';

// Import answer composer - adjust path if needed
let composer: any;
try {
  const mod = require('../../../services/core/answerComposer.service');
  composer = mod.getAnswerComposer?.() || mod.answerComposer || mod.default;
} catch {
  console.warn('Warning: answerComposer not found, using mock');
  composer = {
    composeWithContext: (raw: string) => ({ content: raw }),
  };
}

interface FormatTest {
  id: string;
  ctx: {
    operator: string;
    intentFamily: string;
    docScope: { type: string; documentIds?: string[] };
    domain: string | null;
    language: string;
    originalQuery: string;
    constraints: {
      outputShape?: string;
      exactBulletCount?: number;
      requireSourceButtons?: boolean;
      requireTable?: boolean;
    };
  };
  raw: string;
  expect: {
    bullets?: number;
    mustMatch?: RegExp[];
    mustNotMatch?: RegExp[];
    minLength?: number;
    maxLength?: number;
  };
}

const TESTS: FormatTest[] = [
  {
    id: 'exact_5_bullets',
    ctx: {
      operator: 'extract',
      intentFamily: 'documents',
      docScope: { type: 'single', documentIds: ['doc1'] },
      domain: null,
      language: 'en',
      originalQuery: 'Give me exactly 5 bullets about the document.',
      constraints: { outputShape: 'bullets', exactBulletCount: 5, requireSourceButtons: false },
    },
    raw: '- Point one about the document\n- Point two with details\n- Point three is important\n- Point four covers scope\n- Point five concludes\n- Point six is extra',
    expect: { bullets: 5 },
  },
  {
    id: 'no_trailing_ellipsis',
    ctx: {
      operator: 'summarize',
      intentFamily: 'documents',
      docScope: { type: 'single', documentIds: ['doc1'] },
      domain: null,
      language: 'en',
      originalQuery: 'Summarize it.',
      constraints: { outputShape: 'paragraph' },
    },
    raw: 'This is a complete summary of the document content.',
    expect: { mustNotMatch: [/\.\.\.\s*$/] },
  },
  {
    id: 'valid_table_structure',
    ctx: {
      operator: 'compare',
      intentFamily: 'documents',
      docScope: { type: 'multi', documentIds: ['doc1', 'doc2'] },
      domain: null,
      language: 'en',
      originalQuery: 'Compare them in a table.',
      constraints: { outputShape: 'table', requireTable: true },
    },
    raw: '| Feature | Doc A | Doc B |\n|---------|-------|-------|\n| Revenue | $100 | $200 |',
    expect: { mustMatch: [/^\|.+\|/m, /\|[-:| ]+\|/] },
  },
  {
    id: 'no_raw_doc_markers',
    ctx: {
      operator: 'extract',
      intentFamily: 'documents',
      docScope: { type: 'single', documentIds: ['doc1'] },
      domain: null,
      language: 'en',
      originalQuery: 'What are the key points?',
      constraints: { outputShape: 'bullets' },
    },
    raw: '- Key point one\n- Key point two\n- Key point three',
    expect: {
      mustNotMatch: [
        /\[DOC:/i,
        /\[CHUNK:/i,
        /\[SOURCE:/i,
        /<doc_/i,
        /{{.*}}/,
      ],
    },
  },
  {
    id: 'no_excessive_whitespace',
    ctx: {
      operator: 'summarize',
      intentFamily: 'documents',
      docScope: { type: 'single', documentIds: ['doc1'] },
      domain: null,
      language: 'en',
      originalQuery: 'Summarize.',
      constraints: { outputShape: 'paragraph' },
    },
    raw: 'This is the summary.\n\n\n\nWith too many blank lines.',
    expect: { mustNotMatch: [/\n{4,}/] }, // No more than 3 consecutive newlines
  },
  {
    id: 'numbered_list_valid',
    ctx: {
      operator: 'extract',
      intentFamily: 'documents',
      docScope: { type: 'single', documentIds: ['doc1'] },
      domain: null,
      language: 'en',
      originalQuery: 'List the steps.',
      constraints: { outputShape: 'numbered' },
    },
    raw: '1. First step\n2. Second step\n3. Third step',
    expect: {
      mustMatch: [/^1\.\s+/m, /^2\.\s+/m, /^3\.\s+/m],
      mustNotMatch: [/^4\.\s*$/m], // No dangling numbers
    },
  },
];

function countBullets(text: string): number {
  return (text.match(/^\s*[-*]\s+.+$/gm) || []).length;
}

async function run() {
  let passed = 0;
  const failures: SuiteResult['failures'] = [];

  console.log('Running formatting correctness suite...\n');

  for (const t of TESTS) {
    try {
      const res = composer.composeWithContext?.(t.raw, t.ctx) || { content: t.raw };
      const out = res.content || res || '';

      let ok = true;
      const reasons: string[] = [];

      // Check bullet count
      if (t.expect.bullets !== undefined) {
        const actual = countBullets(out);
        if (actual !== t.expect.bullets) {
          ok = false;
          reasons.push(`bullets: ${actual} != ${t.expect.bullets}`);
        }
      }

      // Check must match patterns
      if (t.expect.mustMatch) {
        for (const r of t.expect.mustMatch) {
          if (!r.test(out)) {
            ok = false;
            reasons.push(`missing pattern: ${r.source}`);
          }
        }
      }

      // Check must NOT match patterns
      if (t.expect.mustNotMatch) {
        for (const r of t.expect.mustNotMatch) {
          if (r.test(out)) {
            ok = false;
            reasons.push(`unwanted pattern: ${r.source}`);
          }
        }
      }

      // Check length constraints
      if (t.expect.minLength !== undefined && out.length < t.expect.minLength) {
        ok = false;
        reasons.push(`too short: ${out.length} < ${t.expect.minLength}`);
      }
      if (t.expect.maxLength !== undefined && out.length > t.expect.maxLength) {
        ok = false;
        reasons.push(`too long: ${out.length} > ${t.expect.maxLength}`);
      }

      if (ok) {
        passed++;
        console.log(`  ✓ ${t.id}`);
      } else {
        failures.push({
          id: t.id,
          reason: reasons.join('; '),
          input: t.raw.slice(0, 100),
          output: out.slice(0, 200),
        });
        console.log(`  ✗ ${t.id}: ${reasons.join('; ')}`);
      }
    } catch (err: any) {
      failures.push({
        id: t.id,
        reason: `Error: ${err.message}`,
        input: t.raw.slice(0, 100),
      });
      console.log(`  ✗ ${t.id}: ERROR`);
    }
  }

  writeReport(createResult('formatting', TESTS.length, passed, failures));
}

run().catch(console.error);
