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
  _meta: z.object({ id: z.string() }).passthrough(),
  config: z.object({
    enabled: z.boolean(),
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
