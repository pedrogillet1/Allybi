/**
 * KODA ROUTING FIX 14 — BEGINNER USER KEYWORDS ROUND 3
 *
 * Fixes remaining 27 intent failures from beginner test.
 * Focus on: confusion/help, file operations, summaries
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
// FIX 1: HELP - Confusion queries going to CONVERSATION
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: HELP - Confusion going to CONVERSATION');
console.log('═'.repeat(70));

// Add NEGATIVE to CONVERSATION to block confusion queries
const CONVERSATION_HELP_NEG = [
  { keyword: "i'm lost", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'im lost', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "i don't understand", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'i dont understand', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what do i do now', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how do i go back', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'where am i', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what kind of documents', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what formats', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'o que você', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'preview my document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'add a document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'summarize this', tier: 'NEGATIVE', layer: 'exclusion' }
];
let added = addIntentKeywords('CONVERSATION', CONVERSATION_HELP_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// Strengthen HELP with stronger keywords
const HELP_STRONGER = [
  { keyword: "i'm lost", tier: 'STRONG', layer: 'confusion' },
  { keyword: 'im lost', tier: 'STRONG', layer: 'confusion' },
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion' },
  { keyword: 'i dont understand', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'what do i do now', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'how do i go back', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'where am i', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'what kind of documents', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'what formats', tier: 'STRONG', layer: 'onboarding' }
];
added = addIntentKeywords('HELP', HELP_STRONGER, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// ============================================================================
// FIX 2: FILE_ACTIONS - File operations going to wrong intents
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: FILE_ACTIONS - Strengthen file operations');
console.log('═'.repeat(70));

const FILE_ACTIONS_STRONGER = [
  // "Search for invoice" going to DOCUMENTS
  { keyword: 'search for invoice', tier: 'STRONG', layer: 'search' },
  { keyword: 'search invoice', tier: 'STRONG', layer: 'search' },

  // "Show me the contract" going to EXTRACTION
  { keyword: 'show me the contract', tier: 'STRONG', layer: 'open' },

  // "Preview my document" going to CONVERSATION
  { keyword: 'preview my document', tier: 'STRONG', layer: 'open' },
  { keyword: 'preview my', tier: 'STRONG', layer: 'open' },

  // "Add a document" going to CONVERSATION
  { keyword: 'add a document', tier: 'STRONG', layer: 'upload' },
  { keyword: 'add document', tier: 'STRONG', layer: 'upload' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_STRONGER, 'en');
console.log(`  EN: Added ${added} FILE_ACTIONS keywords`);

// Add NEGATIVE to DOCUMENTS for file queries
const DOCUMENTS_FILE_NEG = [
  { keyword: 'search for invoice', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'search invoice', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'muéstrame mis archivos', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'muestrame mis archivos', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'abrir el documento', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_FILE_NEG, 'en');
console.log(`  DOCUMENTS: Added ${added} NEGATIVE keywords`);

// Add NEGATIVE to EXTRACTION for file queries
const EXTRACTION_MORE_NEG = [
  { keyword: 'show me the contract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'preview', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_MORE_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: DOCUMENTS - "Summarize this" going to CONVERSATION/EDIT
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: DOCUMENTS - Summarize queries');
console.log('═'.repeat(70));

const DOCUMENTS_SUMMARY = [
  { keyword: 'summarize this', tier: 'STRONG', layer: 'summary' },
  { keyword: 'summarise this', tier: 'STRONG', layer: 'summary' },
  { keyword: 'give me a summary', tier: 'STRONG', layer: 'summary' },
  { keyword: 'quick summary', tier: 'STRONG', layer: 'summary' },
  { keyword: 'brief summary', tier: 'STRONG', layer: 'summary' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_SUMMARY, 'en');
console.log(`  DOCUMENTS: Added ${added} summary keywords`);

// ============================================================================
// FIX 4: CONVERSATION - Edge cases "ok", "maybe" stealing from others
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: Edge case acknowledgments');
console.log('═'.repeat(70));

// Strengthen CONVERSATION for simple acknowledgments
const CONVERSATION_ACK = [
  { keyword: 'ok', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'okay', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'maybe', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'sure', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'alright', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'got it', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'understood', tier: 'STRONG', layer: 'acknowledgment' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_ACK, 'en');
console.log(`  CONVERSATION: Added ${added} acknowledgment keywords`);

// Block FILE_ACTIONS from matching these
const FILE_ACTIONS_ACK_NEG = [
  { keyword: 'ok', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'okay', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'maybe', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ACK_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// Block EXTRACTION from matching these
const EXTRACTION_ACK_NEG = [
  { keyword: 'maybe', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'ok', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_ACK_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 5: Multilingual - PT/ES going to wrong intents
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: Multilingual fixes');
console.log('═'.repeat(70));

// PT: "Abrir o documento" going to EDIT
const FILE_ACTIONS_PT = [
  { keyword: 'abrir o documento', tier: 'STRONG', layer: 'open' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_PT, 'pt');
console.log(`  FILE_ACTIONS PT: Added ${added} keywords`);

const EDIT_PT_NEG = [
  { keyword: 'abrir o documento', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'abrir', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EDIT', EDIT_PT_NEG, 'pt');
console.log(`  EDIT PT: Added ${added} NEGATIVE keywords`);

// ES: Multiple issues
const FILE_ACTIONS_ES = [
  { keyword: 'muéstrame mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'muestrame mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'abrir el documento', tier: 'STRONG', layer: 'open' },
  { keyword: 'mis archivos', tier: 'STRONG', layer: 'discovery' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ES, 'es');
console.log(`  FILE_ACTIONS ES: Added ${added} keywords`);

const DOCUMENTS_ES_NEG = [
  { keyword: 'muéstrame mis archivos', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'muestrame mis archivos', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'mis archivos', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'abrir el documento', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_ES_NEG, 'es');
console.log(`  DOCUMENTS ES: Added ${added} NEGATIVE keywords`);

// ES: "Ayuda" going to ERROR instead of HELP
const HELP_ES = [
  { keyword: 'ayuda', tier: 'STRONG', layer: 'help' }
];
added = addIntentKeywords('HELP', HELP_ES, 'es');
console.log(`  HELP ES: Added ${added} keywords`);

const ERROR_ES_NEG = [
  { keyword: 'ayuda', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('ERROR', ERROR_ES_NEG, 'es');
console.log(`  ERROR ES: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 6: ERROR vs HELP - "It's not working" going to HELP
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 6: ERROR - Strengthen error patterns');
console.log('═'.repeat(70));

const ERROR_STRONGER = [
  { keyword: "it's not working", tier: 'STRONG', layer: 'error' },
  { keyword: 'its not working', tier: 'STRONG', layer: 'error' },
  { keyword: 'not working', tier: 'STRONG', layer: 'error' }
];
added = addIntentKeywords('ERROR', ERROR_STRONGER, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

const HELP_ERROR_NEG = [
  { keyword: "it's not working", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'its not working', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'not working', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('HELP', HELP_ERROR_NEG, 'en');
console.log(`  HELP: Added ${added} NEGATIVE keywords for errors`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix14Beginner3At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
