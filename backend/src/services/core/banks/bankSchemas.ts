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
  _meta: z.object({
    id: z.string(),
    version: z.string().optional(),
    owner: z.string().optional(),
    lastUpdated: z.string().optional(),
    reviewCadenceDays: z.number().optional(),
    criticality: z.string().optional(),
  }).passthrough(),
  config: z.object({
    enabled: z.boolean().optional(),
    applyStage: z.string().optional(),
    actionsContract: z.object({
      thresholds: z.object({
        maxIntroSentencesNavPills: z.number().optional(),
        maxClarificationQuestions: z.number().optional(),
      }).passthrough().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  contracts: z.object({
    nav_pills: z.object({
      maxIntroSentences: z.number().optional(),
      maxIntroChars: z.number().optional(),
      noSourcesHeader: z.boolean().optional(),
      noInlineCitations: z.boolean().optional(),
      disallowedTextPatterns: z.array(z.string()).optional(),
    }).passthrough().optional(),
    doc_grounded: z.object({}).passthrough().optional(),
    conversation: z.object({}).passthrough().optional(),
  }).passthrough().optional(),
  rules: z.array(
    z.object({
      id: z.string().optional(),
      reasonCode: z.string().optional(),
      when: z.object({}).passthrough().optional(),
      triggerPatterns: z.record(z.string(), z.array(z.string())).optional(),
      action: z.object({
        type: z.string().optional(),
        contract: z.string().optional(),
        stripDisallowedTextPatterns: z.boolean().optional(),
        suppressActions: z.boolean().optional(),
      }).passthrough().optional(),
    }).passthrough(),
  ).optional(),
}).passthrough();

// fallback_policy — used by adaptive fallback router
export const FallbackPolicySchema = z.object({
  _meta: z.object({ id: z.string() }).passthrough(),
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
};
