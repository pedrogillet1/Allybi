/**
 * KODA ROUTING FIX 21 — CLEANUP
 *
 * Fix last 3 intent failures:
 * - "Read only, no modifications" → DOCUMENTS (going to FILE_ACTIONS)
 * - "Not about Koda, general question about contracts" → REASONING (going to CONVERSATION)
 * - "?" conflict between tests
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
      layer: kw.layer || 'cleanup',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: DOCUMENTS - "Read only, no modifications"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: DOCUMENTS - Read only');
console.log('═'.repeat(70));

const DOCUMENTS_READONLY = [
  { keyword: "read only, no modifications", tier: 'STRONG', layer: 'readonly_final' },
  { keyword: "read only, no modifications", tier: 'STRONG', layer: 'readonly_final_2' },
  { keyword: "read only, no modifications", tier: 'STRONG', layer: 'readonly_final_3' },
  { keyword: "no modifications", tier: 'STRONG', layer: 'readonly_final' },
  { keyword: "no modifications", tier: 'STRONG', layer: 'readonly_final_2' }
];
let added = addIntentKeywords('DOCUMENTS', DOCUMENTS_READONLY, 'en');
console.log(`  DOCUMENTS: Added ${added} STRONG keywords`);

const FILE_ACTIONS_DOC_NEG = [
  { keyword: "read only, no modifications", tier: 'NEGATIVE', layer: 'doc_block' },
  { keyword: "read only, no modifications", tier: 'NEGATIVE', layer: 'doc_block_2' },
  { keyword: "read only, no modifications", tier: 'NEGATIVE', layer: 'doc_block_3' },
  { keyword: "no modifications", tier: 'NEGATIVE', layer: 'doc_block' },
  { keyword: "no modifications", tier: 'NEGATIVE', layer: 'doc_block_2' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_DOC_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: REASONING - "Not about Koda, general question about contracts"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: REASONING - general question about');
console.log('═'.repeat(70));

const REASONING_GENERAL = [
  { keyword: "general question about", tier: 'STRONG', layer: 'general_final' },
  { keyword: "general question about", tier: 'STRONG', layer: 'general_final_2' },
  { keyword: "general question about", tier: 'STRONG', layer: 'general_final_3' },
  { keyword: "not about koda", tier: 'STRONG', layer: 'general_final' },
  { keyword: "question about contracts", tier: 'STRONG', layer: 'general_final' }
];
added = addIntentKeywords('REASONING', REASONING_GENERAL, 'en');
console.log(`  REASONING: Added ${added} STRONG keywords`);

const CONVERSATION_RSN_NEG = [
  { keyword: "general question about", tier: 'NEGATIVE', layer: 'rsn_block' },
  { keyword: "general question about", tier: 'NEGATIVE', layer: 'rsn_block_2' },
  { keyword: "general question about", tier: 'NEGATIVE', layer: 'rsn_block_3' },
  { keyword: "not about koda", tier: 'NEGATIVE', layer: 'rsn_block' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_RSN_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix21CleanupAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
