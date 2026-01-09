/**
 * KODA ROUTING FIX 10 — BEGINNER/NAVIGATION SAFETY LAYER
 *
 * Implements Layer 0: Human Navigation (BEGINNER)
 * - Navigation phrases ALWAYS win over Extraction/Reasoning/Domains
 * - FILE_ACTIONS and DOCUMENTS get priority for "show/open/find/where is"
 * - Domains ONLY activate when analysis verbs are present
 *
 * RULES: ONLY ADDITIONS, NO DELETIONS
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));
const domainActivation = JSON.parse(readFileSync(`${DATA_DIR}/domain_activation.json`, 'utf-8'));

function addIntentKeywords(intentName, keywords, lang = 'en') {
  const data = intentPatterns.intents[intentName];
  if (!data) {
    console.log(`  ⚠️ Intent ${intentName} not found`);
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
        layer: kw.layer || 'navigation',
        target: kw.target || intentName,
        variants: kw.variants || []
      });
      added++;
    }
  }
  return added;
}

// ============================================================================
// LAYER 0: BEGINNER NAVIGATION KEYWORDS
// These MUST win over everything else
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('LAYER 0: BEGINNER NAVIGATION KEYWORDS');
console.log('═'.repeat(70));

// FILE_ACTIONS STRONG keywords for navigation
const FILE_ACTIONS_NAVIGATION = [
  // Core navigation verbs
  { keyword: 'where is', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'where is file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'where is the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'find file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'find the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'find my file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'find my document', tier: 'STRONG', layer: 'navigation' },
  { keyword: "can't find my file", tier: 'STRONG', layer: 'navigation' },
  { keyword: "can't find the file", tier: 'STRONG', layer: 'navigation' },
  { keyword: 'i uploaded a file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'uploaded yesterday', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'where did my upload go', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'my upload', tier: 'STRONG', layer: 'navigation' },

  // File type specific
  { keyword: 'open the pdf', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me the pdf', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open the document', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me the document', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open the contract', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me the contract', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open the agreement', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'view the pdf', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'view the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'view the document', tier: 'STRONG', layer: 'navigation' },

  // Folder operations
  { keyword: 'where is the folder', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open folder', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show me the folder', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'list files', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'list my files', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show my files', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show my uploads', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'recent uploads', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'my recent files', tier: 'STRONG', layer: 'navigation' },

  // File operations
  { keyword: 'download file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'download the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'delete file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'delete the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'move file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'move the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'rename file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'rename the file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'create folder', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'new folder', tier: 'STRONG', layer: 'navigation' },

  // Upload
  { keyword: 'upload', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'upload file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'upload a file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'upload document', tier: 'STRONG', layer: 'navigation' },

  // Search
  { keyword: 'search files', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'search for file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'search for document', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'look for file', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'look for the file', tier: 'STRONG', layer: 'navigation' },

  // Generic file references
  { keyword: 'the file', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'my file', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'this file', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'that file', tier: 'MEDIUM', layer: 'context' }
];

let added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_NAVIGATION, 'en');
console.log(`  FILE_ACTIONS: Added ${added} navigation keywords`);

// DOCUMENTS STRONG keywords for viewing content
const DOCUMENTS_NAVIGATION = [
  // Viewing document content
  { keyword: 'show me section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'go to section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'go to page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'jump to page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'navigate to', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'scroll to', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'display', tier: 'MEDIUM', layer: 'navigation' },
  { keyword: 'show me the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'table of contents', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'what is in', tier: 'MEDIUM', layer: 'navigation' }
];

added = addIntentKeywords('DOCUMENTS', DOCUMENTS_NAVIGATION, 'en');
console.log(`  DOCUMENTS: Added ${added} navigation keywords`);

// ============================================================================
// RULE A: NAVIGATION PHRASES BLOCK EXTRACTION & REASONING
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('RULE A: NAVIGATION BLOCKS EXTRACTION & REASONING');
console.log('═'.repeat(70));

// EXTRACTION negatives for navigation
const EXTRACTION_NAVIGATION_NEGATIVES = [
  // File navigation verbs
  { keyword: 'where is', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'where is file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'where is the file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me the file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find the file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find my', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "can't find", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'i uploaded', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'my upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'where did my upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the pdf', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the contract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'view the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'delete file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'move file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'rename file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'search files', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'list files', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'my files', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'recent uploads', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('EXTRACTION', EXTRACTION_NAVIGATION_NEGATIVES, 'en');
console.log(`  EXTRACTION: Added ${added} navigation NEGATIVE keywords`);

// REASONING negatives for navigation
const REASONING_NAVIGATION_NEGATIVES = [
  { keyword: 'where is', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'where is file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find my', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "can't find", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'i uploaded', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'my upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the pdf', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the contract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'view the file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'delete file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'move file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'list files', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'my files', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('REASONING', REASONING_NAVIGATION_NEGATIVES, 'en');
console.log(`  REASONING: Added ${added} navigation NEGATIVE keywords`);

// ============================================================================
// RULE B: DOMAIN ACTIVATION REQUIRES ANALYSIS VERBS
// Add negatives to domains for pure navigation
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('RULE B: DOMAIN ACTIVATION REQUIRES ANALYSIS VERBS');
console.log('═'.repeat(70));

// Add navigation negatives to domain activation blockers
const NAVIGATION_BLOCKERS = [
  'where is',
  'open file',
  'open the file',
  'show me file',
  'find file',
  'find my',
  'my upload',
  'download',
  'upload',
  'delete file',
  'move file',
  'rename file',
  'list files',
  'search files'
];

// Add to all domains' layer4_negative_blockers
for (const domainName of ['LEGAL', 'MEDICAL', 'FINANCE', 'ENGINEERING', 'EXCEL']) {
  const domain = domainActivation.domains?.[domainName];
  if (!domain) continue;

  if (!domain.layer4_negative_blockers) {
    domain.layer4_negative_blockers = { blockers: { en: [] } };
  }
  if (!domain.layer4_negative_blockers.blockers) {
    domain.layer4_negative_blockers.blockers = { en: [] };
  }
  if (!domain.layer4_negative_blockers.blockers.en) {
    domain.layer4_negative_blockers.blockers.en = [];
  }

  const existing = new Set(domain.layer4_negative_blockers.blockers.en.map(b => b.toLowerCase()));
  let domainAdded = 0;

  for (const blocker of NAVIGATION_BLOCKERS) {
    if (!existing.has(blocker.toLowerCase())) {
      domain.layer4_negative_blockers.blockers.en.push(blocker);
      domainAdded++;
    }
  }

  console.log(`  ${domainName}: Added ${domainAdded} navigation blockers`);
}

// ============================================================================
// HELP intent for "can't find" problems
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('HELP INTENT FOR NAVIGATION PROBLEMS');
console.log('═'.repeat(70));

const HELP_NAVIGATION = [
  { keyword: "can't find my file", tier: 'STRONG', layer: 'help' },
  { keyword: "can't find the file", tier: 'STRONG', layer: 'help' },
  { keyword: "can't find file", tier: 'STRONG', layer: 'help' },
  { keyword: 'i lost my file', tier: 'STRONG', layer: 'help' },
  { keyword: 'where did my file go', tier: 'STRONG', layer: 'help' },
  { keyword: 'file disappeared', tier: 'STRONG', layer: 'help' },
  { keyword: "can't locate", tier: 'STRONG', layer: 'help' },
  { keyword: 'how do i find', tier: 'STRONG', layer: 'help' },
  { keyword: 'how do i upload', tier: 'STRONG', layer: 'help' },
  { keyword: 'how do i open', tier: 'STRONG', layer: 'help' }
];

added = addIntentKeywords('HELP', HELP_NAVIGATION, 'en');
console.log(`  HELP: Added ${added} navigation help keywords`);

// ============================================================================
// MEMORY and CONVERSATION negatives for file operations
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('BLOCK OTHER INTENTS FROM FILE OPERATIONS');
console.log('═'.repeat(70));

const MEMORY_FILE_NEGATIVES = [
  { keyword: 'where is file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'delete file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'move file', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('MEMORY', MEMORY_FILE_NEGATIVES, 'en');
console.log(`  MEMORY: Added ${added} file operation NEGATIVE keywords`);

const CONVERSATION_FILE_NEGATIVES = [
  { keyword: 'where is file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'delete file', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('CONVERSATION', CONVERSATION_FILE_NEGATIVES, 'en');
console.log(`  CONVERSATION: Added ${added} file operation NEGATIVE keywords`);

const PREFERENCES_FILE_NEGATIVES = [
  { keyword: 'where is file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('PREFERENCES', PREFERENCES_FILE_NEGATIVES, 'en');
console.log(`  PREFERENCES: Added ${added} file operation NEGATIVE keywords`);

const EDIT_FILE_NEGATIVES = [
  { keyword: 'where is file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'find file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'delete file', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'move file', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('EDIT', EDIT_FILE_NEGATIVES, 'en');
console.log(`  EDIT: Added ${added} file operation NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix10BeginnerAt = new Date().toISOString();
intentPatterns.metadata.beginnerLayerImplemented = true;

domainActivation._meta = domainActivation._meta || {};
domainActivation._meta.routingFix10BeginnerAt = new Date().toISOString();
domainActivation._meta.navigationBlockersAdded = true;

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
writeFileSync(`${DATA_DIR}/domain_activation.json`, JSON.stringify(domainActivation, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('  ✓ Saved domain_activation.json');
console.log('\n  ✓ NO DELETIONS');
console.log('  ✓ BEGINNER SAFETY LAYER IMPLEMENTED');
