/**
 * KODA Routing Fix Round 3 - Comprehensive Fix
 *
 * Fixes:
 * 1. DOCUMENTS navigation keywords (STRONG)
 * 2. EXTRACTION negatives (prevent navigation hijack)
 * 3. HELP intent boost for product questions
 * 4. CONVERSATION keywords for acknowledgments
 * 5. Domain activation improvements
 * 6. Multilingual (PT/ES) fixes
 * 7. REASONING boost for analysis queries
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));
const domainLayers = JSON.parse(readFileSync(`${DATA_DIR}/domain_layers.json`, 'utf-8'));

// ============================================================================
// 1. DOCUMENTS - Strong navigation keywords
// ============================================================================

const DOCUMENTS_KEYWORDS = {
  en: [
    // Navigation verbs
    { keyword: "show me section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "show section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "go to the", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "navigate to the", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "jump to page", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "jump to", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "display the", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "display section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Legal document navigation
    { keyword: "termination clause", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "the clause", tier: "MEDIUM", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "warranty section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "indemnification section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "article 3", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "article 7", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "section 5", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "section 8", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "the contract", tier: "MEDIUM", layer: "context", target: "DOCUMENTS" },

    // Medical document navigation
    { keyword: "lab results", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "latest lab", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "diagnosis section", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "medication list", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "clinical notes", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Finance document navigation
    { keyword: "revenue figures", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "q3 revenue", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "cash flow statement", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "income statement", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "profit margins", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Engineering document navigation
    { keyword: "technical specifications", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "tolerance requirements", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "material specifications", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "iso compliance", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "assembly instructions", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },

    // Excel/Spreadsheet navigation
    { keyword: "pivot table", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "the spreadsheet", tier: "MEDIUM", layer: "navigation", target: "DOCUMENTS" },

    // Generic navigation
    { keyword: "what does", tier: "MEDIUM", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "say about", tier: "MEDIUM", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "don't change", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "just show", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "read only", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" }
  ],
  pt: [
    { keyword: "mostre-me", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "mostre a seção", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "seção de pagamento", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "ir para", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "vá para", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" }
  ],
  es: [
    { keyword: "muéstrame", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "mostrar la sección", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "sección de pago", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "ir a", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" },
    { keyword: "ve a", tier: "STRONG", layer: "navigation", target: "DOCUMENTS" }
  ]
};

// ============================================================================
// 2. EXTRACTION - More negative triggers
// ============================================================================

const EXTRACTION_NEGATIVES = {
  en: [
    // Navigation - exclude these from EXTRACTION
    { keyword: "show me section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "go to section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "go to the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "navigate to", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "jump to", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "display the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what does article", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what does section", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "say about", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "latest lab", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "clinical notes", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "pivot table", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "just show", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "don't change", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "read only", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },

    // Analysis - exclude from EXTRACTION (goes to REASONING)
    { keyword: "implications", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what could go wrong", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "strategic", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "systemic analysis", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "comprehensive", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },

    // HELP - exclude from EXTRACTION
    { keyword: "how do i", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what can koda", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "how does the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "can you", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "how accurate", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "keyboard shortcuts", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "document size limit", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  pt: [
    { keyword: "mostre-me", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "ir para", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  es: [
    { keyword: "muéstrame", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "ir a", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ]
};

// ============================================================================
// 3. HELP - Strong product-related keywords
// ============================================================================

const HELP_KEYWORDS = {
  en: [
    { keyword: "how do i", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "how can i", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "what can koda", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "can koda", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "can you", tier: "MEDIUM", layer: "help", target: "HELP" },
    { keyword: "how does the", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "feature work", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "analyze contracts", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "language settings", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "keyboard shortcuts", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "how accurate", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "document size limit", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "upload a document", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "help", tier: "STRONG", layer: "help", target: "HELP" }
  ],
  pt: [
    { keyword: "como posso", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "como eu", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "ajuda", tier: "STRONG", layer: "help", target: "HELP" }
  ],
  es: [
    { keyword: "cómo puedo", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "cómo hago", tier: "STRONG", layer: "help", target: "HELP" },
    { keyword: "ayuda", tier: "STRONG", layer: "help", target: "HELP" }
  ]
};

// ============================================================================
// 4. CONVERSATION - Acknowledgment keywords
// ============================================================================

const CONVERSATION_KEYWORDS = {
  en: [
    { keyword: "thanks", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "thank you", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "thanks for", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "good morning", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "good afternoon", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "good evening", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "hello", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "hi there", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "that's great", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "appreciate", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "how are you", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "ok thanks", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "perfect", tier: "MEDIUM", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "that works", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "ok", tier: "MEDIUM", layer: "acknowledgment", target: "CONVERSATION" }
  ],
  pt: [
    { keyword: "obrigado", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "olá", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "bom dia", tier: "STRONG", layer: "greeting", target: "CONVERSATION" }
  ],
  es: [
    { keyword: "gracias", tier: "STRONG", layer: "acknowledgment", target: "CONVERSATION" },
    { keyword: "hola", tier: "STRONG", layer: "greeting", target: "CONVERSATION" },
    { keyword: "buenos días", tier: "STRONG", layer: "greeting", target: "CONVERSATION" }
  ]
};

// ============================================================================
// 5. REASONING - Analysis keywords
// ============================================================================

const REASONING_KEYWORDS = {
  en: [
    { keyword: "implications", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "what are the implications", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "what could go wrong", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "strategic implications", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "comprehensive", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "systemic analysis", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "what do these symptoms suggest", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "assess the risk", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "clinical context", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "failure modes", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "evaluate the financial", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "cash flow sustainability", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "structural integrity", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "general question about", tier: "STRONG", layer: "analysis", target: "REASONING" }
  ],
  pt: [
    { keyword: "analise os riscos", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "quais são as implicações", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "analise", tier: "STRONG", layer: "analysis", target: "REASONING" }
  ],
  es: [
    { keyword: "analiza los riesgos", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "cuáles son las implicaciones", tier: "STRONG", layer: "analysis", target: "REASONING" },
    { keyword: "analiza", tier: "STRONG", layer: "analysis", target: "REASONING" }
  ]
};

// ============================================================================
// 6. ERROR - Error/problem keywords
// ============================================================================

const ERROR_KEYWORDS = {
  en: [
    { keyword: "won't load", tier: "STRONG", layer: "error", target: "ERROR" },
    { keyword: "not working", tier: "STRONG", layer: "error", target: "ERROR" },
    { keyword: "failed", tier: "STRONG", layer: "error", target: "ERROR" },
    { keyword: "can't access", tier: "STRONG", layer: "error", target: "ERROR" },
    { keyword: "bug in", tier: "STRONG", layer: "error", target: "ERROR" },
    { keyword: "crashed", tier: "STRONG", layer: "error", target: "ERROR" },
    { keyword: "error", tier: "MEDIUM", layer: "error", target: "ERROR" },
    { keyword: "broken", tier: "STRONG", layer: "error", target: "ERROR" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// 7. EDIT - Edit/modify keywords
// ============================================================================

const EDIT_KEYWORDS = {
  en: [
    { keyword: "change the", tier: "STRONG", layer: "edit", target: "EDIT" },
    { keyword: "modify the", tier: "STRONG", layer: "edit", target: "EDIT" },
    { keyword: "update the", tier: "STRONG", layer: "edit", target: "EDIT" },
    { keyword: "change to", tier: "STRONG", layer: "edit", target: "EDIT" },
    { keyword: "apply a formula", tier: "STRONG", layer: "edit", target: "EDIT" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// 8. PREFERENCES - Settings keywords
// ============================================================================

const PREFERENCES_KEYWORDS = {
  en: [
    { keyword: "always show", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "always use", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "set the default", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "enable dark mode", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "configure", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "set timezone", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "default to", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "update my email", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "clear history", tier: "STRONG", layer: "settings", target: "PREFERENCES" },
    { keyword: "start fresh", tier: "STRONG", layer: "settings", target: "PREFERENCES" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// 9. FILE_ACTIONS keywords
// ============================================================================

const FILE_ACTIONS_KEYWORDS = {
  en: [
    { keyword: "export the", tier: "STRONG", layer: "file", target: "FILE_ACTIONS" },
    { keyword: "save this", tier: "STRONG", layer: "file", target: "FILE_ACTIONS" },
    { keyword: "attach another", tier: "STRONG", layer: "file", target: "FILE_ACTIONS" },
    { keyword: "convert to", tier: "STRONG", layer: "file", target: "FILE_ACTIONS" },
    { keyword: "print the", tier: "STRONG", layer: "file", target: "FILE_ACTIONS" },
    { keyword: "extract the table", tier: "STRONG", layer: "file", target: "FILE_ACTIONS" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// 10. MEMORY - Recall keywords
// ============================================================================

const MEMORY_NEGATIVES = {
  en: [
    // Exclude extraction queries
    { keyword: "extract", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "pull the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "get the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "what is the", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    // Exclude analysis
    { keyword: "analyze", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "evaluate", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "assess", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" },
    { keyword: "compare", tier: "NEGATIVE", layer: "exclusion", target: "EXCLUSION" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// 11. EXTRACTION - Boost actual extraction keywords
// ============================================================================

const EXTRACTION_BOOST = {
  en: [
    { keyword: "qual é o valor", tier: "STRONG", layer: "extraction", target: "EXTRACTION" },
    { keyword: "what is the value", tier: "STRONG", layer: "extraction", target: "EXTRACTION" }
  ],
  pt: [
    { keyword: "qual é o valor", tier: "STRONG", layer: "extraction", target: "EXTRACTION" },
    { keyword: "extraia", tier: "STRONG", layer: "extraction", target: "EXTRACTION" }
  ],
  es: [
    { keyword: "cuál es el valor", tier: "STRONG", layer: "extraction", target: "EXTRACTION" },
    { keyword: "extraer", tier: "STRONG", layer: "extraction", target: "EXTRACTION" }
  ]
};

// ============================================================================
// 12. DOMAIN KEYWORDS - Boost domain activation
// ============================================================================

const DOMAIN_LEGAL = {
  en: [
    { keyword: "contract", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "clause", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "section", tier: "MEDIUM", layer: "domain", target: "legal" },
    { keyword: "article", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "liability", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "warranty", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "termination", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "indemnification", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "arbitration", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "non-compete", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "payment terms", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "renewal term", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "enforceability", tier: "STRONG", layer: "domain", target: "legal" },
    { keyword: "provisions", tier: "MEDIUM", layer: "domain", target: "legal" },
    { keyword: "signing this", tier: "MEDIUM", layer: "domain", target: "legal" }
  ],
  pt: [],
  es: []
};

const DOMAIN_MEDICAL = {
  en: [
    { keyword: "lab results", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "hemoglobin", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "cholesterol", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "vital signs", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "creatinine", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "a1c", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "medications", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "dosage", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "diagnosis", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "clinical", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "symptoms", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "medication", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "vitals", tier: "STRONG", layer: "domain", target: "medical" },
    { keyword: "patient", tier: "MEDIUM", layer: "domain", target: "medical" },
    { keyword: "lab report", tier: "STRONG", layer: "domain", target: "medical" }
  ],
  pt: [],
  es: []
};

const DOMAIN_FINANCE = {
  en: [
    { keyword: "revenue", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "ebitda", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "profit margin", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "cash flow", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "income statement", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "expense", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "debt level", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "financial health", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "quarterly", tier: "MEDIUM", layer: "domain", target: "finance" },
    { keyword: "q3", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "q4", tier: "STRONG", layer: "domain", target: "finance" },
    { keyword: "projections", tier: "MEDIUM", layer: "domain", target: "finance" }
  ],
  pt: [],
  es: []
};

const DOMAIN_ENGINEERING = {
  en: [
    { keyword: "specifications", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "tolerance", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "load capacity", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "temperature range", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "material grade", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "iso standards", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "assembly", tier: "MEDIUM", layer: "domain", target: "engineering" },
    { keyword: "structural", tier: "STRONG", layer: "domain", target: "engineering" },
    { keyword: "component", tier: "MEDIUM", layer: "domain", target: "engineering" },
    { keyword: "design", tier: "MEDIUM", layer: "domain", target: "engineering" },
    { keyword: "316l", tier: "STRONG", layer: "domain", target: "engineering" }
  ],
  pt: [],
  es: []
};

const DOMAIN_EXCEL = {
  en: [
    { keyword: "column", tier: "STRONG", layer: "domain", target: "excel" },
    { keyword: "row", tier: "STRONG", layer: "domain", target: "excel" },
    { keyword: "cell", tier: "STRONG", layer: "domain", target: "excel" },
    { keyword: "pivot table", tier: "STRONG", layer: "domain", target: "excel" },
    { keyword: "spreadsheet", tier: "STRONG", layer: "domain", target: "excel" },
    { keyword: "formula", tier: "STRONG", layer: "domain", target: "excel" },
    { keyword: "filter", tier: "MEDIUM", layer: "domain", target: "excel" },
    { keyword: "sum the", tier: "STRONG", layer: "domain", target: "excel" }
  ],
  pt: [],
  es: []
};

// ============================================================================
// APPLY ALL FIXES
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

function addDomainKeywords(domainName, keywords) {
  const data = domainLayers.domains[domainName];
  if (!data) {
    console.log(`  ⚠️ Domain ${domainName} not found`);
    return 0;
  }

  let added = 0;
  for (const lang of ['en', 'pt', 'es']) {
    if (!keywords[lang] || keywords[lang].length === 0) continue;
    if (!data.keywords) data.keywords = {};
    if (!data.keywords[lang]) data.keywords[lang] = [];

    const existing = new Set(data.keywords[lang].map(k => (k.keyword || k.k || '').toLowerCase()));

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

console.log('\nApplying routing fixes (round 3 - comprehensive)...\n');

let totalAdded = 0;

// Intent fixes
console.log('1. Adding DOCUMENTS navigation keywords...');
let added = addKeywords('DOCUMENTS', DOCUMENTS_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('2. Adding EXTRACTION negative triggers...');
added = addKeywords('EXTRACTION', EXTRACTION_NEGATIVES);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('3. Adding EXTRACTION boost keywords...');
added = addKeywords('EXTRACTION', EXTRACTION_BOOST);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('4. Adding HELP keywords...');
added = addKeywords('HELP', HELP_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('5. Adding CONVERSATION keywords...');
added = addKeywords('CONVERSATION', CONVERSATION_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('6. Adding REASONING keywords...');
added = addKeywords('REASONING', REASONING_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('7. Adding ERROR keywords...');
added = addKeywords('ERROR', ERROR_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('8. Adding EDIT keywords...');
added = addKeywords('EDIT', EDIT_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('9. Adding PREFERENCES keywords...');
added = addKeywords('PREFERENCES', PREFERENCES_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('10. Adding FILE_ACTIONS keywords...');
added = addKeywords('FILE_ACTIONS', FILE_ACTIONS_KEYWORDS);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

console.log('11. Adding MEMORY negatives...');
added = addKeywords('MEMORY', MEMORY_NEGATIVES);
console.log(`   Added: ${added} keywords`);
totalAdded += added;

// Domain fixes
console.log('\n12. Adding LEGAL domain keywords...');
added = addDomainKeywords('LEGAL', DOMAIN_LEGAL);
console.log(`    Added: ${added} keywords`);
totalAdded += added;

console.log('13. Adding MEDICAL domain keywords...');
added = addDomainKeywords('MEDICAL', DOMAIN_MEDICAL);
console.log(`    Added: ${added} keywords`);
totalAdded += added;

console.log('14. Adding FINANCE domain keywords...');
added = addDomainKeywords('FINANCE', DOMAIN_FINANCE);
console.log(`    Added: ${added} keywords`);
totalAdded += added;

console.log('15. Adding ENGINEERING domain keywords...');
added = addDomainKeywords('ENGINEERING', DOMAIN_ENGINEERING);
console.log(`    Added: ${added} keywords`);
totalAdded += added;

console.log('16. Adding EXCEL domain keywords...');
added = addDomainKeywords('EXCEL', DOMAIN_EXCEL);
console.log(`    Added: ${added} keywords`);
totalAdded += added;

// Update metadata
intentPatterns.metadata.routingFix3At = new Date().toISOString();
domainLayers.metadata = domainLayers.metadata || {};
domainLayers.metadata.routingFix3At = new Date().toISOString();

// Save
console.log('\nSaving...');
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));
writeFileSync(`${DATA_DIR}/domain_layers.json`, JSON.stringify(domainLayers, null, 2));

console.log('\n' + '='.repeat(60));
console.log('ROUTING FIX 3 COMPLETE');
console.log('='.repeat(60));
console.log(`\nTotal keywords added: ${totalAdded}`);
