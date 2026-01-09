/**
 * KODA Routing Fix Round 2 - More Negative Triggers
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));
const domainLayers = JSON.parse(readFileSync(`${DATA_DIR}/domain_layers.json`, 'utf-8'));

// ============================================================================
// FIX: EXTRACTION needs NEGATIVE triggers for navigation queries
// ============================================================================

const EXTRACTION_NEGATIVES = {
  en: [
    // Navigation phrases that should NOT go to EXTRACTION
    { keyword: "show me section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "go to section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "navigate to", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "go to page", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "show me page", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "jump to", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "table of contents", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "display section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "display the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "list all sections", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "where is", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "find the section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "locate section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  pt: [
    { keyword: "mostre-me a seção", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "vá para a seção", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "navegue até", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  es: [
    { keyword: "muéstrame la sección", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "ve a la sección", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "navega a", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ]
};

// ============================================================================
// FIX: FILE_ACTIONS needs NEGATIVE triggers for document navigation
// ============================================================================

const FILE_ACTIONS_NEGATIVES = {
  en: [
    { keyword: "where is the clause", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "where is the section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "force majeure", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "termination clause", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "indemnification", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "warranty section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "liability", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "confidentiality", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// FIX: More DOCUMENTS STRONG keywords
// ============================================================================

const MORE_DOCUMENTS_KEYWORDS = {
  en: [
    { keyword: "where is the clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "where is the section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "display the", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show me the latest", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "list all", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "sections mentioning", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "provisions", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "the contract", tier: "MEDIUM", layer: "context", target: "DOCUMENTS" },
    { keyword: "the agreement", tier: "MEDIUM", layer: "context", target: "DOCUMENTS" },
    { keyword: "the document", tier: "MEDIUM", layer: "context", target: "DOCUMENTS" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// FIX: More MEMORY NEGATIVE triggers
// ============================================================================

const MORE_MEMORY_NEGATIVES = {
  en: [
    { keyword: "the latest", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "lab results", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "latest lab", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "find the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "provisions", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "show me the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// APPLY FIXES
// ============================================================================

function addKeywords(intentName, keywords) {
  const data = intentPatterns.intents[intentName];
  if (!data) {
    console.log(`  ⚠️ ${intentName} not found`);
    return 0;
  }

  let added = 0;
  for (const lang of ['en', 'pt', 'es']) {
    if (!keywords[lang] || keywords[lang].length === 0) continue;
    if (!data.keywords) data.keywords = {};
    if (!data.keywords[lang]) data.keywords[lang] = [];

    const existing = new Set(data.keywords[lang].map(k => (k.keyword || '').toLowerCase()));

    for (const kw of keywords[lang]) {
      if (!existing.has(kw.keyword.toLowerCase())) {
        data.keywords[lang].push({
          keyword: kw.keyword,
          tier: kw.tier,
          layer: kw.layer,
          target: kw.target,
          variants: []
        });
        added++;
      }
    }
  }
  return added;
}

console.log('\nApplying routing fixes (round 2)...\n');

let totalAdded = 0;

console.log('1. Adding EXTRACTION negative triggers...');
let added = addKeywords('EXTRACTION', EXTRACTION_NEGATIVES);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('2. Adding FILE_ACTIONS negative triggers...');
added = addKeywords('FILE_ACTIONS', FILE_ACTIONS_NEGATIVES);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('3. Adding more DOCUMENTS keywords...');
added = addKeywords('DOCUMENTS', MORE_DOCUMENTS_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('4. Adding more MEMORY negative triggers...');
added = addKeywords('MEMORY', MORE_MEMORY_NEGATIVES);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Update metadata
intentPatterns.metadata.routingFix2At = new Date().toISOString();

// Save
console.log('\nSaving...');
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('\n' + '='.repeat(60));
console.log('ROUTING FIX 2 COMPLETE');
console.log('='.repeat(60));
console.log(`\nTotal keywords added: ${totalAdded}`);
