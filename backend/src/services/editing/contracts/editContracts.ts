/**
 * Zod contract schemas for the editing pipeline.
 *
 * Validates:
 *  - incoming EditApplyRequest payloads
 *  - outgoing EditApplyResult payloads
 *  - individual patches and bundles
 *
 * These schemas guard the entry/exit of editOrchestrator and can be used
 * for runtime validation in development or assertion in tests.
 */

import { z } from "zod";
import { logger } from "../../../utils/logger";

// ---------------------------------------------------------------------------
// Patch & Bundle
// ---------------------------------------------------------------------------

export const PatchSchema = z
  .object({
    kind: z.string().min(1),
    pid: z.string().optional(),
    paragraphId: z.string().optional(),
    afterHtml: z.string().optional(),
    afterText: z.string().optional(),
    rangeA1: z.string().optional(),
    a1: z.string().optional(),
    value: z.unknown().optional(),
    formula: z.string().optional(),
    flags: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const BundleSchema = z
  .object({
    patches: z.array(PatchSchema).min(1),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// EditApplyRequest (subset used for validation)
// ---------------------------------------------------------------------------

export const EditRequestSchema = z
  .object({
    plan: z
      .object({
        operator: z.string().min(1),
        domain: z.enum(["docx", "sheets", "slides"]),
        documentId: z.string().min(1),
        normalizedInstruction: z.string(),
        constraints: z.object({
          preserveNumbers: z.boolean(),
          preserveEntities: z.boolean(),
          strictNoNewFacts: z.boolean(),
          tone: z.enum(["neutral", "formal", "casual"]),
          outputLanguage: z.string(),
          maxExpansionRatio: z.number(),
        }),
        missingRequiredEntities: z.array(z.string()),
        preserveTokens: z.array(z.string()),
        diagnostics: z.object({
          extractedEntities: z.array(z.string()),
          extractedHints: z.array(z.string()),
          checks: z.array(
            z.object({
              id: z.string(),
              pass: z.boolean(),
              detail: z.string().optional(),
            }),
          ),
        }),
      })
      .passthrough(),
    target: z
      .object({
        id: z.string(),
        label: z.string(),
        confidence: z.number(),
        candidates: z.array(z.unknown()),
        decisionMargin: z.number(),
        isAmbiguous: z.boolean(),
        resolutionReason: z.string(),
      })
      .passthrough(),
    beforeText: z.string(),
    proposedText: z.string(),
    userConfirmed: z.boolean(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// EditApplyResult
// ---------------------------------------------------------------------------

export const EditApplyResultSchema = z
  .object({
    ok: z.boolean(),
    applied: z.boolean(),
    outcomeType: z.enum([
      "applied",
      "clarification_required",
      "engine_unsupported",
      "noop",
      "unknown_unsupported",
      "blocked",
    ]),
    revisionId: z.string().optional(),
    error: z.string().optional(),
    proof: z
      .object({
        verified: z.boolean(),
        fileHashBefore: z.string(),
        fileHashAfter: z.string(),
        affectedTargetsCount: z.number(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Guard functions
// ---------------------------------------------------------------------------

export function validateEditRequest(
  input: unknown,
):
  | { ok: true; data: z.infer<typeof EditRequestSchema> }
  | { ok: false; error: string } {
  const result = EditRequestSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  logger.warn("[EditContracts] invalid request", { issues: message });
  return { ok: false, error: `Invalid edit request: ${message}` };
}

export function validateEditResult(
  input: unknown,
):
  | { ok: true; data: z.infer<typeof EditApplyResultSchema> }
  | { ok: false; error: string } {
  const result = EditApplyResultSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const message = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  logger.warn("[EditContracts] invalid result", { issues: message });
  return { ok: false, error: `Invalid edit result: ${message}` };
}
