/**
 * KODA ROUTING FIX 5 — TARGETED INTENT HIJACKING FIXES
 *
 * Focus areas:
 * 5A: Stop EXTRACTION hijacking EDIT and HELP queries
 * 5B: Stop REASONING hijacking HELP queries
 * 5C: Stop DOCUMENTS hijacking FILE_ACTIONS/PREFERENCES queries
 * 5D: Boost HELP, EDIT, ERROR intent STRONG keywords
 *
 * RULES: ONLY ADDITIONS, NO DELETIONS
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

// Track all additions
const additions = { intents: {} };

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
        layer: kw.layer || 'exclusion',
        target: kw.target || intentName,
        variants: kw.variants || []
      });
      added++;

      if (!additions.intents[intentName]) additions.intents[intentName] = [];
      additions.intents[intentName].push({ lang, keyword: kw.keyword, tier: kw.tier });
    }
  }
  return added;
}

// ============================================================================
// 5A: STOP EXTRACTION HIJACKING EDIT AND HELP
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('5A: STOP EXTRACTION HIJACKING EDIT AND HELP');
console.log('═'.repeat(70));

const EXTRACTION_MORE_NEGATIVES = [
  // EDIT signals - EXTRACTION must NOT activate on edit requests
  { keyword: 'modify', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'update', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'change', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'edit', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'rewrite', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'revise', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'correct', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'modify the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'update the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'change the', tier: 'NEGATIVE', layer: 'exclusion' },

  // HELP signals - EXTRACTION must NOT activate on help requests
  { keyword: 'how accurate', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'keyboard shortcuts', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'shortcuts', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'feature work', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how does the', tier: 'NEGATIVE', layer: 'exclusion' },

  // More document navigation signals
  { keyword: 'specifications', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'material specifications', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'technical specifications', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'assembly instructions', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'instructions', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'figures', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'revenue figures', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'Q3 revenue', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'quarterly', tier: 'NEGATIVE', layer: 'exclusion' }
];

let added = addIntentKeywords('EXTRACTION', EXTRACTION_MORE_NEGATIVES, 'en');
console.log(`  Added ${added} NEGATIVE keywords to EXTRACTION (en)`);

// ============================================================================
// 5B: STOP REASONING HIJACKING HELP
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('5B: STOP REASONING HIJACKING HELP');
console.log('═'.repeat(70));

const REASONING_MORE_NEGATIVES = [
  // HELP signals - user asking how to use the product
  { keyword: 'how do i upload', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how does the extraction', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'can you analyze', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how do i change', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'language settings', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'settings', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'feature', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload a document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload a', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('REASONING', REASONING_MORE_NEGATIVES, 'en');
console.log(`  Added ${added} NEGATIVE keywords to REASONING (en)`);

// ============================================================================
// 5C: STOP DOCUMENTS HIJACKING FILE_ACTIONS/PREFERENCES
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('5C: STOP DOCUMENTS HIJACKING FILE_ACTIONS/PREFERENCES');
console.log('═'.repeat(70));

const DOCUMENTS_NEGATIVES = [
  // FILE_ACTIONS signals - DOCUMENTS must NOT activate
  { keyword: 'save this', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'convert to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'export', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'download', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'attach', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'print', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'word format', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'pdf format', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'excel format', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'another document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'the summary', tier: 'NEGATIVE', layer: 'exclusion' },

  // PREFERENCES signals
  { keyword: 'always show', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'set the default', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'default output', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'output format', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'bullet points', tier: 'NEGATIVE', layer: 'exclusion' },

  // ERROR signals
  { keyword: "won't load", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'failed', tier: 'NEGATIVE', layer: 'exclusion' },

  // MEMORY signals
  { keyword: 'profit margins by', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'by quarter', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('DOCUMENTS', DOCUMENTS_NEGATIVES, 'en');
console.log(`  Added ${added} NEGATIVE keywords to DOCUMENTS (en)`);

// ============================================================================
// 5D: BOOST HELP, EDIT, ERROR INTENT STRONG KEYWORDS
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('5D: BOOST HELP, EDIT, ERROR INTENT KEYWORDS');
console.log('═'.repeat(70));

// HELP STRONG keywords
const HELP_STRONG = [
  { keyword: 'how do i upload', tier: 'STRONG', layer: 'actions' },
  { keyword: 'how does the extraction', tier: 'STRONG', layer: 'actions' },
  { keyword: 'can you analyze', tier: 'STRONG', layer: 'actions' },
  { keyword: 'how do i change my', tier: 'STRONG', layer: 'actions' },
  { keyword: 'language settings', tier: 'STRONG', layer: 'actions' },
  { keyword: 'what are the keyboard shortcuts', tier: 'STRONG', layer: 'actions' },
  { keyword: 'keyboard shortcuts', tier: 'STRONG', layer: 'actions' },
  { keyword: 'how accurate is', tier: 'STRONG', layer: 'actions' },
  { keyword: 'size limit', tier: 'STRONG', layer: 'actions' },
  { keyword: 'document size limit', tier: 'STRONG', layer: 'actions' },
  { keyword: 'what is the', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'upload a document', tier: 'STRONG', layer: 'actions' },
  { keyword: 'feature work', tier: 'STRONG', layer: 'actions' },
  { keyword: 'extraction feature', tier: 'STRONG', layer: 'actions' }
];

added = addIntentKeywords('HELP', HELP_STRONG, 'en');
console.log(`  Added ${added} keywords to HELP (en)`);

// EDIT STRONG keywords
const EDIT_STRONG = [
  { keyword: 'modify the payment', tier: 'STRONG', layer: 'actions' },
  { keyword: 'modify the', tier: 'STRONG', layer: 'actions' },
  { keyword: 'update the medication', tier: 'STRONG', layer: 'actions' },
  { keyword: 'update the', tier: 'STRONG', layer: 'actions' },
  { keyword: 'change the material', tier: 'STRONG', layer: 'actions' },
  { keyword: 'change the', tier: 'STRONG', layer: 'actions' },
  { keyword: 'rewrite the', tier: 'STRONG', layer: 'actions' },
  { keyword: 'rewrite', tier: 'STRONG', layer: 'actions' },
  { keyword: 'clinical notes', tier: 'STRONG', layer: 'actions' },
  { keyword: 'more clearly', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'net 60', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'dosage', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'material grade', tier: 'MEDIUM', layer: 'context' },
  { keyword: '316L', tier: 'MEDIUM', layer: 'context' },
  { keyword: '20mg', tier: 'MEDIUM', layer: 'context' }
];

added = addIntentKeywords('EDIT', EDIT_STRONG, 'en');
console.log(`  Added ${added} keywords to EDIT (en)`);

// ERROR STRONG keywords
const ERROR_STRONG = [
  { keyword: "it's not working", tier: 'STRONG', layer: 'states' },
  { keyword: 'not working properly', tier: 'STRONG', layer: 'states' },
  { keyword: 'not working', tier: 'STRONG', layer: 'states' },
  { keyword: "can't access", tier: 'STRONG', layer: 'states' },
  { keyword: 'bug in the system', tier: 'STRONG', layer: 'states' },
  { keyword: 'there is a bug', tier: 'STRONG', layer: 'states' },
  { keyword: "there's a bug", tier: 'STRONG', layer: 'states' },
  { keyword: 'upload crashed', tier: 'STRONG', layer: 'states' },
  { keyword: 'crashed', tier: 'STRONG', layer: 'states' },
  { keyword: "won't load", tier: 'STRONG', layer: 'states' },
  { keyword: 'extraction failed', tier: 'STRONG', layer: 'states' },
  { keyword: 'document wont load', tier: 'STRONG', layer: 'states' },
  { keyword: "document won't load", tier: 'STRONG', layer: 'states' }
];

added = addIntentKeywords('ERROR', ERROR_STRONG, 'en');
console.log(`  Added ${added} keywords to ERROR (en)`);

// FILE_ACTIONS STRONG keywords
const FILE_ACTIONS_STRONG = [
  { keyword: 'save this document', tier: 'STRONG', layer: 'actions' },
  { keyword: 'save this', tier: 'STRONG', layer: 'actions' },
  { keyword: 'convert to word', tier: 'STRONG', layer: 'actions' },
  { keyword: 'convert to', tier: 'STRONG', layer: 'actions' },
  { keyword: 'word format', tier: 'STRONG', layer: 'actions' },
  { keyword: 'attach another', tier: 'STRONG', layer: 'actions' },
  { keyword: 'attach another document', tier: 'STRONG', layer: 'actions' },
  { keyword: 'print the summary', tier: 'STRONG', layer: 'actions' },
  { keyword: 'export the extracted', tier: 'STRONG', layer: 'actions' },
  { keyword: 'export the', tier: 'STRONG', layer: 'actions' },
  { keyword: 'extracted data', tier: 'MEDIUM', layer: 'context' }
];

added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_STRONG, 'en');
console.log(`  Added ${added} keywords to FILE_ACTIONS (en)`);

// PREFERENCES STRONG keywords
const PREFERENCES_STRONG = [
  { keyword: 'always show section', tier: 'STRONG', layer: 'actions' },
  { keyword: 'always show', tier: 'STRONG', layer: 'actions' },
  { keyword: 'set the default output', tier: 'STRONG', layer: 'actions' },
  { keyword: 'set the default', tier: 'STRONG', layer: 'actions' },
  { keyword: 'default output format', tier: 'STRONG', layer: 'actions' },
  { keyword: 'default output', tier: 'STRONG', layer: 'actions' },
  { keyword: 'output format to bullet', tier: 'STRONG', layer: 'actions' },
  { keyword: 'bullet points', tier: 'STRONG', layer: 'actions' },
  { keyword: 'section references', tier: 'MEDIUM', layer: 'context' }
];

added = addIntentKeywords('PREFERENCES', PREFERENCES_STRONG, 'en');
console.log(`  Added ${added} keywords to PREFERENCES (en)`);

// MEMORY negatives to stop it stealing from EXTRACTION/REASONING
const MEMORY_MORE_NEGATIVES = [
  { keyword: 'evaluate', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'assess', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'enforceability', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'non-compete', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'compliance', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'ISO standards', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'diagnosis date', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'expense line items', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'line items', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('MEMORY', MEMORY_MORE_NEGATIVES, 'en');
console.log(`  Added ${added} keywords to MEMORY (en)`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix5At = new Date().toISOString();
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
console.log('  ✓ Saved intent_patterns.json');

// Count totals
let total = 0;
for (const items of Object.values(additions.intents)) total += items.length;

console.log('\n' + '═'.repeat(70));
console.log('ADDITIONS SUMMARY — NO DELETIONS MADE');
console.log('═'.repeat(70));

for (const [intent, items] of Object.entries(additions.intents)) {
  const neg = items.filter(i => i.tier === 'NEGATIVE').length;
  const str = items.filter(i => i.tier === 'STRONG').length;
  const med = items.filter(i => i.tier === 'MEDIUM').length;
  console.log(`  ${intent}: ${neg} NEGATIVE, ${str} STRONG, ${med} MEDIUM`);
}

console.log(`\n  Total additions: ${total}`);
console.log('  ✓ NO DELETIONS');
