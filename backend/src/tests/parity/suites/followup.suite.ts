/**
 * Follow-up Coherence Suite
 *
 * Tests multi-turn conversation behavior:
 * - Pronoun inheritance
 * - "again" operator inheritance
 * - Document scope persistence
 * - Language consistency
 */

import { router } from '../../../services/core/router.service';
import { PARITY_CONFIG } from '../parity.config';
import { writeReport, createResult, SuiteResult } from '../tools/runSuite';

interface TurnTest {
  id: string;
  req: { text: string };
  expect: {
    intentFamily: string;
    operator?: string;
    docScopeMode?: string;
  };
  remember?: {
    recentDocIds?: string[];
    recentDocNames?: string[];
    previousOperator?: string;
    previousIntent?: string;
  };
}

const TURNS: TurnTest[] = [
  // Basic open + again flow
  {
    id: 'turn1_open',
    req: { text: 'Open budget_2024.xlsx' },
    expect: { intentFamily: 'file_actions', operator: 'open' },
    remember: {
      recentDocIds: ['doc_budget_2024'],
      recentDocNames: ['budget_2024.xlsx'],
      previousOperator: 'open',
      previousIntent: 'file_actions',
    },
  },
  {
    id: 'turn2_again',
    req: { text: 'Open it again' },
    expect: { intentFamily: 'file_actions', operator: 'open' },
  },
  {
    id: 'turn3_followup_content',
    req: { text: 'What is the total revenue?' },
    expect: { intentFamily: 'documents', operator: 'extract' },
  },

  // Summarize + followup
  {
    id: 'turn4_summarize',
    req: { text: 'Summarize the project plan' },
    expect: { intentFamily: 'documents', operator: 'summarize' },
    remember: {
      recentDocIds: ['doc_project_plan'],
      recentDocNames: ['project_plan.pdf'],
      previousOperator: 'summarize',
      previousIntent: 'documents',
    },
  },
  {
    id: 'turn5_pronoun_it',
    req: { text: 'What does it say about risks?' },
    expect: { intentFamily: 'documents' },
  },
  {
    id: 'turn6_more_detail',
    req: { text: 'Tell me more about that' },
    expect: { intentFamily: 'documents' },
  },

  // Compare flow
  {
    id: 'turn7_compare',
    req: { text: 'Compare budget_2024.xlsx and budget_2025.xlsx' },
    expect: { intentFamily: 'documents', operator: 'compare' },
    remember: {
      recentDocIds: ['doc_budget_2024', 'doc_budget_2025'],
      recentDocNames: ['budget_2024.xlsx', 'budget_2025.xlsx'],
      previousOperator: 'compare',
      previousIntent: 'documents',
    },
  },
  {
    id: 'turn8_differences',
    req: { text: 'What are the main differences?' },
    expect: { intentFamily: 'documents' },
  },

  // Switch context
  {
    id: 'turn9_switch',
    req: { text: 'Now open the contract' },
    expect: { intentFamily: 'file_actions', operator: 'open' },
    remember: {
      recentDocIds: ['doc_contract'],
      recentDocNames: ['contract_2024.pdf'],
      previousOperator: 'open',
      previousIntent: 'file_actions',
    },
  },
  {
    id: 'turn10_new_context',
    req: { text: 'What are the key terms?' },
    expect: { intentFamily: 'documents', operator: 'extract' },
  },
];

async function run() {
  let passed = 0;
  const failures: SuiteResult['failures'] = [];
  let memory: any = {};

  console.log('Running follow-up coherence suite...\n');

  for (const turn of TURNS) {
    try {
      const res = await router.route({
        text: turn.req.text,
        userId: PARITY_CONFIG.userId,
        hasDocuments: PARITY_CONFIG.hasDocuments,
        availableDocs: PARITY_CONFIG.availableDocs,
        recentDocIds: memory.recentDocIds,
        recentDocNames: memory.recentDocNames,
        previousOperator: memory.previousOperator,
        previousIntent: memory.previousIntent,
      });

      const okFamily = res.intentFamily === turn.expect.intentFamily;
      const okOp = turn.expect.operator ? res.operator === turn.expect.operator : true;
      const okScope = turn.expect.docScopeMode ? res.docScope?.mode === turn.expect.docScopeMode : true;

      const ok = okFamily && okOp && okScope;

      if (ok) {
        passed++;
        console.log(`  ✓ ${turn.id}`);
      } else {
        failures.push({
          id: turn.id,
          reason: `family=${res.intentFamily}(exp:${turn.expect.intentFamily}) op=${res.operator}(exp:${turn.expect.operator || 'any'})`,
          input: turn.req,
          output: { intentFamily: res.intentFamily, operator: res.operator, docScope: res.docScope?.mode },
        });
        console.log(`  ✗ ${turn.id}: got ${res.intentFamily}/${res.operator}`);
      }

      // Update memory
      if (turn.remember) {
        memory = { ...memory, ...turn.remember };
      } else {
        if (res.docScope?.docIds?.length) {
          memory.recentDocIds = res.docScope.docIds;
          memory.recentDocNames = res.docScope.docNames;
        }
        memory.previousOperator = res.operator;
        memory.previousIntent = res.intentFamily;
      }
    } catch (err: any) {
      failures.push({
        id: turn.id,
        reason: `Error: ${err.message}`,
        input: turn.req,
      });
      console.log(`  ✗ ${turn.id}: ERROR`);
    }
  }

  writeReport(createResult('followup', TURNS.length, passed, failures));
}

run().catch(console.error);
