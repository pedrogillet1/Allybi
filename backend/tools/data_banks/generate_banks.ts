#!/usr/bin/env npx ts-node
/**
 * Data Bank Generator - Uses Claude API to generate all data banks in batches
 *
 * Usage: CLAUDE_API_KEY=xxx npx ts-node tools/data_banks/generate_banks.ts [bank_type] [bank_name]
 *
 * Examples:
 *   npx ts-node tools/data_banks/generate_banks.ts triggers primary_intents
 *   npx ts-node tools/data_banks/generate_banks.ts all  # Generate everything
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const DATA_BANKS_DIR = path.join(__dirname, '../../src/data_banks');
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;

if (!CLAUDE_API_KEY) {
  console.error('ERROR: CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable required');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });

// ============================================================================
// BANK GENERATION SPECS
// ============================================================================

interface BankSpec {
  type: 'triggers' | 'negatives' | 'overlays' | 'formatting' | 'normalizers' | 'lexicons' | 'templates';
  name: string;
  targetCount: number;
  languages: string[];
  prompt: string;
  outputFile: string;
}

const BANK_SPECS: BankSpec[] = [
  // === TRIGGERS ===
  {
    type: 'triggers',
    name: 'file_actions_subintents',
    targetCount: 1400,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/file_actions_subintents.json',
    prompt: `Generate a comprehensive JSON file of file action trigger patterns for a document management AI assistant.

TARGET: ~1400 patterns total (~467 per language: EN, PT, ES)

OPERATORS to cover (distribute evenly):
- open: "open file X", "abre o arquivo", "abrir archivo"
- show: "show me file X", "mostre o arquivo", "muéstrame"
- locate: "where is X", "onde está", "dónde está"
- list: "list my files", "liste meus arquivos", "lista mis archivos"
- filter: "only PDFs", "apenas planilhas", "solo documentos Word"
- sort: "newest first", "maior tamanho", "más reciente"
- group: "by folder", "por pasta", "por carpeta"
- topic_search: "files about contracts", "arquivos sobre marketing"
- disambiguate: patterns that indicate user is choosing between options
- count: "how many files", "quantos documentos", "cuántos archivos"

OUTPUT FORMAT (JSON):
{
  "bank": "file_actions_subintents",
  "version": "1.0.0",
  "generated": "2026-01-17",
  "patterns": [
    {
      "id": "fa_open_001",
      "subintent": "open",
      "lang": "en",
      "pattern": "\\\\bopen\\\\s+(the\\\\s+)?file\\\\s+",
      "examples": ["open the file contract.pdf", "open file report"],
      "weight": 1.0
    },
    ...
  ]
}

REQUIREMENTS:
1. Each pattern must have unique ID format: fa_{subintent}_{lang}_{number}
2. Use proper regex escaping (double backslashes for JSON)
3. Include 3-5 example queries per pattern
4. Weight from 0.5 (weak signal) to 1.5 (strong signal)
5. Cover formal, informal, and colloquial variations
6. Include typo-tolerant patterns where appropriate
7. PT patterns should include Brazilian Portuguese variations
8. ES patterns should include Latin American Spanish variations

Generate the complete JSON file with all ~1400 patterns.`
  },
  {
    type: 'triggers',
    name: 'primary_intents',
    targetCount: 1200,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/primary_intents.json',
    prompt: `Generate a comprehensive JSON file of PRIMARY intent trigger patterns for a document management AI assistant.

TARGET: ~1200 patterns total (~400 per language: EN, PT, ES)

INTENTS to cover:
- documents: queries about document content (summarize, explain, extract, analyze)
- file_actions: file management (open, find, list, filter, sort)
- help: questions about the assistant itself
- edit: rewrite/expand/shorten/translate requests
- conversation: greetings, thanks, casual chat
- reasoning: step-by-step, explain why, implications
- excel: spreadsheet operations (sheets, formulas, pivots)
- finance: financial analysis (EBITDA, margins, trends)
- legal: legal document analysis (clauses, terms, liability)
- accounting: accounting analysis (GL, trial balance, reconciliation)
- medical: medical document analysis (symptoms, labs, vitals)
- doc_stats: document statistics (word count, pages)

OUTPUT FORMAT (JSON):
{
  "bank": "primary_intents",
  "version": "1.0.0",
  "generated": "2026-01-17",
  "patterns": [
    {
      "id": "pi_documents_en_001",
      "intent": "documents",
      "lang": "en",
      "pattern": "\\\\b(summarize|explain|analyze)\\\\s+(the|this|my)\\\\s+",
      "examples": ["summarize the document", "explain this report"],
      "weight": 1.2,
      "priority": 70
    },
    ...
  ]
}

REQUIREMENTS:
1. Each pattern must have unique ID format: pi_{intent}_{lang}_{number}
2. Include priority field (documents: 70, file_actions: 95, help: 60, etc.)
3. Cover formal, informal, and colloquial variations
4. Include question patterns and imperative patterns
5. PT/ES patterns should feel native, not translated

Generate the complete JSON file with all ~1200 patterns.`
  },
  {
    type: 'triggers',
    name: 'documents_subintents',
    targetCount: 1600,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/documents_subintents.json',
    prompt: `Generate a comprehensive JSON file of DOCUMENTS subintent trigger patterns.

TARGET: ~1600 patterns total (~533 per language: EN, PT, ES)

SUBINTENTS to cover:
- factual: "what is X", "who wrote", "when was"
- summary: "summarize", "give overview", "main points"
- compare: "compare X and Y", "difference between"
- extract: "extract the", "pull out", "list all"
- search: "find mentions of", "where does it say"
- analytics: "calculate", "total", "average", "trend"
- explain: "explain", "clarify", "what does X mean"
- locate_in_doc: "where in the document", "which section"

OUTPUT FORMAT (JSON):
{
  "bank": "documents_subintents",
  "version": "1.0.0",
  "patterns": [
    {
      "id": "ds_factual_en_001",
      "subintent": "factual",
      "lang": "en",
      "pattern": "\\\\b(what|who|when|where)\\\\s+(is|are|was|were)\\\\b",
      "examples": ["what is the revenue", "who signed the contract"],
      "weight": 1.0
    },
    ...
  ]
}

Generate the complete JSON file with all ~1600 patterns.`
  },
  {
    type: 'triggers',
    name: 'excel_subintents',
    targetCount: 800,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/excel_subintents.json',
    prompt: `Generate a comprehensive JSON file of EXCEL/SPREADSHEET subintent trigger patterns.

TARGET: ~800 patterns total (~267 per language: EN, PT, ES)

SUBINTENTS:
- sheets: "which sheets", "list tabs", "sheet names"
- columns: "column A", "columns B through F", "header row"
- formulas: "formula in", "calculate", "sum of"
- totals: "total", "sum", "grand total"
- pivots: "pivot table", "pivot by", "group by"
- charts: "chart", "graph", "visualization"
- filters: "filter by", "only rows where", "exclude"
- ranges: "cells A1 to B10", "range", "selection"

Include patterns specific to Excel terminology in each language.
PT: "planilha", "célula", "linha", "coluna"
ES: "hoja de cálculo", "celda", "fila", "columna"

Generate the complete JSON file with all ~800 patterns.`
  },
  {
    type: 'triggers',
    name: 'finance_subintents',
    targetCount: 900,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/finance_subintents.json',
    prompt: `Generate a comprehensive JSON file of FINANCE subintent trigger patterns.

TARGET: ~900 patterns total (~300 per language: EN, PT, ES)

SUBINTENTS:
- ebitda: "EBITDA", "earnings before", "operating profit"
- net_income: "net income", "bottom line", "lucro líquido"
- revenue: "revenue", "sales", "top line", "receita"
- trends: "trend", "growth", "increase", "decrease"
- outliers: "outlier", "anomaly", "unusual", "spike"
- ratios: "ratio", "margin", "percentage", "proportion"
- margins: "gross margin", "operating margin", "profit margin"
- cashflow: "cash flow", "FCF", "operating cash"

Include finance jargon variations:
- EN: "burn rate", "runway", "ARR", "MRR"
- PT: "fluxo de caixa", "margem bruta", "receita operacional"
- ES: "flujo de caja", "margen bruto", "ingresos operativos"

Generate the complete JSON file with all ~900 patterns.`
  },
  {
    type: 'triggers',
    name: 'legal_subintents',
    targetCount: 900,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/legal_subintents.json',
    prompt: `Generate a comprehensive JSON file of LEGAL subintent trigger patterns.

TARGET: ~900 patterns total (~300 per language: EN, PT, ES)

SUBINTENTS:
- clauses: "clause", "section", "article", "provision"
- penalties: "penalty", "fine", "damages", "multa"
- termination: "termination", "cancellation", "rescisão"
- liability: "liability", "responsible", "responsabilidade"
- indemnification: "indemnify", "hold harmless", "indenização"
- warranties: "warranty", "guarantee", "garantia"
- confidentiality: "confidential", "NDA", "sigilo"
- jurisdiction: "jurisdiction", "governing law", "foro"

Include legal terminology specific to each language's legal system.

Generate the complete JSON file with all ~900 patterns.`
  },
  {
    type: 'triggers',
    name: 'accounting_subintents',
    targetCount: 800,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/accounting_subintents.json',
    prompt: `Generate a comprehensive JSON file of ACCOUNTING subintent trigger patterns.

TARGET: ~800 patterns total (~267 per language: EN, PT, ES)

SUBINTENTS:
- general_ledger: "GL", "general ledger", "razão geral"
- trial_balance: "trial balance", "balancete", "balance de comprobación"
- reconciliation: "reconcile", "reconciliation", "conciliação"
- journal_entries: "journal entry", "lançamento", "asiento contable"
- accounts_payable: "AP", "payables", "contas a pagar"
- accounts_receivable: "AR", "receivables", "contas a receber"
- depreciation: "depreciation", "amortization", "depreciação"

Include standard accounting terminology (GAAP, IFRS).

Generate the complete JSON file with all ~800 patterns.`
  },
  {
    type: 'triggers',
    name: 'medical_subintents',
    targetCount: 1200,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/medical_subintents.json',
    prompt: `Generate a comprehensive JSON file of MEDICAL subintent trigger patterns.

TARGET: ~1200 patterns total (~400 per language: EN, PT, ES)

SUBINTENTS:
- symptoms: "symptoms", "presents with", "complaints", "sintomas"
- labs: "lab results", "blood work", "exames", "análisis"
- vitals: "vitals", "blood pressure", "heart rate", "sinais vitais"
- medications: "medications", "prescribed", "dosage", "medicamentos"
- diagnoses: "diagnosis", "diagnosed with", "diagnóstico"
- procedures: "procedure", "surgery", "treatment", "procedimento"
- allergies: "allergies", "allergic to", "alergias"
- history: "medical history", "past history", "histórico"

Include common medical abbreviations and terminology.

Generate the complete JSON file with all ~1200 patterns.`
  },
  {
    type: 'triggers',
    name: 'decision_families',
    targetCount: 500,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/decision_families.json',
    prompt: `Generate a comprehensive JSON file of DECISION FAMILY trigger patterns.

TARGET: ~500 patterns total (~167 per language: EN, PT, ES)

FAMILIES:
- content_analysis: queries that need to read document content
- file_management: queries about files/folders without reading content
- domain_specific: queries requiring specialized domain knowledge
- meta_operations: queries about the assistant or system itself

These patterns help route to the right intent family before specific intent.

Generate the complete JSON file with all ~500 patterns.`
  },
  {
    type: 'triggers',
    name: 'help_subintents',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/help_subintents.json',
    prompt: `Generate JSON file of HELP subintent trigger patterns (~250 total).

SUBINTENTS: capabilities, how_to, troubleshoot, examples

Include patterns like:
- "what can you do", "o que você pode fazer"
- "how do I", "como faço para"
- "not working", "não está funcionando"
- "show me an example", "mostre um exemplo"

Generate the complete JSON file.`
  },
  {
    type: 'triggers',
    name: 'edit_subintents',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/edit_subintents.json',
    prompt: `Generate JSON file of EDIT subintent trigger patterns (~250 total).

SUBINTENTS: rewrite, expand, shorten, translate, format

Include patterns like:
- "rewrite this", "reescreva isso"
- "make it longer", "expanda"
- "make it shorter", "resuma"
- "translate to", "traduza para"
- "format as", "formate como"

Generate the complete JSON file.`
  },
  {
    type: 'triggers',
    name: 'reasoning_subintents',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/reasoning_subintents.json',
    prompt: `Generate JSON file of REASONING subintent trigger patterns (~250 total).

SUBINTENTS: explain_why, step_by_step, pros_cons, implications

Include patterns like:
- "explain why", "explique por que"
- "step by step", "passo a passo"
- "pros and cons", "prós e contras"
- "what are the implications", "quais as implicações"

Generate the complete JSON file.`
  },
  {
    type: 'triggers',
    name: 'doc_stats_subintents',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'triggers/doc_stats_subintents.json',
    prompt: `Generate JSON file of DOC_STATS subintent trigger patterns (~250 total).

SUBINTENTS: word_count, page_count, section_count, metadata

Include patterns like:
- "how many words", "quantas palavras"
- "how many pages", "quantas páginas"
- "how many sections", "quantas seções"
- "when was it created", "quando foi criado"

Generate the complete JSON file.`
  },

  // === NEGATIVES ===
  {
    type: 'negatives',
    name: 'not_file_actions',
    targetCount: 600,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_file_actions.json',
    prompt: `Generate JSON file of NOT_FILE_ACTIONS negative patterns (~600 total).

PURPOSE: Block content verbs from hijacking file_actions intent.

When these patterns match, REDUCE file_actions score because the user wants CONTENT analysis, not file management.

PATTERNS to include:
- "summarize the", "explain what", "analyze the" → NOT file_actions
- "what does X say about", "extract from" → NOT file_actions
- Content verbs + document reference → NOT file_actions

FORMAT:
{
  "bank": "not_file_actions",
  "patterns": [
    {
      "id": "nfa_en_001",
      "lang": "en",
      "pattern": "\\\\b(summarize|explain|analyze|extract)\\\\s+(the|this|my)\\\\s+",
      "blocks": "file_actions",
      "penalty": -0.5,
      "reason": "Content verb indicates document analysis, not file management"
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'not_help',
    targetCount: 450,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_help.json',
    prompt: `Generate JSON file of NOT_HELP negative patterns (~450 total).

PURPOSE: Block help intent when query is document-oriented.

PATTERNS:
- "help me understand the contract" → NOT help (it's documents)
- "help summarize" → NOT help (it's documents)
- Document reference + help verb → NOT help

Generate the complete JSON file with penalty values.`
  },
  {
    type: 'negatives',
    name: 'not_conversation',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_conversation.json',
    prompt: `Generate JSON file of NOT_CONVERSATION negative patterns (~250 total).

PURPOSE: Block conversation intent when query has document reference.

PATTERNS:
- "thanks for the summary" + document context → NOT conversation
- Document mention + casual phrase → NOT conversation

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'not_reasoning',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_reasoning.json',
    prompt: `Generate JSON file of NOT_REASONING negative patterns (~250 total).

PURPOSE: Block reasoning intent for simple factual lookups.

PATTERNS:
- "what is the total" → NOT reasoning (it's factual)
- "who signed" → NOT reasoning (it's factual)

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'not_excel_finance',
    targetCount: 300,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_excel_finance.json',
    prompt: `Generate JSON file of NOT_EXCEL_FINANCE negative patterns (~300 total).

PURPOSE: Block excel/finance intents when no operators present.

PATTERNS:
- Generic document query without finance terms → NOT finance
- Spreadsheet mention without formula/calculation → NOT excel

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'not_inventory_when_doc_stats',
    targetCount: 200,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_inventory_when_doc_stats.json',
    prompt: `Generate JSON file of NOT_INVENTORY_WHEN_DOC_STATS patterns (~200 total).

PURPOSE: Block file inventory count when asking for document statistics.

PATTERNS:
- "how many pages in this document" → NOT inventory (it's doc_stats)
- "word count" → NOT inventory (it's doc_stats)

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'not_filename_when_locator',
    targetCount: 250,
    languages: ['en', 'pt', 'es'],
    outputFile: 'negatives/not_filename_when_locator.json',
    prompt: `Generate JSON file of NOT_FILENAME_WHEN_LOCATOR patterns (~250 total).

PURPOSE: Block filename search when query is content locator.

PATTERNS:
- "where does it mention X" → NOT filename search (it's content locator)
- "find the section about" → NOT filename search (it's content locator)

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'force_clarify',
    targetCount: 180,
    languages: ['shared'],
    outputFile: 'negatives/force_clarify.json',
    prompt: `Generate JSON file of FORCE_CLARIFY patterns (~180 total, language-agnostic).

PURPOSE: Force clarification when evidence is too low to route confidently.

PATTERNS:
- Single word queries: "revenue", "contract"
- Ambiguous pronouns without context: "it", "that one"
- Vague requests: "help me with this"

Generate the complete JSON file.`
  },
  {
    type: 'negatives',
    name: 'force_disambiguate',
    targetCount: 120,
    languages: ['shared'],
    outputFile: 'negatives/force_disambiguate.json',
    prompt: `Generate JSON file of FORCE_DISAMBIGUATE patterns (~120 total, language-agnostic).

PURPOSE: Force disambiguation when multiple matches are likely.

PATTERNS:
- Generic file references: "the contract", "the report"
- Common document names without specifics

Generate the complete JSON file.`
  },

  // === OVERLAYS ===
  {
    type: 'overlays',
    name: 'followup_inherit',
    targetCount: 600,
    languages: ['en', 'pt', 'es'],
    outputFile: 'overlays/followup_inherit.json',
    prompt: `Generate JSON file of FOLLOWUP_INHERIT overlay patterns (~600 total).

PURPOSE: Detect pronouns/references that should inherit context from previous turn.

PATTERNS:
- "it", "that", "this", "them" (EN)
- "ele", "ela", "isso", "deles", "delas" (PT)
- "él", "ella", "eso", "ellos" (ES)

FORMAT:
{
  "bank": "followup_inherit",
  "patterns": [
    {
      "id": "fi_en_001",
      "lang": "en",
      "pattern": "\\\\b(it|that|this|them)\\\\b",
      "inherit_context": true,
      "priority": "previous_turn"
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'overlays',
    name: 'followup_file_actions',
    targetCount: 350,
    languages: ['en', 'pt', 'es'],
    outputFile: 'overlays/followup_file_actions.json',
    prompt: `Generate JSON file of FOLLOWUP_FILE_ACTIONS overlay patterns (~350 total).

PURPOSE: Detect file action follow-ups like "open it", "show again".

PATTERNS:
- "open it", "show it again", "where is it"
- "abre ele", "mostra de novo", "onde está"
- "ábrelo", "muéstralo otra vez"

Generate the complete JSON file.`
  },
  {
    type: 'overlays',
    name: 'format_request',
    targetCount: 900,
    languages: ['en', 'pt', 'es'],
    outputFile: 'overlays/format_request.json',
    prompt: `Generate JSON file of FORMAT_REQUEST overlay patterns (~900 total).

PURPOSE: Detect formatting constraints in user requests.

PATTERNS:
- "in exactly 5 bullets", "em exatamente 5 pontos"
- "as a table", "como tabela"
- "in 2 sentences", "em 2 frases"
- "numbered list", "lista numerada"
- "maximum 100 words", "máximo 100 palavras"

FORMAT:
{
  "bank": "format_request",
  "patterns": [
    {
      "id": "fr_en_001",
      "lang": "en",
      "pattern": "\\\\b(exactly|precisely)\\\\s+(\\\\d+)\\\\s+(bullet|point|item)s?\\\\b",
      "constraint": {
        "type": "exact_bullets",
        "capture_group": 2
      }
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'overlays',
    name: 'clarify_required',
    targetCount: 400,
    languages: ['en', 'pt', 'es'],
    outputFile: 'overlays/clarify_required.json',
    prompt: `Generate JSON file of CLARIFY_REQUIRED overlay patterns (~400 total).

PURPOSE: Detect ambiguous requests that require clarification.

PATTERNS:
- Vague references without context
- Requests with multiple possible interpretations
- Missing required parameters

Generate the complete JSON file.`
  },
  {
    type: 'overlays',
    name: 'drift_detectors',
    targetCount: 450,
    languages: ['shared'],
    outputFile: 'overlays/drift_detectors.json',
    prompt: `Generate JSON file of DRIFT_DETECTORS overlay patterns (~450 total, language-agnostic).

PURPOSE: Detect hallucination patterns for quality gate.

PATTERNS:
- Phrases indicating made-up information
- Generic filler without specifics
- Contradictory statements
- Claims without source reference

FORMAT:
{
  "bank": "drift_detectors",
  "patterns": [
    {
      "id": "dd_001",
      "pattern": "\\\\b(I think|probably|might be|possibly)\\\\b",
      "severity": "warning",
      "action": "flag_for_review"
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'overlays',
    name: 'scope_rules',
    targetCount: 320,
    languages: ['shared'],
    outputFile: 'overlays/scope_rules.json',
    prompt: `Generate JSON file of SCOPE_RULES overlay patterns (~320 total).

PURPOSE: Determine single-doc vs multi-doc scope.

PATTERNS:
- "this document" → single-doc
- "all my documents" → multi-doc
- "compare X and Y" → multi-doc
- "the contract" → single-doc (with context)

Generate the complete JSON file.`
  },

  // === FORMATTING ===
  {
    type: 'formatting',
    name: 'constraints',
    targetCount: 900,
    languages: ['en', 'pt', 'es'],
    outputFile: 'formatting/constraints.json',
    prompt: `Generate JSON file of FORMAT_CONSTRAINTS patterns (~900 total).

PURPOSE: Parse formatting requirements from user requests.

PATTERNS:
- Bullet counts: "5 bullets", "5 pontos", "5 viñetas"
- Paragraph counts: "2 paragraphs", "2 parágrafos"
- Sentence limits: "in one sentence", "em uma frase"
- Word limits: "under 100 words", "menos de 100 palavras"
- Table requests: "as a table", "em formato de tabela"
- Numbered lists: "numbered list", "lista numerada"

FORMAT:
{
  "bank": "constraints",
  "patterns": [
    {
      "id": "fc_bullets_en_001",
      "lang": "en",
      "pattern": "(exactly\\\\s+)?(\\\\d+)\\\\s+(bullet|point)s?",
      "constraint_type": "exact_bullets",
      "value_group": 2
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'formatting',
    name: 'validators',
    targetCount: 90,
    languages: ['shared'],
    outputFile: 'formatting/validators.json',
    prompt: `Generate JSON file of FORMAT_VALIDATORS (~90 total).

PURPOSE: Validate output meets constraints.

VALIDATORS:
- bullet_count: Count bullet points in output
- paragraph_count: Count paragraphs
- sentence_count: Count sentences
- word_count: Count words
- table_validity: Check table has headers and rows
- numbered_list_validity: Check sequential numbering

FORMAT:
{
  "bank": "validators",
  "validators": [
    {
      "id": "v_bullet_count",
      "type": "bullet_count",
      "regex": "^\\\\s*[-•*]\\\\s+",
      "multiline": true
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'formatting',
    name: 'repair_rules',
    targetCount: 120,
    languages: ['shared'],
    outputFile: 'formatting/repair_rules.json',
    prompt: `Generate JSON file of REPAIR_RULES (~120 total).

PURPOSE: Fix near-miss outputs.

RULES:
- Add missing bullet if content looks like list item
- Convert dashes to bullets
- Split run-on paragraphs
- Fix bullet formatting inconsistencies
- Add missing table headers

Generate the complete JSON file.`
  },
  {
    type: 'formatting',
    name: 'readability_rules',
    targetCount: 90,
    languages: ['shared'],
    outputFile: 'formatting/readability_rules.json',
    prompt: `Generate JSON file of READABILITY_RULES (~90 total).

PURPOSE: Ensure outputs are readable, not walls of text.

RULES:
- Max paragraph length
- Require line breaks between sections
- Max bullet point length
- Sentence complexity limits

Generate the complete JSON file.`
  },

  // === NORMALIZERS ===
  {
    type: 'normalizers',
    name: 'language_indicators',
    targetCount: 800,
    languages: ['shared'],
    outputFile: 'normalizers/language_indicators.json',
    prompt: `Generate JSON file of LANGUAGE_INDICATORS (~800 total).

PURPOSE: Detect query language (EN/PT/ES) with confidence weights.

INDICATORS:
- Unique words per language
- Common patterns per language
- Diacritics and special characters
- Stop words
- Question patterns

FORMAT:
{
  "bank": "language_indicators",
  "indicators": [
    {
      "id": "li_pt_001",
      "lang": "pt",
      "pattern": "\\\\b(você|qual|como|onde|quando)\\\\b",
      "weight": 0.8
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'filename',
    targetCount: 500,
    languages: ['shared'],
    outputFile: 'normalizers/filename.json',
    prompt: `Generate JSON file of FILENAME normalizers (~500 total).

PURPOSE: Normalize filename references in queries.

RULES:
- Strip file extensions for matching
- Handle spaces vs underscores
- Handle case variations
- Handle partial matches
- Handle quoted vs unquoted filenames

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'filetypes',
    targetCount: 200,
    languages: ['shared'],
    outputFile: 'normalizers/filetypes.json',
    prompt: `Generate JSON file of FILETYPE normalizers (~200 total).

PURPOSE: Map filetype aliases to canonical types.

MAPPINGS:
- "PDF", "pdf file", "PDF document" → application/pdf
- "Word doc", "docx", "Word document" → application/vnd.openxmlformats...
- "Excel", "spreadsheet", "XLSX" → application/vnd.openxmlformats...
- "PowerPoint", "presentation", "PPTX" → application/vnd.openxmlformats...
- "image", "picture", "photo" → image/*
- "text file", "txt" → text/plain

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'months',
    targetCount: 700,
    languages: ['shared'],
    outputFile: 'normalizers/months.json',
    prompt: `Generate JSON file of MONTH normalizers (~700 total).

PURPOSE: Normalize month references across languages.

MAPPINGS for each month (1-12):
- Full names: January, Janeiro, Enero
- Abbreviations: Jan, Jan, Ene
- Numbers: 01, 1
- Ordinals: 1st month, primeiro mês

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'quarters',
    targetCount: 350,
    languages: ['shared'],
    outputFile: 'normalizers/quarters.json',
    prompt: `Generate JSON file of QUARTER normalizers (~350 total).

PURPOSE: Normalize quarter references.

MAPPINGS:
- Q1, 1Q, first quarter, primeiro trimestre, primer trimestre
- Q2, 2Q, second quarter, segundo trimestre
- Q3, 3Q, third quarter, terceiro trimestre, tercer trimestre
- Q4, 4Q, fourth quarter, quarto trimestre, cuarto trimestre
- 1T, 2T, 3T, 4T (Portuguese/Spanish)

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'time_windows',
    targetCount: 300,
    languages: ['en', 'pt', 'es'],
    outputFile: 'normalizers/time_windows.json',
    prompt: `Generate JSON file of TIME_WINDOW normalizers (~300 total).

PURPOSE: Normalize time expressions.

MAPPINGS:
- "last 24 hours", "últimas 24 horas" → {unit: "hours", value: 24}
- "this week", "esta semana" → {unit: "week", relative: "current"}
- "last month", "mês passado" → {unit: "month", relative: "previous"}
- "this year", "este ano" → {unit: "year", relative: "current"}
- "yesterday", "ontem", "ayer"
- "today", "hoje", "hoy"

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'numbers_currency',
    targetCount: 600,
    languages: ['shared'],
    outputFile: 'normalizers/numbers_currency.json',
    prompt: `Generate JSON file of NUMBER/CURRENCY normalizers (~600 total).

PURPOSE: Normalize number and currency formats.

RULES:
- "1,000.00" vs "1.000,00" (US vs BR/EU)
- "$100", "R$100", "€100"
- "100K", "100M", "100B"
- "milhão", "million", "millón"
- Percentage formats

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'typos',
    targetCount: 500,
    languages: ['shared'],
    outputFile: 'normalizers/typos.json',
    prompt: `Generate JSON file of TYPO corrections (~500 total).

PURPOSE: Correct common typos in queries.

CORRECTIONS:
- "sumamrize" → "summarize"
- "documnet" → "document"
- "spredsheet" → "spreadsheet"
- Common keyboard proximity errors
- Common letter transpositions

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'diacritics_pt',
    targetCount: 250,
    languages: ['pt'],
    outputFile: 'normalizers/diacritics_pt.json',
    prompt: `Generate JSON file of PORTUGUESE DIACRITICS normalizers (~250 total).

PURPOSE: Handle diacritic variations in Portuguese.

RULES:
- "resumo" = "résumé" (when typed without accents)
- "analise" = "análise"
- "relatorio" = "relatório"
- Handle ã, õ, ç, é, ê, á, à, ú, etc.

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'diacritics_es',
    targetCount: 250,
    languages: ['es'],
    outputFile: 'normalizers/diacritics_es.json',
    prompt: `Generate JSON file of SPANISH DIACRITICS normalizers (~250 total).

PURPOSE: Handle diacritic variations in Spanish.

RULES:
- "analisis" = "análisis"
- "numero" = "número"
- Handle ñ, á, é, í, ó, ú, ü

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'abbreviations_finance',
    targetCount: 200,
    languages: ['shared'],
    outputFile: 'normalizers/abbreviations_finance.json',
    prompt: `Generate JSON file of FINANCE ABBREVIATIONS (~200 total).

ABBREVIATIONS:
- EBITDA → Earnings Before Interest, Taxes, Depreciation, and Amortization
- ROI → Return on Investment
- P&L → Profit and Loss
- YoY → Year over Year
- MoM → Month over Month
- QoQ → Quarter over Quarter
- ARR → Annual Recurring Revenue
- MRR → Monthly Recurring Revenue
- FCF → Free Cash Flow
- COGS → Cost of Goods Sold

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'abbreviations_legal',
    targetCount: 200,
    languages: ['shared'],
    outputFile: 'normalizers/abbreviations_legal.json',
    prompt: `Generate JSON file of LEGAL ABBREVIATIONS (~200 total).

ABBREVIATIONS:
- NDA → Non-Disclosure Agreement
- SLA → Service Level Agreement
- MSA → Master Service Agreement
- LOI → Letter of Intent
- MOU → Memorandum of Understanding
- IP → Intellectual Property
- TOS → Terms of Service
- GDPR, LGPD, CCPA (privacy laws)

Generate the complete JSON file.`
  },
  {
    type: 'normalizers',
    name: 'abbreviations_medical',
    targetCount: 250,
    languages: ['shared'],
    outputFile: 'normalizers/abbreviations_medical.json',
    prompt: `Generate JSON file of MEDICAL ABBREVIATIONS (~250 total).

ABBREVIATIONS:
- BP → Blood Pressure
- HR → Heart Rate
- CBC → Complete Blood Count
- BMI → Body Mass Index
- MRI → Magnetic Resonance Imaging
- CT → Computed Tomography
- ECG/EKG → Electrocardiogram
- Rx → Prescription
- Dx → Diagnosis
- Hx → History

Generate the complete JSON file.`
  },

  // === LEXICONS ===
  {
    type: 'lexicons',
    name: 'finance',
    targetCount: 2500,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/finance.json',
    prompt: `Generate JSON file of FINANCE lexicon (~2500 terms per language).

PURPOSE: Canonical finance terms with synonyms.

CATEGORIES:
- Income statement terms
- Balance sheet terms
- Cash flow terms
- Ratios and metrics
- Investment terms
- Banking terms
- Tax terms

FORMAT:
{
  "bank": "finance",
  "terms": [
    {
      "id": "fin_revenue",
      "canonical": {
        "en": "revenue",
        "pt": "receita",
        "es": "ingresos"
      },
      "synonyms": {
        "en": ["sales", "top line", "income"],
        "pt": ["faturamento", "vendas"],
        "es": ["ventas", "facturación"]
      },
      "category": "income_statement"
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'accounting',
    targetCount: 2000,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/accounting.json',
    prompt: `Generate JSON file of ACCOUNTING lexicon (~2000 terms per language).

CATEGORIES:
- General ledger terms
- Journal entry terms
- Reconciliation terms
- Asset/liability terms
- Equity terms
- Auditing terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'legal',
    targetCount: 3000,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/legal.json',
    prompt: `Generate JSON file of LEGAL lexicon (~3000 terms per language).

CATEGORIES:
- Contract terms
- Corporate law terms
- Intellectual property terms
- Employment law terms
- Litigation terms
- Regulatory terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'medical',
    targetCount: 6000,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/medical.json',
    prompt: `Generate JSON file of MEDICAL lexicon (~6000 terms per language).

CATEGORIES:
- Anatomy terms
- Symptom terms
- Diagnosis terms
- Medication terms
- Procedure terms
- Lab test terms
- Vital sign terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'excel',
    targetCount: 1500,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/excel.json',
    prompt: `Generate JSON file of EXCEL/SPREADSHEET lexicon (~1500 terms per language).

CATEGORIES:
- Cell/range terms
- Formula terms
- Function names (SUM, VLOOKUP, etc.)
- Chart types
- Data manipulation terms
- Formatting terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'project_agile',
    targetCount: 800,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/project_agile.json',
    prompt: `Generate JSON file of PROJECT/AGILE lexicon (~800 terms per language).

CATEGORIES:
- Scrum terms (sprint, backlog, story)
- Kanban terms
- Project management terms
- Team role terms
- Ceremony terms
- Metric terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'marketing_service_quality',
    targetCount: 1000,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/marketing_service_quality.json',
    prompt: `Generate JSON file of MARKETING/SERVICE QUALITY lexicon (~1000 terms per language).

CATEGORIES:
- Marketing metrics (CAC, LTV, etc.)
- Campaign terms
- Service quality terms
- Customer satisfaction terms
- Brand terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'analytics_telemetry',
    targetCount: 800,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/analytics_telemetry.json',
    prompt: `Generate JSON file of ANALYTICS/TELEMETRY lexicon (~800 terms per language).

CATEGORIES:
- Data analysis terms
- Metrics and KPIs
- Dashboard terms
- Reporting terms
- Visualization terms

Generate the complete JSON file.`
  },
  {
    type: 'lexicons',
    name: 'ui_navigation',
    targetCount: 500,
    languages: ['en', 'pt', 'es'],
    outputFile: 'lexicons/ui_navigation.json',
    prompt: `Generate JSON file of UI/NAVIGATION lexicon (~500 terms per language).

CATEGORIES:
- Button/action terms
- Navigation terms
- Menu terms
- Modal/dialog terms
- Form element terms

Generate the complete JSON file.`
  },

  // === TEMPLATES ===
  {
    type: 'templates',
    name: 'answer_styles',
    targetCount: 600,
    languages: ['en', 'pt', 'es'],
    outputFile: 'templates/answer_styles.json',
    prompt: `Generate JSON file of ANSWER_STYLES templates (~600 total, 200 per language).

STYLES:
- definition: "X is..."
- summary: "The document covers..."
- extraction: "The key points are..."
- comparison: "X differs from Y in..."
- explanation: "This means..."
- list: "Here are the items..."

FORMAT:
{
  "bank": "answer_styles",
  "templates": [
    {
      "id": "as_definition_en_001",
      "style": "definition",
      "lang": "en",
      "template": "{term} is {definition}.",
      "variants": [
        "{term} refers to {definition}.",
        "{term} can be defined as {definition}."
      ]
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'templates',
    name: 'file_actions_microcopy',
    targetCount: 180,
    languages: ['en', 'pt', 'es'],
    outputFile: 'templates/file_actions_microcopy.json',
    prompt: `Generate JSON file of FILE_ACTIONS_MICROCOPY templates (~180 total, 60 per language).

PURPOSE: Minimal, ChatGPT-like responses for file actions.

OPERATORS:
- count: "You have {count} documents."
- list: "Here are your files:" (then buttons)
- filter: "Showing {count} {type} files:" (then buttons)
- locate: (button only, no text)
- open: (button only, no text)
- not_found: "I couldn't find a file matching '{query}'."
- disambiguate: "Which one did you mean?"

FORMAT:
{
  "bank": "file_actions_microcopy",
  "templates": [
    {
      "id": "fam_count_en_001",
      "operator": "count",
      "lang": "en",
      "template": "You have {count} documents.",
      "variants": [
        "There are {count} files in your library.",
        "{count} documents total."
      ]
    }
  ]
}

Generate the complete JSON file.`
  },
  {
    type: 'templates',
    name: 'clarify_templates',
    targetCount: 200,
    languages: ['en', 'pt', 'es'],
    outputFile: 'templates/clarify_templates.json',
    prompt: `Generate JSON file of CLARIFY_TEMPLATES (~200 total).

PURPOSE: Ask for clarification politely.

SCENARIOS:
- Ambiguous file reference
- Missing required information
- Multiple possible interpretations
- Need more context

Generate the complete JSON file.`
  },
  {
    type: 'templates',
    name: 'error_templates',
    targetCount: 200,
    languages: ['en', 'pt', 'es'],
    outputFile: 'templates/error_templates.json',
    prompt: `Generate JSON file of ERROR_TEMPLATES (~200 total).

PURPOSE: Friendly error messages.

SCENARIOS:
- File not found
- No documents match
- Processing error
- Rate limit
- Timeout

Generate the complete JSON file.`
  }
];

// ============================================================================
// GENERATION LOGIC
// ============================================================================

async function generateBank(spec: BankSpec): Promise<void> {
  const outputPath = path.join(DATA_BANKS_DIR, spec.outputFile);
  const outputDir = path.dirname(outputPath);

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`\n[${spec.type}/${spec.name}] Generating ~${spec.targetCount} patterns...`);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 64000,
      messages: [
        {
          role: 'user',
          content: spec.prompt + '\n\nIMPORTANT: Return ONLY valid JSON, no markdown code blocks, no explanations. Start with { and end with }.'
        }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse and validate JSON
    let jsonContent = content.text.trim();

    // Remove markdown code blocks if present
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonContent);

    // Write to file
    fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2));

    // Count patterns
    const count = parsed.patterns?.length || parsed.indicators?.length || parsed.validators?.length ||
                  parsed.terms?.length || parsed.templates?.length || parsed.rules?.length || 0;

    console.log(`  ✓ Generated ${count} entries → ${spec.outputFile}`);
  } catch (error) {
    console.error(`  ✗ Error generating ${spec.name}:`, error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const bankType = args[0];
  const bankName = args[1];

  console.log('=== Koda Data Bank Generator ===');
  console.log(`Output: ${DATA_BANKS_DIR}`);

  let specsToGenerate: BankSpec[];

  if (bankType === 'all') {
    specsToGenerate = BANK_SPECS;
  } else if (bankType && bankName) {
    specsToGenerate = BANK_SPECS.filter(s => s.type === bankType && s.name === bankName);
    if (specsToGenerate.length === 0) {
      console.error(`Bank not found: ${bankType}/${bankName}`);
      process.exit(1);
    }
  } else if (bankType) {
    specsToGenerate = BANK_SPECS.filter(s => s.type === bankType);
  } else {
    console.log('\nUsage:');
    console.log('  npx ts-node generate_banks.ts all                    # Generate all banks');
    console.log('  npx ts-node generate_banks.ts triggers               # Generate all triggers');
    console.log('  npx ts-node generate_banks.ts triggers file_actions  # Generate specific bank');
    console.log('\nAvailable banks:');
    const byType = BANK_SPECS.reduce((acc, s) => {
      acc[s.type] = acc[s.type] || [];
      acc[s.type].push(s.name);
      return acc;
    }, {} as Record<string, string[]>);
    for (const [type, names] of Object.entries(byType)) {
      console.log(`  ${type}: ${names.join(', ')}`);
    }
    process.exit(0);
  }

  console.log(`\nGenerating ${specsToGenerate.length} banks...`);

  for (const spec of specsToGenerate) {
    await generateBank(spec);
    // Rate limiting - wait 1 second between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== Generation Complete ===');
}

main().catch(console.error);
