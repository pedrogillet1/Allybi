import { z } from "zod";
import type {
  PromptConcern,
  PromptConcernConflict,
  PromptFileEntry,
  PromptRegistryBank,
} from "./types";

const NonEmpty = z.string().trim().min(1);
const PromptConcernSchema: z.ZodType<PromptConcern> = z.enum([
  "global_bans",
  "grounding",
  "retrieval_planner",
  "answer_shape",
  "citation_contract",
  "clarification_render",
  "fallback_render",
  "tool_contract",
]);

export const PromptFileEntrySchema: z.ZodType<PromptFileEntry> = z
  .object({
    id: NonEmpty,
    path: NonEmpty.optional(),
    required: z.boolean().optional(),
    concerns: z.array(PromptConcernSchema).optional(),
  })
  .passthrough();

const PromptConcernConflictSchema: z.ZodType<PromptConcernConflict> = z
  .object({
    left: PromptConcernSchema,
    right: PromptConcernSchema,
  })
  .passthrough();

const PromptRegistryLayersSchema = z
  .object({
    system: z.array(NonEmpty).optional(),
    retrieval: z.array(NonEmpty).optional(),
    compose_answer: z.array(NonEmpty).optional(),
    disambiguation: z.array(NonEmpty).optional(),
    fallback: z.array(NonEmpty).optional(),
    tool: z.array(NonEmpty).optional(),
  })
  .passthrough();

const PromptRegistryRequiredConcernsSchema = z
  .object({
    system: z.array(PromptConcernSchema).optional(),
    retrieval: z.array(PromptConcernSchema).optional(),
    compose_answer: z.array(PromptConcernSchema).optional(),
    disambiguation: z.array(PromptConcernSchema).optional(),
    fallback: z.array(PromptConcernSchema).optional(),
    tool: z.array(PromptConcernSchema).optional(),
  })
  .passthrough();

const PromptRegistryMapSchema = z
  .object({
    system: NonEmpty.optional(),
    retrieval: NonEmpty.optional(),
    compose_answer: NonEmpty.optional(),
    disambiguation: NonEmpty.optional(),
    fallback: NonEmpty.optional(),
    tool: NonEmpty.optional(),
  })
  .passthrough();

export const PromptRegistryBankSchema: z.ZodType<PromptRegistryBank> = z
  .object({
    _meta: z
      .object({
        id: NonEmpty.optional(),
        version: NonEmpty.optional(),
        description: z.string().optional(),
      })
      .passthrough()
      .optional(),
    config: z
      .object({
        enabled: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    promptFiles: z.array(PromptFileEntrySchema).optional(),
    layersByKind: PromptRegistryLayersSchema.optional(),
    requiredConcernsByKind: PromptRegistryRequiredConcernsSchema.optional(),
    map: PromptRegistryMapSchema.optional(),
    forbiddenConcernOverlaps: z
      .array(PromptConcernConflictSchema)
      .optional(),
  })
  .passthrough();

const GuardSkipWhen = z.enum(["machine_json_mode"]);

export const GlobalGuardsBankSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            id: z.string().optional(),
            text: NonEmpty,
            skipWhen: z.array(GuardSkipWhen).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const NavPillsGuardBankSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            id: z.string().optional(),
            text: NonEmpty,
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const MinimalSafePromptBankSchema = z
  .object({
    rules: z.array(NonEmpty).optional(),
    navPillsAddendum: z.string().optional(),
  })
  .passthrough();
