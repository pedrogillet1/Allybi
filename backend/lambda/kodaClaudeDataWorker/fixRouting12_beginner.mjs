/**
 * KODA ROUTING FIX 12 — BEGINNER USER KEYWORDS
 *
 * Fixes 66 intent failures from beginner test by adding Layer 0 keywords
 * for simple, first-contact queries.
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
// FIX 1: HELP INTENT - Onboarding & Capability Discovery
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: HELP INTENT - Beginner Queries');
console.log('═'.repeat(70));

const HELP_BEGINNER_EN = [
  // Capability discovery
  { keyword: 'what can you do', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'what do you do', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'how does this work', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'what kind of documents', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'what formats do you support', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'what formats', tier: 'MEDIUM', layer: 'onboarding' },
  { keyword: 'is this free', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'can you read spreadsheets', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'can you read', tier: 'MEDIUM', layer: 'onboarding' },
  { keyword: 'help', tier: 'STRONG', layer: 'help' },

  // Confusion/lost
  { keyword: "i'm lost", tier: 'STRONG', layer: 'confusion' },
  { keyword: 'im lost', tier: 'STRONG', layer: 'confusion' },
  { keyword: "i don't understand", tier: 'STRONG', layer: 'confusion' },
  { keyword: 'i dont understand', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'what do i do now', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'how do i go back', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'where am i', tier: 'STRONG', layer: 'confusion' },

  // Upload help
  { keyword: 'how do i add files', tier: 'STRONG', layer: 'help' },
  { keyword: 'can i upload', tier: 'STRONG', layer: 'help' },
  { keyword: 'can i upload a pdf', tier: 'STRONG', layer: 'help' },

  // Single character
  { keyword: '?', tier: 'MEDIUM', layer: 'confusion' }
];
let added = addIntentKeywords('HELP', HELP_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} HELP beginner keywords`);

const HELP_BEGINNER_PT = [
  { keyword: 'o que você pode fazer', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'o que voce pode fazer', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'como funciona', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'ajuda', tier: 'STRONG', layer: 'help' },
  { keyword: 'estou perdido', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'não entendo', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'nao entendo', tier: 'STRONG', layer: 'confusion' }
];
added = addIntentKeywords('HELP', HELP_BEGINNER_PT, 'pt');
console.log(`  PT: Added ${added} HELP beginner keywords`);

const HELP_BEGINNER_ES = [
  { keyword: 'qué puedes hacer', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'que puedes hacer', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'cómo funciona', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'como funciona', tier: 'STRONG', layer: 'onboarding' },
  { keyword: 'ayuda', tier: 'STRONG', layer: 'help' },
  { keyword: 'estoy perdido', tier: 'STRONG', layer: 'confusion' },
  { keyword: 'no entiendo', tier: 'STRONG', layer: 'confusion' }
];
added = addIntentKeywords('HELP', HELP_BEGINNER_ES, 'es');
console.log(`  ES: Added ${added} HELP beginner keywords`);

// ============================================================================
// FIX 2: FILE_ACTIONS INTENT - File Discovery & Navigation
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: FILE_ACTIONS INTENT - Beginner Queries');
console.log('═'.repeat(70));

const FILE_ACTIONS_BEGINNER_EN = [
  // File discovery
  { keyword: 'where are my files', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'show me my files', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'what files do i have', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'my documents', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'show my recent uploads', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'list files', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'find my contract', tier: 'STRONG', layer: 'search' },
  { keyword: 'find my', tier: 'MEDIUM', layer: 'search' },
  { keyword: 'search for invoice', tier: 'STRONG', layer: 'search' },
  { keyword: 'search for', tier: 'MEDIUM', layer: 'search' },

  // Opening/viewing
  { keyword: 'open file', tier: 'STRONG', layer: 'open' },
  { keyword: 'show me the contract', tier: 'STRONG', layer: 'open' },
  { keyword: 'open the pdf', tier: 'STRONG', layer: 'open' },
  { keyword: 'view the spreadsheet', tier: 'STRONG', layer: 'open' },
  { keyword: 'view the', tier: 'MEDIUM', layer: 'open' },
  { keyword: 'preview my document', tier: 'STRONG', layer: 'open' },
  { keyword: 'preview', tier: 'MEDIUM', layer: 'open' },
  { keyword: 'download the file', tier: 'STRONG', layer: 'download' },
  { keyword: 'can i download this', tier: 'STRONG', layer: 'download' },
  { keyword: 'can i download', tier: 'MEDIUM', layer: 'download' },

  // Uploading
  { keyword: 'upload a file', tier: 'STRONG', layer: 'upload' },
  { keyword: 'upload file', tier: 'STRONG', layer: 'upload' },
  { keyword: 'i want to upload', tier: 'STRONG', layer: 'upload' },
  { keyword: 'add a document', tier: 'STRONG', layer: 'upload' },
  { keyword: 'attach file', tier: 'STRONG', layer: 'upload' },
  { keyword: 'attach', tier: 'MEDIUM', layer: 'upload' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} FILE_ACTIONS beginner keywords`);

const FILE_ACTIONS_BEGINNER_PT = [
  { keyword: 'mostra meus arquivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'onde estão meus arquivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'abrir o documento', tier: 'STRONG', layer: 'open' },
  { keyword: 'abrir documento', tier: 'STRONG', layer: 'open' },
  { keyword: 'abrir arquivo', tier: 'STRONG', layer: 'open' },
  { keyword: 'enviar arquivo', tier: 'STRONG', layer: 'upload' },
  { keyword: 'fazer upload', tier: 'STRONG', layer: 'upload' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_BEGINNER_PT, 'pt');
console.log(`  PT: Added ${added} FILE_ACTIONS beginner keywords`);

const FILE_ACTIONS_BEGINNER_ES = [
  { keyword: 'muéstrame mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'muestrame mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'dónde están mis archivos', tier: 'STRONG', layer: 'discovery' },
  { keyword: 'abrir el documento', tier: 'STRONG', layer: 'open' },
  { keyword: 'abrir documento', tier: 'STRONG', layer: 'open' },
  { keyword: 'abrir archivo', tier: 'STRONG', layer: 'open' },
  { keyword: 'subir archivo', tier: 'STRONG', layer: 'upload' },
  { keyword: 'cargar archivo', tier: 'STRONG', layer: 'upload' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_BEGINNER_ES, 'es');
console.log(`  ES: Added ${added} FILE_ACTIONS beginner keywords`);

// ============================================================================
// FIX 3: DOCUMENTS INTENT - Document Navigation
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: DOCUMENTS INTENT - Beginner Queries');
console.log('═'.repeat(70));

const DOCUMENTS_BEGINNER_EN = [
  // Navigation
  { keyword: 'go to section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me the first page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'first page', tier: 'MEDIUM', layer: 'navigation' },
  { keyword: 'jump to the conclusion', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'jump to', tier: 'MEDIUM', layer: 'navigation' },
  { keyword: 'where is the table of contents', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'table of contents', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'next page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'previous section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'previous page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'skip to appendix', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'skip to', tier: 'MEDIUM', layer: 'navigation' },

  // Basic questions
  { keyword: 'what is this document about', tier: 'STRONG', layer: 'summary' },
  { keyword: 'summarize this', tier: 'STRONG', layer: 'summary' },
  { keyword: 'summarize', tier: 'MEDIUM', layer: 'summary' },
  { keyword: 'give me the main points', tier: 'STRONG', layer: 'summary' },
  { keyword: 'main points', tier: 'MEDIUM', layer: 'summary' },
  { keyword: "what's on page", tier: 'STRONG', layer: 'navigation' },
  { keyword: 'whats on page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'how many pages', tier: 'STRONG', layer: 'metadata' },
  { keyword: 'who wrote this', tier: 'STRONG', layer: 'metadata' },
  { keyword: 'when was this created', tier: 'STRONG', layer: 'metadata' },
  { keyword: 'is there a signature page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'signature page', tier: 'MEDIUM', layer: 'navigation' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} DOCUMENTS beginner keywords`);

const DOCUMENTS_BEGINNER_PT = [
  { keyword: 'onde está a seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'onde esta a secao', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'ir para seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'próxima página', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'página anterior', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'resumir', tier: 'STRONG', layer: 'summary' },
  { keyword: 'o que é este documento', tier: 'STRONG', layer: 'summary' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_BEGINNER_PT, 'pt');
console.log(`  PT: Added ${added} DOCUMENTS beginner keywords`);

const DOCUMENTS_BEGINNER_ES = [
  { keyword: 'dónde está la sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'donde esta la seccion', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'ir a sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'siguiente página', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'página anterior', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'resumir', tier: 'STRONG', layer: 'summary' },
  { keyword: 'de qué trata este documento', tier: 'STRONG', layer: 'summary' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_BEGINNER_ES, 'es');
console.log(`  ES: Added ${added} DOCUMENTS beginner keywords`);

// ============================================================================
// FIX 4: ERROR INTENT - Error States
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: ERROR INTENT - Beginner Queries');
console.log('═'.repeat(70));

const ERROR_BEGINNER_EN = [
  { keyword: "it's not working", tier: 'STRONG', layer: 'error' },
  { keyword: 'its not working', tier: 'STRONG', layer: 'error' },
  { keyword: 'not working', tier: 'STRONG', layer: 'error' },
  { keyword: 'something went wrong', tier: 'STRONG', layer: 'error' },
  { keyword: 'went wrong', tier: 'MEDIUM', layer: 'error' },
  { keyword: "the file won't open", tier: 'STRONG', layer: 'error' },
  { keyword: "won't open", tier: 'MEDIUM', layer: 'error' },
  { keyword: 'wont open', tier: 'MEDIUM', layer: 'error' },
  { keyword: 'i got an error', tier: 'STRONG', layer: 'error' },
  { keyword: 'got an error', tier: 'STRONG', layer: 'error' },
  { keyword: 'upload failed', tier: 'STRONG', layer: 'error' },
  { keyword: 'crashed', tier: 'STRONG', layer: 'error' },
  { keyword: 'broken', tier: 'MEDIUM', layer: 'error' }
];
added = addIntentKeywords('ERROR', ERROR_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} ERROR beginner keywords`);

// ============================================================================
// FIX 5: EXTRACTION INTENT - Simple Extraction
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: EXTRACTION INTENT - Beginner Queries');
console.log('═'.repeat(70));

const EXTRACTION_BEGINNER_EN = [
  { keyword: 'what is the date on this', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'the date on this', tier: 'MEDIUM', layer: 'extraction' },
  { keyword: 'who signed this', tier: 'STRONG', layer: 'extraction' },
  { keyword: "what's the total amount", tier: 'STRONG', layer: 'extraction' },
  { keyword: 'whats the total amount', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'total amount', tier: 'MEDIUM', layer: 'extraction' },
  { keyword: 'find the phone number', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'phone number', tier: 'MEDIUM', layer: 'extraction' },
  { keyword: 'find the email', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'find the address', tier: 'STRONG', layer: 'extraction' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} EXTRACTION beginner keywords`);

// ============================================================================
// FIX 6: CONVERSATION INTENT - Acknowledgments (strengthen)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 6: CONVERSATION INTENT - Acknowledgments');
console.log('═'.repeat(70));

const CONVERSATION_BEGINNER_EN = [
  { keyword: 'hello', tier: 'STRONG', layer: 'greeting' },
  { keyword: 'hi', tier: 'STRONG', layer: 'greeting' },
  { keyword: 'hey', tier: 'STRONG', layer: 'greeting' },
  { keyword: 'cancel', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'never mind', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'nevermind', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'yes', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'no', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'maybe', tier: 'STRONG', layer: 'acknowledgment' },
  { keyword: 'hmm', tier: 'MEDIUM', layer: 'acknowledgment' },
  { keyword: '...', tier: 'MEDIUM', layer: 'acknowledgment' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} CONVERSATION beginner keywords`);

// ============================================================================
// FIX 7: MEMORY INTENT - Session Reset
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 7: MEMORY INTENT - Session Reset');
console.log('═'.repeat(70));

const MEMORY_BEGINNER_EN = [
  { keyword: 'start over', tier: 'STRONG', layer: 'session' },
  { keyword: 'reset', tier: 'STRONG', layer: 'session' },
  { keyword: 'clear', tier: 'MEDIUM', layer: 'session' },
  { keyword: 'new session', tier: 'STRONG', layer: 'session' },
  { keyword: 'forget everything', tier: 'STRONG', layer: 'session' }
];
added = addIntentKeywords('MEMORY', MEMORY_BEGINNER_EN, 'en');
console.log(`  EN: Added ${added} MEMORY beginner keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix12BeginnerAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
