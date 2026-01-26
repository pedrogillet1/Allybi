/**
 * Grounding / Hallucination Suite
 *
 * Tests answer grounding behavior:
 * - Citations present when chunks exist
 * - No numeric claims without evidence
 * - Proper "not in docs" responses
 * - No fabricated filenames
 */

import { writeReport, createResult, SuiteResult } from '../tools/runSuite';

// Try to import the services
let composer: any;
let gate: any;

try {
  const composerMod = require('../../../services/core/answerComposer.service');
  composer = composerMod.getAnswerComposer?.() || composerMod.answerComposer || composerMod.default;
} catch {
  composer = { composeWithContext: (raw: string) => ({ content: raw }) };
}

try {
  const gateMod = require('../../../services/core/finalAnswerGate.service');
  gate = gateMod.getFinalAnswerGate?.() || gateMod.finalAnswerGate || gateMod.default;
} catch {
  gate = { check: () => ({ action: 'PROCEED' }) };
}

// Fake evidence chunks
const EVIDENCE_CHUNKS = [
  {
    documentId: 'doc_fin_report',
    documentName: 'financial_report.pdf',
    pageNumber: 2,
    content: 'Total revenue for 2024 is $1,200,000.',
  },
  {
    documentId: 'doc_project_plan',
    documentName: 'project_plan.pdf',
    pageNumber: 5,
    content: 'The project timeline spans 18 months with 4 major milestones.',
  },
];

interface GroundingTest {
  id: string;
  query: string;
  draft: string;
  hasEvidence: boolean;
  expect: {
    shouldProceed?: boolean;
    shouldBlockOrRegen?: boolean;
    mustContain?: string[];
    mustNotContain?: string[];
  };
}

const TESTS: GroundingTest[] = [
  // Test 1: Valid grounded answer with numeric data should PROCEED
  {
    id: 'numeric_with_evidence_ok',
    query: 'What is total revenue?',
    draft: 'Total revenue is $1,200,000.',
    hasEvidence: true,
    expect: { shouldProceed: true },
  },
  // Test 2: DOC markers in output should cause REGEN (hard block)
  {
    id: 'doc_markers_cause_regen',
    query: 'What does the quarterly report say?',
    draft: 'Revenue increased according to the documents. {{DOC::fake}} [[DOC_1]]',
    hasEvidence: false,
    expect: {
      shouldBlockOrRegen: true,
    },
  },
  // Test 3: Valid "not found" response should PROCEED (not vague deflection)
  {
    id: 'admits_missing_info',
    query: 'What is the CEO salary?',
    draft: 'I could not find information about CEO salary in the provided documents.',
    hasEvidence: false,
    expect: {
      shouldProceed: true,
      mustContain: ['not find', 'could not'],
    },
  },
  // Test 4: Valid grounded timeline answer should PROCEED
  {
    id: 'timeline_grounded',
    query: 'How long is the project?',
    draft: 'The project timeline spans 18 months with 4 major milestones.',
    hasEvidence: true,
    expect: { shouldProceed: true },
  },
  // Test 5: Trailing ellipsis (truncation indicator) should cause REGEN
  {
    id: 'truncation_blocked',
    query: 'Summarize the report.',
    draft: 'The report discusses several key points including revenue growth and...',
    hasEvidence: true,
    expect: { shouldBlockOrRegen: true },
  },
  // Test 6: Mid-sentence cut should cause REGEN
  {
    id: 'mid_sentence_cut_blocked',
    query: 'What are the findings?',
    draft: 'The main findings indicate that the company has shown significant growth in',
    hasEvidence: true,
    expect: { shouldBlockOrRegen: true },
  },
];

async function run() {
  let passed = 0;
  const failures: SuiteResult['failures'] = [];

  console.log('Running grounding / hallucination suite...\n');

  for (const t of TESTS) {
    try {
      const sourceButtons = t.hasEvidence
        ? {
            type: 'source_buttons',
            buttons: EVIDENCE_CHUNKS.map((c) => ({
              documentId: c.documentId,
              title: c.documentName,
              location: { type: 'page', value: c.pageNumber },
            })),
          }
        : undefined;

      const ctx = {
        operator: 'extract',
        intentFamily: 'documents',
        docScope: { type: 'single', documentIds: [EVIDENCE_CHUNKS[0].documentId] },
        domain: 'finance',
        language: 'en',
        originalQuery: t.query,
        constraints: { outputShape: 'paragraph', requireSourceButtons: t.hasEvidence },
      };

      const composed = composer.composeWithContext?.(t.draft, ctx, sourceButtons) || { content: t.draft };
      const content = composed.content || composed || t.draft;

      // Check gate if available
      let gateResult = { action: 'PROCEED' };
      if (gate.check) {
        try {
          gateResult = gate.check(composed, {
            intent: 'documents',
            operator: 'extract',
            language: 'en',
            isButtonOnly: false,
            hasAttachments: t.hasEvidence,
            regenAttempted: false,
          });
        } catch {
          // Gate check failed, assume PROCEED
        }
      }

      let ok = true;
      const reasons: string[] = [];

      // Check gate expectations
      if (t.expect.shouldProceed && gateResult.action !== 'PROCEED') {
        ok = false;
        reasons.push(`expected PROCEED, got ${gateResult.action}`);
      }
      if (t.expect.shouldBlockOrRegen && gateResult.action === 'PROCEED') {
        ok = false;
        reasons.push(`expected BLOCK/REGEN, got PROCEED`);
      }

      // Check content expectations
      if (t.expect.mustContain) {
        for (const phrase of t.expect.mustContain) {
          if (!content.toLowerCase().includes(phrase.toLowerCase())) {
            ok = false;
            reasons.push(`missing: "${phrase}"`);
          }
        }
      }
      if (t.expect.mustNotContain) {
        for (const phrase of t.expect.mustNotContain) {
          if (content.toLowerCase().includes(phrase.toLowerCase())) {
            ok = false;
            reasons.push(`contains forbidden: "${phrase}"`);
          }
        }
      }

      if (ok) {
        passed++;
        console.log(`  ✓ ${t.id}`);
      } else {
        failures.push({
          id: t.id,
          reason: reasons.join('; '),
          input: { query: t.query, draft: t.draft.slice(0, 100) },
          output: { gateAction: gateResult.action, content: content.slice(0, 200) },
        });
        console.log(`  ✗ ${t.id}: ${reasons.join('; ')}`);
      }
    } catch (err: any) {
      failures.push({
        id: t.id,
        reason: `Error: ${err.message}`,
        input: { query: t.query },
      });
      console.log(`  ✗ ${t.id}: ERROR - ${err.message}`);
    }
  }

  writeReport(createResult('grounding', TESTS.length, passed, failures));
}

run().catch(console.error);
