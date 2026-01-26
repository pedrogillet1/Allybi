/**
 * Data Bank Registry - Single source of truth for all JSON data banks
 *
 * This registry defines every data bank that the system uses, with metadata
 * about type, language support, source, and whether it's required or optional.
 *
 * RULES:
 * 1. Every JSON file used by runtime MUST be registered here
 * 2. Files not in registry are considered DEPRECATED
 * 3. Generated files are marked with source: 'generated'
 */

export type BankLanguage = 'en' | 'pt' | 'both' | 'any';
export type BankSource = 'hand' | 'generated' | 'hybrid';
export type BankType =
  | 'prompts'      // System prompts, templates
  | 'styles'       // Answer styles, formatting
  | 'patterns'     // Intent patterns, routing
  | 'policies'     // Validation, retrieval policies
  | 'vocab'        // Domain vocabulary, synonyms
  | 'localization' // Error messages, UI text
  | 'schema'       // JSON schemas for validation
  | 'config';      // Configuration

export interface DataBankEntry {
  id: string;                   // Unique identifier (used by loader)
  filename: string;             // Actual JSON filename
  type: BankType;
  language: BankLanguage;       // Language dimension
  source: BankSource;
  required: boolean;            // Fail boot if missing?
  description: string;
  consumers: string[];          // Services that use this bank
  deprecatedAliases?: string[]; // Old filenames that map to this
  version?: string;
}

/**
 * CANONICAL REGISTRY of all data banks
 *
 * Organized by usage category. Every file loaded at runtime must be here.
 */
export const DATA_BANK_REGISTRY: DataBankEntry[] = [
  // ========== CORE PROMPTS & STYLES ==========
  {
    id: 'system_prompts',
    filename: 'system_prompts.json',
    type: 'prompts',
    language: 'both',
    source: 'hand',
    required: true,
    description: 'Core system prompts for Claude conversations',
    consumers: ['promptConfig.service'],
  },
  {
    id: 'answer_styles',
    filename: 'answer_styles.json',
    type: 'styles',
    language: 'both',
    source: 'hand',
    required: true,
    description: 'Answer style definitions per intent',
    consumers: ['promptConfig.service', 'brainDataLoader.service'],
  },
  {
    id: 'answer_examples',
    filename: 'answer_examples.json',
    type: 'styles',
    language: 'both',
    source: 'hand',
    required: true,
    description: 'Example answers for few-shot prompting',
    consumers: ['promptConfig.service'],
  },

  // ========== INTENT PATTERNS & ROUTING ==========
  {
    id: 'intent_patterns_runtime',
    filename: 'intent_patterns.runtime.json',
    type: 'patterns',
    language: 'both',
    source: 'hand',
    required: true,
    description: 'Runtime intent patterns (primary routing file)',
    consumers: ['intentConfig.service', 'routingPriority.service'],
  },
  {
    id: 'routing_priority',
    filename: 'routing_priority.json',
    type: 'patterns',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'Intent routing priority rules',
    consumers: ['domainEnforcement.service'],
  },
  {
    id: 'routing_tiebreakers',
    filename: 'routing_tiebreakers.json',
    type: 'patterns',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'Tiebreaker rules for routing conflicts',
    consumers: ['routingTiebreakers.service'],
  },

  // ========== POLICIES ==========
  {
    id: 'validation_policies',
    filename: 'validation_policies.json',
    type: 'policies',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'Output validation rules',
    consumers: ['promptConfig.service', 'brainDataLoader.service'],
  },
  {
    id: 'retrieval_policies',
    filename: 'retrieval_policies.json',
    type: 'policies',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'RAG retrieval policies',
    consumers: ['promptConfig.service'],
  },
  {
    id: 'policies_any',
    filename: 'formatting/policies.any.json',
    type: 'policies',
    language: 'any',
    source: 'hand',
    required: true,
    description: 'Operator contracts, evidence policy, language policy, followup policy',
    consumers: ['kodaFormattingPipelineV3.service', 'kodaOrchestratorV3.service'],
    version: '1.0.0',
  },
  {
    id: 'validators_any',
    filename: 'formatting/validators.any.json',
    type: 'policies',
    language: 'any',
    source: 'hand',
    required: true,
    description: 'Output validators including contract enforcement (button_only, file_list, sources)',
    consumers: ['kodaFormattingPipelineV3.service', 'kodaOrchestratorV3.service'],
    version: '1.0.0',
  },
  {
    id: 'routing_rules_any',
    filename: 'routing/routing_rules.any.json',
    type: 'patterns',
    language: 'any',
    source: 'hand',
    required: true,
    description: 'Bank-driven routing rules (boost/dampen signals)',
    consumers: ['routingPriority.service'],
    version: '1.0.0',
  },

  // ========== VOCABULARY & SYNONYMS ==========
  {
    id: 'acronyms',
    filename: 'acronyms.json',
    type: 'vocab',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Acronym expansions',
    consumers: ['kodaOrchestratorV3.service'],
  },
  {
    id: 'doc_query_synonyms',
    filename: 'doc_query_synonyms.json',
    type: 'vocab',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Document query synonyms for search',
    consumers: ['promptConfig.service', 'brainDataLoader.service'],
  },
  {
    id: 'doc_aliases',
    filename: 'doc_aliases.json',
    type: 'vocab',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Document filename aliases',
    consumers: ['promptConfig.service'],
  },

  // ========== FORMATTING & MARKDOWN ==========
  {
    id: 'markdown_components',
    filename: 'markdown_components.json',
    type: 'styles',
    language: 'any',
    source: 'hand',
    required: true,
    description: 'Markdown formatting components',
    consumers: ['promptConfig.service'],
  },
  {
    id: 'table_presets',
    filename: 'table_presets.json',
    type: 'styles',
    language: 'any',
    source: 'hand',
    required: true,
    description: 'Table formatting presets',
    consumers: ['promptConfig.service'],
  },

  // ========== LOCALIZATION ==========
  {
    id: 'error_localization',
    filename: 'error_localization.json',
    type: 'localization',
    language: 'both',
    source: 'hand',
    required: true,
    description: 'Localized error messages',
    consumers: ['promptConfig.service'],
  },
  {
    id: 'debug_labels',
    filename: 'debug_labels.json',
    type: 'localization',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'Debug output labels',
    consumers: ['promptConfig.service'],
  },
  {
    id: 'language_profiles',
    filename: 'language_profiles.json',
    type: 'localization',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Language-specific profiles',
    consumers: ['promptConfig.service'],
  },

  // ========== PRODUCT HELP ==========
  {
    id: 'koda_product_help',
    filename: 'koda_product_help.json',
    type: 'prompts',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Koda product help content',
    consumers: ['promptConfig.service', 'kodaProductHelpV3.service'],
  },
  {
    id: 'capabilities_catalog',
    filename: 'capabilities_catalog.json',
    type: 'prompts',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Koda capabilities catalog',
    consumers: ['promptConfig.service', 'kodaProductHelpV3.service'],
  },

  // ========== FALLBACKS & CONFIG ==========
  {
    id: 'fallbacks',
    filename: 'fallbacks.json',
    type: 'config',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Fallback responses',
    consumers: ['promptConfig.service', 'kodaOrchestratorV3.service', 'fallbackConfig.service'],
  },
  {
    id: 'analytics_phrases',
    filename: 'analytics_phrases.json',
    type: 'vocab',
    language: 'both',
    source: 'hand',
    required: false,
    description: 'Analytics trigger phrases',
    consumers: ['promptConfig.service'],
  },

  // ========== DOMAIN SCHEMAS ==========
  {
    id: 'calculation_schemas',
    filename: 'calculation_schemas.json',
    type: 'schema',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'Calculation validation schemas',
    consumers: ['domainEnforcement.service'],
  },
  {
    id: 'intent_schema',
    filename: 'intent_schema.json',
    type: 'schema',
    language: 'any',
    source: 'hand',
    required: false,
    description: 'Intent classification schema',
    consumers: ['domainEnforcement.service'],
  },

  // ========== GENERATED DATA BANKS ==========
  {
    id: 'entity_normalization',
    filename: 'entity_normalization_v1.json',
    type: 'vocab',
    language: 'both',
    source: 'generated',
    required: false,
    description: 'Entity normalization rules (company names, etc)',
    consumers: [],
    version: '1.0.0',
  },
  {
    id: 'phrasing_controls',
    filename: 'phrasing_controls_v1.json',
    type: 'styles',
    language: 'both',
    source: 'generated',
    required: false,
    description: 'Phrasing control rules for answers',
    consumers: [],
    version: '1.0.0',
  },
];

// ========== REGISTRY HELPERS ==========

/**
 * Get bank entry by ID
 */
export function getBankEntry(id: string): DataBankEntry | undefined {
  return DATA_BANK_REGISTRY.find(b => b.id === id);
}

/**
 * Get bank entry by filename
 */
export function getBankByFilename(filename: string): DataBankEntry | undefined {
  return DATA_BANK_REGISTRY.find(b =>
    b.filename === filename ||
    b.deprecatedAliases?.includes(filename)
  );
}

/**
 * Get all required banks
 */
export function getRequiredBanks(): DataBankEntry[] {
  return DATA_BANK_REGISTRY.filter(b => b.required);
}

/**
 * Get all generated banks
 */
export function getGeneratedBanks(): DataBankEntry[] {
  return DATA_BANK_REGISTRY.filter(b => b.source === 'generated');
}

/**
 * Get banks by type
 */
export function getBanksByType(type: BankType): DataBankEntry[] {
  return DATA_BANK_REGISTRY.filter(b => b.type === type);
}

/**
 * Get banks by consumer service
 */
export function getBanksByConsumer(serviceName: string): DataBankEntry[] {
  return DATA_BANK_REGISTRY.filter(b =>
    b.consumers.some(c => c.includes(serviceName))
  );
}

/**
 * List of known DEPRECATED/UNUSED files (not in registry)
 * These should eventually be deleted or moved to archive
 */
export const DEPRECATED_FILES = [
  'audit_report_schema.json',
  'depth_schema.json',
  'disclaimer_policy.json',
  'domain_activation.json',
  'domain_labels.json',
  'domain_layers.json',
  'domain_schema.json',
  'evaluation_metrics.json',
  'failure_modes.json',
  'file_actions_schema.json',
  'file_integrity_policy.json',
  'intent_labels.json',
  'intent_patterns.backup.json',
  'intent_patterns.json',
  'intent_patterns.training.backup.json',
  'memory_schema.json',
  'negative_triggers.json',
  'output_schema.json',
  'preferences_schema.json',
  'regex_fix_report.json',
  'training_dataset_schema.json',
];
