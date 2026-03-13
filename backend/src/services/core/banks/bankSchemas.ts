import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas for the top-10 most-accessed data banks.
//
// Design principles:
//   • Partial / loose: only validate keys that callers actually depend on.
//   • .passthrough() on every object so unknown keys are preserved (banks
//     evolve faster than consuming code).
//   • Kept in one file so the import cost is a single module.
// ---------------------------------------------------------------------------

// memory_policy — used by ConversationMemoryService, evidenceGate, memoryPolicyEngine
export const MemoryPolicySchema = z.object({
  _meta: z.object({ id: z.string(), version: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
    runtimeTuning: z.object({
      inMemoryMessageCacheLimit: z.number(),
      inMemoryConversationCacheLimit: z.number().optional(),
      inMemoryCacheTtlSeconds: z.number().optional(),
      recentContextLimit: z.number().optional(),
      historyClampMax: z.number().optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

// answer_style_policy — used by composer, profile selector, block planner
export const AnswerStylePolicySchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  profiles: z.record(z.string(), z.object({
    name: z.string().optional(),
    budget: z.object({
      maxChars: z.number().optional(),
    }).passthrough().optional(),
  }).passthrough()).optional(),
}).passthrough();

// banned_phrases — used by post-processing enforcer
export const BannedPhrasesSchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  patterns: z.array(z.object({
    id: z.string(),
    regex: z.string(),
  }).passthrough()).optional(),
}).passthrough();

// prompt_registry — used by promptRegistry.service, llmRequestBuilder
export const PromptRegistrySchema = z.object({
  _meta: z.object({
    id: z.string(),
    version: z.string().optional(),
    description: z.string().optional(),
  }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  promptFiles: z.array(z.object({
    id: z.string(),
    path: z.string().optional(),
    required: z.boolean().optional(),
  }).passthrough()).optional(),
  layersByKind: z.object({
    system: z.array(z.string()).optional(),
    retrieval: z.array(z.string()).optional(),
    compose_answer: z.array(z.string()).optional(),
    disambiguation: z.array(z.string()).optional(),
    fallback: z.array(z.string()).optional(),
    tool: z.array(z.string()).optional(),
  }).passthrough().optional(),
  map: z.object({
    system: z.string().optional(),
    retrieval: z.string().optional(),
    compose_answer: z.string().optional(),
    disambiguation: z.string().optional(),
    fallback: z.string().optional(),
    tool: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

// quality_gates — used by quality gate runner, responseContractEnforcer
export const QualityGatesSchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  gates: z.record(z.string(), z.object({
    enabled: z.boolean().optional(),
  }).passthrough()).optional(),
}).passthrough();

// feature_flags — used by feature flag evaluator across all services
export const FeatureFlagsSchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  flags: z.array(z.object({
    id: z.string(),
    type: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

// intent_patterns — used by intentEngine routing
export const IntentPatternsSchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
}).passthrough();

// bank_registry — used by BankLoaderService, wiring integrity checks
export const BankRegistrySchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  banks: z.array(z.object({
    id: z.string(),
    category: z.string().optional(),
    path: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

// ui_contracts — used by frontend contract enforcement
export const UIContractsSchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
}).passthrough();

// fallback_policy — used by adaptive fallback router
export const FallbackPolicySchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
}).passthrough();

const BankMetaSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
  bankId: z.string().optional(),
}).passthrough();

const LocalizedStringListSchema = z.object({
  en: z.array(z.string()).optional(),
  pt: z.array(z.string()).optional(),
}).passthrough();

export const DomainOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  domains: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    crossDomainLinks: z.array(z.string()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const DocTypeOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  docTypes: z.array(z.object({
    id: z.string(),
    domainId: z.string().optional(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    aliases: LocalizedStringListSchema.optional(),
    packRefs: z.object({
      sections: z.array(z.string()).optional(),
      entities: z.array(z.string()).optional(),
      tables: z.array(z.string()).optional(),
      extraction: z.array(z.string()).optional(),
    }).passthrough().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const SectionOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  sections: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    headerVariants: LocalizedStringListSchema.optional(),
    families: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const TableOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  tableFamilies: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    domains: z.array(z.string()).optional(),
    headerFamilies: LocalizedStringListSchema.optional(),
    columnArchetypes: z.array(z.string()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const EntityOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  entityTypes: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    category: z.string().optional(),
    aliases: LocalizedStringListSchema.optional(),
  }).passthrough()).optional(),
}).passthrough();

export const MetricOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  metrics: z.array(z.object({
    id: z.string(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    domain: z.string().optional(),
    unitId: z.string().optional(),
    aliases: LocalizedStringListSchema.optional(),
    typicalTableHeaders: LocalizedStringListSchema.optional(),
  }).passthrough()).optional(),
}).passthrough();

export const UnitOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  unitFamilies: z.array(z.object({
    id: z.string(),
    baseUnit: z.string().optional(),
  }).passthrough()).optional(),
  units: z.array(z.object({
    id: z.string(),
    familyId: z.string().optional(),
    label: z.string().optional(),
    labelPt: z.string().optional(),
    symbols: z.array(z.string()).optional(),
    aliases: LocalizedStringListSchema.optional(),
  }).passthrough()).optional(),
}).passthrough();

export const StructureHeadingMapSchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  headings: z.array(z.object({
    canonical: z.string(),
    synonyms: LocalizedStringListSchema.optional(),
    domainTags: z.array(z.string()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export const LayoutCuesSchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  cues: z.array(z.object({
    id: z.string(),
    patterns: z.array(z.string()).optional(),
    meaning: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export const FieldRoleOntologySchema = z.object({
  _meta: BankMetaSchema,
  config: z.object({
    enabled: z.boolean(),
  }).passthrough().optional(),
  roles: z.array(z.object({
    id: z.string(),
    entityRoleId: z.string().optional(),
    exactAnchors: LocalizedStringListSchema.optional(),
    semanticAliases: LocalizedStringListSchema.optional(),
  }).passthrough()).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Convenience registry: look up a schema by bank id at runtime.
// ---------------------------------------------------------------------------
export const BANK_SCHEMAS: Record<string, z.ZodType> = {
  memory_policy: MemoryPolicySchema,
  answer_style_policy: AnswerStylePolicySchema,
  banned_phrases: BannedPhrasesSchema,
  prompt_registry: PromptRegistrySchema,
  quality_gates: QualityGatesSchema,
  feature_flags: FeatureFlagsSchema,
  intent_patterns: IntentPatternsSchema,
  bank_registry: BankRegistrySchema,
  ui_contracts: UIContractsSchema,
  fallback_policy: FallbackPolicySchema,
  di_domain_ontology: DomainOntologySchema,
  di_doc_type_ontology: DocTypeOntologySchema,
  di_section_ontology: SectionOntologySchema,
  di_table_ontology: TableOntologySchema,
  di_entity_ontology: EntityOntologySchema,
  di_metric_ontology: MetricOntologySchema,
  di_unit_and_measurement_ontology: UnitOntologySchema,
  headings_map: StructureHeadingMapSchema,
  layout_cues: LayoutCuesSchema,
  field_role_ontology: FieldRoleOntologySchema,
};
