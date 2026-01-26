/**
 * Zod schemas for all data bank types
 */

import { z } from "zod";

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const TriggerPatternSchema = z.object({
  id: z.union([z.string(), z.number()]),
  pattern: z.string().min(1),
  priority: z.number().min(0).max(100).optional().default(50),
  category: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

export const NegativePatternSchema = z.object({
  id: z.union([z.string(), z.number()]),
  pattern: z.string().min(1),
  blocks: z.string().optional(), // Which intent this pattern blocks
  priority: z.number().min(0).max(100).optional().default(70),
  reason: z.string().optional(),
});

export const OverlayPatternSchema = z.object({
  id: z.union([z.string(), z.number()]),
  pattern: z.string().min(1),
  priority: z.number().min(0).max(100).optional().default(60),
  type: z.enum(["followup_inherit", "format_request", "clarify_required"]).optional(),
});

export const FormattingPatternSchema = z.object({
  id: z.union([z.string(), z.number()]),
  pattern: z.string().min(1),
  extractCount: z.boolean().optional().default(false),
  format: z.string().optional(),
});

export const NormalizerRuleSchema = z.object({
  id: z.union([z.string(), z.number()]),
  from: z.string().optional(),
  to: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  pattern: z.string().optional(),
  replacement: z.string().optional(),
  type: z.string().optional(),
});

export const LexiconTermSchema = z.object({
  id: z.union([z.string(), z.number()]),
  term: z.string().optional(),
  en: z.string().optional(),
  pt: z.string().optional(),
  aliases_en: z.array(z.string()).optional(),
  aliases_pt: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  domain: z.string().optional(),
  category: z.string().optional(),
});

// ============================================================================
// ARRAY SCHEMAS
// ============================================================================

export const TriggerBankSchema = z.array(TriggerPatternSchema);
export const NegativeBankSchema = z.array(NegativePatternSchema);
export const OverlayBankSchema = z.array(OverlayPatternSchema);
export const FormattingBankSchema = z.array(FormattingPatternSchema);
export const NormalizerBankSchema = z.array(NormalizerRuleSchema);
export const LexiconBankSchema = z.array(LexiconTermSchema);

// ============================================================================
// BANK TYPE DETECTION
// ============================================================================

export type BankType = "trigger" | "negative" | "overlay" | "formatting" | "normalizer" | "lexicon" | "unknown";

export function detectBankType(filePath: string): BankType {
  const path = filePath.toLowerCase();

  if (path.includes("/triggers/") || path.includes("/trigger")) {
    if (path.includes("overlay_")) {
      return "overlay";
    }
    return "trigger";
  }
  if (path.includes("/negatives/") || path.includes("/negative")) {
    return "negative";
  }
  if (path.includes("/overlays/")) {
    return "overlay";
  }
  if (path.includes("/formatting/")) {
    return "formatting";
  }
  if (path.includes("/normalizers/") || path.includes("/normalizer")) {
    return "normalizer";
  }
  if (path.includes("/lexicons/") || path.includes("/lexicon")) {
    return "lexicon";
  }

  return "unknown";
}

export function getSchemaForType(type: BankType): z.ZodArray<any> | null {
  switch (type) {
    case "trigger":
      return TriggerBankSchema;
    case "negative":
      return NegativeBankSchema;
    case "overlay":
      return OverlayBankSchema;
    case "formatting":
      return FormattingBankSchema;
    case "normalizer":
      return NormalizerBankSchema;
    case "lexicon":
      return LexiconBankSchema;
    default:
      return null;
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  count: number;
}

export function validateBank(data: unknown, type: BankType): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    count: 0,
  };

  if (!Array.isArray(data)) {
    result.valid = false;
    result.errors.push("Bank data must be an array");
    return result;
  }

  result.count = data.length;

  const schema = getSchemaForType(type);
  if (!schema) {
    result.warnings.push(`No schema defined for type: ${type}`);
    return result;
  }

  const parseResult = schema.safeParse(data);
  if (!parseResult.success) {
    result.valid = false;
    for (const issue of parseResult.error.issues) {
      result.errors.push(`[${issue.path.join(".")}] ${issue.message}`);
    }
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const item of data) {
    const id = String(item.id);
    if (ids.has(id)) {
      result.warnings.push(`Duplicate ID found: ${id}`);
    }
    ids.add(id);
  }

  return result;
}

// ============================================================================
// TARGET COUNTS (from mission specification)
// ============================================================================

export interface TargetCounts {
  [key: string]: {
    en: number;
    pt: number;
    shared?: number;
  };
}

export const PRIMARY_INTENT_TARGETS: TargetCounts = {
  documents: { en: 260, pt: 260 },
  file_actions: { en: 200, pt: 200 },
  help: { en: 120, pt: 120 },
  conversation: { en: 60, pt: 60 },
  edit: { en: 80, pt: 80 },
  reasoning: { en: 80, pt: 80 },
  memory: { en: 40, pt: 40 },
  preferences: { en: 40, pt: 40 },
  extraction: { en: 80, pt: 80 },
  error: { en: 40, pt: 40 },
  excel: { en: 40, pt: 40 },
  finance: { en: 60, pt: 60 },
  accounting: { en: 50, pt: 50 },
  legal: { en: 60, pt: 60 },
  medical: { en: 60, pt: 60 },
  engineering: { en: 50, pt: 50 },
};

export const DECISION_FAMILY_TARGETS: TargetCounts = {
  documents: { en: 120, pt: 120 },
  files: { en: 110, pt: 110 },
  help: { en: 50, pt: 50 },
  edit: { en: 40, pt: 40 },
  reasoning: { en: 40, pt: 40 },
  conversation: { en: 25, pt: 25 },
  memory: { en: 15, pt: 15 },
  preferences: { en: 10, pt: 10 },
  extraction: { en: 20, pt: 20 },
  error: { en: 10, pt: 10 },
};

export const DOCUMENTS_SUBINTENT_TARGETS: TargetCounts = {
  factual: { en: 140, pt: 140 },
  summary: { en: 120, pt: 120 },
  compare: { en: 110, pt: 110 },
  analytics: { en: 110, pt: 110 },
  extract: { en: 130, pt: 130 },
  manage: { en: 70, pt: 70 },
  search: { en: 140, pt: 140 },
  recommend: { en: 50, pt: 50 },
  stats: { en: 80, pt: 80 },
  count: { en: 90, pt: 90 },
  table: { en: 70, pt: 70 },
  filter_extension: { en: 70, pt: 70 },
  folder_path: { en: 60, pt: 60 },
  group_by_folder: { en: 60, pt: 60 },
  largest: { en: 40, pt: 40 },
  smallest: { en: 25, pt: 25 },
  most_recent: { en: 40, pt: 40 },
  name_contains: { en: 45, pt: 45 },
};

export const FILE_ACTIONS_SUBINTENT_TARGETS: TargetCounts = {
  list_all: { en: 90, pt: 90 },
  list_folder: { en: 70, pt: 70 },
  list_files: { en: 70, pt: 70 },
  list_folders: { en: 70, pt: 70 },
  location: { en: 100, pt: 100 },
  open: { en: 90, pt: 90 },
  preview: { en: 70, pt: 70 },
  search: { en: 100, pt: 100 },
  type_filter: { en: 80, pt: 80 },
  type_search: { en: 50, pt: 50 },
  newest_type: { en: 60, pt: 60 },
  semantic: { en: 80, pt: 80 },
  semantic_folder: { en: 50, pt: 50 },
  topic_search: { en: 70, pt: 70 },
  same_folder: { en: 35, pt: 35 },
  folder_ops: { en: 80, pt: 80 },
  again: { en: 45, pt: 45 },
  default: { en: 20, pt: 20 },
};

export const NEGATIVE_TARGETS: TargetCounts = {
  block_file_actions_when_content: { en: 240, pt: 240 },
  block_help_when_content: { en: 200, pt: 200 },
  block_conversation_when_doc: { en: 120, pt: 120 },
  block_finance_when_no_terms: { en: 140, pt: 140 },
  block_inventory_when_doc_stats: { en: 100, pt: 100 },
  block_exact_filename_fuzzy: { en: 60, pt: 60 },
  force_clarify_empty_sources: { en: 40, pt: 40 },
};

export const OVERLAY_TARGETS: TargetCounts = {
  followup_inherit_pronoun: { en: 200, pt: 200 },
  followup_inherit_continuation: { en: 120, pt: 120 },
  format_request_list: { en: 180, pt: 180 },
  format_request_table: { en: 90, pt: 90 },
  format_request_sentence: { en: 45, pt: 45 },
  format_request_line: { en: 45, pt: 45 },
  clarify_ambiguous_doc: { en: 80, pt: 80 },
  clarify_multiple_files: { en: 60, pt: 60 },
  clarify_not_found: { en: 60, pt: 60 },
};

export const NORMALIZER_TARGETS: TargetCounts = {
  filename: { en: 0, pt: 0, shared: 320 },
  months: { en: 0, pt: 0, shared: 450 },
  quarters: { en: 0, pt: 0, shared: 200 },
  time_windows: { en: 200, pt: 200 },
  typos: { en: 0, pt: 0, shared: 250 },
  diacritics: { en: 0, pt: 0, shared: 160 },
  numbers_currency: { en: 0, pt: 0, shared: 350 },
};

export const LEXICON_TARGETS: TargetCounts = {
  finance: { en: 0, pt: 0, shared: 900 },
  accounting: { en: 0, pt: 0, shared: 750 },
  legal: { en: 0, pt: 0, shared: 900 },
  medical: { en: 0, pt: 0, shared: 2500 },
  engineering: { en: 0, pt: 0, shared: 600 },
  project_agile: { en: 0, pt: 0, shared: 350 },
  marketing_service_quality: { en: 0, pt: 0, shared: 500 },
  analytics_telemetry: { en: 0, pt: 0, shared: 300 },
  ui_navigation: { en: 0, pt: 0, shared: 200 },
};
