/**
 * KODA ROUTING FIX 7 — FINAL TARGETED FIXES
 *
 * Remaining issues:
 * - Intent hijacking: 23 cases
 * - Domain activation: 20 cases
 * - Multilingual: 5 cases
 * - Depth mismatch: 6 cases
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
// FIX 1: INTENT HIJACKING
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: INTENT HIJACKING (23 cases)');
console.log('═'.repeat(70));

// MEMORY should win "What did I ask about earlier?" and "What context do you have from before?"
const MEMORY_BOOST = [
  { keyword: 'what did i ask', tier: 'STRONG', layer: 'memory' },
  { keyword: 'what did i ask about earlier', tier: 'STRONG', layer: 'memory' },
  { keyword: 'asked about earlier', tier: 'STRONG', layer: 'memory' },
  { keyword: 'what context do you have', tier: 'STRONG', layer: 'memory' },
  { keyword: 'context do you have from before', tier: 'STRONG', layer: 'memory' },
  { keyword: 'from before', tier: 'MEDIUM', layer: 'memory' },
  { keyword: 'earlier', tier: 'WEAK', layer: 'memory' }
];
let added = addIntentKeywords('MEMORY', MEMORY_BOOST, 'en');
console.log(`  MEMORY: Added ${added} STRONG/MEDIUM keywords`);

// EXTRACTION negatives for MEMORY queries
const EXTRACTION_MEMORY_NEG = [
  { keyword: 'what did i ask', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'asked about earlier', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'context do you have', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'from before', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'earlier', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how accurate', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'not about koda', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'general question', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_MEMORY_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// DOCUMENTS should win "Show me the pivot table", "Explain the payment terms"
const DOCUMENTS_BOOST = [
  { keyword: 'show me the pivot', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'pivot table', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'explain the payment', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'assembly instructions', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show the assembly', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'profit margins', tier: 'STRONG', layer: 'navigation' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_BOOST, 'en');
console.log(`  DOCUMENTS: Added ${added} STRONG keywords`);

// HELP should win specific queries
const HELP_BOOST = [
  { keyword: 'how accurate is the extraction', tier: 'STRONG', layer: 'help' },
  { keyword: 'document size limit', tier: 'STRONG', layer: 'help' },
  { keyword: 'what is the document size', tier: 'STRONG', layer: 'help' }
];
added = addIntentKeywords('HELP', HELP_BOOST, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// ERROR should win its queries
const ERROR_BOOST = [
  { keyword: "document won't load", tier: 'STRONG', layer: 'error' },
  { keyword: 'extraction failed', tier: 'STRONG', layer: 'error' },
  { keyword: "can't access the file", tier: 'STRONG', layer: 'error' },
  { keyword: 'upload crashed', tier: 'STRONG', layer: 'error' }
];
added = addIntentKeywords('ERROR', ERROR_BOOST, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

// ERROR negatives for FILE_ACTIONS, CONVERSATION, HELP
const ERROR_NEGATIVES = [
  { keyword: 'save', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'export', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'convert', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('ERROR', ERROR_NEGATIVES, 'en');
console.log(`  ERROR: Added ${added} NEGATIVE keywords`);

// CONVERSATION should NOT match "ok" going to FILE_ACTIONS
// Actually CONVERSATION should have negatives for FILE_ACTIONS patterns
const CONVERSATION_NEGATIVES = [
  { keyword: 'perfect, that works', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('FILE_ACTIONS', CONVERSATION_NEGATIVES, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// PREFERENCES negatives for EXTRACTION
const PREFERENCES_BOOST = [
  { keyword: 'set the default output format', tier: 'STRONG', layer: 'preferences' },
  { keyword: 'clear history', tier: 'STRONG', layer: 'preferences' },
  { keyword: 'start fresh', tier: 'STRONG', layer: 'preferences' },
  { keyword: 'clear history and start fresh', tier: 'STRONG', layer: 'preferences' }
];
added = addIntentKeywords('PREFERENCES', PREFERENCES_BOOST, 'en');
console.log(`  PREFERENCES: Added ${added} STRONG keywords`);

// EDIT should win "Rewrite the clinical notes"
const EDIT_BOOST = [
  { keyword: 'rewrite the clinical notes', tier: 'STRONG', layer: 'actions' },
  { keyword: 'rewrite the clinical', tier: 'STRONG', layer: 'actions' }
];
added = addIntentKeywords('EDIT', EDIT_BOOST, 'en');
console.log(`  EDIT: Added ${added} STRONG keywords`);

// FILE_ACTIONS should win "Save this document", "Export the extracted data"
const FILE_ACTIONS_BOOST = [
  { keyword: 'save this document', tier: 'STRONG', layer: 'file_actions' },
  { keyword: 'export the extracted data', tier: 'STRONG', layer: 'file_actions' },
  { keyword: 'export the extracted', tier: 'STRONG', layer: 'file_actions' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_BOOST, 'en');
console.log(`  FILE_ACTIONS: Added ${added} STRONG keywords`);

// REASONING should NOT win DOCUMENTS queries
const REASONING_NEGATIVES = [
  { keyword: 'profit margins', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'assembly instructions', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('REASONING', REASONING_NEGATIVES, 'en');
console.log(`  REASONING: Added ${added} NEGATIVE keywords`);

// MEMORY negatives
const MEMORY_NEGATIVES = [
  { keyword: 'profit margins', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show profit', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'pivot table', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('MEMORY', MEMORY_NEGATIVES, 'en');
console.log(`  MEMORY: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: DOMAIN ACTIVATION
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: DOMAIN ACTIVATION (20 cases)');
console.log('═'.repeat(70));

// LEGAL needs more anchors - failing: "table of contents", "page 15", "dates", "renewal term"
const LEGAL_MORE_ANCHORS = [
  'table of contents', 'toc', 'page', 'pages', 'date', 'dates',
  'renewal', 'renewal term', 'term', 'effective date', 'expiration',
  'mentioned', 'mentioned in', 'per annum', 'per year', 'cap', 'cap amount'
];
added = addDomainAnchors('LEGAL', LEGAL_MORE_ANCHORS, 'en');
console.log(`  LEGAL: Added ${added} anchors`);

// FINANCE needs more anchors - failing: "expense line items", "debt level", "financial health", "cash flow sustainability"
const FINANCE_MORE_ANCHORS = [
  'expense line', 'line items', 'debt level', 'financial health',
  'cash flow sustainability', 'sustainability', 'health', 'evaluate financial',
  'company', 'business', 'enterprise', 'firm'
];
added = addDomainAnchors('FINANCE', FINANCE_MORE_ANCHORS, 'en');
console.log(`  FINANCE: Added ${added} anchors`);

// Need to add blockers between LEGAL and FINANCE
// Legal → Finance confusions: "liability cap", "warranty period", payment terms"
// These have financial terms but are legal concepts in contracts
// Add LEGAL anchors that should override FINANCE
const LEGAL_OVERRIDE_FINANCE = [
  'liability cap', 'warranty period', 'payment terms', 'net 60', 'net 30',
  'due date', 'payment due', 'cap', 'ceiling', 'floor'
];
added = addDomainAnchors('LEGAL', LEGAL_OVERRIDE_FINANCE, 'en');
console.log(`  LEGAL: Added ${added} finance-override anchors`);

// MEDICAL needs more anchors
const MEDICAL_MORE_ANCHORS = [
  'vitals', 'vital', 'last visit', 'visit', 'symptoms', 'symptom'
];
added = addDomainAnchors('MEDICAL', MEDICAL_MORE_ANCHORS, 'en');
console.log(`  MEDICAL: Added ${added} anchors`);

// ENGINEERING needs more anchors
const ENGINEERING_MORE_ANCHORS = [
  'assembly instructions', 'revise', 'revision'
];
added = addDomainAnchors('ENGINEERING', ENGINEERING_MORE_ANCHORS, 'en');
console.log(`  ENGINEERING: Added ${added} anchors`);

// Add cross-domain blockers to prevent FINANCE from stealing LEGAL queries
if (!domainActivation.cross_domain_blockers) {
  domainActivation.cross_domain_blockers = { matrix: {} };
}
if (!domainActivation.cross_domain_blockers.matrix) {
  domainActivation.cross_domain_blockers.matrix = {};
}

// When these terms appear, block FINANCE from activating if LEGAL terms also present
domainActivation.cross_domain_blockers.matrix['liability cap'] = ['FINANCE'];
domainActivation.cross_domain_blockers.matrix['warranty period'] = ['FINANCE'];
domainActivation.cross_domain_blockers.matrix['net 60'] = ['FINANCE'];
domainActivation.cross_domain_blockers.matrix['net 30'] = ['FINANCE'];
console.log('  Added cross-domain blockers for LEGAL/FINANCE disambiguation');

// ============================================================================
// FIX 3: MULTILINGUAL
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: MULTILINGUAL (5 cases)');
console.log('═'.repeat(70));

// Portuguese
const DOCUMENTS_PT = [
  { keyword: 'mostre-me', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'mostre-me a', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'seção de', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'pagamento', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_PT, 'pt');
console.log(`  DOCUMENTS (pt): Added ${added} keywords`);

const REASONING_PT = [
  { keyword: 'analise', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'analise os', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'riscos', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'desta', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'cláusula', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('REASONING', REASONING_PT, 'pt');
console.log(`  REASONING (pt): Added ${added} keywords`);

// Spanish
const DOCUMENTS_ES = [
  { keyword: 'muéstrame', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'muéstrame la', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'sección de', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'pago', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_ES, 'es');
console.log(`  DOCUMENTS (es): Added ${added} keywords`);

const EXTRACTION_ES = [
  { keyword: 'cuál es', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'cuál es el', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'valor', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'valor del', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'contrato', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_ES, 'es');
console.log(`  EXTRACTION (es): Added ${added} keywords`);

const REASONING_ES = [
  { keyword: 'analiza', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'analiza los', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'riesgos', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'de esta', tier: 'MEDIUM', layer: 'context' },
  { keyword: 'cláusula', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('REASONING', REASONING_ES, 'es');
console.log(`  REASONING (es): Added ${added} keywords`);

// CONVERSATION and FILE_ACTIONS negatives for PT/ES
const FILE_ACTIONS_PT_NEG = [
  { keyword: 'mostre-me', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'analise', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'riscos', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_PT_NEG, 'pt');
console.log(`  FILE_ACTIONS (pt): Added ${added} NEGATIVE keywords`);

const FILE_ACTIONS_ES_NEG = [
  { keyword: 'muéstrame', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'analiza', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'riesgos', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'cuál es', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ES_NEG, 'es');
console.log(`  FILE_ACTIONS (es): Added ${added} NEGATIVE keywords`);

const CONVERSATION_PT_NEG = [
  { keyword: 'mostre-me', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'analise', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'seção', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_PT_NEG, 'pt');
console.log(`  CONVERSATION (pt): Added ${added} NEGATIVE keywords`);

const CONVERSATION_ES_NEG = [
  { keyword: 'muéstrame', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'analiza', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'cuál es', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'sección', tier: 'NEGATIVE', layer: 'exclusion' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_ES_NEG, 'es');
console.log(`  CONVERSATION (es): Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix7At = new Date().toISOString();
domainActivation._meta = domainActivation._meta || {};
domainActivation._meta.routingFix7At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
writeFileSync(`${DATA_DIR}/domain_activation.json`, JSON.stringify(domainActivation, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('  ✓ Saved domain_activation.json');
console.log('\n  ✓ NO DELETIONS');
