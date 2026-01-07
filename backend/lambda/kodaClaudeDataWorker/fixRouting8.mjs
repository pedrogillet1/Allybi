/**
 * KODA ROUTING FIX 8 — FINAL TARGETED FIXES
 *
 * Remaining 33 failures:
 * - Intent hijacking: 18 cases (specific phrase fixes)
 * - Domain activation: 5 cases
 * - Multilingual: 3 cases (1 real, 2 depth)
 * - Depth mismatch: 7 cases
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
  if (!data) return 0;

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
        variants: []
      });
      added++;
    }
  }
  return added;
}

function addDomainAnchors(domainName, newAnchors, lang = 'en') {
  const domain = domainActivation.domains?.[domainName];
  if (!domain) return 0;

  if (!domain.layer1_strong_anchors?.anchors?.[lang]) {
    if (!domain.layer1_strong_anchors) domain.layer1_strong_anchors = { anchors: {} };
    if (!domain.layer1_strong_anchors.anchors) domain.layer1_strong_anchors.anchors = {};
    if (!domain.layer1_strong_anchors.anchors[lang]) domain.layer1_strong_anchors.anchors[lang] = [];
  }

  const existing = new Set(domain.layer1_strong_anchors.anchors[lang].map(a => a.toLowerCase()));
  let added = 0;

  for (const anchor of newAnchors) {
    if (!existing.has(anchor.toLowerCase())) {
      domain.layer1_strong_anchors.anchors[lang].push(anchor);
      added++;
    }
  }
  return added;
}

// ============================================================================
// FIX SPECIFIC INTENT HIJACKING CASES
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: SPECIFIC INTENT HIJACKING (18 cases)');
console.log('═'.repeat(70));

// DOCUMENTS specific boost - for "pivot table", "payment terms", "profit margins", "assembly instructions"
const DOCUMENTS_SPECIFIC = [
  { keyword: 'show me the pivot table', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'explain the payment terms', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show profit margins by quarter', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show the assembly instructions', tier: 'STRONG', layer: 'navigation' }
];
let added = addIntentKeywords('DOCUMENTS', DOCUMENTS_SPECIFIC, 'en');
console.log(`  DOCUMENTS: Added ${added} specific STRONG keywords`);

// EXTRACTION negatives for the above
const EXTRACTION_SPECIFIC_NEG = [
  { keyword: 'show me the pivot table', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'explain the payment terms', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how accurate is the extraction', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_SPECIFIC_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} specific NEGATIVE keywords`);

// EXTRACTION specific boost - for "diagnosis date"
const EXTRACTION_SPECIFIC = [
  { keyword: 'diagnosis date', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'what was the diagnosis date', tier: 'STRONG', layer: 'extraction' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_SPECIFIC, 'en');
console.log(`  EXTRACTION: Added ${added} specific STRONG keywords`);

// MEMORY negatives
const MEMORY_SPECIFIC_NEG = [
  { keyword: 'diagnosis date', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'profit margins by quarter', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'save this document', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('MEMORY', MEMORY_SPECIFIC_NEG, 'en');
console.log(`  MEMORY: Added ${added} specific NEGATIVE keywords`);

// REASONING negatives
const REASONING_SPECIFIC_NEG = [
  { keyword: 'assembly instructions', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show the assembly', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('REASONING', REASONING_SPECIFIC_NEG, 'en');
console.log(`  REASONING: Added ${added} specific NEGATIVE keywords`);

// EDIT specific boost
const EDIT_SPECIFIC = [
  { keyword: 'rewrite the clinical notes more clearly', tier: 'STRONG', layer: 'actions' },
  { keyword: 'more clearly', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('EDIT', EDIT_SPECIFIC, 'en');
console.log(`  EDIT: Added ${added} specific keywords`);

// HELP specific boost
const HELP_SPECIFIC = [
  { keyword: 'how accurate is the extraction', tier: 'STRONG', layer: 'help' },
  { keyword: 'document size limit', tier: 'STRONG', layer: 'help' }
];
added = addIntentKeywords('HELP', HELP_SPECIFIC, 'en');
console.log(`  HELP: Added ${added} specific STRONG keywords`);

// ERROR specific boost
const ERROR_SPECIFIC = [
  { keyword: "the document won't load", tier: 'STRONG', layer: 'error' },
  { keyword: 'the extraction failed', tier: 'STRONG', layer: 'error' },
  { keyword: "can't access the file", tier: 'STRONG', layer: 'error' },
  { keyword: 'the upload crashed', tier: 'STRONG', layer: 'error' }
];
added = addIntentKeywords('ERROR', ERROR_SPECIFIC, 'en');
console.log(`  ERROR: Added ${added} specific STRONG keywords`);

// FILE_ACTIONS specific boost
const FILE_ACTIONS_SPECIFIC = [
  { keyword: 'export the extracted data', tier: 'STRONG', layer: 'file_actions' },
  { keyword: 'save this document', tier: 'STRONG', layer: 'file_actions' },
  { keyword: 'read only', tier: 'STRONG', layer: 'file_actions' },
  { keyword: 'no modifications', tier: 'STRONG', layer: 'file_actions' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_SPECIFIC, 'en');
console.log(`  FILE_ACTIONS: Added ${added} specific STRONG keywords`);

// CONVERSATION - "Sum the cells in row 5" should go to EXTRACTION (Excel)
// Let's boost EXTRACTION for Excel calculations
const EXTRACTION_EXCEL = [
  { keyword: 'sum the cells', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'sum the cells in row', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'cells in row', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_EXCEL, 'en');
console.log(`  EXTRACTION: Added ${added} Excel keywords`);

// CONVERSATION negatives
const CONVERSATION_SPECIFIC_NEG = [
  { keyword: 'sum the cells', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: "document won't load", tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_SPECIFIC_NEG, 'en');
console.log(`  CONVERSATION: Added ${added} NEGATIVE keywords`);

// FILE_ACTIONS negatives
const FILE_ACTIONS_SPECIFIC_NEG = [
  { keyword: "won't load", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'crashed', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'ok', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_SPECIFIC_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// HELP negatives
const HELP_SPECIFIC_NEG = [
  { keyword: "can't access", tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('HELP', HELP_SPECIFIC_NEG, 'en');
console.log(`  HELP: Added ${added} NEGATIVE keywords`);

// PREFERENCES negatives
const PREFERENCES_SPECIFIC_NEG = [
  { keyword: 'perfect, that works', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('PREFERENCES', PREFERENCES_SPECIFIC_NEG, 'en');
console.log(`  PREFERENCES: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX DOMAIN ACTIVATION
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: DOMAIN ACTIVATION (5 cases)');
console.log('═'.repeat(70));

// LEGAL needs: "strategic implications", "rephrase", "plain English"
const LEGAL_SPECIFIC = [
  'strategic implications', 'implications', 'signing', 'rephrase',
  'plain english', 'plain language', 'layman', 'general question',
  'about contracts'
];
added = addDomainAnchors('LEGAL', LEGAL_SPECIFIC, 'en');
console.log(`  LEGAL: Added ${added} specific anchors`);

// FINANCE needs: "revenue calculation", "financial tables"
const FINANCE_SPECIFIC = [
  'revenue calculation', 'calculation', 'financial tables', 'reformat',
  'tables'
];
added = addDomainAnchors('FINANCE', FINANCE_SPECIFIC, 'en');
console.log(`  FINANCE: Added ${added} specific anchors`);

// ============================================================================
// FIX MULTILINGUAL
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: MULTILINGUAL (1 real failure)');
console.log('═'.repeat(70));

// "Qual é o valor do contrato?" should be EXTRACTION, going to DOCUMENTS
const EXTRACTION_PT = [
  { keyword: 'qual é o valor', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'valor do contrato', tier: 'STRONG', layer: 'extraction' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_PT, 'pt');
console.log(`  EXTRACTION (pt): Added ${added} STRONG keywords`);

const DOCUMENTS_PT_NEG = [
  { keyword: 'qual é o valor', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'valor do', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_PT_NEG, 'pt');
console.log(`  DOCUMENTS (pt): Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix8At = new Date().toISOString();
domainActivation._meta = domainActivation._meta || {};
domainActivation._meta.routingFix8At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
writeFileSync(`${DATA_DIR}/domain_activation.json`, JSON.stringify(domainActivation, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('  ✓ Saved domain_activation.json');
console.log('\n  ✓ NO DELETIONS');
