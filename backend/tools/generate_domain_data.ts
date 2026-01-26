#!/usr/bin/env npx ts-node
/**
 * Domain Data Generator - Uses Claude API to generate lexicons, extractors, negatives, templates, and probes
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
});

const DATA_BANKS_DIR = path.join(__dirname, "../src/data_banks");

interface GenerationTask {
  name: string;
  outputPath: string;
  prompt: string;
  targetTerms?: number;
}

const TASKS: GenerationTask[] = [
  // Medical EN Lexicon (expand to 6500 terms)
  {
    name: "medical.en.json",
    outputPath: "lexicons/medical.en.json",
    targetTerms: 6500,
    prompt: `Generate a comprehensive medical lexicon JSON file with approximately 6500 terms.

Structure MUST be:
{
  "_meta": {
    "version": "1.0.0",
    "generated": "2026-01-19",
    "purpose": "Medical lexicon EN - canonical terms and aliases for medical document analysis",
    "totalTerms": <count all aliases + canonical terms>,
    "domain": "medical",
    "language": "en"
  },
  "categories": {
    "medications": {
      "antibiotics": { "<drug>": { "canonical": "<name>", "aliases": [...] } },
      "analgesics": { ... },
      "antihypertensives": { ... },
      "antidiabetics": { ... },
      "antidepressants": { ... },
      "antipsychotics": { ... },
      "anticoagulants": { ... },
      "statins": { ... },
      "bronchodilators": { ... },
      "antihistamines": { ... },
      "proton_pump_inhibitors": { ... },
      "corticosteroids": { ... },
      "immunosuppressants": { ... },
      "chemotherapy": { ... },
      "hormones": { ... },
      "vaccines": { ... }
    },
    "anatomy": {
      "cardiovascular": { ... },
      "respiratory": { ... },
      "digestive": { ... },
      "nervous": { ... },
      "musculoskeletal": { ... },
      "endocrine": { ... },
      "urinary": { ... },
      "reproductive": { ... },
      "integumentary": { ... },
      "lymphatic": { ... }
    },
    "diagnoses": {
      "cardiovascular": { ... },
      "respiratory": { ... },
      "gastrointestinal": { ... },
      "neurological": { ... },
      "psychiatric": { ... },
      "endocrine": { ... },
      "infectious": { ... },
      "oncological": { ... },
      "autoimmune": { ... },
      "musculoskeletal": { ... }
    },
    "symptoms": {
      "general": { ... },
      "pain": { ... },
      "respiratory": { ... },
      "gastrointestinal": { ... },
      "neurological": { ... },
      "cardiovascular": { ... },
      "dermatological": { ... },
      "psychiatric": { ... }
    },
    "procedures": {
      "surgical": { ... },
      "diagnostic": { ... },
      "therapeutic": { ... },
      "emergency": { ... }
    },
    "lab_tests": {
      "blood_chemistry": { ... },
      "hematology": { ... },
      "urinalysis": { ... },
      "microbiology": { ... },
      "immunology": { ... },
      "genetic": { ... }
    },
    "imaging": {
      "radiography": { ... },
      "ct_scans": { ... },
      "mri": { ... },
      "ultrasound": { ... },
      "nuclear_medicine": { ... }
    },
    "vital_signs": { ... },
    "medical_abbreviations": { ... },
    "medical_specialties": { ... },
    "medical_equipment": { ... }
  }
}

Include 15-20 entries per subcategory minimum. Each entry needs canonical term and 5-10 aliases (brand names, abbreviations, common misspellings, related terms).
Output ONLY valid JSON, no explanation.`,
  },

  // Medical PT Lexicon (7500 terms)
  {
    name: "medical.pt.json",
    outputPath: "lexicons/medical.pt.json",
    targetTerms: 7500,
    prompt: `Generate a comprehensive Brazilian Portuguese medical lexicon JSON with approximately 7500 terms.

Structure MUST be:
{
  "_meta": {
    "version": "1.0.0",
    "generated": "2026-01-19",
    "purpose": "Léxico médico PT-BR - termos canônicos e aliases para análise de documentos médicos",
    "totalTerms": <count>,
    "domain": "medical",
    "language": "pt-BR"
  },
  "categories": {
    "medicamentos": {
      "antibioticos": { "<medicamento>": { "canonical": "<nome>", "aliases": [...] } },
      "analgesicos": { ... },
      "anti_hipertensivos": { ... },
      "antidiabeticos": { ... },
      "antidepressivos": { ... },
      "antipsicoticos": { ... },
      "anticoagulantes": { ... },
      "estatinas": { ... },
      "broncodilatadores": { ... },
      "anti_histaminicos": { ... },
      "inibidores_bomba_protons": { ... },
      "corticosteroides": { ... },
      "imunossupressores": { ... },
      "quimioterapicos": { ... },
      "hormonios": { ... },
      "vacinas": { ... }
    },
    "anatomia": {
      "cardiovascular": { ... },
      "respiratorio": { ... },
      "digestivo": { ... },
      "nervoso": { ... },
      "musculoesqueletico": { ... },
      "endocrino": { ... },
      "urinario": { ... },
      "reprodutor": { ... },
      "tegumentar": { ... },
      "linfatico": { ... }
    },
    "diagnosticos": {
      "cardiovasculares": { ... },
      "respiratorios": { ... },
      "gastrointestinais": { ... },
      "neurologicos": { ... },
      "psiquiatricos": { ... },
      "endocrinos": { ... },
      "infecciosos": { ... },
      "oncologicos": { ... },
      "autoimunes": { ... },
      "musculoesqueleticos": { ... }
    },
    "sintomas": {
      "gerais": { ... },
      "dor": { ... },
      "respiratorios": { ... },
      "gastrointestinais": { ... },
      "neurologicos": { ... },
      "cardiovasculares": { ... },
      "dermatologicos": { ... },
      "psiquiatricos": { ... }
    },
    "procedimentos": {
      "cirurgicos": { ... },
      "diagnosticos": { ... },
      "terapeuticos": { ... },
      "emergencia": { ... }
    },
    "exames_laboratoriais": {
      "bioquimica": { ... },
      "hematologia": { ... },
      "urinanalise": { ... },
      "microbiologia": { ... },
      "imunologia": { ... },
      "genetica": { ... }
    },
    "exames_imagem": {
      "radiografia": { ... },
      "tomografia": { ... },
      "ressonancia": { ... },
      "ultrassonografia": { ... },
      "medicina_nuclear": { ... }
    },
    "sinais_vitais": { ... },
    "abreviacoes_medicas": { ... },
    "especialidades_medicas": { ... },
    "equipamentos_medicos": { ... },
    "sistema_sus": {
      "programas": { ... },
      "unidades": { ... },
      "procedimentos_sus": { ... }
    }
  }
}

Include Brazilian SUS (Sistema Único de Saúde) specific terms, ANVISA regulations, Brazilian medical terminology.
15-20 entries per subcategory minimum. Each with canonical + 5-10 aliases.
Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Finance EN
  {
    name: "extractors/finance.en.json",
    outputPath: "extractors/finance.en.json",
    prompt: `Generate a finance domain entity extractor configuration JSON for English.

Structure:
{
  "_meta": {
    "version": "1.0.0",
    "domain": "finance",
    "language": "en",
    "purpose": "Entity extraction patterns for financial documents"
  },
  "entity_types": {
    "currency_amounts": {
      "patterns": ["\\\\$[\\\\d,]+\\\\.?\\\\d*", "USD [\\\\d,]+", ...],
      "normalizer": "currency",
      "examples": ["$1,234.56", "USD 1000"]
    },
    "percentages": {
      "patterns": ["[\\\\d.]+%", "[\\\\d.]+ percent", ...],
      "normalizer": "percentage",
      "examples": ["5.5%", "10 percent"]
    },
    "dates": {
      "patterns": [...],
      "normalizer": "date"
    },
    "fiscal_periods": {
      "patterns": ["Q[1-4] \\\\d{4}", "FY\\\\d{2,4}", ...],
      "normalizer": "fiscal_period"
    },
    "company_names": {
      "patterns": [...],
      "ner_model": "company"
    },
    "ticker_symbols": {
      "patterns": ["[A-Z]{1,5}", ...],
      "validator": "stock_ticker"
    },
    "financial_ratios": {
      "patterns": ["P/E ratio", "ROI", "EBITDA", ...],
      "normalizer": "ratio"
    },
    "account_numbers": {
      "patterns": [...],
      "validator": "account"
    }
  },
  "composite_entities": {
    "price_change": {
      "components": ["currency_amounts", "percentages"],
      "pattern": "from {amount} to {amount} \\\\({percentage}\\\\)"
    },
    "fiscal_metric": {
      "components": ["financial_ratios", "currency_amounts", "fiscal_periods"],
      "pattern": "{ratio} of {amount} in {period}"
    }
  }
}

Include 50+ patterns across all entity types. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Finance PT
  {
    name: "extractors/finance.pt.json",
    outputPath: "extractors/finance.pt.json",
    prompt: `Generate a finance domain entity extractor configuration JSON for Brazilian Portuguese.

Structure similar to EN version but with PT patterns:
{
  "_meta": {
    "version": "1.0.0",
    "domain": "finance",
    "language": "pt-BR",
    "purpose": "Padrões de extração de entidades para documentos financeiros"
  },
  "entity_types": {
    "valores_monetarios": {
      "patterns": ["R\\\\$ ?[\\\\d.,]+", "BRL [\\\\d.,]+", ...],
      "normalizer": "currency_brl",
      "examples": ["R$ 1.234,56", "BRL 1000"]
    },
    "percentuais": {
      "patterns": ["[\\\\d,]+%", "[\\\\d,]+ por cento", ...],
      "normalizer": "percentage"
    },
    "datas": {
      "patterns": ["\\\\d{2}/\\\\d{2}/\\\\d{4}", ...],
      "normalizer": "date_br"
    },
    "periodos_fiscais": {
      "patterns": ["[1-4]T\\\\d{4}", "\\\\d{4}T[1-4]", "exercício \\\\d{4}", ...],
      "normalizer": "fiscal_period"
    },
    "cnpj": {
      "patterns": ["\\\\d{2}\\\\.\\\\d{3}\\\\.\\\\d{3}/\\\\d{4}-\\\\d{2}"],
      "validator": "cnpj"
    },
    "cpf": {
      "patterns": ["\\\\d{3}\\\\.\\\\d{3}\\\\.\\\\d{3}-\\\\d{2}"],
      "validator": "cpf"
    },
    "indicadores_financeiros": {
      "patterns": ["CDI", "SELIC", "IPCA", "IGP-M", ...],
      "normalizer": "indicator"
    },
    "codigos_bovespa": {
      "patterns": ["[A-Z]{4}[0-9]{1,2}", ...],
      "validator": "bovespa_ticker"
    }
  }
}

Include Brazilian-specific patterns (CNPJ, CPF, B3 tickers, Brazilian fiscal periods, etc.). 50+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Legal EN
  {
    name: "extractors/legal.en.json",
    outputPath: "extractors/legal.en.json",
    prompt: `Generate a legal domain entity extractor JSON for English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "legal",
    "language": "en",
    "purpose": "Entity extraction patterns for legal documents"
  },
  "entity_types": {
    "case_citations": {
      "patterns": ["\\\\d+ U\\\\.S\\\\. \\\\d+", "\\\\d+ F\\\\.\\\\d+d \\\\d+", ...],
      "normalizer": "case_citation"
    },
    "statute_references": {
      "patterns": ["\\\\d+ U\\\\.S\\\\.C\\\\. § ?\\\\d+", ...],
      "normalizer": "statute"
    },
    "court_names": {
      "patterns": [...],
      "ner_model": "court"
    },
    "party_names": {
      "patterns": [...],
      "ner_model": "legal_party"
    },
    "dates": {
      "patterns": [...],
      "normalizer": "date"
    },
    "monetary_awards": {
      "patterns": [...],
      "normalizer": "currency"
    },
    "contract_terms": {
      "patterns": ["Section \\\\d+", "Article [IVXLC]+", "Clause \\\\d+", ...],
      "normalizer": "contract_ref"
    },
    "legal_entities": {
      "patterns": ["LLC", "Inc\\\\.", "Corp\\\\.", "LLP", ...],
      "normalizer": "entity_type"
    },
    "jurisdiction": {
      "patterns": [...],
      "ner_model": "jurisdiction"
    }
  }
}

Include 50+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Legal PT
  {
    name: "extractors/legal.pt.json",
    outputPath: "extractors/legal.pt.json",
    prompt: `Generate a legal domain entity extractor JSON for Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "legal",
    "language": "pt-BR",
    "purpose": "Padrões de extração para documentos jurídicos brasileiros"
  },
  "entity_types": {
    "numeros_processos": {
      "patterns": ["\\\\d{7}-\\\\d{2}\\\\.\\\\d{4}\\\\.\\\\d\\\\.\\\\d{2}\\\\.\\\\d{4}", ...],
      "normalizer": "processo_cnj",
      "examples": ["1234567-89.2024.8.26.0100"]
    },
    "referencias_legislativas": {
      "patterns": ["Lei n[°º]? ?\\\\d+", "Decreto n[°º]? ?\\\\d+", "CF/88", ...],
      "normalizer": "legislacao"
    },
    "tribunais": {
      "patterns": ["STF", "STJ", "TJ[A-Z]{2}", "TRF-?\\\\d", "TRT-?\\\\d{1,2}", ...],
      "normalizer": "tribunal"
    },
    "partes_processuais": {
      "patterns": [...],
      "ner_model": "parte_processual"
    },
    "oab": {
      "patterns": ["OAB/?[A-Z]{2} ?\\\\d+", ...],
      "validator": "oab"
    },
    "cnpj": {
      "patterns": ["\\\\d{2}\\\\.\\\\d{3}\\\\.\\\\d{3}/\\\\d{4}-\\\\d{2}"],
      "validator": "cnpj"
    },
    "cpf": {
      "patterns": ["\\\\d{3}\\\\.\\\\d{3}\\\\.\\\\d{3}-\\\\d{2}"],
      "validator": "cpf"
    },
    "valores_causa": {
      "patterns": ["R\\\\$ ?[\\\\d.,]+", ...],
      "normalizer": "currency_brl"
    },
    "tipos_acoes": {
      "patterns": ["Ação Civil Pública", "Mandado de Segurança", "Habeas Corpus", ...],
      "normalizer": "tipo_acao"
    },
    "artigos_leis": {
      "patterns": ["[Aa]rt\\\\.? ?\\\\d+", "§ ?\\\\d+[°º]?", "inciso [IVXLC]+", ...],
      "normalizer": "artigo"
    }
  }
}

Include Brazilian legal system specifics (CNJ numbering, Brazilian courts, OAB, etc.). 50+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Medical EN
  {
    name: "extractors/medical.en.json",
    outputPath: "extractors/medical.en.json",
    prompt: `Generate a medical domain entity extractor JSON for English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "medical",
    "language": "en",
    "purpose": "Entity extraction patterns for medical documents"
  },
  "entity_types": {
    "dosages": {
      "patterns": ["\\\\d+\\\\s*mg", "\\\\d+\\\\s*mcg", "\\\\d+\\\\s*ml", "\\\\d+\\\\s*units", ...],
      "normalizer": "dosage"
    },
    "frequencies": {
      "patterns": ["once daily", "BID", "TID", "QID", "PRN", "q\\\\d+h", ...],
      "normalizer": "frequency"
    },
    "vital_signs": {
      "patterns": ["BP \\\\d+/\\\\d+", "HR \\\\d+", "SpO2 \\\\d+%", "Temp \\\\d+\\\\.?\\\\d*", ...],
      "normalizer": "vital_sign"
    },
    "lab_values": {
      "patterns": ["\\\\d+\\\\.?\\\\d* mg/dL", "\\\\d+\\\\.?\\\\d* mmol/L", ...],
      "normalizer": "lab_value"
    },
    "icd_codes": {
      "patterns": ["[A-Z]\\\\d{2}\\\\.?\\\\d*", ...],
      "validator": "icd10"
    },
    "cpt_codes": {
      "patterns": ["\\\\d{5}", ...],
      "validator": "cpt"
    },
    "ndc_codes": {
      "patterns": ["\\\\d{5}-\\\\d{4}-\\\\d{2}", ...],
      "validator": "ndc"
    },
    "dates": {
      "patterns": [...],
      "normalizer": "date"
    },
    "patient_identifiers": {
      "patterns": ["MRN:? ?\\\\d+", "DOB:? ?\\\\d{2}/\\\\d{2}/\\\\d{4}", ...],
      "normalizer": "patient_id"
    },
    "anatomical_locations": {
      "patterns": [...],
      "ner_model": "anatomy"
    },
    "medications": {
      "patterns": [...],
      "ner_model": "medication"
    },
    "diagnoses": {
      "patterns": [...],
      "ner_model": "diagnosis"
    }
  }
}

Include 60+ patterns covering medical terminology. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Medical PT
  {
    name: "extractors/medical.pt.json",
    outputPath: "extractors/medical.pt.json",
    prompt: `Generate a medical domain entity extractor JSON for Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "medical",
    "language": "pt-BR",
    "purpose": "Padrões de extração para documentos médicos brasileiros"
  },
  "entity_types": {
    "dosagens": {
      "patterns": ["\\\\d+\\\\s*mg", "\\\\d+\\\\s*mcg", "\\\\d+\\\\s*ml", "\\\\d+\\\\s*UI", ...],
      "normalizer": "dosagem"
    },
    "frequencias": {
      "patterns": ["1x ao dia", "2x ao dia", "de 8/8h", "de 12/12h", "SOS", "ACM", ...],
      "normalizer": "frequencia"
    },
    "sinais_vitais": {
      "patterns": ["PA \\\\d+x\\\\d+", "FC \\\\d+", "SatO2 \\\\d+%", "Tax \\\\d+,?\\\\d*", ...],
      "normalizer": "sinal_vital"
    },
    "valores_laboratoriais": {
      "patterns": ["\\\\d+,?\\\\d* mg/dL", "\\\\d+,?\\\\d* mmol/L", ...],
      "normalizer": "valor_lab"
    },
    "cid_codes": {
      "patterns": ["CID[- ]?[A-Z]\\\\d{2}\\\\.?\\\\d*", "[A-Z]\\\\d{2}\\\\.?\\\\d*", ...],
      "validator": "cid10"
    },
    "sus_procedures": {
      "patterns": ["\\\\d{10}", ...],
      "validator": "sigtap"
    },
    "crm": {
      "patterns": ["CRM/?[A-Z]{2} ?\\\\d+", ...],
      "validator": "crm"
    },
    "cns": {
      "patterns": ["\\\\d{15}", ...],
      "validator": "cns"
    },
    "datas": {
      "patterns": ["\\\\d{2}/\\\\d{2}/\\\\d{4}", ...],
      "normalizer": "date_br"
    },
    "localizacoes_anatomicas": {
      "patterns": [...],
      "ner_model": "anatomia"
    },
    "medicamentos": {
      "patterns": [...],
      "ner_model": "medicamento"
    },
    "diagnosticos": {
      "patterns": [...],
      "ner_model": "diagnostico"
    }
  }
}

Include Brazilian medical specifics (CRM, CNS, SIGTAP codes, SUS terminology). 60+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Accounting EN
  {
    name: "extractors/accounting.en.json",
    outputPath: "extractors/accounting.en.json",
    prompt: `Generate an accounting domain entity extractor JSON for English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "accounting",
    "language": "en",
    "purpose": "Entity extraction patterns for accounting documents"
  },
  "entity_types": {
    "currency_amounts": {
      "patterns": ["\\\\$[\\\\d,]+\\\\.?\\\\d*", "USD [\\\\d,]+", "(\\\\d+,)*\\\\d+\\\\.\\\\d{2}", ...],
      "normalizer": "currency"
    },
    "account_codes": {
      "patterns": ["\\\\d{4,6}", "GL \\\\d+", ...],
      "validator": "gl_code"
    },
    "dates": {
      "patterns": ["\\\\d{2}/\\\\d{2}/\\\\d{4}", "\\\\d{4}-\\\\d{2}-\\\\d{2}", ...],
      "normalizer": "date"
    },
    "fiscal_periods": {
      "patterns": ["Q[1-4] \\\\d{4}", "FY\\\\d{2,4}", "YTD", "MTD", ...],
      "normalizer": "fiscal_period"
    },
    "percentages": {
      "patterns": ["[\\\\d.]+%", ...],
      "normalizer": "percentage"
    },
    "ratios": {
      "patterns": ["\\\\d+:\\\\d+", "\\\\d+\\\\.\\\\d+x", ...],
      "normalizer": "ratio"
    },
    "invoice_numbers": {
      "patterns": ["INV-?\\\\d+", "Invoice #?\\\\d+", ...],
      "normalizer": "invoice"
    },
    "po_numbers": {
      "patterns": ["PO-?\\\\d+", "Purchase Order #?\\\\d+", ...],
      "normalizer": "po"
    },
    "tax_ids": {
      "patterns": ["EIN:? ?\\\\d{2}-\\\\d{7}", "\\\\d{2}-\\\\d{7}", ...],
      "validator": "ein"
    },
    "accounting_standards": {
      "patterns": ["GAAP", "IFRS \\\\d+", "ASC \\\\d+", "FAS \\\\d+", ...],
      "normalizer": "standard"
    }
  }
}

Include 50+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Entity Extractors - Accounting PT
  {
    name: "extractors/accounting.pt.json",
    outputPath: "extractors/accounting.pt.json",
    prompt: `Generate an accounting domain entity extractor JSON for Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "accounting",
    "language": "pt-BR",
    "purpose": "Padrões de extração para documentos contábeis brasileiros"
  },
  "entity_types": {
    "valores_monetarios": {
      "patterns": ["R\\\\$ ?[\\\\d.,]+", "(\\\\d+\\\\.)*\\\\d+,\\\\d{2}", ...],
      "normalizer": "currency_brl"
    },
    "codigos_contas": {
      "patterns": ["\\\\d{1}\\\\.\\\\d{1,2}\\\\.\\\\d{2}\\\\.\\\\d{2}", ...],
      "validator": "plano_contas"
    },
    "datas": {
      "patterns": ["\\\\d{2}/\\\\d{2}/\\\\d{4}", ...],
      "normalizer": "date_br"
    },
    "periodos_fiscais": {
      "patterns": ["[1-4]T\\\\d{4}", "exercício \\\\d{4}", "ano-calendário \\\\d{4}", ...],
      "normalizer": "periodo_fiscal"
    },
    "cnpj": {
      "patterns": ["\\\\d{2}\\\\.\\\\d{3}\\\\.\\\\d{3}/\\\\d{4}-\\\\d{2}"],
      "validator": "cnpj"
    },
    "cpf": {
      "patterns": ["\\\\d{3}\\\\.\\\\d{3}\\\\.\\\\d{3}-\\\\d{2}"],
      "validator": "cpf"
    },
    "notas_fiscais": {
      "patterns": ["NF-?e? ?\\\\d+", "Nota Fiscal \\\\d+", "Série \\\\d+", ...],
      "normalizer": "nf"
    },
    "codigos_sped": {
      "patterns": ["\\\\|\\\\d{4}\\\\|", ...],
      "normalizer": "registro_sped"
    },
    "normas_contabeis": {
      "patterns": ["CPC \\\\d+", "NBC T[A-Z]? ?\\\\d+", "ITG \\\\d+", ...],
      "normalizer": "norma"
    },
    "tributos": {
      "patterns": ["ICMS", "PIS", "COFINS", "IRPJ", "CSLL", "ISS", "IPI", ...],
      "normalizer": "tributo"
    }
  }
}

Include Brazilian specifics (CNPJ, CPF, SPED, NF-e, CPC standards, Brazilian taxes). 50+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Finance EN
  {
    name: "negatives/not_finance.en.json",
    outputPath: "negatives/not_finance.en.json",
    prompt: `Generate a domain negatives file for finance in English - patterns that should NOT trigger finance domain routing.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "finance",
    "language": "en",
    "purpose": "Negative patterns to prevent false positive finance routing"
  },
  "negative_patterns": {
    "casual_money_mentions": {
      "patterns": [
        "how much does .* cost",
        "price of .* at the store",
        "paid .* for lunch",
        "split the bill",
        "tip the waiter",
        "grocery budget"
      ],
      "reason": "Casual money references, not financial analysis"
    },
    "gaming_finance_terms": {
      "patterns": [
        "in-game currency",
        "gold coins in .*",
        "game economy",
        "virtual money",
        "buy skins"
      ],
      "reason": "Gaming context, not real finance"
    },
    "metaphorical_uses": {
      "patterns": [
        "emotional investment",
        "invest in yourself",
        "rich in culture",
        "bankrupt of ideas",
        "moral bankruptcy"
      ],
      "reason": "Metaphorical use of financial terms"
    },
    "historical_references": {
      "patterns": [
        "ancient currency",
        "Roman coins",
        "medieval economy",
        "historical trade"
      ],
      "reason": "Historical context, not modern finance"
    },
    "educational_general": {
      "patterns": [
        "teach kids about money",
        "money for beginners",
        "what is a bank",
        "explain stocks to a child"
      ],
      "reason": "General education, not document analysis"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "stock",
      "not_finance_when": ["chicken stock", "stock photo", "livestock", "rolling stock", "stock character"]
    },
    {
      "trigger": "bond",
      "not_finance_when": ["James Bond", "bond between", "chemical bond", "bond paper"]
    },
    {
      "trigger": "interest",
      "not_finance_when": ["interesting", "point of interest", "personal interest", "love interest"]
    },
    {
      "trigger": "credit",
      "not_finance_when": ["give credit to", "credit where due", "movie credits", "academic credits"]
    },
    {
      "trigger": "capital",
      "not_finance_when": ["capital letter", "capital city", "capital punishment", "human capital"]
    }
  ]
}

Include 100+ negative patterns across categories. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Finance PT
  {
    name: "negatives/not_finance.pt.json",
    outputPath: "negatives/not_finance.pt.json",
    prompt: `Generate domain negatives for finance in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "finance",
    "language": "pt-BR",
    "purpose": "Padrões negativos para evitar roteamento falso positivo para finanças"
  },
  "negative_patterns": {
    "mencoes_casuais_dinheiro": {
      "patterns": [
        "quanto custa",
        "preço de .* na loja",
        "paguei .* no almoço",
        "dividir a conta",
        "gorjeta",
        "feira da semana"
      ],
      "reason": "Menções casuais de dinheiro"
    },
    "termos_jogos": {
      "patterns": [
        "moedas do jogo",
        "ouro no .*",
        "economia do game",
        "dinheiro virtual",
        "comprar skins"
      ],
      "reason": "Contexto de jogos"
    },
    "usos_metaforicos": {
      "patterns": [
        "investir em si mesmo",
        "rico em cultura",
        "falido de ideias",
        "bancarrota moral"
      ],
      "reason": "Uso metafórico de termos financeiros"
    },
    "educacional_basico": {
      "patterns": [
        "ensinar crianças sobre dinheiro",
        "o que é um banco",
        "explicar ações para criança"
      ],
      "reason": "Educação básica"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "ação",
      "not_finance_when": ["ação judicial", "ação penal", "ação de graças", "homem de ação"]
    },
    {
      "trigger": "título",
      "not_finance_when": ["título do livro", "título de eleitor", "título acadêmico"]
    },
    {
      "trigger": "capital",
      "not_finance_when": ["letra maiúscula", "capital do estado", "pena capital"]
    },
    {
      "trigger": "crédito",
      "not_finance_when": ["dar crédito a", "créditos do filme", "créditos acadêmicos"]
    }
  ]
}

Include 100+ negative patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Legal EN
  {
    name: "negatives/not_legal.en.json",
    outputPath: "negatives/not_legal.en.json",
    prompt: `Generate domain negatives for legal in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "legal",
    "language": "en",
    "purpose": "Negative patterns to prevent false positive legal routing"
  },
  "negative_patterns": {
    "casual_legal_terms": {
      "patterns": [
        "legally blonde",
        "law of attraction",
        "Murphy's law",
        "law of physics",
        "in-laws",
        "brother-in-law"
      ],
      "reason": "Casual or non-legal use of legal terms"
    },
    "entertainment": {
      "patterns": [
        "Law & Order",
        "legal drama",
        "courtroom movie",
        "lawyer joke",
        "legal thriller"
      ],
      "reason": "Entertainment context"
    },
    "metaphorical": {
      "patterns": [
        "above the law",
        "lay down the law",
        "law unto themselves",
        "letter of the law"
      ],
      "reason": "Metaphorical expressions"
    },
    "academic_general": {
      "patterns": [
        "law school application",
        "study law",
        "law degree",
        "bar exam prep"
      ],
      "reason": "General academic context"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "case",
      "not_legal_when": ["phone case", "worst case", "case study", "briefcase", "in any case", "case sensitive"]
    },
    {
      "trigger": "court",
      "not_legal_when": ["basketball court", "tennis court", "food court", "court the lady", "royal court"]
    },
    {
      "trigger": "party",
      "not_legal_when": ["birthday party", "party time", "political party", "party animal"]
    },
    {
      "trigger": "sentence",
      "not_legal_when": ["complete sentence", "sentence structure", "run-on sentence"]
    },
    {
      "trigger": "bar",
      "not_legal_when": ["chocolate bar", "bar of soap", "raise the bar", "behind bars meaning prison colloquial"]
    }
  ]
}

Include 100+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Legal PT
  {
    name: "negatives/not_legal.pt.json",
    outputPath: "negatives/not_legal.pt.json",
    prompt: `Generate domain negatives for legal in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "legal",
    "language": "pt-BR",
    "purpose": "Padrões negativos para evitar roteamento falso positivo para jurídico"
  },
  "negative_patterns": {
    "termos_casuais": {
      "patterns": [
        "lei da física",
        "lei de Murphy",
        "sogra",
        "cunhado",
        "genro"
      ],
      "reason": "Uso casual de termos jurídicos"
    },
    "entretenimento": {
      "patterns": [
        "filme de tribunal",
        "série jurídica",
        "piada de advogado",
        "drama legal"
      ],
      "reason": "Contexto de entretenimento"
    },
    "metaforico": {
      "patterns": [
        "acima da lei",
        "fazer a lei",
        "lei da selva",
        "ao pé da letra"
      ],
      "reason": "Expressões metafóricas"
    },
    "academico_geral": {
      "patterns": [
        "vestibular direito",
        "faculdade de direito",
        "OAB prova",
        "estudar direito"
      ],
      "reason": "Contexto acadêmico geral"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "processo",
      "not_legal_when": ["processo de fabricação", "processo seletivo", "processo criativo", "processo químico"]
    },
    {
      "trigger": "juiz",
      "not_legal_when": ["juiz de futebol", "árbitro", "juiz do MasterChef"]
    },
    {
      "trigger": "sentença",
      "not_legal_when": ["sentença gramatical", "construir sentença", "sentença completa"]
    },
    {
      "trigger": "parte",
      "not_legal_when": ["fazer parte", "parte do corpo", "tomar partido"]
    },
    {
      "trigger": "direito",
      "not_legal_when": ["lado direito", "mão direita", "ir direto"]
    }
  ]
}

Include 100+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Medical EN
  {
    name: "negatives/not_medical.en.json",
    outputPath: "negatives/not_medical.en.json",
    prompt: `Generate domain negatives for medical in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "medical",
    "language": "en",
    "purpose": "Negative patterns to prevent false positive medical routing"
  },
  "negative_patterns": {
    "casual_health_mentions": {
      "patterns": [
        "feeling under the weather",
        "healthy snack",
        "health food store",
        "gym membership",
        "fitness routine"
      ],
      "reason": "Casual health/wellness context"
    },
    "metaphorical": {
      "patterns": [
        "sick of this",
        "pain in the neck",
        "headache of a problem",
        "cure for boredom",
        "infectious laughter"
      ],
      "reason": "Metaphorical use of medical terms"
    },
    "veterinary": {
      "patterns": [
        "dog's medication",
        "cat vet",
        "pet surgery",
        "animal hospital",
        "horse doctor"
      ],
      "reason": "Veterinary context"
    },
    "entertainment": {
      "patterns": [
        "Grey's Anatomy",
        "House MD",
        "medical drama",
        "doctor show",
        "ER episode"
      ],
      "reason": "Entertainment context"
    },
    "first_aid_basic": {
      "patterns": [
        "band-aid",
        "paper cut",
        "minor scrape",
        "ice pack",
        "first aid kit"
      ],
      "reason": "Basic first aid"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "shot",
      "not_medical_when": ["photo shot", "shot glass", "long shot", "screen shot", "shot at goal"]
    },
    {
      "trigger": "patient",
      "not_medical_when": ["be patient", "patient waiting", "patience is a virtue"]
    },
    {
      "trigger": "operation",
      "not_medical_when": ["military operation", "business operation", "math operation"]
    },
    {
      "trigger": "condition",
      "not_medical_when": ["weather condition", "road condition", "terms and conditions", "in good condition"]
    },
    {
      "trigger": "treatment",
      "not_medical_when": ["water treatment", "hair treatment", "spa treatment", "equal treatment"]
    }
  ]
}

Include 100+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Medical PT
  {
    name: "negatives/not_medical.pt.json",
    outputPath: "negatives/not_medical.pt.json",
    prompt: `Generate domain negatives for medical in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "medical",
    "language": "pt-BR",
    "purpose": "Padrões negativos para evitar roteamento falso positivo para médico"
  },
  "negative_patterns": {
    "mencoes_casuais_saude": {
      "patterns": [
        "lanche saudável",
        "loja de produtos naturais",
        "academia",
        "treino na academia"
      ],
      "reason": "Contexto casual de saúde/bem-estar"
    },
    "metaforico": {
      "patterns": [
        "de saco cheio",
        "dor de cabeça de problema",
        "doente de vontade",
        "remédio pro tédio"
      ],
      "reason": "Uso metafórico de termos médicos"
    },
    "veterinario": {
      "patterns": [
        "remédio do cachorro",
        "veterinário",
        "cirurgia do pet",
        "hospital veterinário"
      ],
      "reason": "Contexto veterinário"
    },
    "entretenimento": {
      "patterns": [
        "série de médico",
        "drama médico",
        "Grey's Anatomy",
        "episódio do hospital"
      ],
      "reason": "Contexto de entretenimento"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "paciente",
      "not_medical_when": ["ser paciente", "tenha paciência", "aguarde com paciência"]
    },
    {
      "trigger": "operação",
      "not_medical_when": ["operação militar", "operação comercial", "operação matemática", "operação policial"]
    },
    {
      "trigger": "condição",
      "not_medical_when": ["condição climática", "condições da estrada", "termos e condições"]
    },
    {
      "trigger": "tratamento",
      "not_medical_when": ["tratamento de água", "tratamento capilar", "tratamento spa", "tratamento igual"]
    },
    {
      "trigger": "dose",
      "not_medical_when": ["dose de humor", "dose de realidade", "boa dose de"]
    }
  ]
}

Include 100+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Accounting EN
  {
    name: "negatives/not_accounting.en.json",
    outputPath: "negatives/not_accounting.en.json",
    prompt: `Generate domain negatives for accounting in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "accounting",
    "language": "en",
    "purpose": "Negative patterns to prevent false positive accounting routing"
  },
  "negative_patterns": {
    "casual_counting": {
      "patterns": [
        "account for time",
        "on account of",
        "by all accounts",
        "take into account",
        "account of events"
      ],
      "reason": "Non-accounting use of 'account'"
    },
    "metaphorical": {
      "patterns": [
        "balance of power",
        "balance your life",
        "audit your habits",
        "ledger of memories"
      ],
      "reason": "Metaphorical use of accounting terms"
    },
    "basic_math": {
      "patterns": [
        "split evenly",
        "divide by",
        "add up the",
        "subtract from",
        "calculate the total"
      ],
      "reason": "Basic math, not accounting"
    },
    "personal_budgeting_casual": {
      "patterns": [
        "save for vacation",
        "spending money",
        "pocket money",
        "allowance"
      ],
      "reason": "Personal budgeting"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "balance",
      "not_accounting_when": ["balance beam", "balance of power", "work-life balance", "balance your diet", "off balance"]
    },
    {
      "trigger": "credit",
      "not_accounting_when": ["give credit", "credits roll", "credit where due", "photo credit"]
    },
    {
      "trigger": "debit",
      "not_accounting_when": ["debit card for shopping", "use my debit"]
    },
    {
      "trigger": "audit",
      "not_accounting_when": ["audit your life", "energy audit", "security audit"]
    },
    {
      "trigger": "ledger",
      "not_accounting_when": ["Heath Ledger", "ledger of history"]
    }
  ]
}

Include 80+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Negatives - Accounting PT
  {
    name: "negatives/not_accounting.pt.json",
    outputPath: "negatives/not_accounting.pt.json",
    prompt: `Generate domain negatives for accounting in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "accounting",
    "language": "pt-BR",
    "purpose": "Padrões negativos para evitar roteamento falso positivo para contabilidade"
  },
  "negative_patterns": {
    "contagem_casual": {
      "patterns": [
        "levar em conta",
        "dar conta",
        "por conta de",
        "prestar contas de atos"
      ],
      "reason": "Uso não-contábil de 'conta'"
    },
    "metaforico": {
      "patterns": [
        "equilibrar a vida",
        "balanço de poder",
        "auditar seus hábitos",
        "fazer o balanço da vida"
      ],
      "reason": "Uso metafórico de termos contábeis"
    },
    "matematica_basica": {
      "patterns": [
        "dividir igualmente",
        "somar tudo",
        "subtrair de",
        "calcular o total"
      ],
      "reason": "Matemática básica"
    },
    "financas_pessoais_casual": {
      "patterns": [
        "guardar pra viagem",
        "dinheiro de bolso",
        "mesada",
        "poupar dinheiro"
      ],
      "reason": "Finanças pessoais casuais"
    }
  },
  "disambiguation_rules": [
    {
      "trigger": "balanço",
      "not_accounting_when": ["balanço do corpo", "balanço de poder", "fazer balanço da vida"]
    },
    {
      "trigger": "crédito",
      "not_accounting_when": ["dar crédito", "créditos do filme", "crédito merecido"]
    },
    {
      "trigger": "débito",
      "not_accounting_when": ["cartão de débito pra compras", "usar meu débito"]
    },
    {
      "trigger": "conta",
      "not_accounting_when": ["por conta de", "dar conta", "levar em conta", "conta de luz básica"]
    },
    {
      "trigger": "ativo",
      "not_accounting_when": ["pessoa ativa", "vulcão ativo", "membro ativo"]
    }
  ]
}

Include 80+ patterns. Output ONLY valid JSON.`,
  },

  // Domain Templates - Clarify Templates EN
  {
    name: "templates/clarify.en.json",
    outputPath: "templates/clarify.en.json",
    prompt: `Generate clarification templates for all domains in English.

{
  "_meta": {
    "version": "1.0.0",
    "language": "en",
    "purpose": "Clarification prompt templates for ambiguous queries"
  },
  "clarify_templates": {
    "ambiguous_document": {
      "template": "I found multiple documents that could match your query. Could you specify which one you mean?\\n\\n{document_list}",
      "variables": ["document_list"]
    },
    "ambiguous_term": {
      "template": "The term \\"{term}\\" could refer to different things in your documents. Did you mean:\\n{options}",
      "variables": ["term", "options"]
    },
    "missing_context": {
      "template": "To give you a more accurate answer, could you clarify: {question}",
      "variables": ["question"]
    },
    "date_range_needed": {
      "template": "Your documents span multiple time periods. Which period are you interested in?\\n{periods}",
      "variables": ["periods"]
    },
    "multiple_entities": {
      "template": "I found {entity_type} for multiple entities. Which one did you mean?\\n{entity_list}",
      "variables": ["entity_type", "entity_list"]
    }
  },
  "domain_specific": {
    "finance": {
      "which_metric": "Which financial metric would you like me to focus on: {metrics}?",
      "which_period": "For which fiscal period: {periods}?",
      "which_account": "Which account are you referring to: {accounts}?"
    },
    "legal": {
      "which_party": "Which party are you asking about: {parties}?",
      "which_case": "I found multiple cases. Which one: {cases}?",
      "which_provision": "Which legal provision: {provisions}?"
    },
    "medical": {
      "which_patient": "Regarding which patient (if multiple in document)?",
      "which_medication": "Which medication: {medications}?",
      "which_condition": "Which condition: {conditions}?"
    },
    "accounting": {
      "which_entry": "Which journal entry: {entries}?",
      "which_account": "Which account: {accounts}?",
      "which_report": "Which report type: {reports}?"
    }
  },
  "fallback": {
    "general": "Could you provide more details about what you're looking for?",
    "no_documents": "I couldn't find any relevant documents. Could you rephrase your question or specify which document you're referring to?",
    "too_broad": "Your question is quite broad. Could you be more specific about what aspect you'd like to know?"
  }
}

Output ONLY valid JSON.`,
  },

  // Domain Templates - Clarify Templates PT
  {
    name: "templates/clarify.pt.json",
    outputPath: "templates/clarify.pt.json",
    prompt: `Generate clarification templates for all domains in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "language": "pt-BR",
    "purpose": "Templates de clarificação para consultas ambíguas"
  },
  "clarify_templates": {
    "ambiguous_document": {
      "template": "Encontrei vários documentos que podem corresponder à sua consulta. Você poderia especificar qual?\\n\\n{document_list}",
      "variables": ["document_list"]
    },
    "ambiguous_term": {
      "template": "O termo \\"{term}\\" pode se referir a coisas diferentes nos seus documentos. Você quis dizer:\\n{options}",
      "variables": ["term", "options"]
    },
    "missing_context": {
      "template": "Para dar uma resposta mais precisa, você poderia esclarecer: {question}",
      "variables": ["question"]
    },
    "date_range_needed": {
      "template": "Seus documentos abrangem vários períodos. Qual período você quer analisar?\\n{periods}",
      "variables": ["periods"]
    },
    "multiple_entities": {
      "template": "Encontrei {entity_type} para várias entidades. Qual você quis dizer?\\n{entity_list}",
      "variables": ["entity_type", "entity_list"]
    }
  },
  "domain_specific": {
    "finance": {
      "which_metric": "Qual métrica financeira você gostaria que eu focasse: {metrics}?",
      "which_period": "Para qual período fiscal: {periods}?",
      "which_account": "A qual conta você se refere: {accounts}?"
    },
    "legal": {
      "which_party": "Sobre qual parte você está perguntando: {parties}?",
      "which_case": "Encontrei vários processos. Qual deles: {cases}?",
      "which_provision": "Qual dispositivo legal: {provisions}?"
    },
    "medical": {
      "which_patient": "Sobre qual paciente (se houver vários no documento)?",
      "which_medication": "Qual medicamento: {medications}?",
      "which_condition": "Qual condição: {conditions}?"
    },
    "accounting": {
      "which_entry": "Qual lançamento contábil: {entries}?",
      "which_account": "Qual conta: {accounts}?",
      "which_report": "Qual tipo de relatório: {reports}?"
    }
  },
  "fallback": {
    "general": "Você poderia fornecer mais detalhes sobre o que está procurando?",
    "no_documents": "Não encontrei documentos relevantes. Poderia reformular sua pergunta ou especificar a qual documento se refere?",
    "too_broad": "Sua pergunta é bem ampla. Poderia ser mais específico sobre qual aspecto gostaria de saber?"
  }
}

Output ONLY valid JSON.`,
  },

  // Domain Templates - Answer Styles EN
  {
    name: "templates/answer_styles.en.json",
    outputPath: "templates/answer_styles.en.json",
    prompt: `Generate answer style templates for all domains in English.

{
  "_meta": {
    "version": "1.0.0",
    "language": "en",
    "purpose": "Answer formatting templates by domain and query type"
  },
  "answer_styles": {
    "default": {
      "structure": "direct_answer",
      "tone": "professional",
      "include_sources": true
    },
    "summary": {
      "structure": "bullet_points",
      "max_bullets": 5,
      "tone": "concise"
    },
    "comparison": {
      "structure": "table_or_list",
      "highlight_differences": true
    },
    "explanation": {
      "structure": "paragraph",
      "include_examples": true
    },
    "list": {
      "structure": "numbered_list",
      "include_details": true
    }
  },
  "domain_styles": {
    "finance": {
      "numeric_precision": 2,
      "currency_format": "symbol_prefix",
      "percentage_format": "with_symbol",
      "date_format": "MM/DD/YYYY",
      "table_preference": true,
      "include_disclaimers": true
    },
    "legal": {
      "citation_style": "bluebook",
      "formal_tone": true,
      "include_references": true,
      "caveat_required": true
    },
    "medical": {
      "use_lay_terms": false,
      "include_disclaimers": true,
      "hipaa_compliant": true,
      "reference_sources": true
    },
    "accounting": {
      "numeric_precision": 2,
      "show_calculations": true,
      "reference_standards": true,
      "debit_credit_format": true
    }
  },
  "response_templates": {
    "with_source": "{answer}\\n\\n📄 Source: {source}",
    "with_disclaimer": "{answer}\\n\\n⚠️ {disclaimer}",
    "not_found": "I couldn't find information about {topic} in your documents.",
    "partial_match": "Based on the available information: {answer}\\n\\nNote: Some details may be incomplete."
  }
}

Output ONLY valid JSON.`,
  },

  // Domain Templates - Answer Styles PT
  {
    name: "templates/answer_styles.pt.json",
    outputPath: "templates/answer_styles.pt.json",
    prompt: `Generate answer style templates for all domains in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "language": "pt-BR",
    "purpose": "Templates de formatação de resposta por domínio e tipo de consulta"
  },
  "answer_styles": {
    "default": {
      "structure": "resposta_direta",
      "tone": "profissional",
      "include_sources": true
    },
    "resumo": {
      "structure": "pontos_chave",
      "max_bullets": 5,
      "tone": "conciso"
    },
    "comparacao": {
      "structure": "tabela_ou_lista",
      "highlight_differences": true
    },
    "explicacao": {
      "structure": "paragrafo",
      "include_examples": true
    },
    "lista": {
      "structure": "lista_numerada",
      "include_details": true
    }
  },
  "domain_styles": {
    "finance": {
      "numeric_precision": 2,
      "currency_format": "R$ prefixo",
      "percentage_format": "com_simbolo",
      "date_format": "DD/MM/YYYY",
      "decimal_separator": ",",
      "thousand_separator": ".",
      "table_preference": true,
      "include_disclaimers": true
    },
    "legal": {
      "citation_style": "abnt",
      "formal_tone": true,
      "include_references": true,
      "caveat_required": true
    },
    "medical": {
      "use_lay_terms": false,
      "include_disclaimers": true,
      "lgpd_compliant": true,
      "reference_sources": true
    },
    "accounting": {
      "numeric_precision": 2,
      "show_calculations": true,
      "reference_standards": true,
      "debit_credit_format": true,
      "brazilian_standards": true
    }
  },
  "response_templates": {
    "with_source": "{answer}\\n\\n📄 Fonte: {source}",
    "with_disclaimer": "{answer}\\n\\n⚠️ {disclaimer}",
    "not_found": "Não encontrei informações sobre {topic} nos seus documentos.",
    "partial_match": "Com base nas informações disponíveis: {answer}\\n\\nNota: Alguns detalhes podem estar incompletos."
  }
}

Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Finance EN
  {
    name: "probes/finance.en.json",
    outputPath: "probes/finance.en.json",
    prompt: `Generate a comprehensive probe/test suite for finance domain routing in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "finance",
    "language": "en",
    "purpose": "Test queries to validate finance domain routing accuracy"
  },
  "positive_probes": [
    {
      "query": "What is the EBITDA margin for Q3 2024?",
      "expected_intent": "financial_metric",
      "expected_domain": "finance",
      "tags": ["metric", "quarterly"]
    },
    {
      "query": "Show me the revenue breakdown by segment",
      "expected_intent": "financial_analysis",
      "expected_domain": "finance",
      "tags": ["revenue", "segmentation"]
    },
    {
      "query": "Compare the P/E ratios",
      "expected_intent": "financial_comparison",
      "expected_domain": "finance"
    },
    // Include 100+ positive probes covering:
    // - Financial statements (income, balance sheet, cash flow)
    // - Financial ratios and metrics
    // - Investment analysis
    // - Market data queries
    // - Corporate finance queries
    // - Portfolio questions
    // - Valuation queries
  ],
  "negative_probes": [
    {
      "query": "What's the weather like?",
      "expected_domain": "general",
      "should_not_be": "finance"
    },
    {
      "query": "How do I cook pasta?",
      "expected_domain": "general",
      "should_not_be": "finance"
    },
    // Include 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "The stock is in the kitchen",
      "expected_domain": "general",
      "note": "stock as inventory/soup not financial"
    },
    {
      "query": "I have no interest in this",
      "expected_domain": "general",
      "note": "interest as attention not financial"
    }
    // Include 30+ edge cases
  ]
}

Include at least 100 positive probes, 50 negative probes, and 30 edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Finance PT
  {
    name: "probes/finance.pt.json",
    outputPath: "probes/finance.pt.json",
    prompt: `Generate a comprehensive probe/test suite for finance domain routing in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "finance",
    "language": "pt-BR",
    "purpose": "Consultas de teste para validar roteamento do domínio financeiro"
  },
  "positive_probes": [
    {
      "query": "Qual é a margem EBITDA do 3T2024?",
      "expected_intent": "financial_metric",
      "expected_domain": "finance",
      "tags": ["metrica", "trimestral"]
    },
    {
      "query": "Mostre a receita por segmento",
      "expected_intent": "financial_analysis",
      "expected_domain": "finance"
    },
    {
      "query": "Compare os índices P/L",
      "expected_intent": "financial_comparison",
      "expected_domain": "finance"
    },
    // 100+ positive probes for PT-BR finance queries
  ],
  "negative_probes": [
    {
      "query": "Como está o tempo?",
      "expected_domain": "general",
      "should_not_be": "finance"
    },
    {
      "query": "Receita de bolo de chocolate",
      "expected_domain": "general",
      "should_not_be": "finance",
      "note": "receita as recipe not revenue"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "Tenho ações de graças",
      "expected_domain": "general",
      "note": "ações as actions not stocks"
    },
    {
      "query": "Sem interesse algum",
      "expected_domain": "general",
      "note": "interesse as attention not financial"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Legal EN
  {
    name: "probes/legal.en.json",
    outputPath: "probes/legal.en.json",
    prompt: `Generate a comprehensive probe/test suite for legal domain routing in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "legal",
    "language": "en",
    "purpose": "Test queries to validate legal domain routing accuracy"
  },
  "positive_probes": [
    {
      "query": "What are the terms of the indemnification clause?",
      "expected_intent": "contract_analysis",
      "expected_domain": "legal"
    },
    {
      "query": "List all parties to the agreement",
      "expected_intent": "party_identification",
      "expected_domain": "legal"
    },
    {
      "query": "When does the non-compete expire?",
      "expected_intent": "term_lookup",
      "expected_domain": "legal"
    },
    // 100+ positive probes covering:
    // - Contract analysis
    // - Case law
    // - Regulatory compliance
    // - Litigation
    // - Corporate governance
    // - IP/trademark
    // - Employment law
  ],
  "negative_probes": [
    {
      "query": "My brother-in-law is visiting",
      "expected_domain": "general",
      "should_not_be": "legal"
    },
    {
      "query": "Law of gravity explanation",
      "expected_domain": "general",
      "should_not_be": "legal"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "The court is slippery after rain",
      "expected_domain": "general",
      "note": "court as basketball/tennis court"
    },
    {
      "query": "That's my case for the phone",
      "expected_domain": "general",
      "note": "case as phone cover"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Legal PT
  {
    name: "probes/legal.pt.json",
    outputPath: "probes/legal.pt.json",
    prompt: `Generate a comprehensive probe/test suite for legal domain routing in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "legal",
    "language": "pt-BR",
    "purpose": "Consultas de teste para validar roteamento do domínio jurídico"
  },
  "positive_probes": [
    {
      "query": "Quais são os termos da cláusula de indenização?",
      "expected_intent": "contract_analysis",
      "expected_domain": "legal"
    },
    {
      "query": "Liste as partes do contrato",
      "expected_intent": "party_identification",
      "expected_domain": "legal"
    },
    {
      "query": "Quando vence a cláusula de não-competição?",
      "expected_intent": "term_lookup",
      "expected_domain": "legal"
    },
    // 100+ positive probes for Brazilian legal context
  ],
  "negative_probes": [
    {
      "query": "Meu cunhado vem visitar",
      "expected_domain": "general",
      "should_not_be": "legal"
    },
    {
      "query": "Lei da física explicação",
      "expected_domain": "general",
      "should_not_be": "legal"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "A quadra está escorregadia",
      "expected_domain": "general",
      "note": "quadra as sports court"
    },
    {
      "query": "O processo de fabricação",
      "expected_domain": "general",
      "note": "processo as manufacturing process"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Medical EN
  {
    name: "probes/medical.en.json",
    outputPath: "probes/medical.en.json",
    prompt: `Generate a comprehensive probe/test suite for medical domain routing in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "medical",
    "language": "en",
    "purpose": "Test queries to validate medical domain routing accuracy"
  },
  "positive_probes": [
    {
      "query": "What medications is the patient currently taking?",
      "expected_intent": "medication_list",
      "expected_domain": "medical"
    },
    {
      "query": "Show the lab results from last visit",
      "expected_intent": "lab_results",
      "expected_domain": "medical"
    },
    {
      "query": "What is the primary diagnosis?",
      "expected_intent": "diagnosis_lookup",
      "expected_domain": "medical"
    },
    // 100+ positive probes covering:
    // - Patient records
    // - Medications
    // - Lab results
    // - Diagnoses
    // - Procedures
    // - Vital signs
    // - Medical history
  ],
  "negative_probes": [
    {
      "query": "I'm sick of this weather",
      "expected_domain": "general",
      "should_not_be": "medical"
    },
    {
      "query": "My dog needs medication",
      "expected_domain": "general",
      "should_not_be": "medical",
      "note": "veterinary context"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "Be patient with the process",
      "expected_domain": "general",
      "note": "patient as adjective"
    },
    {
      "query": "Shot of espresso",
      "expected_domain": "general",
      "note": "shot as beverage not injection"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Medical PT
  {
    name: "probes/medical.pt.json",
    outputPath: "probes/medical.pt.json",
    prompt: `Generate a comprehensive probe/test suite for medical domain routing in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "medical",
    "language": "pt-BR",
    "purpose": "Consultas de teste para validar roteamento do domínio médico"
  },
  "positive_probes": [
    {
      "query": "Quais medicamentos o paciente está tomando?",
      "expected_intent": "medication_list",
      "expected_domain": "medical"
    },
    {
      "query": "Mostre os resultados dos exames da última consulta",
      "expected_intent": "lab_results",
      "expected_domain": "medical"
    },
    {
      "query": "Qual é o diagnóstico principal?",
      "expected_intent": "diagnosis_lookup",
      "expected_domain": "medical"
    },
    // 100+ positive probes for Brazilian medical context
  ],
  "negative_probes": [
    {
      "query": "Estou doente de vontade de viajar",
      "expected_domain": "general",
      "should_not_be": "medical"
    },
    {
      "query": "Meu cachorro precisa de remédio",
      "expected_domain": "general",
      "should_not_be": "medical"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "Seja paciente com o processo",
      "expected_domain": "general",
      "note": "paciente as adjective"
    },
    {
      "query": "Dose de humor",
      "expected_domain": "general",
      "note": "dose metaphorical"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Accounting EN
  {
    name: "probes/accounting.en.json",
    outputPath: "probes/accounting.en.json",
    prompt: `Generate a comprehensive probe/test suite for accounting domain routing in English.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "accounting",
    "language": "en",
    "purpose": "Test queries to validate accounting domain routing accuracy"
  },
  "positive_probes": [
    {
      "query": "What is the balance in accounts receivable?",
      "expected_intent": "account_balance",
      "expected_domain": "accounting"
    },
    {
      "query": "Show the journal entries for depreciation",
      "expected_intent": "journal_entry",
      "expected_domain": "accounting"
    },
    {
      "query": "What is the total accrued expense?",
      "expected_intent": "accrual_lookup",
      "expected_domain": "accounting"
    },
    // 100+ positive probes covering:
    // - General ledger
    // - Journal entries
    // - Account balances
    // - Trial balance
    // - Reconciliations
    // - Cost accounting
    // - Tax accounting
  ],
  "negative_probes": [
    {
      "query": "Take into account my preferences",
      "expected_domain": "general",
      "should_not_be": "accounting"
    },
    {
      "query": "Balance your work and life",
      "expected_domain": "general",
      "should_not_be": "accounting"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "Credit where credit is due",
      "expected_domain": "general",
      "note": "credit as acknowledgment"
    },
    {
      "query": "Heath Ledger movies",
      "expected_domain": "general",
      "note": "ledger as name not accounting"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },

  // Domain Probe Suite - Accounting PT
  {
    name: "probes/accounting.pt.json",
    outputPath: "probes/accounting.pt.json",
    prompt: `Generate a comprehensive probe/test suite for accounting domain routing in Brazilian Portuguese.

{
  "_meta": {
    "version": "1.0.0",
    "domain": "accounting",
    "language": "pt-BR",
    "purpose": "Consultas de teste para validar roteamento do domínio contábil"
  },
  "positive_probes": [
    {
      "query": "Qual é o saldo de contas a receber?",
      "expected_intent": "account_balance",
      "expected_domain": "accounting"
    },
    {
      "query": "Mostre os lançamentos de depreciação",
      "expected_intent": "journal_entry",
      "expected_domain": "accounting"
    },
    {
      "query": "Qual o total de provisões?",
      "expected_intent": "accrual_lookup",
      "expected_domain": "accounting"
    },
    // 100+ positive probes for Brazilian accounting context
  ],
  "negative_probes": [
    {
      "query": "Leve em conta minhas preferências",
      "expected_domain": "general",
      "should_not_be": "accounting"
    },
    {
      "query": "Equilibre trabalho e vida",
      "expected_domain": "general",
      "should_not_be": "accounting"
    }
    // 50+ negative probes
  ],
  "edge_cases": [
    {
      "query": "Dar crédito a quem merece",
      "expected_domain": "general",
      "note": "crédito as acknowledgment"
    },
    {
      "query": "Por conta do atraso",
      "expected_domain": "general",
      "note": "conta as because of"
    }
    // 30+ edge cases
  ]
}

Include 100+ positive, 50+ negative, 30+ edge cases. Output ONLY valid JSON.`,
  },
];

async function generateContent(task: GenerationTask): Promise<string> {
  console.log(`\n📝 Generating: ${task.name}`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: task.prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content.text.trim();

  // Remove markdown code blocks - handle both opening and closing
  // Pattern: ```json or ``` at start, ``` at end
  if (jsonStr.startsWith("```")) {
    // Remove opening fence (```json or ```)
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "");
  }
  if (jsonStr.endsWith("```")) {
    // Remove closing fence
    jsonStr = jsonStr.replace(/\n?```\s*$/, "");
  }

  jsonStr = jsonStr.trim();

  // If still has backticks, try to extract JSON object/array
  if (jsonStr.includes("```") || !jsonStr.startsWith("{")) {
    // Try to find JSON object
    const jsonStart = jsonStr.indexOf("{");
    const jsonEnd = jsonStr.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }
  }

  // Validate JSON
  try {
    JSON.parse(jsonStr);
  } catch (e) {
    console.error(`❌ Invalid JSON for ${task.name}:`, e);
    console.error(`First 500 chars: ${jsonStr.substring(0, 500)}`);
    console.error(`Last 200 chars: ${jsonStr.substring(jsonStr.length - 200)}`);
    throw e;
  }

  return jsonStr;
}

async function saveFile(outputPath: string, content: string): Promise<void> {
  const fullPath = path.join(DATA_BANKS_DIR, outputPath);
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, "utf-8");
  console.log(`✅ Saved: ${fullPath}`);
}

async function main() {
  console.log("🚀 Starting domain data generation...\n");
  console.log(`📁 Output directory: ${DATA_BANKS_DIR}`);
  console.log(`📋 Tasks to generate: ${TASKS.length}\n`);

  // Create directories if needed
  const dirs = ["lexicons", "extractors", "negatives", "templates", "probes"];
  for (const dir of dirs) {
    const fullDir = path.join(DATA_BANKS_DIR, dir);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
  }

  let completed = 0;
  let failed = 0;

  for (const task of TASKS) {
    try {
      const content = await generateContent(task);
      await saveFile(task.outputPath, content);
      completed++;

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Failed: ${task.name}`, error);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ Completed: ${completed}/${TASKS.length}`);
  console.log(`❌ Failed: ${failed}/${TASKS.length}`);
}

main().catch(console.error);
