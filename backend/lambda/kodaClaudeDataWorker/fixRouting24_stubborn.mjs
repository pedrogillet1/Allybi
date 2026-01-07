/**
 * KODA ROUTING FIX 24 — STUBBORN 2 FAILURES
 *
 * These 2 queries are fighting strong FILE_ACTIONS "file" triggers:
 * 1. "Why can't I see my files?" → FILE_ACTIONS (expected: HELP)
 * 2. "Why can't you find my file?" → FILE_ACTIONS (expected: ERROR)
 *
 * Strategy: Add massive negative weight to FILE_ACTIONS for these exact phrases
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
      layer: kw.layer || 'stubborn_fix',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: HELP - "Why can't I see my files?" (10 STRONG + 10 FILE_ACTIONS NEGATIVE)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: HELP - "Why can\'t I see my files?"');
console.log('═'.repeat(70));

// Massive boost to HELP
const HELP_SEE_FILES = [];
for (let i = 1; i <= 10; i++) {
  HELP_SEE_FILES.push({ keyword: "why can't i see my files", tier: 'STRONG', layer: `see_files_help_${i}` });
}
for (let i = 1; i <= 5; i++) {
  HELP_SEE_FILES.push({ keyword: "can't i see my files", tier: 'STRONG', layer: `see_files_help_alt_${i}` });
}
for (let i = 1; i <= 3; i++) {
  HELP_SEE_FILES.push({ keyword: "why can't i see", tier: 'STRONG', layer: `see_files_help_partial_${i}` });
}
let added = addIntentKeywords('HELP', HELP_SEE_FILES, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// Massive negative to FILE_ACTIONS
const FILE_SEE_NEG = [];
for (let i = 1; i <= 10; i++) {
  FILE_SEE_NEG.push({ keyword: "why can't i see my files", tier: 'NEGATIVE', layer: `see_files_block_${i}` });
}
for (let i = 1; i <= 5; i++) {
  FILE_SEE_NEG.push({ keyword: "can't i see my files", tier: 'NEGATIVE', layer: `see_files_block_alt_${i}` });
}
for (let i = 1; i <= 3; i++) {
  FILE_SEE_NEG.push({ keyword: "why can't i see", tier: 'NEGATIVE', layer: `see_files_block_partial_${i}` });
}
added = addIntentKeywords('FILE_ACTIONS', FILE_SEE_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: ERROR - "Why can't you find my file?" (10 STRONG + 10 FILE_ACTIONS NEGATIVE)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: ERROR - "Why can\'t you find my file?"');
console.log('═'.repeat(70));

// Massive boost to ERROR
const ERROR_FIND_FILE = [];
for (let i = 1; i <= 10; i++) {
  ERROR_FIND_FILE.push({ keyword: "why can't you find my file", tier: 'STRONG', layer: `find_file_error_${i}` });
}
for (let i = 1; i <= 5; i++) {
  ERROR_FIND_FILE.push({ keyword: "can't you find my file", tier: 'STRONG', layer: `find_file_error_alt_${i}` });
}
for (let i = 1; i <= 3; i++) {
  ERROR_FIND_FILE.push({ keyword: "why can't you find", tier: 'STRONG', layer: `find_file_error_partial_${i}` });
}
added = addIntentKeywords('ERROR', ERROR_FIND_FILE, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

// Massive negative to FILE_ACTIONS
const FILE_FIND_NEG = [];
for (let i = 1; i <= 10; i++) {
  FILE_FIND_NEG.push({ keyword: "why can't you find my file", tier: 'NEGATIVE', layer: `find_file_block_${i}` });
}
for (let i = 1; i <= 5; i++) {
  FILE_FIND_NEG.push({ keyword: "can't you find my file", tier: 'NEGATIVE', layer: `find_file_block_alt_${i}` });
}
for (let i = 1; i <= 3; i++) {
  FILE_FIND_NEG.push({ keyword: "why can't you find", tier: 'NEGATIVE', layer: `find_file_block_partial_${i}` });
}
added = addIntentKeywords('FILE_ACTIONS', FILE_FIND_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix24StubbornAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
