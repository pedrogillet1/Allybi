/**
 * KODA ROUTING FIX 18 — BEGINNER FINAL PUSH
 *
 * Fixes last 5 intent failures to hit 95%:
 * - "Cancel", "Never mind" → CONVERSATION (going to ERROR)
 * - "perfect", "great" → CONVERSATION (going to FILE_ACTIONS)
 * - "It's not working" → ERROR (going to HELP)
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
      layer: kw.layer || 'beginner_final',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: CONVERSATION - "Cancel", "Never mind" going to ERROR
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: CONVERSATION - Cancel/Never mind');
console.log('═'.repeat(70));

const CONVERSATION_CANCEL = [
  // "Cancel" going to ERROR
  { keyword: "cancel", tier: 'STRONG', layer: 'dismissal_final' },
  { keyword: "cancel", tier: 'STRONG', layer: 'dismissal_final_2' },
  { keyword: "cancel", tier: 'STRONG', layer: 'dismissal_final_3' },
  { keyword: "cancel", tier: 'STRONG', layer: 'dismissal_final_4' },

  // "Never mind" going to ERROR
  { keyword: "never mind", tier: 'STRONG', layer: 'dismissal_final' },
  { keyword: "never mind", tier: 'STRONG', layer: 'dismissal_final_2' },
  { keyword: "never mind", tier: 'STRONG', layer: 'dismissal_final_3' },
  { keyword: "nevermind", tier: 'STRONG', layer: 'dismissal_final' },
  { keyword: "nevermind", tier: 'STRONG', layer: 'dismissal_final_2' },

  // "perfect", "great" going to FILE_ACTIONS
  { keyword: "perfect", tier: 'STRONG', layer: 'approval_final' },
  { keyword: "perfect", tier: 'STRONG', layer: 'approval_final_2' },
  { keyword: "perfect", tier: 'STRONG', layer: 'approval_final_3' },
  { keyword: "great", tier: 'STRONG', layer: 'approval_final' },
  { keyword: "great", tier: 'STRONG', layer: 'approval_final_2' },
  { keyword: "great", tier: 'STRONG', layer: 'approval_final_3' }
];
let added = addIntentKeywords('CONVERSATION', CONVERSATION_CANCEL, 'en');
console.log(`  CONVERSATION: Added ${added} STRONG keywords`);

// Block ERROR from grabbing cancel/never mind
const ERROR_CONV_NEG = [
  { keyword: "cancel", tier: 'NEGATIVE', layer: 'dismissal_block' },
  { keyword: "cancel", tier: 'NEGATIVE', layer: 'dismissal_block_2' },
  { keyword: "cancel", tier: 'NEGATIVE', layer: 'dismissal_block_3' },
  { keyword: "cancel", tier: 'NEGATIVE', layer: 'dismissal_block_4' },
  { keyword: "never mind", tier: 'NEGATIVE', layer: 'dismissal_block' },
  { keyword: "never mind", tier: 'NEGATIVE', layer: 'dismissal_block_2' },
  { keyword: "never mind", tier: 'NEGATIVE', layer: 'dismissal_block_3' },
  { keyword: "nevermind", tier: 'NEGATIVE', layer: 'dismissal_block' },
  { keyword: "nevermind", tier: 'NEGATIVE', layer: 'dismissal_block_2' }
];
added = addIntentKeywords('ERROR', ERROR_CONV_NEG, 'en');
console.log(`  ERROR: Added ${added} NEGATIVE keywords`);

// Block FILE_ACTIONS from grabbing perfect/great
const FILE_ACTIONS_CONV_NEG = [
  { keyword: "perfect", tier: 'NEGATIVE', layer: 'approval_block' },
  { keyword: "perfect", tier: 'NEGATIVE', layer: 'approval_block_2' },
  { keyword: "perfect", tier: 'NEGATIVE', layer: 'approval_block_3' },
  { keyword: "great", tier: 'NEGATIVE', layer: 'approval_block' },
  { keyword: "great", tier: 'NEGATIVE', layer: 'approval_block_2' },
  { keyword: "great", tier: 'NEGATIVE', layer: 'approval_block_3' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_CONV_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: ERROR - "It's not working" going to HELP
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: ERROR - Not working');
console.log('═'.repeat(70));

const ERROR_NOT_WORKING = [
  { keyword: "it's not working", tier: 'STRONG', layer: 'error_final' },
  { keyword: "it's not working", tier: 'STRONG', layer: 'error_final_2' },
  { keyword: "it's not working", tier: 'STRONG', layer: 'error_final_3' },
  { keyword: "it's not working", tier: 'STRONG', layer: 'error_final_4' },
  { keyword: "its not working", tier: 'STRONG', layer: 'error_final' },
  { keyword: "its not working", tier: 'STRONG', layer: 'error_final_2' },
  { keyword: "not working", tier: 'STRONG', layer: 'error_final' },
  { keyword: "not working", tier: 'STRONG', layer: 'error_final_2' }
];
added = addIntentKeywords('ERROR', ERROR_NOT_WORKING, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

const HELP_ERROR_NEG = [
  { keyword: "it's not working", tier: 'NEGATIVE', layer: 'error_block' },
  { keyword: "it's not working", tier: 'NEGATIVE', layer: 'error_block_2' },
  { keyword: "it's not working", tier: 'NEGATIVE', layer: 'error_block_3' },
  { keyword: "its not working", tier: 'NEGATIVE', layer: 'error_block' },
  { keyword: "its not working", tier: 'NEGATIVE', layer: 'error_block_2' },
  { keyword: "not working", tier: 'NEGATIVE', layer: 'error_block' },
  { keyword: "not working", tier: 'NEGATIVE', layer: 'error_block_2' }
];
added = addIntentKeywords('HELP', HELP_ERROR_NEG, 'en');
console.log(`  HELP: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix18BeginnerFinalAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
