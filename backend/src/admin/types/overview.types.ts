/**
 * Overview Types & Schemas
 * Dashboard overview KPIs and charts
 */

import { z } from "zod";
import {
  SeveritySchema,
  DayValuePointSchema,
  createResponseSchema,
  isoDateStringSchema,
} from "./_base";

// ============================================================================
// KPIs Schema
// ============================================================================

export const OverviewKpisSchema = z
  .object({
    activeUsers: z.number(),
    messages: z.number(),
    documents: z.number(),
    llmCostUsd: z.number(),
    weakEvidenceRate: z.number().min(0).max(1),
    ttftAvgMs: z.number().nullable(),
  })
  .strict();

export type OverviewKpis = z.infer<typeof OverviewKpisSchema>;

// ============================================================================
// Chart Schemas
// ============================================================================

export const QueriesByDomainPointSchema = z
  .object({
    day: z.string(),
    finance: z.number(),
    legal: z.number(),
    medical: z.number(),
    general: z.number(),
    other: z.number(),
  })
  .strict();

export type QueriesByDomainPoint = z.infer<typeof QueriesByDomainPointSchema>;

export const CostPerDayPointSchema = z
  .object({
    day: z.string(),
    valueUsd: z.number(),
  })
  .strict();

export type CostPerDayPoint = z.infer<typeof CostPerDayPointSchema>;

export const OverviewChartsSchema = z
  .object({
    dau: z.array(DayValuePointSchema).default([]),
    queriesByDomain: z.array(QueriesByDomainPointSchema).default([]),
    costPerDay: z.array(CostPerDayPointSchema).default([]),
    weakEvidenceRatePerDay: z.array(DayValuePointSchema).default([]),
  })
  .strict();

export type OverviewCharts = z.infer<typeof OverviewChartsSchema>;

// ============================================================================
// Recent Error Schema
// ============================================================================

export const RecentErrorSchema = z
  .object({
    ts: isoDateStringSchema,
    service: z.string(),
    type: z.string(),
    severity: SeveritySchema,
    message: z.string(),
  })
  .strict();

export type RecentError = z.infer<typeof RecentErrorSchema>;

// ============================================================================
// Overview Data Schema
// ============================================================================

export const OverviewDataSchema = z
  .object({
    v: z.literal(1),
    kpis: OverviewKpisSchema,
    charts: OverviewChartsSchema,
    recentErrors: z.array(RecentErrorSchema).default([]),
  })
  .strict();

export type OverviewData = z.infer<typeof OverviewDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const OverviewResponseSchema = createResponseSchema(OverviewDataSchema);

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
