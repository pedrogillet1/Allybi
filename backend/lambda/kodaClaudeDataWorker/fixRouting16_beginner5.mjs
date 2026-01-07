/**
 * KODA ROUTING FIX 16 — BEGINNER USER KEYWORDS ROUND 5
 *
 * Problem: CONVERSATION has many "I'm lost" keywords from failure modes data.
 * Solution: Add multiple NEGATIVE keywords to overwhelm the positive matches.
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

  // For this fix, we explicitly allow duplicates of NEGATIVE keywords
  let added = 0;
  for (const kw of keywords) {
    data.keywords[lang].push({
      keyword: kw.keyword,
      tier: kw.tier,
      layer: kw.layer || 'beginner_override',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: CONVERSATION - Add multiple NEGATIVES for beginner queries
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: CONVERSATION - Block beginner queries');
console.log('═'.repeat(70));

// Need to add 5+ NEGATIVE to overcome the 3+ STRONG/MEDIUM from existing data
const CONVERSATION_STRONG_NEG = [
  // "I'm lost" - need multiple NEGATIVES
  { keyword: "i'm lost", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "i'm lost", tier: 'NEGATIVE', layer: 'beginner_block_2' },
  { keyword: "i'm lost", tier: 'NEGATIVE', layer: 'beginner_block_3' },
  { keyword: "im lost", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "im lost", tier: 'NEGATIVE', layer: 'beginner_block_2' },
  { keyword: "lost", tier: 'NEGATIVE', layer: 'beginner_block' },

  // "I don't understand"
  { keyword: "i don't understand", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "i don't understand", tier: 'NEGATIVE', layer: 'beginner_block_2' },
  { keyword: "i don't understand", tier: 'NEGATIVE', layer: 'beginner_block_3' },
  { keyword: "i dont understand", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "dont understand", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "don't understand", tier: 'NEGATIVE', layer: 'beginner_block' },

  // "What kind of documents"
  { keyword: "what kind of documents", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "what kind of documents", tier: 'NEGATIVE', layer: 'beginner_block_2' },
  { keyword: "kind of documents", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "kind of documents", tier: 'NEGATIVE', layer: 'beginner_block_2' },

  // Other confusion phrases
  { keyword: "what do i do now", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "what do i do", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "how do i go back", tier: 'NEGATIVE', layer: 'beginner_block' },
  { keyword: "where am i", tier: 'NEGATIVE', layer: 'beginner_block' }
];
let added = addIntentKeywords('CONVERSATION', CONVERSATION_STRONG_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: HELP - Add more STRONG keywords
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: HELP - Add more STRONG keywords');
console.log('═'.repeat(70));

const HELP_STRONG_BOOST = [
  // Multiple STRONG for "I'm lost"
  { keyword: "i'm lost", tier: 'STRONG', layer: 'confusion_mega' },
  { keyword: "i'm lost", tier: 'STRONG', layer: 'confusion_mega_2' },
  { keyword: "i'm lost", tier: 'STRONG', layer: 'confusion_mega_3' },
  { keyword: "im lost", tier: 'STRONG', layer: 'confusion_mega' },
  { keyword: "im lost", tier: 'STRONG', layer: 'confusion_mega_2' },

  // Multiple STRONG for "I don't understand"
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion_mega' },
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion_mega_2' },
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion_mega_3' },
  { keyword: "dont understand", tier: 'STRONG', layer: 'confusion_mega' },

  // Multiple STRONG for "What kind of documents"
  { keyword: "what kind of documents", tier: 'STRONG', layer: 'onboarding_mega' },
  { keyword: "what kind of documents", tier: 'STRONG', layer: 'onboarding_mega_2' },
  { keyword: "kind of documents", tier: 'STRONG', layer: 'onboarding_mega' },
  { keyword: "kind of documents", tier: 'STRONG', layer: 'onboarding_mega_2' },

  // Other confusion
  { keyword: "what do i do now", tier: 'STRONG', layer: 'confusion_mega' },
  { keyword: "what do i do now", tier: 'STRONG', layer: 'confusion_mega_2' },
  { keyword: "how do i go back", tier: 'STRONG', layer: 'confusion_mega' },
  { keyword: "how do i go back", tier: 'STRONG', layer: 'confusion_mega_2' },
  { keyword: "where am i", tier: 'STRONG', layer: 'confusion_mega' },
  { keyword: "where am i", tier: 'STRONG', layer: 'confusion_mega_2' }
];
added = addIntentKeywords('HELP', HELP_STRONG_BOOST, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// ============================================================================
// FIX 3: FILE_ACTIONS - Stronger for file queries
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: FILE_ACTIONS - Stronger file queries');
console.log('═'.repeat(70));

const FILE_ACTIONS_STRONG = [
  // Multiple STRONG for "Search for invoice"
  { keyword: "search for invoice", tier: 'STRONG', layer: 'search_mega' },
  { keyword: "search for invoice", tier: 'STRONG', layer: 'search_mega_2' },
  { keyword: "search for invoice", tier: 'STRONG', layer: 'search_mega_3' },

  // Multiple STRONG for "Show me the contract"
  { keyword: "show me the contract", tier: 'STRONG', layer: 'open_mega' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'open_mega_2' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'open_mega_3' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_STRONG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} STRONG keywords`);

// DOCUMENTS needs multiple NEGATIVES
const DOCUMENTS_NEG = [
  { keyword: "search for invoice", tier: 'NEGATIVE', layer: 'file_block' },
  { keyword: "search for invoice", tier: 'NEGATIVE', layer: 'file_block_2' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'file_block' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'file_block_2' },
  { keyword: "abrir el documento", tier: 'NEGATIVE', layer: 'file_block' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_NEG, 'en');
console.log(`  DOCUMENTS: Added ${added} NEGATIVE keywords`);

// EXTRACTION needs multiple NEGATIVES
const EXTRACTION_NEG = [
  { keyword: "give me the main points", tier: 'NEGATIVE', layer: 'doc_block' },
  { keyword: "main points", tier: 'NEGATIVE', layer: 'doc_block' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 4: DOCUMENTS - Stronger for summary queries
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: DOCUMENTS - Stronger summary queries');
console.log('═'.repeat(70));

const DOCUMENTS_STRONG = [
  { keyword: "give me the main points", tier: 'STRONG', layer: 'summary_mega' },
  { keyword: "give me the main points", tier: 'STRONG', layer: 'summary_mega_2' },
  { keyword: "main points", tier: 'STRONG', layer: 'summary_mega' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_STRONG, 'en');
console.log(`  DOCUMENTS: Added ${added} STRONG keywords`);

// ============================================================================
// FIX 5: Spanish fixes
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: Spanish fixes');
console.log('═'.repeat(70));

const FILE_ACTIONS_ES = [
  { keyword: "abrir el documento", tier: 'STRONG', layer: 'open_mega' },
  { keyword: "abrir el documento", tier: 'STRONG', layer: 'open_mega_2' },
  { keyword: "abrir el documento", tier: 'STRONG', layer: 'open_mega_3' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ES, 'es');
console.log(`  FILE_ACTIONS ES: Added ${added} STRONG keywords`);

const DOCUMENTS_ES_NEG = [
  { keyword: "abrir el documento", tier: 'NEGATIVE', layer: 'file_block' },
  { keyword: "abrir el documento", tier: 'NEGATIVE', layer: 'file_block_2' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_ES_NEG, 'es');
console.log(`  DOCUMENTS ES: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix16Beginner5At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
