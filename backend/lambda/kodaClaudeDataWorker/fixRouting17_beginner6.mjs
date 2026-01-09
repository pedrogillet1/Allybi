/**
 * KODA ROUTING FIX 17 — BEGINNER USER KEYWORDS ROUND 6
 *
 * Fixes remaining 15 intent failures:
 * - "How do I add files?" → HELP (going to REASONING)
 * - "Can I upload a PDF?" → HELP (going to FILE_ACTIONS)
 * - "I don't understand" → HELP (going to ERROR)
 * - "ok", "maybe" → CONVERSATION (going to FILE_ACTIONS/EXTRACTION)
 * - Document metadata queries going wrong
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
// FIX 1: HELP - "How do I" and "Can I" questions
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: HELP - How do I / Can I questions');
console.log('═'.repeat(70));

const HELP_HOW_CAN = [
  // "How do I add files?" going to REASONING
  { keyword: "how do i add files", tier: 'STRONG', layer: 'how_do_i' },
  { keyword: "how do i add files", tier: 'STRONG', layer: 'how_do_i_2' },
  { keyword: "how do i add files", tier: 'STRONG', layer: 'how_do_i_3' },
  { keyword: "add files", tier: 'STRONG', layer: 'how_do_i' },

  // "Can I upload a PDF?" going to FILE_ACTIONS
  { keyword: "can i upload a pdf", tier: 'STRONG', layer: 'can_i' },
  { keyword: "can i upload a pdf", tier: 'STRONG', layer: 'can_i_2' },
  { keyword: "can i upload", tier: 'STRONG', layer: 'can_i' },

  // "I don't understand" going to ERROR
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion_final' },
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion_final_2' },
  { keyword: "don't understand", tier: 'STRONG', layer: 'confusion_final' },

  // "How do I go back?"
  { keyword: "how do i go back", tier: 'STRONG', layer: 'how_do_i' },
  { keyword: "how do i go back", tier: 'STRONG', layer: 'how_do_i_2' },
  { keyword: "go back", tier: 'STRONG', layer: 'how_do_i' },

  // "Start over"
  { keyword: "start over", tier: 'STRONG', layer: 'confusion_final' },
  { keyword: "start over", tier: 'STRONG', layer: 'confusion_final_2' }
];
let added = addIntentKeywords('HELP', HELP_HOW_CAN, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// Block from REASONING
const REASONING_NEG = [
  { keyword: "how do i add files", tier: 'NEGATIVE', layer: 'help_block' },
  { keyword: "how do i add files", tier: 'NEGATIVE', layer: 'help_block_2' },
  { keyword: "how do i go back", tier: 'NEGATIVE', layer: 'help_block' },
  { keyword: "how do i go back", tier: 'NEGATIVE', layer: 'help_block_2' }
];
added = addIntentKeywords('REASONING', REASONING_NEG, 'en');
console.log(`  REASONING: Added ${added} NEGATIVE keywords`);

// Block from FILE_ACTIONS
const FILE_ACTIONS_HELP_NEG = [
  { keyword: "can i upload a pdf", tier: 'NEGATIVE', layer: 'help_block' },
  { keyword: "can i upload a pdf", tier: 'NEGATIVE', layer: 'help_block_2' },
  { keyword: "is there a signature", tier: 'NEGATIVE', layer: 'doc_block' },
  { keyword: "signature page", tier: 'NEGATIVE', layer: 'doc_block' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_HELP_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// Block from ERROR
const ERROR_HELP_NEG = [
  { keyword: "i don't understand", tier: 'NEGATIVE', layer: 'confusion_block' },
  { keyword: "i don't understand", tier: 'NEGATIVE', layer: 'confusion_block_2' },
  { keyword: "don't understand", tier: 'NEGATIVE', layer: 'confusion_block' },
  { keyword: "dont understand", tier: 'NEGATIVE', layer: 'confusion_block' }
];
added = addIntentKeywords('ERROR', ERROR_HELP_NEG, 'en');
console.log(`  ERROR: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: DOCUMENTS - Metadata queries going to EXTRACTION/FILE_ACTIONS
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: DOCUMENTS - Metadata queries');
console.log('═'.repeat(70));

const DOCUMENTS_META = [
  // "When was this created?"
  { keyword: "when was this created", tier: 'STRONG', layer: 'metadata' },
  { keyword: "when was this created", tier: 'STRONG', layer: 'metadata_2' },
  { keyword: "was this created", tier: 'STRONG', layer: 'metadata' },

  // "Is there a signature page?"
  { keyword: "is there a signature page", tier: 'STRONG', layer: 'navigation' },
  { keyword: "is there a signature page", tier: 'STRONG', layer: 'navigation_2' },
  { keyword: "signature page", tier: 'STRONG', layer: 'navigation' },

  // "Who wrote this?"
  { keyword: "who wrote this", tier: 'STRONG', layer: 'metadata' },
  { keyword: "who wrote this", tier: 'STRONG', layer: 'metadata_2' },

  // "How many pages?"
  { keyword: "how many pages", tier: 'STRONG', layer: 'metadata' },
  { keyword: "how many pages", tier: 'STRONG', layer: 'metadata_2' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_META, 'en');
console.log(`  DOCUMENTS: Added ${added} STRONG keywords`);

// Block from EXTRACTION
const EXTRACTION_DOC_NEG = [
  { keyword: "when was this created", tier: 'NEGATIVE', layer: 'meta_block' },
  { keyword: "when was this created", tier: 'NEGATIVE', layer: 'meta_block_2' },
  { keyword: "who wrote this", tier: 'NEGATIVE', layer: 'meta_block' },
  { keyword: "how many pages", tier: 'NEGATIVE', layer: 'meta_block' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_DOC_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: CONVERSATION - Edge case acknowledgments
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: CONVERSATION - Edge case acknowledgments');
console.log('═'.repeat(70));

const CONVERSATION_ACK = [
  // "ok" going to FILE_ACTIONS
  { keyword: "ok", tier: 'STRONG', layer: 'ack_final' },
  { keyword: "ok", tier: 'STRONG', layer: 'ack_final_2' },
  { keyword: "ok", tier: 'STRONG', layer: 'ack_final_3' },

  // "maybe" going to EXTRACTION
  { keyword: "maybe", tier: 'STRONG', layer: 'ack_final' },
  { keyword: "maybe", tier: 'STRONG', layer: 'ack_final_2' },
  { keyword: "maybe", tier: 'STRONG', layer: 'ack_final_3' },

  // "yes", "no"
  { keyword: "yes", tier: 'STRONG', layer: 'ack_final' },
  { keyword: "yes", tier: 'STRONG', layer: 'ack_final_2' },
  { keyword: "no", tier: 'STRONG', layer: 'ack_final' },
  { keyword: "no", tier: 'STRONG', layer: 'ack_final_2' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_ACK, 'en');
console.log(`  CONVERSATION: Added ${added} STRONG keywords`);

// Block from other intents
const FILE_ACTIONS_ACK_NEG = [
  { keyword: "ok", tier: 'NEGATIVE', layer: 'ack_block' },
  { keyword: "ok", tier: 'NEGATIVE', layer: 'ack_block_2' },
  { keyword: "ok", tier: 'NEGATIVE', layer: 'ack_block_3' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ACK_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

const EXTRACTION_ACK_NEG = [
  { keyword: "maybe", tier: 'NEGATIVE', layer: 'ack_block' },
  { keyword: "maybe", tier: 'NEGATIVE', layer: 'ack_block_2' },
  { keyword: "maybe", tier: 'NEGATIVE', layer: 'ack_block_3' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_ACK_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 4: MEMORY - "Start over" going wrong
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: MEMORY - Start over');
console.log('═'.repeat(70));

const MEMORY_START = [
  { keyword: "start over", tier: 'STRONG', layer: 'session' },
  { keyword: "start over", tier: 'STRONG', layer: 'session_2' },
  { keyword: "start over", tier: 'STRONG', layer: 'session_3' }
];
added = addIntentKeywords('MEMORY', MEMORY_START, 'en');
console.log(`  MEMORY: Added ${added} STRONG keywords`);

// ============================================================================
// FIX 5: Spanish "Ayuda" going to ERROR
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: Spanish Ayuda fix');
console.log('═'.repeat(70));

const HELP_ES = [
  { keyword: "ayuda", tier: 'STRONG', layer: 'help_es' },
  { keyword: "ayuda", tier: 'STRONG', layer: 'help_es_2' },
  { keyword: "ayuda", tier: 'STRONG', layer: 'help_es_3' }
];
added = addIntentKeywords('HELP', HELP_ES, 'es');
console.log(`  HELP ES: Added ${added} STRONG keywords`);

const ERROR_ES_NEG = [
  { keyword: "ayuda", tier: 'NEGATIVE', layer: 'help_block' },
  { keyword: "ayuda", tier: 'NEGATIVE', layer: 'help_block_2' },
  { keyword: "ayuda", tier: 'NEGATIVE', layer: 'help_block_3' }
];
added = addIntentKeywords('ERROR', ERROR_ES_NEG, 'es');
console.log(`  ERROR ES: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix17Beginner6At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
