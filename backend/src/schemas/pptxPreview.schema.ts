/**
 * ⚠️ FROZEN SUBSYSTEM ⚠️
 *
 * This module is production-hardened and contract-locked.
 * Do not modify without:
 *   1. Updating golden snapshots (backend/src/tests/__snapshots__/pptx-*.snapshot.json)
 *   2. Running canary checks (npm run canary:pptx)
 *   3. Updating PPTX_PREVIEW_FUTURE_CHANGES.md
 *   4. Verifying drift metrics remain zero
 *
 * See: PPTX_PREVIEW_FUTURE_CHANGES.md for modification guidelines
 * Contact: Backend Team (@pptx-preview-owner)
 */

/**
 * PPTX Preview API Schemas
 * Defines strict contracts for PPT preview responses with runtime validation
 */

import { z } from "zod";

// ══════════════════════════════════════════════════════════════════════════
// SLIDE PREVIEW SCHEMA
// ══════════════════════════════════════════════════════════════════════════

/**
 * Single slide preview response
 * Enforces contract: if hasImage=true, imageUrl must be valid
 */
export const SlidePreviewSchema = z
  .object({
    slideNumber: z.number().int().positive(),
    content: z.string().default(""),
    textCount: z.number().int().nonnegative().optional(),
    storagePath: z.string().optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    hasImage: z.boolean(),
    // Legacy fields for backward compatibility
    slide_number: z.number().int().positive().optional(),
    text_count: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) => {
      // Contract: if hasImage is true, imageUrl must exist
      if (data.hasImage && !data.imageUrl) {
        return false;
      }
      return true;
    },
    {
      message: "If hasImage is true, imageUrl must be provided",
    },
  );

export type SlidePreview = z.infer<typeof SlidePreviewSchema>;

// ══════════════════════════════════════════════════════════════════════════
// SLIDES RESPONSE SCHEMA
// ══════════════════════════════════════════════════════════════════════════

export const SlidesResponseSchema = z.object({
  success: z.boolean(),
  slides: z.array(SlidePreviewSchema),
  totalSlides: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.any()).optional(),
  message: z.string().optional(),
});

export type SlidesResponse = z.infer<typeof SlidesResponseSchema>;

// ══════════════════════════════════════════════════════════════════════════
// PREVIEW PLAN SCHEMA
// ══════════════════════════════════════════════════════════════════════════

export const PreviewTypeEnum = z.enum([
  "pptx-pdf", // PDF ready
  "pptx-slides", // Slides fallback
  "pptx-processing", // Still processing
  "pptx-unsupported", // Cannot preview
]);

export const PreviewPlanReasonEnum = z.enum([
  "PDF_READY",
  "PDF_FAILED_SLIDES_READY",
  "PDF_UNAVAILABLE_SLIDES_READY",
  "PDF_PROCESSING",
  "SLIDES_PROCESSING",
  "PROCESSING",
  "NO_PREVIEW_AVAILABLE",
  "UNSUPPORTED",
]);

export const PreviewPlanSchema = z.object({
  previewType: PreviewTypeEnum,
  reason: PreviewPlanReasonEnum,
  assetsReady: z.boolean(),
  previewPdfStatus: z
    .enum(["ready", "pending", "processing", "failed", "skipped"])
    .nullable(),
  slidesStatus: z
    .enum(["ready", "pending", "processing", "failed"])
    .nullable()
    .optional(),
  previewUrl: z.string().optional(),
  message: z.string().optional(),
  // Metadata for client
  totalSlides: z.number().int().nonnegative().optional(),
  canRetry: z.boolean().optional(),
  attempts: z.number().int().nonnegative().optional(),
});

export type PreviewPlan = z.infer<typeof PreviewPlanSchema>;
export type PreviewType = z.infer<typeof PreviewTypeEnum>;
export type PreviewPlanReason = z.infer<typeof PreviewPlanReasonEnum>;

// ══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Safely validate slides response
 * Returns validation result with detailed errors
 */
export function validateSlidesResponse(data: unknown): {
  success: boolean;
  data?: SlidesResponse;
  errors?: z.ZodError;
} {
  const result = SlidesResponseSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Safely validate single slide
 */
export function validateSlidePreview(data: unknown): {
  success: boolean;
  data?: SlidePreview;
  errors?: z.ZodError;
} {
  const result = SlidePreviewSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Safely validate preview plan
 */
export function validatePreviewPlan(data: unknown): {
  success: boolean;
  data?: PreviewPlan;
  errors?: z.ZodError;
} {
  const result = PreviewPlanSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: result.error };
  }
}

export default {
  SlidePreviewSchema,
  SlidesResponseSchema,
  PreviewPlanSchema,
  validateSlidesResponse,
  validateSlidePreview,
  validatePreviewPlan,
};
