/**
 * Shared Base Types & Schemas
 * Common types used across all admin API responses
 */

import { z } from "zod";

// ============================================================================
// Enums
// ============================================================================

export const RangeSchema = z.enum(["24h", "7d", "30d", "90d"]);
export type Range = z.infer<typeof RangeSchema>;

export const CacheStatusSchema = z.enum(["hit", "miss", "stale"]);
export type CacheStatus = z.infer<typeof CacheStatusSchema>;

export const SeveritySchema = z.enum(["low", "med", "high"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const FileStatusSchema = z.enum([
  "uploaded",
  "processing",
  "ready",
  "failed",
]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const PreviewStatusSchema = z.enum([
  "none",
  "processing",
  "ready",
  "failed",
]);
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;

export const FileFormatSchema = z.enum([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "image",
  "text",
  "other",
]);
export type FileFormat = z.infer<typeof FileFormatSchema>;

export const DomainSchema = z.enum([
  "finance",
  "legal",
  "medical",
  "general",
  "other",
]);
export type Domain = z.infer<typeof DomainSchema>;

// ============================================================================
// ISO Date String Validator
// ============================================================================

export const isoDateStringSchema = z.string().refine(
  (val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.includes("T");
  },
  { message: "Invalid ISO date string" },
);

// ============================================================================
// Response Meta
// ============================================================================

export const MetaSchema = z
  .object({
    cache: CacheStatusSchema,
    generatedAt: isoDateStringSchema,
    requestId: z.string().nullable().optional(),
  })
  .strict();

export type Meta = z.infer<typeof MetaSchema>;

// ============================================================================
// Response Envelope Factory
// ============================================================================

export function createResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({
      ok: z.literal(true),
      range: RangeSchema,
      data: dataSchema,
      meta: MetaSchema,
    })
    .strict();
}

// ============================================================================
// Common Chart Point Schemas
// ============================================================================

export const DayValuePointSchema = z
  .object({
    day: z.string(),
    value: z.number(),
  })
  .strict();

export type DayValuePoint = z.infer<typeof DayValuePointSchema>;

// ============================================================================
// User Identity (No PII)
// ============================================================================

export const UserIdentitySchema = z
  .object({
    userId: z.string(),
    emailMasked: z.string().nullable(),
    emailHash: z.string().nullable(),
  })
  .strict();

export type UserIdentity = z.infer<typeof UserIdentitySchema>;
