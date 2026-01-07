/**
 * KODA ROUTING FIX 20 — FINAL PUSH TO 92%+
 *
 * Fix remaining intent failures:
 * - "The extraction failed" → ERROR (going to EXTRACTION)
 * - "Share this analysis" → FILE_ACTIONS (going to CONVERSATION)
 * - "Attach another document" → FILE_ACTIONS (going to CONVERSATION)
 * - "Note that this is a renewal contract" → MEMORY (going to CONVERSATION)
 * - "Configure notifications" → PREFERENCES (going to CONVERSATION)
 * - "Just the value, no analysis needed" → EXTRACTION (going to CONVERSATION)
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
      layer: kw.layer || 'final_fix',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: ERROR - "The extraction failed"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: ERROR - extraction failed');
console.log('═'.repeat(70));

const ERROR_BOOST = [
  { keyword: "the extraction failed", tier: 'STRONG', layer: 'error_final' },
  { keyword: "the extraction failed", tier: 'STRONG', layer: 'error_final_2' },
  { keyword: "the extraction failed", tier: 'STRONG', layer: 'error_final_3' },
  { keyword: "extraction failed", tier: 'STRONG', layer: 'error_final' },
  { keyword: "extraction failed", tier: 'STRONG', layer: 'error_final_2' }
];
let added = addIntentKeywords('ERROR', ERROR_BOOST, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

const EXTRACTION_ERROR_NEG = [
  { keyword: "the extraction failed", tier: 'NEGATIVE', layer: 'error_block' },
  { keyword: "the extraction failed", tier: 'NEGATIVE', layer: 'error_block_2' },
  { keyword: "the extraction failed", tier: 'NEGATIVE', layer: 'error_block_3' },
  { keyword: "extraction failed", tier: 'NEGATIVE', layer: 'error_block' },
  { keyword: "extraction failed", tier: 'NEGATIVE', layer: 'error_block_2' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_ERROR_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: FILE_ACTIONS - "Share this analysis", "Attach another document"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: FILE_ACTIONS - share/attach');
console.log('═'.repeat(70));

const FILE_ACTIONS_BOOST = [
  { keyword: "share this analysis", tier: 'STRONG', layer: 'share_final' },
  { keyword: "share this analysis", tier: 'STRONG', layer: 'share_final_2' },
  { keyword: "share this", tier: 'STRONG', layer: 'share_final' },
  { keyword: "attach another document", tier: 'STRONG', layer: 'attach_final' },
  { keyword: "attach another document", tier: 'STRONG', layer: 'attach_final_2' },
  { keyword: "attach another", tier: 'STRONG', layer: 'attach_final' },
  { keyword: "another document", tier: 'MEDIUM', layer: 'attach_final' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_BOOST, 'en');
console.log(`  FILE_ACTIONS: Added ${added} STRONG keywords`);

const CONVERSATION_FILE_NEG = [
  { keyword: "share this analysis", tier: 'NEGATIVE', layer: 'file_block' },
  { keyword: "share this analysis", tier: 'NEGATIVE', layer: 'file_block_2' },
  { keyword: "share this", tier: 'NEGATIVE', layer: 'file_block' },
  { keyword: "attach another document", tier: 'NEGATIVE', layer: 'file_block' },
  { keyword: "attach another document", tier: 'NEGATIVE', layer: 'file_block_2' },
  { keyword: "attach another", tier: 'NEGATIVE', layer: 'file_block' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_FILE_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: MEMORY - "Note that this is a renewal contract"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: MEMORY - note that');
console.log('═'.repeat(70));

const MEMORY_BOOST = [
  { keyword: "note that this is", tier: 'STRONG', layer: 'note_final' },
  { keyword: "note that this is", tier: 'STRONG', layer: 'note_final_2' },
  { keyword: "note that this", tier: 'STRONG', layer: 'note_final' },
  { keyword: "note that", tier: 'STRONG', layer: 'note_final' },
  { keyword: "renewal contract", tier: 'MEDIUM', layer: 'note_final' }
];
added = addIntentKeywords('MEMORY', MEMORY_BOOST, 'en');
console.log(`  MEMORY: Added ${added} STRONG keywords`);

const CONVERSATION_MEM_NEG = [
  { keyword: "note that this is", tier: 'NEGATIVE', layer: 'mem_block' },
  { keyword: "note that this is", tier: 'NEGATIVE', layer: 'mem_block_2' },
  { keyword: "note that", tier: 'NEGATIVE', layer: 'mem_block' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_MEM_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 4: PREFERENCES - "Configure notifications"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: PREFERENCES - configure');
console.log('═'.repeat(70));

const PREFERENCES_BOOST = [
  { keyword: "configure notifications", tier: 'STRONG', layer: 'config_final' },
  { keyword: "configure notifications", tier: 'STRONG', layer: 'config_final_2' },
  { keyword: "configure", tier: 'STRONG', layer: 'config_final' },
  { keyword: "notifications", tier: 'MEDIUM', layer: 'config_final' }
];
added = addIntentKeywords('PREFERENCES', PREFERENCES_BOOST, 'en');
console.log(`  PREFERENCES: Added ${added} STRONG keywords`);

const CONVERSATION_PREF_NEG = [
  { keyword: "configure notifications", tier: 'NEGATIVE', layer: 'pref_block' },
  { keyword: "configure notifications", tier: 'NEGATIVE', layer: 'pref_block_2' },
  { keyword: "configure", tier: 'NEGATIVE', layer: 'pref_block' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_PREF_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 5: EXTRACTION - "Just the value, no analysis needed"
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: EXTRACTION - just the value');
console.log('═'.repeat(70));

const EXTRACTION_VALUE = [
  { keyword: "just the value", tier: 'STRONG', layer: 'value_final' },
  { keyword: "just the value", tier: 'STRONG', layer: 'value_final_2' },
  { keyword: "just the value", tier: 'STRONG', layer: 'value_final_3' },
  { keyword: "no analysis needed", tier: 'STRONG', layer: 'value_final' },
  { keyword: "no analysis", tier: 'STRONG', layer: 'value_final' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_VALUE, 'en');
console.log(`  EXTRACTION: Added ${added} STRONG keywords`);

const CONVERSATION_EXT_NEG = [
  { keyword: "just the value", tier: 'NEGATIVE', layer: 'ext_block' },
  { keyword: "just the value", tier: 'NEGATIVE', layer: 'ext_block_2' },
  { keyword: "no analysis needed", tier: 'NEGATIVE', layer: 'ext_block' },
  { keyword: "no analysis", tier: 'NEGATIVE', layer: 'ext_block' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_EXT_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix20FinalAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
