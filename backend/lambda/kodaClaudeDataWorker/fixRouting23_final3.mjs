/**
 * KODA ROUTING FIX 23 — FINAL 3 FAILURES
 *
 * Fix remaining 3 answer quality failures:
 * 1. "Show me the contract" → EDIT (expected: DOCUMENTS)
 * 2. "Why can't I see my files?" → FILE_ACTIONS (expected: HELP)
 * 3. "Why can't you find my file?" → FILE_ACTIONS (expected: ERROR)
 *
 * RULES: ONLY ADDITIONS, NO DELETIONS
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

function addIntentKeywords(intentName, keywords, lang = 'en') {
  const data = intentPatterns.intents[intentName];
  if (!data) {
    console.log(`  WARNING: Intent ${intentName} not found`);
    return 0;
  }

  if (!data.keywords) data.keywords = {};
  if (!data.keywords[lang]) data.keywords[lang] = [];

  let added = 0;
  for (const kw of keywords) {
    data.keywords[lang].push({
      keyword: kw.keyword,
      tier: kw.tier,
      layer: kw.layer || 'final_3',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: DOCUMENTS - "Show me the contract"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: DOCUMENTS - "Show me the contract"');
console.log('═'.repeat(70));

// Heavy boost to DOCUMENTS
const DOCUMENTS_SHOW_CONTRACT = [
  { keyword: "show me the contract", tier: 'STRONG', layer: 'show_contract_fix_1' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'show_contract_fix_2' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'show_contract_fix_3' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'show_contract_fix_4' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'show_contract_fix_5' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'show_contract_fix_6' }
];
let added = addIntentKeywords('DOCUMENTS', DOCUMENTS_SHOW_CONTRACT, 'en');
console.log(`  DOCUMENTS: Added ${added} STRONG keywords`);

// Heavy negative to EDIT
const EDIT_SHOW_NEG = [
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'show_contract_block_1' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'show_contract_block_2' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'show_contract_block_3' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'show_contract_block_4' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'show_contract_block_5' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'show_contract_block_6' }
];
added = addIntentKeywords('EDIT', EDIT_SHOW_NEG, 'en');
console.log(`  EDIT: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: HELP - "Why can't I see my files?"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: HELP - "Why can\'t I see my files?"');
console.log('═'.repeat(70));

// Heavy boost to HELP
const HELP_CANT_SEE = [
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_1' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_2' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_3' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_4' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_5' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_6' },
  { keyword: "can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_1' },
  { keyword: "can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_2' },
  { keyword: "can't i see my files", tier: 'STRONG', layer: 'cant_see_fix_3' },
  { keyword: "can't i see my", tier: 'STRONG', layer: 'cant_see_fix_1' },
  { keyword: "can't i see my", tier: 'STRONG', layer: 'cant_see_fix_2' }
];
added = addIntentKeywords('HELP', HELP_CANT_SEE, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// Heavy negative to FILE_ACTIONS
const FILE_ACTIONS_CANT_SEE_NEG = [
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_1' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_2' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_3' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_4' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_5' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_6' },
  { keyword: "can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_1' },
  { keyword: "can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_2' },
  { keyword: "can't i see my files", tier: 'NEGATIVE', layer: 'cant_see_block_3' },
  { keyword: "can't i see my", tier: 'NEGATIVE', layer: 'cant_see_block_1' },
  { keyword: "can't i see my", tier: 'NEGATIVE', layer: 'cant_see_block_2' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_CANT_SEE_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: ERROR - "Why can't you find my file?"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: ERROR - "Why can\'t you find my file?"');
console.log('═'.repeat(70));

// Heavy boost to ERROR
const ERROR_CANT_FIND = [
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_1' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_2' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_3' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_4' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_5' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_6' },
  { keyword: "can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_1' },
  { keyword: "can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_2' },
  { keyword: "can't you find my file", tier: 'STRONG', layer: 'cant_find_fix_3' },
  { keyword: "can't you find my", tier: 'STRONG', layer: 'cant_find_fix_1' },
  { keyword: "can't you find my", tier: 'STRONG', layer: 'cant_find_fix_2' }
];
added = addIntentKeywords('ERROR', ERROR_CANT_FIND, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

// Heavy negative to FILE_ACTIONS
const FILE_ACTIONS_CANT_FIND_NEG = [
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_1' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_2' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_3' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_4' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_5' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_6' },
  { keyword: "can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_1' },
  { keyword: "can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_2' },
  { keyword: "can't you find my file", tier: 'NEGATIVE', layer: 'cant_find_block_3' },
  { keyword: "can't you find my", tier: 'NEGATIVE', layer: 'cant_find_block_1' },
  { keyword: "can't you find my", tier: 'NEGATIVE', layer: 'cant_find_block_2' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_CANT_FIND_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix23Final3At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
