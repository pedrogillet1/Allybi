/**
 * KODA Routing Fix - Surgical Keyword Additions
 *
 * Adds STRONG keywords to fix routing failures without mass changes.
 * Each fix is targeted at specific test case failures.
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));
const domainLayers = JSON.parse(readFileSync(`${DATA_DIR}/domain_layers.json`, 'utf-8'));

// ============================================================================
// FIX 1: DOCUMENTS intent needs stronger navigation keywords
// ============================================================================

const DOCUMENTS_STRONG_KEYWORDS = {
  en: [
    // Navigation verbs (these should route to DOCUMENTS, not MEMORY/EXTRACTION)
    { keyword: "show me section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navigate to section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show me page", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to page", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "jump to page", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "display section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show the section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "find the section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "locate section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Document structure queries
    { keyword: "table of contents", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show table of contents", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "list all sections", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "what sections", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Legal document navigation
    { keyword: "go to the clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show me the clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navigate to clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "find the clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "termination clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "indemnification section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "confidentiality provisions", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "warranty section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "force majeure clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "payment terms section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Article/Section references
    { keyword: "article 3", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "section 5", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "what does article", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "what does section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Medical document navigation
    { keyword: "show me the lab results", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to diagnosis section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "find patient history", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show medication list", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "clinical notes", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Finance document navigation
    { keyword: "show me the revenue", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navigate to balance sheet", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "find cash flow", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to income statement", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show profit margins", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Engineering document navigation
    { keyword: "show technical specifications", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navigate to tolerance", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "find material specifications", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to iso compliance", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show assembly instructions", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" }
  ],
  pt: [
    { keyword: "mostre-me a seção", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "vá para a seção", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navegue até a seção", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "mostre a página", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "vá para a página", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "índice", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "sumário", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "cláusula de rescisão", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "seção de pagamento", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" }
  ],
  es: [
    { keyword: "muéstrame la sección", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "ve a la sección", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navega a la sección", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "muestra la página", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "ve a la página", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "índice", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "tabla de contenido", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "cláusula de terminación", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "sección de pago", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" }
  ]
};

// ============================================================================
// FIX 2: Add NEGATIVE triggers to MEMORY to prevent document navigation matches
// ============================================================================

const MEMORY_NEGATIVE_KEYWORDS = {
  en: [
    { keyword: "show me section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "go to section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "navigate to", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "table of contents", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "find the clause", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "show me the clause", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "article 3", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "section 5", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what does article", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what does section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "termination clause", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "indemnification section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "confidentiality provisions", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "of the contract", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "in the document", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "in the agreement", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  pt: [
    { keyword: "mostre-me a seção", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "vá para a seção", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "no contrato", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "no documento", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  es: [
    { keyword: "muéstrame la sección", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "ve a la sección", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "en el contrato", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "en el documento", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ]
};

// ============================================================================
// FIX 3: EXTRACTION intent - strengthen data extraction keywords
// ============================================================================

const EXTRACTION_STRONG_KEYWORDS = {
  en: [
    { keyword: "extract the value", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the value", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "get the number", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "pull the data", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the amount", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "extract the amount", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the date", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the term", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the period", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the rate", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the percentage", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "extract all dates", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "pull all values", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "what is the contract value", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "termination notice period", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "payment terms", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "liability cap", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "governing law", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "warranty period", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "renewal term", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "arbitration venue", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    // Medical extraction
    { keyword: "blood pressure", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "hemoglobin level", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "medication dosage", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "cholesterol values", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "creatinine level", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "vital signs", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "a1c percentage", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    // Finance extraction
    { keyword: "total revenue", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "net profit margin", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "ebitda figure", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "debt-to-equity", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    // Engineering extraction
    { keyword: "maximum load capacity", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "dimensional tolerances", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "material grade", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "operating temperature", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "torque specifications", tier: "STRONG", layer: "actions", target: "EXTRACTION" }
  ],
  pt: [
    { keyword: "qual é o valor", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "extraia o valor", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "obtenha o número", tier: "STRONG", layer: "actions", target: "EXTRACTION" }
  ],
  es: [
    { keyword: "cuál es el valor", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "extrae el valor", tier: "STRONG", layer: "actions", target: "EXTRACTION" },
    { keyword: "obtén el número", tier: "STRONG", layer: "actions", target: "EXTRACTION" }
  ]
};

// ============================================================================
// FIX 4: REASONING intent - strengthen analysis keywords
// ============================================================================

const REASONING_STRONG_KEYWORDS = {
  en: [
    { keyword: "analyze the risks", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "compare section", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "what are the implications", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "evaluate the enforceability", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "assess the risks", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "how does article", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "what could go wrong", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "analyze the balance", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "why is the", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "strategic implications", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "analyze the lab results", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "compare current vitals", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "what do these symptoms suggest", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "evaluate medication interactions", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "assess the risk factors", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "analyze the revenue trend", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "compare profit margins", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "evaluate financial health", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "assess cash flow", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "analyze structural integrity", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "compare material specifications", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "what are the failure modes", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "evaluate safety margins", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "assess compliance", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "comprehensive analysis", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "systemic analysis", tier: "STRONG", layer: "actions", target: "REASONING" }
  ],
  pt: [
    { keyword: "analise os riscos", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "compare a seção", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "quais são as implicações", tier: "STRONG", layer: "actions", target: "REASONING" }
  ],
  es: [
    { keyword: "analiza los riesgos", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "compara la sección", tier: "STRONG", layer: "actions", target: "REASONING" },
    { keyword: "cuáles son las implicaciones", tier: "STRONG", layer: "actions", target: "REASONING" }
  ]
};

// ============================================================================
// FIX 5: Domain keywords - strengthen domain activation
// ============================================================================

const LEGAL_STRONG_KEYWORDS = {
  en: [
    { keyword: "contract", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "agreement", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "clause", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "section of the contract", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "article of the agreement", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "termination", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "indemnification", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "liability", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "confidentiality", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "warranty", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "force majeure", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "non-compete", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "arbitration", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "jurisdiction", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "governing law", tier: "STRONG", layer: "domain_signal", target: "LEGAL" }
  ],
  pt: [
    { keyword: "contrato", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "acordo", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "cláusula", tier: "STRONG", layer: "domain_signal", target: "LEGAL" }
  ],
  es: [
    { keyword: "contrato", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "acuerdo", tier: "STRONG", layer: "domain_signal", target: "LEGAL" },
    { keyword: "cláusula", tier: "STRONG", layer: "domain_signal", target: "LEGAL" }
  ]
};

const MEDICAL_STRONG_KEYWORDS = {
  en: [
    { keyword: "patient", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "diagnosis", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "lab results", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "medication", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "clinical", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "vitals", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "symptoms", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" }
  ],
  pt: [
    { keyword: "paciente", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "diagnóstico", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" }
  ],
  es: [
    { keyword: "paciente", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" },
    { keyword: "diagnóstico", tier: "STRONG", layer: "domain_signal", target: "MEDICAL" }
  ]
};

const FINANCE_STRONG_KEYWORDS = {
  en: [
    { keyword: "revenue", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "profit", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "balance sheet", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "income statement", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "cash flow", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "ebitda", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "financial", tier: "STRONG", layer: "domain_signal", target: "FINANCE" }
  ],
  pt: [
    { keyword: "receita", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "lucro", tier: "STRONG", layer: "domain_signal", target: "FINANCE" }
  ],
  es: [
    { keyword: "ingresos", tier: "STRONG", layer: "domain_signal", target: "FINANCE" },
    { keyword: "ganancia", tier: "STRONG", layer: "domain_signal", target: "FINANCE" }
  ]
};

const ENGINEERING_STRONG_KEYWORDS = {
  en: [
    { keyword: "specifications", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "tolerance", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "technical", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "iso", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "assembly", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "material grade", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" }
  ],
  pt: [
    { keyword: "especificações", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "tolerância", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" }
  ],
  es: [
    { keyword: "especificaciones", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" },
    { keyword: "tolerancia", tier: "STRONG", layer: "domain_signal", target: "ENGINEERING" }
  ]
};

// ============================================================================
// APPLY FIXES
// ============================================================================

function addKeywords(intentOrDomain, keywords, isIntent = true) {
  const data = isIntent ? intentPatterns.intents[intentOrDomain] : domainLayers.domains[intentOrDomain];
  if (!data) {
    console.log(`  ⚠️ ${intentOrDomain} not found`);
    return 0;
  }

  let added = 0;
  for (const lang of ['en', 'pt', 'es']) {
    if (!keywords[lang]) continue;
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

console.log('\nApplying routing fixes...\n');

let totalAdded = 0;

// Fix 1: DOCUMENTS navigation keywords
console.log('1. Adding DOCUMENTS navigation keywords...');
let added = addKeywords('DOCUMENTS', DOCUMENTS_STRONG_KEYWORDS, true);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Fix 2: MEMORY negative triggers
console.log('2. Adding MEMORY negative triggers...');
added = addKeywords('MEMORY', MEMORY_NEGATIVE_KEYWORDS, true);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Fix 3: EXTRACTION keywords
console.log('3. Adding EXTRACTION keywords...');
added = addKeywords('EXTRACTION', EXTRACTION_STRONG_KEYWORDS, true);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Fix 4: REASONING keywords
console.log('4. Adding REASONING keywords...');
added = addKeywords('REASONING', REASONING_STRONG_KEYWORDS, true);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Fix 5: Domain keywords
console.log('5. Adding LEGAL domain keywords...');
added = addKeywords('LEGAL', LEGAL_STRONG_KEYWORDS, false);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('6. Adding MEDICAL domain keywords...');
added = addKeywords('MEDICAL', MEDICAL_STRONG_KEYWORDS, false);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('7. Adding FINANCE domain keywords...');
added = addKeywords('FINANCE', FINANCE_STRONG_KEYWORDS, false);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('8. Adding ENGINEERING domain keywords...');
added = addKeywords('ENGINEERING', ENGINEERING_STRONG_KEYWORDS, false);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Update metadata
intentPatterns.metadata.routingFixAt = new Date().toISOString();
domainLayers.metadata.routingFixAt = new Date().toISOString();

// Save
console.log('\nSaving files...');
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
writeFileSync(`${DATA_DIR}/domain_layers.json`, JSON.stringify(domainLayers, null, 2));

console.log('\n' + '='.repeat(60));
console.log('ROUTING FIX COMPLETE');
console.log('='.repeat(60));
console.log(`\nTotal keywords added: ${totalAdded}`);
console.log('\nRun "npm run test:koda" to verify fixes.');
