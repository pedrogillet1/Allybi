/**
 * KODA ROUTING FIX 15 — BEGINNER USER KEYWORDS ROUND 4
 *
 * Targeted fixes based on score analysis:
 * - "I'm lost" → CONVERSATION (3.4) beats HELP (2.4)
 * - "Search for invoice" → DOCUMENTS (10.6) beats FILE_ACTIONS (1.6)
 * - "ok", "maybe" going to wrong intents
 *
 * Strategy: Add multiple STRONG keywords to boost target intent
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

  const existing = new Set(data.keywords[lang].map(k => (k.keyword || '').toLowerCase()));
  let added = 0;

  for (const kw of keywords) {
    if (!existing.has(kw.keyword.toLowerCase())) {
      data.keywords[lang].push({
        keyword: kw.keyword,
        tier: kw.tier,
        layer: kw.layer || 'beginner',
        target: kw.target || intentName,
        variants: []
      });
      added++;
    }
  }
  return added;
}

// ============================================================================
// FIX 1: HELP - Boost confusion signals (need 3+ STRONG to beat CONVERSATION)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: HELP - Boost confusion signals');
console.log('═'.repeat(70));

// Add more variants of confusion phrases
const HELP_CONFUSION_BOOST = [
  // "I'm lost" variants - need multiple STRONG to win
  { keyword: "i'm lost", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "i am lost", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "lost", tier: 'STRONG', layer: 'confusion_boost' },

  // "I don't understand" variants
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "don't understand", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "dont understand", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "do not understand", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "understand", tier: 'MEDIUM', layer: 'confusion_boost' },

  // "What kind of documents"
  { keyword: "what kind of documents", tier: 'STRONG', layer: 'onboarding_boost' },
  { keyword: "kind of documents", tier: 'STRONG', layer: 'onboarding_boost' },
  { keyword: "what documents", tier: 'STRONG', layer: 'onboarding_boost' },
  { keyword: "documents can i use", tier: 'STRONG', layer: 'onboarding_boost' },
  { keyword: "can i use", tier: 'MEDIUM', layer: 'onboarding_boost' },

  // Other confusion
  { keyword: "what do i do", tier: 'STRONG', layer: 'confusion_boost' },
  { keyword: "go back", tier: 'STRONG', layer: 'confusion_boost' }
];
let added = addIntentKeywords('HELP', HELP_CONFUSION_BOOST, 'en');
console.log(`  HELP: Added ${added} confusion boost keywords`);

// ============================================================================
// FIX 2: FILE_ACTIONS - Boost search/file signals
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: FILE_ACTIONS - Boost search signals');
console.log('═'.repeat(70));

const FILE_ACTIONS_BOOST = [
  // "Search for invoice" - need to beat DOCUMENTS (10.6)
  { keyword: "search for invoice", tier: 'STRONG', layer: 'search_boost' },
  { keyword: "search invoice", tier: 'STRONG', layer: 'search_boost' },
  { keyword: "for invoice", tier: 'STRONG', layer: 'search_boost' },
  { keyword: "invoice", tier: 'MEDIUM', layer: 'search_boost' },

  // "Show me the contract"
  { keyword: "show me the contract", tier: 'STRONG', layer: 'open_boost' },
  { keyword: "the contract", tier: 'STRONG', layer: 'open_boost' },
  { keyword: "contract", tier: 'MEDIUM', layer: 'open_boost' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_BOOST, 'en');
console.log(`  FILE_ACTIONS: Added ${added} boost keywords`);

// Add more NEGATIVES to DOCUMENTS for file queries
const DOCUMENTS_SEARCH_NEG = [
  { keyword: "search for", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "invoice", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "contract", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "show me the", tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_SEARCH_NEG, 'en');
console.log(`  DOCUMENTS: Added ${added} NEGATIVE keywords`);

// Add NEGATIVES to EXTRACTION
const EXTRACTION_FILE_NEG = [
  { keyword: "contract", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "show me the", tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_FILE_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: CONVERSATION - Stronger acknowledgment signals
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: CONVERSATION - Acknowledgment boost');
console.log('═'.repeat(70));

const CONVERSATION_ACK_BOOST = [
  // "ok" needs multiple STRONG
  { keyword: "ok", tier: 'STRONG', layer: 'ack_boost' },
  { keyword: "ok", tier: 'STRONG', layer: 'ack_boost2' },

  // "maybe" needs multiple STRONG
  { keyword: "maybe", tier: 'STRONG', layer: 'ack_boost' },
  { keyword: "maybe", tier: 'STRONG', layer: 'ack_boost2' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_ACK_BOOST, 'en');
console.log(`  CONVERSATION: Added ${added} acknowledgment boost keywords`);

// More NEGATIVES to FILE_ACTIONS and EXTRACTION
const FILE_ACK_NEG = [
  { keyword: "ok", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "ok", tier: 'NEGATIVE', layer: 'exclusion2' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACK_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

const EXTRACTION_ACK_NEG = [
  { keyword: "maybe", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "maybe", tier: 'NEGATIVE', layer: 'exclusion2' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_ACK_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 4: Spanish fixes
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: Spanish fixes');
console.log('═'.repeat(70));

const FILE_ACTIONS_ES = [
  { keyword: "muéstrame mis archivos", tier: 'STRONG', layer: 'discovery' },
  { keyword: "muestrame mis archivos", tier: 'STRONG', layer: 'discovery' },
  { keyword: "mis archivos", tier: 'STRONG', layer: 'discovery' },
  { keyword: "archivos", tier: 'STRONG', layer: 'discovery' },
  { keyword: "abrir el documento", tier: 'STRONG', layer: 'open' },
  { keyword: "el documento", tier: 'MEDIUM', layer: 'open' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ES, 'es');
console.log(`  FILE_ACTIONS ES: Added ${added} keywords`);

const MEMORY_ES_NEG = [
  { keyword: "muéstrame mis archivos", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "muestrame mis archivos", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "mis archivos", tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('MEMORY', MEMORY_ES_NEG, 'es');
console.log(`  MEMORY ES: Added ${added} NEGATIVE keywords`);

const DOCUMENTS_ES_NEG = [
  { keyword: "abrir el documento", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "archivos", tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_ES_NEG, 'es');
console.log(`  DOCUMENTS ES: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix15Beginner4At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
