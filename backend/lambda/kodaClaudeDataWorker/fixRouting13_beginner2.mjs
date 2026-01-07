/**
 * KODA ROUTING FIX 13 — BEGINNER USER KEYWORDS ROUND 2
 *
 * Fixes remaining 31 intent failures from beginner test.
 * Adding stronger keywords and NEGATIVE blockers.
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
// FIX 1: HELP INTENT - More confusion/onboarding patterns
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: HELP INTENT - More patterns');
console.log('═'.repeat(70));

const HELP_MORE_EN = [
  // Onboarding - "What kind of documents can I use?"
  { keyword: 'what kind of documents', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'kind of documents', tier: 'MEDIUM', layer: 'onboarding' },
  { keyword: 'what documents', tier: 'MEDIUM', layer: 'onboarding' },

  // Confusion patterns
  { keyword: 'lost', tier: 'STRONG', layer: 'confusion' },
  { keyword: "don't understand", tier: 'STRONG', layer: 'confusion' },
  { keyword: 'confused', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'stuck', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'need help', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'what now', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'what should i', tier: 'MEDIUM', layer: 'confusion' },
  { keyword: 'go back', tier: 'MEDIUM', layer: 'navigation' },

  // "It's not working" → should be HELP not ERROR (user seeking help)
  { keyword: "it's not working", tier: 'MEDIUM', layer: 'help' }
];
let added = addIntentKeywords('HELP', HELP_MORE_EN, 'en');
console.log(`  EN: Added ${added} HELP keywords`);

const HELP_MORE_PT = [
  { keyword: 'o que você', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'perdido', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'confuso', tier: 'STRONG', layer: 'confusion' }
];
added = addIntentKeywords('HELP', HELP_MORE_PT, 'pt');
console.log(`  PT: Added ${added} HELP keywords`);

const HELP_MORE_ES = [
  { keyword: 'qué puedes', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'perdido', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'confundido', tier: 'STRONG', layer: 'confusion' }
];
added = addIntentKeywords('HELP', HELP_MORE_ES, 'es');
console.log(`  ES: Added ${added} HELP keywords`);

// ============================================================================
// FIX 2: FILE_ACTIONS INTENT - Strengthen and add NEGATIVES to others
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: FILE_ACTIONS INTENT - Strengthen');
console.log('═'.repeat(70));

const FILE_ACTIONS_MORE_EN = [
  // "Find my contract" going to MEMORY
  { keyword: 'find my contract', tier: 'STRONG', layer: 'search' },
  { keyword: 'find contract', tier: 'STRONG', layer: 'search' },

  // "Search for invoice"
  { keyword: 'search for invoice', tier: 'STRONG', layer: 'search' },
  { keyword: 'search invoice', tier: 'STRONG', layer: 'search' },

  // "Show me the contract" going to EXTRACTION
  { keyword: 'show me the contract', tier: 'STRONG', layer: 'open' },
  { keyword: 'show the contract', tier: 'STRONG', layer: 'open' },

  // "Preview my document" going to CONVERSATION
  { keyword: 'preview my document', tier: 'STRONG', layer: 'open' },
  { keyword: 'preview document', tier: 'STRONG', layer: 'open' },
  { keyword: 'preview my', tier: 'MEDIUM', layer: 'open' },

  // "Can I download this?"
  { keyword: 'can i download this', tier: 'STRONG', layer: 'download' },
  { keyword: 'download this', tier: 'MEDIUM', layer: 'download' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_MORE_EN, 'en');
console.log(`  EN: Added ${added} FILE_ACTIONS keywords`);

const FILE_ACTIONS_MORE_PT = [
  { keyword: 'abrir o documento', tier: 'STRONG', layer: 'open' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_MORE_PT, 'pt');
console.log(`  PT: Added ${added} FILE_ACTIONS keywords`);

const FILE_ACTIONS_MORE_ES = [
  { keyword: 'muéstrame mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'muestrame mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'abrir el documento', tier: 'STRONG', layer: 'open' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_MORE_ES, 'es');
console.log(`  ES: Added ${added} FILE_ACTIONS keywords`);

// Add NEGATIVE to other intents that are stealing FILE_ACTIONS queries
const MEMORY_FILE_NEG = [
  { keyword: 'find my contract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find my', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find contract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'search for', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('MEMORY', MEMORY_FILE_NEG, 'en');
console.log(`  MEMORY: Added ${added} NEGATIVE keywords`);

const EXTRACTION_FILE_NEG = [
  { keyword: 'show me the contract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show the first page', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'first page', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'skip to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'appendix', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'maybe', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_FILE_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: DOCUMENTS INTENT - Fix navigation queries going to EXTRACTION
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: DOCUMENTS INTENT - Navigation');
console.log('═'.repeat(70));

const DOCUMENTS_MORE_EN = [
  // "Show me the first page" going to EXTRACTION
  { keyword: 'show me the first page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'the first page', tier: 'STRONG', layer: 'navigation' },

  // "Skip to appendix" going to EXTRACTION
  { keyword: 'skip to appendix', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'appendix', tier: 'MEDIUM', layer: 'navigation' },

  // Basic questions
  { keyword: 'give me the main points', tier: 'STRONG', layer: 'summary' },
  { keyword: "what's on page", tier: 'STRONG', layer: 'navigation' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_MORE_EN, 'en');
console.log(`  EN: Added ${added} DOCUMENTS keywords`);

// ============================================================================
// FIX 4: EDIT INTENT - Add NEGATIVES for document queries
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: EDIT INTENT - Add NEGATIVES');
console.log('═'.repeat(70));

const EDIT_NEGATIVES = [
  { keyword: 'summarize this', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'summarize', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'abrir o documento', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'abrir el documento', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EDIT', EDIT_NEGATIVES, 'en');
console.log(`  EDIT: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 5: CONVERSATION INTENT - Single word acknowledgments
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: CONVERSATION INTENT - Acknowledgments');
console.log('═'.repeat(70));

// Add NEGATIVE to FILE_ACTIONS for simple acknowledgments
const FILE_ACTIONS_CONV_NEG = [
  { keyword: 'ok', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'maybe', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'yes', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'no', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_CONV_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords for acknowledgments`);

// ============================================================================
// FIX 6: ERROR INTENT - Add NEGATIVES for help queries
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 6: ERROR INTENT - Fix overlap with HELP');
console.log('═'.repeat(70));

// "Ayuda" (ES) going to ERROR instead of HELP
const ERROR_HELP_NEG = [
  { keyword: 'ayuda', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'help', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'ajuda', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('ERROR', ERROR_HELP_NEG, 'en');
added += addIntentKeywords('ERROR', ERROR_HELP_NEG, 'es');
added += addIntentKeywords('ERROR', ERROR_HELP_NEG, 'pt');
console.log(`  ERROR: Added ${added} NEGATIVE keywords (help words)`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix13Beginner2At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
