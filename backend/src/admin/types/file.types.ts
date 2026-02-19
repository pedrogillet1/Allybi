/**
 * File Types & Schemas
 * Document/file analytics and processing data
 */

import { z } from "zod";
import {
  FileStatusSchema,
  PreviewStatusSchema,
  FileFormatSchema,
  createResponseSchema,
  isoDateStringSchema,
} from "./_base";

// ============================================================================
// File Row Schema (No PII - no filenames, no storage keys)
// ============================================================================

export const FileRowSchema = z
  .object({
    documentId: z.string(),
    userId: z.string().nullable(),
    userEmailMasked: z.string().nullable(),
    userEmailHash: z.string().nullable(),
    encrypted: z.boolean(),
    sizeBytes: z.number(),
    format: FileFormatSchema,
    uploadedAt: isoDateStringSchema.nullable(),
    chunksCount: z.number().nullable(),
    status: FileStatusSchema,
    previewStatus: PreviewStatusSchema.optional(),
  })
  .strict();

export type FileRow = z.infer<typeof FileRowSchema>;

// ============================================================================
// File Chart Schemas
// ============================================================================

export const UploadsByTypePointSchema = z
  .object({
    day: z.string(),
    pdf: z.number(),
    docx: z.number(),
    pptx: z.number(),
    xlsx: z.number(),
    image: z.number(),
    text: z.number(),
    other: z.number(),
  })
  .strict();

export type UploadsByTypePoint = z.infer<typeof UploadsByTypePointSchema>;

export const ProcessingSuccessPointSchema = z
  .object({
    day: z.string(),
    completed: z.number(),
    failed: z.number(),
  })
  .strict();

export type ProcessingSuccessPoint = z.infer<
  typeof ProcessingSuccessPointSchema
>;

export const AvgProcessingMsByTypeSchema = z
  .object({
    type: z.string(),
    valueMs: z.number(),
  })
  .strict();

export type AvgProcessingMsByType = z.infer<typeof AvgProcessingMsByTypeSchema>;

export const FileChartsSchema = z
  .object({
    uploadsByType: z.array(UploadsByTypePointSchema).optional(),
    processingSuccess: z.array(ProcessingSuccessPointSchema).optional(),
    avgProcessingMsByType: z.array(AvgProcessingMsByTypeSchema).optional(),
  })
  .strict();

export type FileCharts = z.infer<typeof FileChartsSchema>;

// ============================================================================
// Files Data Schema
// ============================================================================

export const FilesDataSchema = z
  .object({
    v: z.literal(1),
    total: z.number(),
    files: z.array(FileRowSchema).default([]),
    charts: FileChartsSchema.optional(),
  })
  .strict();

export type FilesData = z.infer<typeof FilesDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const FilesResponseSchema = createResponseSchema(FilesDataSchema);

export type FilesResponse = z.infer<typeof FilesResponseSchema>;
