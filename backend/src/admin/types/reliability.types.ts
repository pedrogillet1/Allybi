/**
 * Reliability Types & Schemas
 * System reliability, latency, and error analytics
 */

import { z } from "zod";
import {
  SeveritySchema,
  DayValuePointSchema,
  createResponseSchema,
  isoDateStringSchema,
} from "./_base";

// ============================================================================
// Reliability KPIs Schema
// ============================================================================

export const ReliabilityKpisSchema = z
  .object({
    p50LatencyMs: z.number().nullable(),
    p95LatencyMs: z.number().nullable(),
    errorRate: z.number(),
    errorCount: z.number(),
    totalMessages: z.number(),
    activeUsers: z.number(),
  })
  .strict();

export type ReliabilityKpis = z.infer<typeof ReliabilityKpisSchema>;

// ============================================================================
// Reliability Chart Schemas
// ============================================================================

export const LatencyPointSchema = z
  .object({
    day: z.string(),
    p50: z.number().nullable(),
    p95: z.number().nullable(),
  })
  .strict();

export type LatencyPoint = z.infer<typeof LatencyPointSchema>;

export const JobFailurePointSchema = z
  .object({
    label: z.string(),
    value: z.number(),
  })
  .strict();

export type JobFailurePoint = z.infer<typeof JobFailurePointSchema>;

export const ReliabilityChartsSchema = z
  .object({
    latency: z.array(LatencyPointSchema).optional(),
    errorRate: z.array(DayValuePointSchema).optional(),
    jobFailures: z.array(JobFailurePointSchema).optional(),
  })
  .strict();

export type ReliabilityCharts = z.infer<typeof ReliabilityChartsSchema>;

// ============================================================================
// Error Row Schema
// ============================================================================

export const ErrorRowSchema = z
  .object({
    ts: isoDateStringSchema,
    service: z.string(),
    type: z.string(),
    severity: SeveritySchema,
    message: z.string(),
    resolved: z.boolean().nullable(),
  })
  .strict();

export type ErrorRow = z.infer<typeof ErrorRowSchema>;

// ============================================================================
// Reliability Data Schema
// ============================================================================

export const ReliabilityDataSchema = z
  .object({
    v: z.literal(1),
    kpis: ReliabilityKpisSchema,
    charts: ReliabilityChartsSchema.optional(),
    errors: z.array(ErrorRowSchema).default([]),
  })
  .strict();

export type ReliabilityData = z.infer<typeof ReliabilityDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const ReliabilityResponseSchema = createResponseSchema(
  ReliabilityDataSchema,
);

export type ReliabilityResponse = z.infer<typeof ReliabilityResponseSchema>;
