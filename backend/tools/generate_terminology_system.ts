#!/usr/bin/env npx ts-node
/**
 * Terminology System Generator - Creates all ChatGPT-like terminology banks
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic();
const DATA_BANKS_DIR = path.join(__dirname, "../src/data_banks");

interface Task {
  name: string;
  path: string;
  prompt: string;
}

function extractJSON(text: string): string {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*\n?/, "");
  if (s.endsWith("```")) s = s.replace(/\n?```\s*$/, "");
  s = s.trim();
  if (!s.startsWith("{")) {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) s = s.substring(start, end + 1);
  }
  JSON.parse(s); // validate
  return s;
}

async function generate(task: Task): Promise<void> {
  console.log(`\n📝 ${task.name}...`);
  const resp = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [{ role: "user", content: task.prompt }],
  });
  const content = resp.content[0];
  if (content.type !== "text") throw new Error("Bad response");
  const json = extractJSON(content.text);
  const fullPath = path.join(DATA_BANKS_DIR, task.path);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, json);
  console.log(`✅ ${task.name} -> ${task.path}`);
}

const TASKS: Task[] = [
  // BATCH 1: Terminology Policies
  {
    name: "Global Terminology Policy",
    path: "formatting/terminology_policy.any.json",
    prompt: `Generate a comprehensive global terminology policy JSON for a RAG assistant that should sound like ChatGPT.

Output this exact structure with real, comprehensive content:
{
  "_meta": {
    "bank": "terminology_policy",
    "version": "1.0.0",
    "description": "Global terminology rules for ChatGPT-like output",
    "appliesToLanguages": ["en", "pt"],
    "defaultRegister": "neutral"
  },
  "registers": {
    "neutral": { "description": "Default ChatGPT voice: concise, natural, avoids jargon unless document uses it" },
    "chat": { "description": "More conversational, still precise, no report headings" },
    "professional": { "description": "More formal, structured, still short" }
  },
  "banned_openers": [
    // 30+ regex patterns for EN and PT that should never start answers
    // Examples: "^here\\\\s+(is|are)", "^i\\\\s+found", "^aqui\\\\s+est", "^encontrei"
  ],
  "banned_phrases": [
    // 50+ phrases that break ChatGPT feel in EN and PT
    // Examples: "based on limited information", "i'm just an ai", "posso listar seus arquivos"
  ],
  "preferred_output_style": {
    "answer_first": true,
    "max_sentences_per_paragraph": 4,
    "bullets_for_3plus_points": true,
    "avoid_repeated_section_labels": true,
    "no_meta_commentary": true,
    "mirror_user_formality": true
  },
  "term_selection": {
    "mirror_document_terms_first": true,
    "max_parenthetical_definitions_per_answer": 1,
    "preferred_language_matches_user": true,
    "avoid_synonym_switching": true,
    "define_technical_term_once_only": true
  },
  "domain_defaults": {
    "finance": { "register": "neutral", "precision": "high" },
    "accounting": { "register": "neutral", "precision": "high" },
    "legal": { "register": "professional", "precision": "very_high" },
    "medical": { "register": "professional", "precision": "very_high" },
    "general": { "register": "neutral", "precision": "standard" }
  },
  "output_term_overrides": {
    "en": {
      // 30+ common terms with preferred output form
    },
    "pt": {
      // 30+ common terms with preferred output form
    }
  }
}

Include at least 30 banned_openers, 50 banned_phrases, and 30 output_term_overrides per language.
Output ONLY valid JSON.`
  },
  {
    name: "Finance Terminology Policy",
    path: "formatting/terminology_policy.finance.any.json",
    prompt: `Generate a finance-specific terminology policy JSON.

{
  "_meta": {
    "bank": "terminology_policy_finance",
    "version": "1.0.0",
    "description": "Finance output terminology rules",
    "appliesToLanguages": ["en", "pt"]
  },
  "finance_style_rules": {
    "always_include_period_context": true,
    "use_document_metric_names": true,
    "number_formatting": { "thousands_separator": true, "decimal_places": 2 },
    "currency_display": "symbol_prefix",
    "percentage_display": "with_symbol"
  },
  "preferred_terms": {
    "en": {
      // 50+ finance terms with preferred output form
      // revenue, net_income, ebitda, gross_margin, operating_expenses, etc.
    },
    "pt": {
      // 50+ finance terms with preferred output form
      // receita, lucro_liquido, ebitda, margem_bruta, despesas_operacionais, etc.
    }
  },
  "metric_aliases_output_allowed": {
    // Which aliases can appear in output vs input-only
    "EBITDA": ["EBITDA", "EBITDA Adjusted"],
    "Net Income": ["Net Income", "Profit"],
    // etc.
  },
  "forbidden_phrases": [
    // 20+ phrases to avoid in finance context
  ],
  "document_verb_preferences": {
    "en": ["shows", "reports", "indicates", "totals", "reflects"],
    "pt": ["mostra", "apresenta", "indica", "totaliza", "reflete"]
  }
}

Output ONLY valid JSON with comprehensive content.`
  },
  {
    name: "Legal Terminology Policy",
    path: "formatting/terminology_policy.legal.any.json",
    prompt: `Generate a legal-specific terminology policy JSON.

{
  "_meta": {
    "bank": "terminology_policy_legal",
    "version": "1.0.0",
    "description": "Legal output terminology rules: precision, consistent clause language, avoid advice framing",
    "appliesToLanguages": ["en", "pt"]
  },
  "legal_style_rules": {
    "avoid_legal_advice_tone": true,
    "always_cite_document_location": true,
    "quote_limit_words": 25,
    "use_neutral_framing": true
  },
  "document_verb_preferences": {
    "en": ["states", "provides", "defines", "requires", "stipulates", "establishes"],
    "pt": ["consta", "prevê", "define", "estabelece", "estipula", "dispõe"]
  },
  "preferred_terms": {
    "en": {
      // 60+ legal terms: termination, notice_period, liability, indemnification, force_majeure, breach, etc.
    },
    "pt": {
      // 60+ legal terms: rescisão, prazo_aviso, responsabilidade, indenização, força_maior, inadimplemento, etc.
    }
  },
  "forbidden_phrases": [
    "you should definitely", "i recommend you do", "this is legal advice",
    "você deve com certeza", "isso é aconselhamento jurídico", "recomendo que você"
    // 30+ more
  ],
  "clause_reference_format": {
    "en": "Section {num}, {title}",
    "pt": "Cláusula {num}, {title}"
  }
}

Output ONLY valid JSON with comprehensive content.`
  },
  {
    name: "Accounting Terminology Policy",
    path: "formatting/terminology_policy.accounting.any.json",
    prompt: `Generate an accounting-specific terminology policy JSON.

{
  "_meta": {
    "bank": "terminology_policy_accounting",
    "version": "1.0.0",
    "description": "Accounting output terminology rules",
    "appliesToLanguages": ["en", "pt"]
  },
  "accounting_style_rules": {
    "always_show_debit_credit_context": true,
    "reference_account_codes_when_available": true,
    "use_document_account_names": true,
    "show_journal_entry_format": true
  },
  "preferred_terms": {
    "en": {
      // 60+ accounting terms with preferred forms
      // accounts_receivable, accounts_payable, depreciation, amortization, accrual, etc.
    },
    "pt": {
      // 60+ accounting terms
      // contas_a_receber, contas_a_pagar, depreciação, amortização, provisão, etc.
    }
  },
  "document_verb_preferences": {
    "en": ["records", "debits", "credits", "posts", "recognizes", "accrues"],
    "pt": ["registra", "debita", "credita", "lança", "reconhece", "provisiona"]
  },
  "forbidden_phrases": [
    // 20+ accounting-specific forbidden phrases
  ],
  "standards_reference_format": {
    "en": { "gaap": "US GAAP", "ifrs": "IFRS {num}" },
    "pt": { "cpc": "CPC {num}", "nbc": "NBC T {num}" }
  }
}

Output ONLY valid JSON with comprehensive content.`
  },
  {
    name: "Medical Terminology Policy",
    path: "formatting/terminology_policy.medical.any.json",
    prompt: `Generate a medical-specific terminology policy JSON.

{
  "_meta": {
    "bank": "terminology_policy_medical",
    "version": "1.0.0",
    "description": "Medical output terminology rules: precision, units, disclaimers",
    "appliesToLanguages": ["en", "pt"]
  },
  "medical_style_rules": {
    "always_include_units": true,
    "always_include_frequency": true,
    "never_speculate_on_missing_data": true,
    "include_disclaimer_on_clinical_info": true,
    "preserve_dosage_precision": true
  },
  "preferred_terms": {
    "en": {
      // 80+ medical terms with preferred forms
      // dosage, frequency, diagnosis, prognosis, vital_signs, blood_pressure, etc.
    },
    "pt": {
      // 80+ medical terms
      // dose, frequência, diagnóstico, prognóstico, sinais_vitais, pressão_arterial, etc.
    }
  },
  "document_verb_preferences": {
    "en": ["indicates", "shows", "records", "documents", "notes"],
    "pt": ["indica", "mostra", "registra", "documenta", "aponta"]
  },
  "forbidden_phrases": [
    "you definitely have", "this means you should take", "i diagnose",
    "você definitivamente tem", "isso significa que você deve tomar"
    // 30+ more
  ],
  "unit_formatting": {
    "always_space_before_unit": true,
    "standard_units": ["mg", "mL", "mcg", "IU", "mmHg", "bpm"]
  },
  "disclaimers": {
    "en": "This information is from the document and should be verified with a healthcare provider.",
    "pt": "Esta informação é do documento e deve ser verificada com um profissional de saúde."
  }
}

Output ONLY valid JSON with comprehensive content.`
  },

  // BATCH 2: Output Rules & Blocklist
  {
    name: "Lexicon Output Rules",
    path: "lexicons/lexicon_output_rules.any.json",
    prompt: `Generate lexicon output rules JSON that controls which terms can appear in output vs input-only matching.

{
  "_meta": {
    "bank": "lexicon_output_rules",
    "version": "1.0.0",
    "description": "Controls which lexicon aliases appear in output vs used only for input matching"
  },
  "default": {
    "output_mode": "canonical_only",
    "allow_alias_output": false
  },
  "domain_overrides": {
    "finance": { "output_mode": "canonical_preferred", "allow_alias_output": true },
    "legal": { "output_mode": "canonical_only", "allow_alias_output": false },
    "medical": { "output_mode": "canonical_only", "allow_alias_output": false },
    "accounting": { "output_mode": "canonical_preferred", "allow_alias_output": true }
  },
  "term_rules": [
    // 100+ rules for specific terms across all domains
    // Each rule specifies: domain, canonical, allow_output_aliases[], input_only_aliases[]
    {
      "domain": "finance",
      "canonical": "EBITDA",
      "allow_output_aliases": ["EBITDA", "EBITDA Adjusted", "EBITDA Ajustado"],
      "input_only_aliases": ["earnings before interest taxes depreciation amortization", "lucro antes de juros impostos depreciação amortização"]
    },
    // ... many more for finance, legal, accounting, medical terms
  ],
  "language_specific_rules": {
    "en": {
      "capitalize_acronyms": true,
      "title_case_proper_nouns": true
    },
    "pt": {
      "capitalize_acronyms": true,
      "preserve_accents": true
    }
  }
}

Include at least 100 term_rules covering all four domains. Output ONLY valid JSON.`
  },
  {
    name: "Boilerplate Blocklist",
    path: "formatting/boilerplate_blocklist.any.json",
    prompt: `Generate a comprehensive boilerplate blocklist JSON with all phrases that should never appear in ChatGPT-like output.

{
  "_meta": {
    "bank": "boilerplate_blocklist",
    "version": "1.0.0",
    "description": "Phrases and patterns to strip from output for ChatGPT-like responses"
  },
  "banned_openers": {
    "en": [
      // 40+ regex patterns for English openers to remove
      "^here\\\\s+(is|are|'s)\\\\b",
      "^i\\\\s+found\\\\b",
      "^below\\\\s+(is|are)\\\\b",
      "^the\\\\s+following\\\\b",
      "^as\\\\s+(an\\\\s+)?ai\\\\b",
      "^let\\\\s+me\\\\s+(show|list|explain)\\\\b",
      // etc.
    ],
    "pt": [
      // 40+ regex patterns for Portuguese openers
      "^aqui\\\\s+est[aá]\\\\b",
      "^encontrei\\\\b",
      "^a\\\\s+seguir\\\\b",
      "^como\\\\s+(uma?\\\\s+)?ia\\\\b",
      "^deixe-?me\\\\s+(mostrar|listar|explicar)\\\\b",
      // etc.
    ]
  },
  "banned_phrases": {
    "en": [
      // 80+ exact phrases to remove
      "based on limited information",
      "i'm just an ai",
      "i cannot guarantee",
      "as an ai assistant",
      "i don't have access to",
      // etc.
    ],
    "pt": [
      // 80+ Portuguese phrases
      "com base em informações limitadas",
      "sou apenas uma ia",
      "não posso garantir",
      "como assistente de ia",
      "não tenho acesso a",
      // etc.
    ]
  },
  "banned_closers": {
    "en": [
      // 20+ closing phrases to remove
      "let me know if you need anything else",
      "hope this helps",
      "feel free to ask",
      // etc.
    ],
    "pt": [
      // 20+ Portuguese closers
      "me avise se precisar de mais alguma coisa",
      "espero ter ajudado",
      "fique à vontade para perguntar",
      // etc.
    ]
  },
  "hedging_phrases_to_simplify": {
    "en": {
      "it appears that": "",
      "it seems like": "",
      "based on the document": "",
      "according to": ""
    },
    "pt": {
      "parece que": "",
      "aparentemente": "",
      "com base no documento": "",
      "de acordo com": ""
    }
  },
  "meta_commentary_patterns": [
    // Patterns for self-referential commentary to strip
    "i (will|can|am going to) (now )?",
    "vou (agora )?",
    "let me ",
    "deixe-?me "
  ]
}

Output ONLY valid JSON with comprehensive content.`
  },

  // BATCH 3: Domain Templates
  {
    name: "Finance Templates EN",
    path: "templates/domain_finance.en.json",
    prompt: `Generate finance domain answer templates for English.

{
  "_meta": {
    "bank": "domain_templates_finance",
    "version": "1.0.0",
    "language": "en",
    "domain": "finance"
  },
  "templates": {
    "metric_single": {
      "pattern": "{metric} is {value}{unit} for {period}.",
      "slots": ["metric", "value", "unit", "period"],
      "example": "Revenue is $2.5M for Q3 2024."
    },
    "metric_comparison": {
      "pattern": "{metric} {change_verb} from {old_value} to {new_value} ({change_pct}%) between {period1} and {period2}.",
      "slots": ["metric", "change_verb", "old_value", "new_value", "change_pct", "period1", "period2"]
    },
    "metric_list": {
      "pattern": "Key metrics for {period}:\\n{metrics_list}",
      "slots": ["period", "metrics_list"]
    },
    "ratio_single": {
      "pattern": "The {ratio} is {value} for {period}.",
      "slots": ["ratio", "value", "period"]
    },
    "trend_description": {
      "pattern": "{metric} shows a {trend} trend, moving from {start_value} to {end_value} over {time_span}.",
      "slots": ["metric", "trend", "start_value", "end_value", "time_span"]
    },
    // 30+ more finance-specific templates
  },
  "change_verbs": {
    "increase": ["increased", "grew", "rose", "climbed"],
    "decrease": ["decreased", "fell", "dropped", "declined"],
    "stable": ["remained stable", "stayed flat", "held steady"]
  },
  "period_formats": {
    "quarter": "Q{q} {year}",
    "year": "FY{year}",
    "month": "{month} {year}",
    "ytd": "YTD {year}"
  }
}

Include 30+ comprehensive templates. Output ONLY valid JSON.`
  },
  {
    name: "Finance Templates PT",
    path: "templates/domain_finance.pt.json",
    prompt: `Generate finance domain answer templates for Brazilian Portuguese.

{
  "_meta": {
    "bank": "domain_templates_finance",
    "version": "1.0.0",
    "language": "pt-BR",
    "domain": "finance"
  },
  "templates": {
    "metric_single": {
      "pattern": "{metric} é {value}{unit} para {period}.",
      "slots": ["metric", "value", "unit", "period"],
      "example": "A Receita é R$ 2,5M para o 3T2024."
    },
    "metric_comparison": {
      "pattern": "{metric} {change_verb} de {old_value} para {new_value} ({change_pct}%) entre {period1} e {period2}.",
      "slots": ["metric", "change_verb", "old_value", "new_value", "change_pct", "period1", "period2"]
    },
    "metric_list": {
      "pattern": "Principais métricas para {period}:\\n{metrics_list}",
      "slots": ["period", "metrics_list"]
    },
    // 30+ more templates in PT-BR
  },
  "change_verbs": {
    "increase": ["aumentou", "cresceu", "subiu"],
    "decrease": ["diminuiu", "caiu", "reduziu"],
    "stable": ["manteve-se estável", "permaneceu estável"]
  },
  "period_formats": {
    "quarter": "{q}T{year}",
    "year": "Exercício {year}",
    "month": "{month}/{year}",
    "ytd": "Acumulado {year}"
  }
}

Include 30+ comprehensive templates. Output ONLY valid JSON.`
  },
  {
    name: "Legal Templates EN",
    path: "templates/domain_legal.en.json",
    prompt: `Generate legal domain answer templates for English.

{
  "_meta": {
    "bank": "domain_templates_legal",
    "version": "1.0.0",
    "language": "en",
    "domain": "legal"
  },
  "templates": {
    "clause_reference": {
      "pattern": "{clause_type} is addressed in {location}: \\"{quote}\\"",
      "slots": ["clause_type", "location", "quote"]
    },
    "term_definition": {
      "pattern": "The document defines {term} as: \\"{definition}\\" ({location}).",
      "slots": ["term", "definition", "location"]
    },
    "obligation_statement": {
      "pattern": "{party} {obligation_verb} {action} per {location}.",
      "slots": ["party", "obligation_verb", "action", "location"]
    },
    "deadline_reference": {
      "pattern": "The {deadline_type} is {timeframe} as stated in {location}.",
      "slots": ["deadline_type", "timeframe", "location"]
    },
    "party_list": {
      "pattern": "The parties to this {doc_type} are:\\n{party_list}",
      "slots": ["doc_type", "party_list"]
    },
    // 30+ more legal templates
  },
  "obligation_verbs": ["must", "shall", "is required to", "agrees to", "undertakes to"],
  "location_formats": {
    "section": "Section {num}",
    "article": "Article {num}",
    "clause": "Clause {num}",
    "paragraph": "Paragraph {num}"
  }
}

Include 30+ templates. Output ONLY valid JSON.`
  },
  {
    name: "Legal Templates PT",
    path: "templates/domain_legal.pt.json",
    prompt: `Generate legal domain answer templates for Brazilian Portuguese.

{
  "_meta": {
    "bank": "domain_templates_legal",
    "version": "1.0.0",
    "language": "pt-BR",
    "domain": "legal"
  },
  "templates": {
    "clause_reference": {
      "pattern": "{clause_type} é tratado em {location}: \\"{quote}\\"",
      "slots": ["clause_type", "location", "quote"]
    },
    "term_definition": {
      "pattern": "O documento define {term} como: \\"{definition}\\" ({location}).",
      "slots": ["term", "definition", "location"]
    },
    "obligation_statement": {
      "pattern": "{party} {obligation_verb} {action} conforme {location}.",
      "slots": ["party", "obligation_verb", "action", "location"]
    },
    // 30+ more templates in PT-BR
  },
  "obligation_verbs": ["deve", "deverá", "é obrigado a", "compromete-se a", "obriga-se a"],
  "location_formats": {
    "section": "Seção {num}",
    "article": "Artigo {num}",
    "clause": "Cláusula {num}",
    "paragraph": "Parágrafo {num}"
  }
}

Include 30+ templates. Output ONLY valid JSON.`
  },
  {
    name: "Accounting Templates EN",
    path: "templates/domain_accounting.en.json",
    prompt: `Generate accounting domain answer templates for English.

{
  "_meta": {
    "bank": "domain_templates_accounting",
    "version": "1.0.0",
    "language": "en",
    "domain": "accounting"
  },
  "templates": {
    "account_balance": {
      "pattern": "{account} has a balance of {amount} ({balance_type}) as of {date}.",
      "slots": ["account", "amount", "balance_type", "date"]
    },
    "journal_entry": {
      "pattern": "Journal entry {entry_id}:\\n  Dr. {debit_account}: {debit_amount}\\n  Cr. {credit_account}: {credit_amount}",
      "slots": ["entry_id", "debit_account", "debit_amount", "credit_account", "credit_amount"]
    },
    "depreciation": {
      "pattern": "{asset} depreciation for {period}: {amount} ({method} method).",
      "slots": ["asset", "period", "amount", "method"]
    },
    "reconciliation": {
      "pattern": "{account} reconciliation shows {status}: book balance {book_amount}, bank balance {bank_amount}, difference {diff_amount}.",
      "slots": ["account", "status", "book_amount", "bank_amount", "diff_amount"]
    },
    // 30+ more accounting templates
  },
  "balance_types": {
    "debit": "debit",
    "credit": "credit"
  }
}

Include 30+ templates. Output ONLY valid JSON.`
  },
  {
    name: "Accounting Templates PT",
    path: "templates/domain_accounting.pt.json",
    prompt: `Generate accounting domain answer templates for Brazilian Portuguese.

{
  "_meta": {
    "bank": "domain_templates_accounting",
    "version": "1.0.0",
    "language": "pt-BR",
    "domain": "accounting"
  },
  "templates": {
    "account_balance": {
      "pattern": "{account} tem saldo de {amount} ({balance_type}) em {date}.",
      "slots": ["account", "amount", "balance_type", "date"]
    },
    "journal_entry": {
      "pattern": "Lançamento {entry_id}:\\n  D - {debit_account}: {debit_amount}\\n  C - {credit_account}: {credit_amount}",
      "slots": ["entry_id", "debit_account", "debit_amount", "credit_account", "credit_amount"]
    },
    // 30+ more templates in PT-BR
  },
  "balance_types": {
    "debit": "devedor",
    "credit": "credor"
  }
}

Include 30+ templates. Output ONLY valid JSON.`
  },
  {
    name: "Medical Templates EN",
    path: "templates/domain_medical.en.json",
    prompt: `Generate medical domain answer templates for English.

{
  "_meta": {
    "bank": "domain_templates_medical",
    "version": "1.0.0",
    "language": "en",
    "domain": "medical"
  },
  "templates": {
    "medication_info": {
      "pattern": "{medication}: {dosage} {frequency} ({route}).",
      "slots": ["medication", "dosage", "frequency", "route"]
    },
    "vital_sign": {
      "pattern": "{vital} recorded as {value} {unit} on {date}.",
      "slots": ["vital", "value", "unit", "date"]
    },
    "lab_result": {
      "pattern": "{test}: {value} {unit} ({reference_range}: {range}) - {status}.",
      "slots": ["test", "value", "unit", "reference_range", "range", "status"]
    },
    "diagnosis": {
      "pattern": "Diagnosis: {diagnosis} ({icd_code}) documented on {date}.",
      "slots": ["diagnosis", "icd_code", "date"]
    },
    // 30+ more medical templates
  },
  "frequency_terms": ["once daily", "twice daily", "every 8 hours", "as needed", "at bedtime"],
  "status_terms": {
    "normal": "within normal limits",
    "high": "above normal",
    "low": "below normal",
    "critical": "critical value"
  },
  "disclaimer": "This information is from the medical record. Please consult your healthcare provider for medical advice."
}

Include 30+ templates. Output ONLY valid JSON.`
  },
  {
    name: "Medical Templates PT",
    path: "templates/domain_medical.pt.json",
    prompt: `Generate medical domain answer templates for Brazilian Portuguese.

{
  "_meta": {
    "bank": "domain_templates_medical",
    "version": "1.0.0",
    "language": "pt-BR",
    "domain": "medical"
  },
  "templates": {
    "medication_info": {
      "pattern": "{medication}: {dosage} {frequency} ({route}).",
      "slots": ["medication", "dosage", "frequency", "route"]
    },
    "vital_sign": {
      "pattern": "{vital} registrado como {value} {unit} em {date}.",
      "slots": ["vital", "value", "unit", "date"]
    },
    // 30+ more templates in PT-BR
  },
  "frequency_terms": ["1x ao dia", "2x ao dia", "de 8/8h", "se necessário", "ao deitar"],
  "status_terms": {
    "normal": "dentro dos limites normais",
    "high": "acima do normal",
    "low": "abaixo do normal",
    "critical": "valor crítico"
  },
  "disclaimer": "Esta informação é do prontuário médico. Consulte seu médico para orientação clínica."
}

Include 30+ templates. Output ONLY valid JSON.`
  },

  // BATCH 4: Medical Lexicons
  {
    name: "Medical Lexicon EN (6500 terms)",
    path: "lexicons/medical.en.json",
    prompt: `Generate a comprehensive English medical lexicon with 6500+ terms.

{
  "_meta": {
    "version": "1.0.0",
    "generated": "2026-01-19",
    "purpose": "Medical lexicon EN - canonical terms and aliases for medical document analysis",
    "totalTerms": 6500,
    "domain": "medical",
    "language": "en"
  },
  "categories": {
    "medications": {
      "antibiotics": { /* 20 entries */ },
      "analgesics": { /* 20 entries */ },
      "antihypertensives": { /* 25 entries */ },
      "antidiabetics": { /* 20 entries */ },
      "antidepressants": { /* 20 entries */ },
      "antipsychotics": { /* 15 entries */ },
      "anticoagulants": { /* 15 entries */ },
      "statins": { /* 10 entries */ },
      "bronchodilators": { /* 15 entries */ },
      "antihistamines": { /* 15 entries */ },
      "ppi": { /* 10 entries */ },
      "corticosteroids": { /* 15 entries */ },
      "immunosuppressants": { /* 10 entries */ },
      "chemotherapy": { /* 20 entries */ },
      "hormones": { /* 15 entries */ },
      "vaccines": { /* 20 entries */ }
    },
    "anatomy": {
      "cardiovascular": { /* 30 entries */ },
      "respiratory": { /* 25 entries */ },
      "digestive": { /* 30 entries */ },
      "nervous": { /* 35 entries */ },
      "musculoskeletal": { /* 40 entries */ },
      "endocrine": { /* 20 entries */ },
      "urinary": { /* 20 entries */ },
      "reproductive": { /* 25 entries */ },
      "integumentary": { /* 15 entries */ },
      "lymphatic": { /* 15 entries */ }
    },
    "diagnoses": {
      "cardiovascular": { /* 40 entries */ },
      "respiratory": { /* 35 entries */ },
      "gastrointestinal": { /* 35 entries */ },
      "neurological": { /* 40 entries */ },
      "psychiatric": { /* 30 entries */ },
      "endocrine": { /* 25 entries */ },
      "infectious": { /* 40 entries */ },
      "oncological": { /* 35 entries */ },
      "autoimmune": { /* 25 entries */ },
      "musculoskeletal": { /* 30 entries */ }
    },
    "symptoms": {
      "general": { /* 30 entries */ },
      "pain": { /* 25 entries */ },
      "respiratory": { /* 20 entries */ },
      "gastrointestinal": { /* 25 entries */ },
      "neurological": { /* 25 entries */ },
      "cardiovascular": { /* 20 entries */ },
      "dermatological": { /* 20 entries */ },
      "psychiatric": { /* 20 entries */ }
    },
    "procedures": {
      "surgical": { /* 50 entries */ },
      "diagnostic": { /* 40 entries */ },
      "therapeutic": { /* 35 entries */ },
      "emergency": { /* 25 entries */ }
    },
    "lab_tests": {
      "blood_chemistry": { /* 40 entries */ },
      "hematology": { /* 30 entries */ },
      "urinalysis": { /* 15 entries */ },
      "microbiology": { /* 20 entries */ },
      "immunology": { /* 20 entries */ },
      "genetic": { /* 15 entries */ }
    },
    "imaging": {
      "radiography": { /* 15 entries */ },
      "ct_scans": { /* 15 entries */ },
      "mri": { /* 15 entries */ },
      "ultrasound": { /* 15 entries */ },
      "nuclear_medicine": { /* 10 entries */ }
    },
    "vital_signs": { /* 15 entries */ },
    "medical_abbreviations": { /* 100 entries */ },
    "medical_specialties": { /* 30 entries */ },
    "medical_equipment": { /* 40 entries */ }
  }
}

Each entry has: { "canonical": "term", "aliases": ["alias1", "alias2", ...], "aliasOnly": [...optional input-only aliases...] }
Include brand names, abbreviations, common misspellings. Output ONLY valid JSON.`
  },
  {
    name: "Medical Lexicon PT (7500 terms)",
    path: "lexicons/medical.pt.json",
    prompt: `Generate a comprehensive Brazilian Portuguese medical lexicon with 7500+ terms.

{
  "_meta": {
    "version": "1.0.0",
    "generated": "2026-01-19",
    "purpose": "Léxico médico PT-BR - termos canônicos e aliases para análise de documentos médicos",
    "totalTerms": 7500,
    "domain": "medical",
    "language": "pt-BR"
  },
  "categories": {
    "medicamentos": {
      "antibioticos": { /* 25 entries with PT names */ },
      "analgesicos": { /* 25 entries */ },
      "anti_hipertensivos": { /* 30 entries */ },
      "antidiabeticos": { /* 25 entries */ },
      "antidepressivos": { /* 25 entries */ },
      "antipsicoticos": { /* 20 entries */ },
      "anticoagulantes": { /* 20 entries */ },
      "estatinas": { /* 15 entries */ },
      "broncodilatadores": { /* 20 entries */ },
      "anti_histaminicos": { /* 20 entries */ },
      "inibidores_bomba_protons": { /* 15 entries */ },
      "corticosteroides": { /* 20 entries */ },
      "imunossupressores": { /* 15 entries */ },
      "quimioterapicos": { /* 25 entries */ },
      "hormonios": { /* 20 entries */ },
      "vacinas": { /* 25 entries */ }
    },
    "anatomia": {
      "cardiovascular": { /* 35 entries */ },
      "respiratorio": { /* 30 entries */ },
      "digestivo": { /* 35 entries */ },
      "nervoso": { /* 40 entries */ },
      "musculoesqueletico": { /* 45 entries */ },
      "endocrino": { /* 25 entries */ },
      "urinario": { /* 25 entries */ },
      "reprodutor": { /* 30 entries */ },
      "tegumentar": { /* 20 entries */ },
      "linfatico": { /* 20 entries */ }
    },
    "diagnosticos": {
      "cardiovasculares": { /* 45 entries */ },
      "respiratorios": { /* 40 entries */ },
      "gastrointestinais": { /* 40 entries */ },
      "neurologicos": { /* 45 entries */ },
      "psiquiatricos": { /* 35 entries */ },
      "endocrinos": { /* 30 entries */ },
      "infecciosos": { /* 45 entries */ },
      "oncologicos": { /* 40 entries */ },
      "autoimunes": { /* 30 entries */ },
      "musculoesqueleticos": { /* 35 entries */ }
    },
    "sintomas": { /* similar structure */ },
    "procedimentos": { /* similar structure */ },
    "exames_laboratoriais": { /* similar structure */ },
    "exames_imagem": { /* similar structure */ },
    "sinais_vitais": { /* 20 entries */ },
    "abreviacoes_medicas": { /* 120 entries */ },
    "especialidades_medicas": { /* 35 entries */ },
    "equipamentos_medicos": { /* 45 entries */ },
    "sistema_sus": {
      "programas": { /* 20 entries */ },
      "unidades": { /* 15 entries */ },
      "procedimentos_sus": { /* 30 entries */ }
    }
  }
}

Include Brazilian SUS terms, ANVISA terminology, CRM references. Output ONLY valid JSON.`
  },

  // BATCH 5: Probes
  {
    name: "Terminology Probe Suite EN",
    path: "probes/terminology.en.json",
    prompt: `Generate a terminology consistency probe suite for English.

{
  "_meta": {
    "version": "1.0.0",
    "purpose": "Test queries to validate ChatGPT-like terminology consistency",
    "language": "en"
  },
  "consistency_probes": [
    // 50 probes that check same term is used consistently
    {
      "query": "What is the EBITDA in the financial report?",
      "expected_term": "EBITDA",
      "forbidden_synonyms": ["earnings before interest", "operating profit"],
      "domain": "finance"
    },
    // more...
  ],
  "opener_probes": [
    // 30 probes to verify no banned openers
    {
      "query": "List the medications",
      "forbidden_openers": ["Here are", "I found", "Below are", "The following"],
      "domain": "medical"
    },
    // more...
  ],
  "domain_voice_probes": [
    // 40 probes per domain checking appropriate voice
    {
      "query": "What does the termination clause say?",
      "domain": "legal",
      "forbidden_phrases": ["you should", "I recommend", "legal advice"],
      "required_elements": ["document states", "Section/Clause reference"]
    },
    // more for finance, medical, accounting
  ],
  "synonym_stability_probes": [
    // 30 probes checking no synonym switching mid-answer
    {
      "query": "Explain the revenue breakdown",
      "domain": "finance",
      "pick_one_term": ["revenue", "sales", "income"],
      "must_be_consistent": true
    },
    // more...
  ]
}

Include 150+ total probes. Output ONLY valid JSON.`
  },
  {
    name: "Terminology Probe Suite PT",
    path: "probes/terminology.pt.json",
    prompt: `Generate a terminology consistency probe suite for Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "purpose": "Consultas de teste para validar consistência terminológica tipo ChatGPT",
    "language": "pt-BR"
  },
  "consistency_probes": [
    // 50 probes for PT-BR terminology consistency
    {
      "query": "Qual é o EBITDA no relatório financeiro?",
      "expected_term": "EBITDA",
      "forbidden_synonyms": ["lucro antes de juros", "resultado operacional"],
      "domain": "finance"
    },
    // more...
  ],
  "opener_probes": [
    // 30 probes for PT-BR
    {
      "query": "Liste os medicamentos",
      "forbidden_openers": ["Aqui está", "Encontrei", "A seguir", "Seguem"],
      "domain": "medical"
    },
    // more...
  ],
  "domain_voice_probes": [
    // 40 probes for PT-BR
    {
      "query": "O que diz a cláusula de rescisão?",
      "domain": "legal",
      "forbidden_phrases": ["você deve", "recomendo", "aconselhamento jurídico"],
      "required_elements": ["documento estabelece", "Cláusula/Seção"]
    },
    // more...
  ],
  "synonym_stability_probes": [
    // 30 probes for PT-BR
    {
      "query": "Explique a composição da receita",
      "domain": "finance",
      "pick_one_term": ["receita", "faturamento", "vendas"],
      "must_be_consistent": true
    },
    // more...
  ]
}

Include 150+ total probes. Output ONLY valid JSON.`
  }
];

async function runBatch(tasks: Task[], batchName: string): Promise<number> {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🚀 BATCH: ${batchName} (${tasks.length} files)`);
  console.log("=".repeat(50));

  let success = 0;
  for (const task of tasks) {
    try {
      await generate(task);
      success++;
      await new Promise(r => setTimeout(r, 2000)); // rate limit
    } catch (e) {
      console.error(`❌ Failed: ${task.name}`, e);
    }
  }
  return success;
}

async function main() {
  console.log("🎯 Terminology System Generator");
  console.log(`📁 Output: ${DATA_BANKS_DIR}\n`);

  // Create directories
  ["formatting", "lexicons", "templates", "probes"].forEach(d => {
    fs.mkdirSync(path.join(DATA_BANKS_DIR, d), { recursive: true });
  });

  const batch1 = TASKS.slice(0, 5);  // Terminology policies
  const batch2 = TASKS.slice(5, 7);  // Output rules + blocklist
  const batch3 = TASKS.slice(7, 15); // Domain templates
  const batch4 = TASKS.slice(15, 17); // Medical lexicons
  const batch5 = TASKS.slice(17);    // Probes

  let total = 0;
  total += await runBatch(batch1, "Terminology Policies");
  total += await runBatch(batch2, "Output Rules & Blocklist");
  total += await runBatch(batch3, "Domain Templates");
  total += await runBatch(batch4, "Medical Lexicons");
  total += await runBatch(batch5, "Probe Suites");

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ COMPLETED: ${total}/${TASKS.length} files generated`);
  console.log("=".repeat(50));
}

main().catch(console.error);
