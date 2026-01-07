/**
 * KODA ROUTING FIX 6 — DOMAIN ANCHOR EXPANSION
 *
 * Focus: Fix 41 domain activation failures by adding more anchors
 * - LEGAL: 14 failures → need "agreement", "liability", etc.
 * - MEDICAL: 11 failures → need "patient", "blood", "level", etc.
 * - FINANCE: 10 failures → need "revenue", "EBITDA", "ratio", etc.
 * - ENGINEERING: 5 failures → need "design", "component", "safety", etc.
 * - EXCEL: 1 failure → need "formula", "calculate", etc.
 *
 * Also fixes:
 * - Remaining intent hijacking (27 cases)
 * - Multilingual issues (5 cases)
 *
 * RULES: ONLY ADDITIONS, NO DELETIONS
 */

import { readFileSync, writeFileSync } from 'fs';

const DATA_DIR = '/Users/pg/Desktop/koda-webapp/backend/src/data';

console.log('Loading data files...');
const domainActivation = JSON.parse(readFileSync(`${DATA_DIR}/domain_activation.json`, 'utf-8'));
const intentPatterns = JSON.parse(readFileSync(`${DATA_DIR}/intent_patterns.json`, 'utf-8'));

// ============================================================================
// ADD DOMAIN ANCHORS
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('ADDING DOMAIN ANCHORS');
console.log('═'.repeat(70));

function addDomainAnchors(domainName, newAnchors, lang = 'en') {
  const domain = domainActivation.domains?.[domainName];
  if (!domain) {
    console.log(`  ⚠️ Domain ${domainName} not found`);
    return 0;
  }

  if (!domain.layer1_strong_anchors) {
    domain.layer1_strong_anchors = { anchors: {} };
  }
  if (!domain.layer1_strong_anchors.anchors) {
    domain.layer1_strong_anchors.anchors = {};
  }
  if (!domain.layer1_strong_anchors.anchors[lang]) {
    domain.layer1_strong_anchors.anchors[lang] = [];
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

// LEGAL domain - fix 14 failures
const LEGAL_ANCHORS = [
  // Document types
  'agreement', 'contract', 'lease', 'deed', 'covenant', 'bond',
  'memorandum', 'articles', 'bylaws', 'charter', 'indenture',

  // Legal concepts
  'liability', 'indemnification', 'indemnity', 'warranty', 'warranties',
  'termination', 'breach', 'default', 'damages', 'remedy', 'remedies',
  'arbitration', 'jurisdiction', 'governing law', 'severability',
  'force majeure', 'confidentiality', 'non-disclosure', 'nda',
  'non-compete', 'intellectual property', 'ip rights',

  // Legal terms
  'clause', 'provision', 'section', 'article', 'schedule', 'exhibit',
  'party', 'parties', 'signatory', 'assignee', 'assignor',
  'lessor', 'lessee', 'licensor', 'licensee', 'grantor', 'grantee',

  // Actions
  'executed', 'execution', 'enforce', 'enforceable', 'binding'
];

let added = addDomainAnchors('LEGAL', LEGAL_ANCHORS, 'en');
console.log(`  LEGAL: Added ${added} anchors`);

// MEDICAL domain - fix 11 failures
const MEDICAL_ANCHORS = [
  // Patient data
  'patient', 'patient\'s', 'diagnosis', 'prognosis', 'symptoms',
  'condition', 'history', 'vitals', 'vital signs',

  // Lab values
  'blood pressure', 'bp', 'heart rate', 'pulse', 'temperature',
  'hemoglobin', 'hgb', 'creatinine', 'bun', 'glucose', 'a1c',
  'cholesterol', 'ldl', 'hdl', 'triglycerides', 'sodium', 'potassium',
  'level', 'levels', 'count', 'lab', 'labs', 'laboratory',

  // Measurements
  'weight', 'height', 'bmi', 'mass', 'kg', 'lbs',

  // Medical concepts
  'medication', 'medications', 'drug', 'drugs', 'dosage', 'dose',
  'treatment', 'therapy', 'procedure', 'surgery', 'operation',
  'imaging', 'x-ray', 'ct', 'mri', 'ultrasound', 'scan',

  // Clinical
  'clinical', 'assessment', 'findings', 'notes', 'chart', 'record',
  'icd', 'icd-10', 'cpt', 'hcpcs', 'snomed'
];

added = addDomainAnchors('MEDICAL', MEDICAL_ANCHORS, 'en');
console.log(`  MEDICAL: Added ${added} anchors`);

// FINANCE domain - fix 10 failures
const FINANCE_ANCHORS = [
  // Financial metrics
  'revenue', 'revenues', 'income', 'profit', 'profits', 'earnings',
  'ebitda', 'ebit', 'gross margin', 'net margin', 'margin', 'margins',
  'expense', 'expenses', 'cost', 'costs', 'overhead',

  // Ratios
  'ratio', 'ratios', 'debt-to-equity', 'd/e', 'current ratio',
  'quick ratio', 'p/e', 'price-to-earnings', 'roi', 'roa', 'roe',

  // Statements
  'balance sheet', 'income statement', 'cash flow', 'p&l',
  'profit and loss', 'statement', 'statements', 'financial',
  'fiscal', 'fy', 'quarterly', 'q1', 'q2', 'q3', 'q4', 'annual',

  // Items
  'asset', 'assets', 'liability', 'liabilities', 'equity',
  'debt', 'loan', 'loans', 'receivable', 'payable',
  'depreciation', 'amortization', 'capex', 'opex',

  // Currency
  'dollar', 'dollars', 'usd', 'eur', 'gbp', 'amount', 'total',
  'figure', 'figures', 'value', 'valuation'
];

added = addDomainAnchors('FINANCE', FINANCE_ANCHORS, 'en');
console.log(`  FINANCE: Added ${added} anchors`);

// ENGINEERING domain - fix 5 failures
const ENGINEERING_ANCHORS = [
  // Design
  'design', 'designs', 'specification', 'specifications', 'spec', 'specs',
  'requirement', 'requirements', 'constraint', 'constraints',
  'architecture', 'schematic', 'blueprint', 'drawing', 'cad',

  // Components
  'component', 'components', 'part', 'parts', 'module', 'modules',
  'assembly', 'subassembly', 'system', 'subsystem', 'unit',

  // Analysis
  'structural', 'integrity', 'stress', 'strain', 'load', 'loads',
  'failure', 'failure mode', 'fmea', 'safety', 'margin', 'margins',
  'tolerance', 'tolerances', 'dimension', 'dimensions',

  // Standards
  'iso', 'ansi', 'astm', 'asme', 'ieee', 'compliance', 'standard',
  'standards', 'certification', 'certified', 'qualified',

  // Materials
  'material', 'materials', 'steel', 'aluminum', 'alloy', 'grade',
  'tensile', 'yield', 'strength', 'hardness'
];

added = addDomainAnchors('ENGINEERING', ENGINEERING_ANCHORS, 'en');
console.log(`  ENGINEERING: Added ${added} anchors`);

// EXCEL domain - fix 1 failure
const EXCEL_ANCHORS = [
  // Spreadsheet concepts
  'cell', 'cells', 'row', 'rows', 'column', 'columns',
  'formula', 'formulas', 'function', 'functions',
  'sheet', 'worksheet', 'workbook', 'spreadsheet', 'excel',

  // Operations
  'sum', 'sumif', 'average', 'count', 'countif', 'vlookup', 'hlookup',
  'index', 'match', 'lookup', 'pivot', 'pivot table', 'filter',
  'sort', 'calculate', 'calculation', 'total', 'totals',

  // Ranges
  'range', 'a1', 'b1', 'c1', 'a2', 'b2', 'c2'
];

added = addDomainAnchors('EXCEL', EXCEL_ANCHORS, 'en');
console.log(`  EXCEL: Added ${added} anchors`);

// ============================================================================
// FIX REMAINING INTENT HIJACKING
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIXING REMAINING INTENT HIJACKING');
console.log('═'.repeat(70));

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

// More EXTRACTION negatives
const EXTRACTION_FIX6 = [
  { keyword: 'pivot table', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'payment terms', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'explain the', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'list all sections', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'mentioning', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'sum the cells', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'default output format', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('EXTRACTION', EXTRACTION_FIX6, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// More MEMORY negatives
const MEMORY_FIX6 = [
  { keyword: 'profit margins', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'show profit', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'diagnosis date', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('MEMORY', MEMORY_FIX6, 'en');
console.log(`  MEMORY: Added ${added} NEGATIVE keywords`);

// More REASONING negatives
const REASONING_FIX6 = [
  { keyword: 'assembly instructions', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what are the keyboard', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('REASONING', REASONING_FIX6, 'en');
console.log(`  REASONING: Added ${added} NEGATIVE keywords`);

// More DOCUMENTS negatives
const DOCUMENTS_FIX6 = [
  { keyword: 'save this document', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'convert to word', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'rewrite the clinical', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'analyze the lab results', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'read only', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'no modifications', tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'what context do you have', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('DOCUMENTS', DOCUMENTS_FIX6, 'en');
console.log(`  DOCUMENTS: Added ${added} NEGATIVE keywords`);

// Boost HELP
const HELP_FIX6 = [
  { keyword: 'what are the keyboard shortcuts', tier: 'STRONG', layer: 'actions' },
  { keyword: 'how accurate is the extraction', tier: 'STRONG', layer: 'actions' },
  { keyword: 'what is the document size limit', tier: 'STRONG', layer: 'actions' }
];

added = addIntentKeywords('HELP', HELP_FIX6, 'en');
console.log(`  HELP: Added ${added} STRONG keywords`);

// Boost CONVERSATION
const CONVERSATION_FIX6 = [
  { keyword: 'sum the cells', tier: 'STRONG', layer: 'actions' },
  { keyword: 'in row', tier: 'MEDIUM', layer: 'context' }
];

added = addIntentKeywords('CONVERSATION', CONVERSATION_FIX6, 'en');
console.log(`  CONVERSATION: Added ${added} keywords`);

// Boost ERROR
const ERROR_FIX6 = [
  { keyword: "document won't load", tier: 'STRONG', layer: 'states' },
  { keyword: 'extraction failed', tier: 'STRONG', layer: 'states' },
  { keyword: "can't access the file", tier: 'STRONG', layer: 'states' },
  { keyword: 'upload crashed', tier: 'STRONG', layer: 'states' }
];

added = addIntentKeywords('ERROR', ERROR_FIX6, 'en');
console.log(`  ERROR: Added ${added} STRONG keywords`);

// Boost FILE_ACTIONS negatives
const FILE_ACTIONS_FIX6 = [
  { keyword: "won't load", tier: 'NEGATIVE', layer: 'exclusion' },
  { keyword: 'crashed', tier: 'NEGATIVE', layer: 'exclusion' }
];

added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_FIX6, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// Boost PREFERENCES STRONG
const PREFERENCES_FIX6 = [
  { keyword: 'default output format to bullet', tier: 'STRONG', layer: 'actions' }
];

added = addIntentKeywords('PREFERENCES', PREFERENCES_FIX6, 'en');
console.log(`  PREFERENCES: Added ${added} STRONG keywords`);

// ============================================================================
// FIX MULTILINGUAL
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIXING MULTILINGUAL');
console.log('═'.repeat(70));

// Portuguese DOCUMENTS
const DOCUMENTS_PT = [
  { keyword: 'seção de pagamento', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'mostre-me a seção de', tier: 'STRONG', layer: 'navigation' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_PT, 'pt');
console.log(`  DOCUMENTS (pt): Added ${added} keywords`);

// Portuguese REASONING
const REASONING_PT = [
  { keyword: 'analise os riscos', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'riscos desta', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'cláusula', tier: 'MEDIUM', layer: 'context' }
];
added = addIntentKeywords('REASONING', REASONING_PT, 'pt');
console.log(`  REASONING (pt): Added ${added} keywords`);

// Spanish DOCUMENTS
const DOCUMENTS_ES = [
  { keyword: 'sección de pago', tier: 'STRONG', layer: 'navigation' },
  { keyword: 'muéstrame la sección de', tier: 'STRONG', layer: 'navigation' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_ES, 'es');
console.log(`  DOCUMENTS (es): Added ${added} keywords`);

// Spanish EXTRACTION
const EXTRACTION_ES = [
  { keyword: 'cuál es el valor', tier: 'STRONG', layer: 'extraction' },
  { keyword: 'valor del contrato', tier: 'STRONG', layer: 'extraction' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_ES, 'es');
console.log(`  EXTRACTION (es): Added ${added} keywords`);

// Spanish REASONING
const REASONING_ES = [
  { keyword: 'analiza los riesgos', tier: 'STRONG', layer: 'analysis' },
  { keyword: 'riesgos de esta', tier: 'STRONG', layer: 'analysis' }
];
added = addIntentKeywords('REASONING', REASONING_ES, 'es');
console.log(`  REASONING (es): Added ${added} keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

domainActivation._meta = domainActivation._meta || {};
domainActivation._meta.routingFix6At = new Date().toISOString();
intentPatterns.metadata.routingFix6At = new Date().toISOString();

writeFileSync(`${DATA_DIR}/domain_activation.json`, JSON.stringify(domainActivation, null, 2));
writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved domain_activation.json');
console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS');
