/**
 * KODA ROUTING FIX 19 — REBALANCE AFTER BEGINNER FIXES
 *
 * Fix regressions from beginner fixes:
 * - "Evaluate the enforceability of this non-compete" → REASONING (going to CONVERSATION)
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
      layer: kw.layer || 'balance',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX: REASONING - Boost analysis keywords
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX: REASONING - Boost analysis keywords');
console.log('═'.repeat(70));

const REASONING_BOOST = [
  { keyword: "evaluate the enforceability", tier: 'STRONG', layer: 'reasoning_boost' },
  { keyword: "evaluate the enforceability", tier: 'STRONG', layer: 'reasoning_boost_2' },
  { keyword: "enforceability", tier: 'STRONG', layer: 'reasoning_boost' },
  { keyword: "enforceability", tier: 'STRONG', layer: 'reasoning_boost_2' },
  { keyword: "non-compete", tier: 'STRONG', layer: 'reasoning_boost' }
];
let added = addIntentKeywords('REASONING', REASONING_BOOST, 'en');
console.log(`  REASONING: Added ${added} STRONG keywords`);

// Block CONVERSATION from analysis queries
const CONVERSATION_REASONING_NEG = [
  { keyword: "evaluate", tier: 'NEGATIVE', layer: 'reasoning_block' },
  { keyword: "enforceability", tier: 'NEGATIVE', layer: 'reasoning_block' },
  { keyword: "enforceability", tier: 'NEGATIVE', layer: 'reasoning_block_2' },
  { keyword: "non-compete", tier: 'NEGATIVE', layer: 'reasoning_block' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_REASONING_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix19BalanceAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
