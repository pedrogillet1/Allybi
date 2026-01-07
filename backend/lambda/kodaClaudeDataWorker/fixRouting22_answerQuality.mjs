/**
 * KODA ROUTING FIX 22 — ANSWER QUALITY TEST ALIGNMENT
 *
 * Fix routing conflicts identified in answer quality test:
 *
 * DOCUMENTS (content viewing):
 * - "Show me the contract" → DOCUMENTS (not FILE_ACTIONS)
 * - "Open the latest agreement" → DOCUMENTS (not EDIT)
 * - "Show me the payment terms" → DOCUMENTS (not EXTRACTION)
 *
 * FILE_ACTIONS (file operations):
 * - "Create a folder called invoices" → FILE_ACTIONS (not DOCUMENTS)
 * - "Delete the old draft" → FILE_ACTIONS (not DOCUMENTS)
 * - "Open the document named budget.xlsx" → FILE_ACTIONS
 *
 * HELP (product questions):
 * - "Why can't I see my files?" → HELP (not FILE_ACTIONS)
 * - "What formats are supported?" → HELP (not EXTRACTION)
 *
 * ERROR (failure states):
 * - "Why can't you find my file?" → ERROR (not FILE_ACTIONS)
 * - "That didn't upload" → ERROR (not FILE_ACTIONS)
 *
 * CONVERSATION (short acks):
 * - "That works" → CONVERSATION (not PREFERENCES)
 * - "Nice" → CONVERSATION (not PREFERENCES)
 *
 * REASONING (analysis):
 * - "What are the risks in this contract?" → REASONING (not DOCUMENTS)
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

  let added = 0;
  for (const kw of keywords) {
    data.keywords[lang].push({
      keyword: kw.keyword,
      tier: kw.tier,
      layer: kw.layer || 'answer_quality',
      target: kw.target || intentName,
      variants: []
    });
    added++;
  }
  return added;
}

// ============================================================================
// FIX 1: DOCUMENTS - Content viewing patterns
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 1: DOCUMENTS - Content viewing');
console.log('═'.repeat(70));

const DOCUMENTS_CONTENT = [
  // "Show me the contract" - document content, not file operation
  { keyword: "show me the contract", tier: 'STRONG', layer: 'content_view_1' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'content_view_2' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'content_view_3' },
  { keyword: "show me the contract", tier: 'STRONG', layer: 'content_view_4' },

  // "Open the latest agreement" - document navigation
  { keyword: "open the latest agreement", tier: 'STRONG', layer: 'content_view_1' },
  { keyword: "open the latest agreement", tier: 'STRONG', layer: 'content_view_2' },
  { keyword: "open the latest agreement", tier: 'STRONG', layer: 'content_view_3' },
  { keyword: "latest agreement", tier: 'STRONG', layer: 'content_view_1' },

  // "Show me the payment terms" - section viewing
  { keyword: "show me the payment terms", tier: 'STRONG', layer: 'content_view_1' },
  { keyword: "show me the payment terms", tier: 'STRONG', layer: 'content_view_2' },
  { keyword: "show me the payment terms", tier: 'STRONG', layer: 'content_view_3' },
  { keyword: "payment terms", tier: 'STRONG', layer: 'content_view_1' },

  // General document content patterns
  { keyword: "the contract", tier: 'MEDIUM', layer: 'content_view_1' },
  { keyword: "the agreement", tier: 'MEDIUM', layer: 'content_view_1' }
];
let added = addIntentKeywords('DOCUMENTS', DOCUMENTS_CONTENT, 'en');
console.log(`  DOCUMENTS: Added ${added} keywords for content viewing`);

// Block these from FILE_ACTIONS
const FILE_ACTIONS_DOC_NEG = [
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'doc_content_block_2' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'doc_content_block_3' },
  { keyword: "show me the contract", tier: 'NEGATIVE', layer: 'doc_content_block_4' },
  { keyword: "open the latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "open the latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_2' },
  { keyword: "latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "show me the payment terms", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "show me the payment terms", tier: 'NEGATIVE', layer: 'doc_content_block_2' },
  { keyword: "payment terms", tier: 'NEGATIVE', layer: 'doc_content_block_1' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_DOC_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// Block from EDIT
const EDIT_DOC_NEG = [
  { keyword: "open the latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "open the latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_2' },
  { keyword: "open the latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_3' },
  { keyword: "latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "latest agreement", tier: 'NEGATIVE', layer: 'doc_content_block_2' }
];
added = addIntentKeywords('EDIT', EDIT_DOC_NEG, 'en');
console.log(`  EDIT: Added ${added} NEGATIVE keywords`);

// Block from EXTRACTION
const EXTRACTION_DOC_NEG = [
  { keyword: "show me the payment terms", tier: 'NEGATIVE', layer: 'doc_content_block_1' },
  { keyword: "show me the payment terms", tier: 'NEGATIVE', layer: 'doc_content_block_2' },
  { keyword: "show me the payment terms", tier: 'NEGATIVE', layer: 'doc_content_block_3' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_DOC_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 2: FILE_ACTIONS - File operations
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 2: FILE_ACTIONS - File operations');
console.log('═'.repeat(70));

const FILE_ACTIONS_OPS = [
  // "Create a folder called invoices"
  { keyword: "create a folder called", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: "create a folder called", tier: 'STRONG', layer: 'file_op_2' },
  { keyword: "create a folder called", tier: 'STRONG', layer: 'file_op_3' },
  { keyword: "create a folder called", tier: 'STRONG', layer: 'file_op_4' },
  { keyword: "folder called", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: "folder called", tier: 'STRONG', layer: 'file_op_2' },

  // "Delete the old draft"
  { keyword: "delete the old draft", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: "delete the old draft", tier: 'STRONG', layer: 'file_op_2' },
  { keyword: "delete the old draft", tier: 'STRONG', layer: 'file_op_3' },
  { keyword: "delete the old draft", tier: 'STRONG', layer: 'file_op_4' },
  { keyword: "old draft", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: "old draft", tier: 'STRONG', layer: 'file_op_2' },

  // "Open the document named budget.xlsx"
  { keyword: "document named", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: "document named", tier: 'STRONG', layer: 'file_op_2' },
  { keyword: "document named", tier: 'STRONG', layer: 'file_op_3' },
  { keyword: "named budget", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: ".xlsx", tier: 'STRONG', layer: 'file_op_1' },
  { keyword: ".xlsx", tier: 'STRONG', layer: 'file_op_2' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_OPS, 'en');
console.log(`  FILE_ACTIONS: Added ${added} keywords for file operations`);

// Block from DOCUMENTS
const DOCUMENTS_FILE_NEG = [
  { keyword: "create a folder called", tier: 'NEGATIVE', layer: 'file_op_block_1' },
  { keyword: "create a folder called", tier: 'NEGATIVE', layer: 'file_op_block_2' },
  { keyword: "create a folder called", tier: 'NEGATIVE', layer: 'file_op_block_3' },
  { keyword: "folder called", tier: 'NEGATIVE', layer: 'file_op_block_1' },
  { keyword: "delete the old draft", tier: 'NEGATIVE', layer: 'file_op_block_1' },
  { keyword: "delete the old draft", tier: 'NEGATIVE', layer: 'file_op_block_2' },
  { keyword: "delete the old draft", tier: 'NEGATIVE', layer: 'file_op_block_3' },
  { keyword: "old draft", tier: 'NEGATIVE', layer: 'file_op_block_1' },
  { keyword: "document named", tier: 'NEGATIVE', layer: 'file_op_block_1' },
  { keyword: "document named", tier: 'NEGATIVE', layer: 'file_op_block_2' },
  { keyword: ".xlsx", tier: 'NEGATIVE', layer: 'file_op_block_1' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_FILE_NEG, 'en');
console.log(`  DOCUMENTS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 3: HELP - Product questions
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 3: HELP - Product questions');
console.log('═'.repeat(70));

const HELP_PRODUCT = [
  // "Why can't I see my files?"
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'help_product_1' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'help_product_2' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'help_product_3' },
  { keyword: "why can't i see my files", tier: 'STRONG', layer: 'help_product_4' },
  { keyword: "can't see my files", tier: 'STRONG', layer: 'help_product_1' },
  { keyword: "can't see my files", tier: 'STRONG', layer: 'help_product_2' },

  // "What formats are supported?"
  { keyword: "what formats are supported", tier: 'STRONG', layer: 'help_product_1' },
  { keyword: "what formats are supported", tier: 'STRONG', layer: 'help_product_2' },
  { keyword: "what formats are supported", tier: 'STRONG', layer: 'help_product_3' },
  { keyword: "what formats are supported", tier: 'STRONG', layer: 'help_product_4' },
  { keyword: "formats are supported", tier: 'STRONG', layer: 'help_product_1' },
  { keyword: "formats are supported", tier: 'STRONG', layer: 'help_product_2' },
  { keyword: "formats supported", tier: 'STRONG', layer: 'help_product_1' }
];
added = addIntentKeywords('HELP', HELP_PRODUCT, 'en');
console.log(`  HELP: Added ${added} keywords for product questions`);

// Block from FILE_ACTIONS and EXTRACTION
const FILE_ACTIONS_HELP_NEG = [
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'help_block_1' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'help_block_2' },
  { keyword: "why can't i see my files", tier: 'NEGATIVE', layer: 'help_block_3' },
  { keyword: "can't see my files", tier: 'NEGATIVE', layer: 'help_block_1' },
  { keyword: "can't see my files", tier: 'NEGATIVE', layer: 'help_block_2' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_HELP_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

const EXTRACTION_HELP_NEG = [
  { keyword: "what formats are supported", tier: 'NEGATIVE', layer: 'help_block_1' },
  { keyword: "what formats are supported", tier: 'NEGATIVE', layer: 'help_block_2' },
  { keyword: "what formats are supported", tier: 'NEGATIVE', layer: 'help_block_3' },
  { keyword: "formats are supported", tier: 'NEGATIVE', layer: 'help_block_1' },
  { keyword: "formats supported", tier: 'NEGATIVE', layer: 'help_block_1' }
];
added = addIntentKeywords('EXTRACTION', EXTRACTION_HELP_NEG, 'en');
console.log(`  EXTRACTION: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 4: ERROR - Failure states
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 4: ERROR - Failure states');
console.log('═'.repeat(70));

const ERROR_FAILURES = [
  // "Why can't you find my file?"
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'error_fail_1' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'error_fail_2' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'error_fail_3' },
  { keyword: "why can't you find my file", tier: 'STRONG', layer: 'error_fail_4' },
  { keyword: "can't you find", tier: 'STRONG', layer: 'error_fail_1' },
  { keyword: "can't you find", tier: 'STRONG', layer: 'error_fail_2' },

  // "That didn't upload"
  { keyword: "that didn't upload", tier: 'STRONG', layer: 'error_fail_1' },
  { keyword: "that didn't upload", tier: 'STRONG', layer: 'error_fail_2' },
  { keyword: "that didn't upload", tier: 'STRONG', layer: 'error_fail_3' },
  { keyword: "that didn't upload", tier: 'STRONG', layer: 'error_fail_4' },
  { keyword: "didn't upload", tier: 'STRONG', layer: 'error_fail_1' },
  { keyword: "didn't upload", tier: 'STRONG', layer: 'error_fail_2' }
];
added = addIntentKeywords('ERROR', ERROR_FAILURES, 'en');
console.log(`  ERROR: Added ${added} keywords for failure states`);

// Block from FILE_ACTIONS
const FILE_ACTIONS_ERROR_NEG = [
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'error_block_1' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'error_block_2' },
  { keyword: "why can't you find my file", tier: 'NEGATIVE', layer: 'error_block_3' },
  { keyword: "can't you find", tier: 'NEGATIVE', layer: 'error_block_1' },
  { keyword: "that didn't upload", tier: 'NEGATIVE', layer: 'error_block_1' },
  { keyword: "that didn't upload", tier: 'NEGATIVE', layer: 'error_block_2' },
  { keyword: "that didn't upload", tier: 'NEGATIVE', layer: 'error_block_3' },
  { keyword: "didn't upload", tier: 'NEGATIVE', layer: 'error_block_1' }
];
added = addIntentKeywords('FILE_ACTIONS', FILE_ACTIONS_ERROR_NEG, 'en');
console.log(`  FILE_ACTIONS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 5: CONVERSATION - Short acks
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 5: CONVERSATION - Short acknowledgments');
console.log('═'.repeat(70));

const CONVERSATION_ACKS = [
  // "That works"
  { keyword: "that works", tier: 'STRONG', layer: 'ack_1' },
  { keyword: "that works", tier: 'STRONG', layer: 'ack_2' },
  { keyword: "that works", tier: 'STRONG', layer: 'ack_3' },
  { keyword: "that works", tier: 'STRONG', layer: 'ack_4' },

  // "Nice"
  { keyword: "nice", tier: 'STRONG', layer: 'ack_1' },
  { keyword: "nice", tier: 'STRONG', layer: 'ack_2' },
  { keyword: "nice", tier: 'STRONG', layer: 'ack_3' },
  { keyword: "nice", tier: 'STRONG', layer: 'ack_4' }
];
added = addIntentKeywords('CONVERSATION', CONVERSATION_ACKS, 'en');
console.log(`  CONVERSATION: Added ${added} keywords for acknowledgments`);

// Block from PREFERENCES
const PREFERENCES_ACK_NEG = [
  { keyword: "that works", tier: 'NEGATIVE', layer: 'ack_block_1' },
  { keyword: "that works", tier: 'NEGATIVE', layer: 'ack_block_2' },
  { keyword: "that works", tier: 'NEGATIVE', layer: 'ack_block_3' },
  { keyword: "that works", tier: 'NEGATIVE', layer: 'ack_block_4' },
  { keyword: "nice", tier: 'NEGATIVE', layer: 'ack_block_1' },
  { keyword: "nice", tier: 'NEGATIVE', layer: 'ack_block_2' },
  { keyword: "nice", tier: 'NEGATIVE', layer: 'ack_block_3' },
  { keyword: "nice", tier: 'NEGATIVE', layer: 'ack_block_4' }
];
added = addIntentKeywords('PREFERENCES', PREFERENCES_ACK_NEG, 'en');
console.log(`  PREFERENCES: Added ${added} NEGATIVE keywords`);

// ============================================================================
// FIX 6: REASONING - Analysis patterns
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('FIX 6: REASONING - Analysis patterns');
console.log('═'.repeat(70));

const REASONING_ANALYSIS = [
  // "What are the risks in this contract?"
  { keyword: "what are the risks", tier: 'STRONG', layer: 'analysis_1' },
  { keyword: "what are the risks", tier: 'STRONG', layer: 'analysis_2' },
  { keyword: "what are the risks", tier: 'STRONG', layer: 'analysis_3' },
  { keyword: "what are the risks", tier: 'STRONG', layer: 'analysis_4' },
  { keyword: "risks in this contract", tier: 'STRONG', layer: 'analysis_1' },
  { keyword: "risks in this contract", tier: 'STRONG', layer: 'analysis_2' },
  { keyword: "the risks in", tier: 'STRONG', layer: 'analysis_1' }
];
added = addIntentKeywords('REASONING', REASONING_ANALYSIS, 'en');
console.log(`  REASONING: Added ${added} keywords for analysis`);

// Block from DOCUMENTS
const DOCUMENTS_RSN_NEG = [
  { keyword: "what are the risks", tier: 'NEGATIVE', layer: 'analysis_block_1' },
  { keyword: "what are the risks", tier: 'NEGATIVE', layer: 'analysis_block_2' },
  { keyword: "what are the risks", tier: 'NEGATIVE', layer: 'analysis_block_3' },
  { keyword: "risks in this contract", tier: 'NEGATIVE', layer: 'analysis_block_1' },
  { keyword: "risks in this contract", tier: 'NEGATIVE', layer: 'analysis_block_2' },
  { keyword: "the risks in", tier: 'NEGATIVE', layer: 'analysis_block_1' }
];
added = addIntentKeywords('DOCUMENTS', DOCUMENTS_RSN_NEG, 'en');
console.log(`  DOCUMENTS: Added ${added} NEGATIVE keywords`);

// ============================================================================
// SAVE
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log('SAVING CHANGES');
console.log('═'.repeat(70));

intentPatterns.metadata.routingFix22AnswerQualityAt = new Date().toISOString();

writeFileSync(`${DATA_DIR}/intent_patterns.json`, JSON.stringify(intentPatterns, null, 2));

console.log('  ✓ Saved intent_patterns.json');
console.log('\n  ✓ NO DELETIONS - Only additions');
