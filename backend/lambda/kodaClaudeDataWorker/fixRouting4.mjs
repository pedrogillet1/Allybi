/**
 * KODA ROUTING FIX 4 — STRICT, NO DATA LOSS
 *
 * Implements all fixes in exact priority order:
 * STEP 1A: EXTRACTION negatives
 * STEP 1B: MEMORY negatives
 * STEP 1C: REASONING negatives
 * STEP 2: DOCUMENTS STRONG keywords
 * STEP 3: Domain structural phrases
 * STEP 4: Multilingual PT/ES coverage
 *
 * RULES:
 * - NO deletions
 * - NO deduplication
 * - NO count reductions
 * - ONLY additions
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));
const domainActivation = JSON.parse(readFileSync(`${DATA_DIR}/domain_activation.json`, 'utf-8'));

// Track all additions
const additions = {
  intents: {},
  domains: {}
};

// ============================================================================
// HELPER: Add keywords to intent (ONLY ADDS, NEVER REMOVES)
// ============================================================================
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
// HELPER: Add structural phrases to domain (ONLY ADDS, NEVER REMOVES)
// ============================================================================
function addDomainStructural(domainName, phrases, lang = 'en') {
  const domain = domainActivation.domains?.[domainName];
  if (!domain) {
    console.log(`  ⚠️ Domain ${domainName} not found`);
    return 0;
  }

  // Add to layer2_structural_signals
  if (!domain.layer2_structural_signals) {
    domain.layer2_structural_signals = { patterns: {} };
  }
  if (!domain.layer2_structural_signals.patterns) {
    domain.layer2_structural_signals.patterns = {};
  }
  if (!domain.layer2_structural_signals.patterns[lang]) {
    domain.layer2_structural_signals.patterns[lang] = [];
  }

  const existing = new Set(domain.layer2_structural_signals.patterns[lang].map(p => p.toLowerCase()));
  let added = 0;

  for (const phrase of phrases) {
    if (!existing.has(phrase.toLowerCase())) {
      domain.layer2_structural_signals.patterns[lang].push(phrase);
      added++;

      if (!additions.domains[domainName]) additions.domains[domainName] = [];
      additions.domains[domainName].push({ lang, phrase, type: 'structural' });
    }
  }
  return added;
}

// ============================================================================
// STEP 1A: FIX EXTRACTION (CRITICAL)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 1A: FIX EXTRACTION — Adding NEGATIVE triggers');
console.log('═'.repeat(70));

const EXTRACTION_NEGATIVES_EN = [
  // Navigation phrases
  { keyword: 'show me', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'go to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'navigate to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'jump to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'scroll to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'open the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'display the', tier: 'NEGATIVE', layer: 'exclusion' },

  // Location references
  { keyword: 'section', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'page', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'article', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'chapter', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'clause', tier: 'NEGATIVE', layer: 'exclusion' },

  // Help-oriented phrases
  { keyword: 'how do i', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how does', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'can you', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'help me', tier: 'NEGATIVE', layer: 'exclusion' },

  // Navigation patterns
  { keyword: 'show me section', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'go to section', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'navigate to section', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'jump to page', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what does .* say', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how do i .*', tier: 'NEGATIVE', layer: 'exclusion' }
];

let added = addIntentKeywords('EXTRACTION', EXTRACTION_NEGATIVES_EN, 'en');
console.log(`  Added ${added} NEGATIVE keywords to EXTRACTION (en)`);

// ============================================================================
// STEP 1B: FIX MEMORY (HIGH IMPACT)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 1B: FIX MEMORY — Adding NEGATIVE triggers');
console.log('═'.repeat(70));

const MEMORY_NEGATIVES_EN = [
  // Content extraction phrases
  { keyword: 'extract', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'pull', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'get the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what is', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show the', tier: 'NEGATIVE', layer: 'exclusion' },

  // Domain-specific terms that indicate document content
  { keyword: 'ebitda', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'revenue', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'liability cap', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'diagnosis date', tier: 'NEGATIVE', layer: 'exclusion' },

  // Extraction patterns
  { keyword: 'get the value', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'extract the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'pull the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what is the value', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what is the amount', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what is the date', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('MEMORY', MEMORY_NEGATIVES_EN, 'en');
console.log(`  Added ${added} NEGATIVE keywords to MEMORY (en)`);

// ============================================================================
// STEP 1C: FIX REASONING (MEDIUM IMPACT)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 1C: FIX REASONING — Adding NEGATIVE triggers');
console.log('═'.repeat(70));

const REASONING_NEGATIVES_EN = [
  // Navigation phrases
  { keyword: 'show me', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'navigate', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'go to', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'upload', tier: 'NEGATIVE', layer: 'exclusion' },

  // Help phrases
  { keyword: 'how do i', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'how does', tier: 'NEGATIVE', layer: 'exclusion' },

  // Navigation patterns
  { keyword: 'show me section', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show me the section', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('REASONING', REASONING_NEGATIVES_EN, 'en');
console.log(`  Added ${added} NEGATIVE keywords to REASONING (en)`);

// ============================================================================
// STEP 2: FIX DOCUMENTS (STRUCTURAL BOOST)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 2: FIX DOCUMENTS — Adding STRONG keywords');
console.log('═'.repeat(70));

const DOCUMENTS_STRONG_EN = [
  // Navigation phrases (STRONG)
  { keyword: 'show me section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'go to section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'navigate to section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'jump to page', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'display the section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'table of contents', tier: 'STRONG', layer: 'navigation' },

  // More navigation phrases
  { keyword: 'show me the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'go to the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'navigate to the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'jump to the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'scroll to the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'open the section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'display section', tier: 'STRONG', layer: 'navigation' },

  // Location-based queries
  { keyword: 'where is the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'find the section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'locate the', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'which section', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'which page', tier: 'STRONG', layer: 'navigation' },

  // Document structure queries
  { keyword: 'list all sections', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'show all sections', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'sections in', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'what does .* say', tier: 'STRONG', layer: 'navigation' }
];

added = addIntentKeywords('DOCUMENTS', DOCUMENTS_STRONG_EN, 'en');
console.log(`  Added ${added} STRONG keywords to DOCUMENTS (en)`);

// ============================================================================
// STEP 3: FIX DOMAIN ACTIVATION (STRUCTURAL PHRASES)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 3: FIX DOMAIN ACTIVATION — Adding structural phrases');
console.log('═'.repeat(70));

// MEDICAL structural phrases
const MEDICAL_STRUCTURAL = [
  'diagnosis section',
  'medication list',
  'lab results section',
  'imaging report',
  'problem list',
  'patient history',
  'clinical notes',
  'treatment plan',
  'medical history section',
  'vitals section'
];

added = addDomainStructural('MEDICAL', MEDICAL_STRUCTURAL, 'en');
console.log(`  Added ${added} structural phrases to MEDICAL (en)`);

// LEGAL structural phrases
const LEGAL_STRUCTURAL = [
  'indemnification section',
  'payment terms',
  'termination clause',
  'liability section',
  'governing law section',
  'warranty section',
  'confidentiality section',
  'force majeure clause',
  'arbitration clause',
  'amendment section'
];

added = addDomainStructural('LEGAL', LEGAL_STRUCTURAL, 'en');
console.log(`  Added ${added} structural phrases to LEGAL (en)`);

// FINANCE structural phrases
const FINANCE_STRUCTURAL = [
  'cash flow statement',
  'income statement',
  'balance sheet',
  'revenue trend',
  'financial summary',
  'profit and loss',
  'quarterly results',
  'annual report',
  'earnings section',
  'expense breakdown'
];

added = addDomainStructural('FINANCE', FINANCE_STRUCTURAL, 'en');
console.log(`  Added ${added} structural phrases to FINANCE (en)`);

// ENGINEERING structural phrases
const ENGINEERING_STRUCTURAL = [
  'ISO compliance section',
  'requirements section',
  'test plan',
  'acceptance criteria',
  'technical specifications',
  'design document',
  'architecture section',
  'performance requirements',
  'quality assurance section',
  'validation criteria'
];

added = addDomainStructural('ENGINEERING', ENGINEERING_STRUCTURAL, 'en');
console.log(`  Added ${added} structural phrases to ENGINEERING (en)`);

// ============================================================================
// STEP 4: MULTILINGUAL COVERAGE (PT/ES)
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 4: MULTILINGUAL COVERAGE — Adding PT/ES phrases');
console.log('═'.repeat(70));

// DOCUMENTS Portuguese
const DOCUMENTS_STRONG_PT = [
  { keyword: 'mostre-me a seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'vá para a seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'navegue até a seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'mostre-me o', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'vá para o', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'onde está', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'encontre a seção', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'índice', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'sumário', tier: 'STRONG', layer: 'navigation' }
];

added = addIntentKeywords('DOCUMENTS', DOCUMENTS_STRONG_PT, 'pt');
console.log(`  Added ${added} STRONG keywords to DOCUMENTS (pt)`);

// DOCUMENTS Spanish
const DOCUMENTS_STRONG_ES = [
  { keyword: 'muéstrame la sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 've a la sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'navega hasta la sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'muéstrame el', tier: 'STRONG', layer: 'navigation' },
  { keyword: 've a la', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'dónde está', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'encuentra la sección', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'índice', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'tabla de contenido', tier: 'STRONG', layer: 'navigation' }
];

added = addIntentKeywords('DOCUMENTS', DOCUMENTS_STRONG_ES, 'es');
console.log(`  Added ${added} STRONG keywords to DOCUMENTS (es)`);

// EXTRACTION negatives for PT/ES
const EXTRACTION_NEGATIVES_PT = [
  { keyword: 'mostre-me', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'vá para', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'navegue até', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'seção', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'página', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('EXTRACTION', EXTRACTION_NEGATIVES_PT, 'pt');
console.log(`  Added ${added} NEGATIVE keywords to EXTRACTION (pt)`);

const EXTRACTION_NEGATIVES_ES = [
  { keyword: 'muéstrame', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 've a', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'navega hasta', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'sección', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'página', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('EXTRACTION', EXTRACTION_NEGATIVES_ES, 'es');
console.log(`  Added ${added} NEGATIVE keywords to EXTRACTION (es)`);

// ============================================================================
// STEP 5: UPDATE METADATA AND SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('STEP 5: SAVING CHANGES');
console.log('═'.repeat(70));

// Update metadata
intentPatterns.metadata.routingFix4At = new Date().toISOString();
intentPatterns.metadata.fix4Description = 'Strict no-data-loss fix: NEGATIVES + STRONG + STRUCTURAL';

if (!domainActivation._meta) domainActivation._meta = {};
domainActivation._meta.routingFix4At = new Date().toISOString();

// Save files
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
writeFileSync(`${DATA_DIR}/domain_activation.json`, JSON.stringify(domainActivation, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('  ✓ Saved domain_activation.json');

// ============================================================================
// OUTPUT SUMMARY
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('ADDITIONS SUMMARY — NO DELETIONS MADE');
console.log('═'.repeat(70));

console.log('\nINTENT ADDITIONS:');
for (const [intent, items] of Object.entries(additions.intents)) {
  console.log(`\n  ${intent}:`);
  const byLang = {};
  for (const item of items) {
    if (!byLang[item.lang]) byLang[item.lang] = { NEGATIVE: [], STRONG: [], MEDIUM: [], WEAK: [] };
    byLang[item.lang][item.tier].push(item.keyword);
  }
  for (const [lang, tiers] of Object.entries(byLang)) {
    for (const [tier, keywords] of Object.entries(tiers)) {
      if (keywords.length > 0) {
        console.log(`    [${lang}] ${tier}: ${keywords.length} keywords`);
      }
    }
  }
}

console.log('\nDOMAIN ADDITIONS:');
for (const [domain, items] of Object.entries(additions.domains)) {
  console.log(`  ${domain}: ${items.length} structural phrases`);
}

// Count totals
let totalIntentAdditions = 0;
let totalDomainAdditions = 0;
for (const items of Object.values(additions.intents)) totalIntentAdditions += items.length;
for (const items of Object.values(additions.domains)) totalDomainAdditions += items.length;

console.log('\n' + '═'.repeat(70));
console.log('TOTALS');
console.log('═'.repeat(70));
console.log(`  Intent keywords added: ${totalIntentAdditions}`);
console.log(`  Domain phrases added: ${totalDomainAdditions}`);
console.log(`  Total additions: ${totalIntentAdditions + totalDomainAdditions}`);
console.log('\n  ✓ NO DELETIONS');
console.log('  ✓ NO DEDUPLICATION');
console.log('  ✓ NO COUNT REDUCTIONS');
console.log('\n' + '═'.repeat(70));
