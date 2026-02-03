/**
 * LLM Cost Types & Schemas
 * LLM usage, tokens, and cost analytics
 */

import { z } from 'zod';
import {
  DayValuePointSchema,
  createResponseSchema,
  isoDateStringSchema,
} from './_base';

// ============================================================================
// LLM KPIs Schema
// ============================================================================

export const LlmKpisSchema = z.object({
  costUsd: z.number(),
  totalTokens: z.number(),
  totalCalls: z.number(),
  avgLatencyMs: z.number().nullable(),
  errorRate: z.number(),
  recentErrors: z.number(),
}).strict();

export type LlmKpis = z.infer<typeof LlmKpisSchema>;

// ============================================================================
// LLM Chart Schemas
// ============================================================================

export const CostPerDayPointSchema = z.object({
  day: z.string(),
  valueUsd: z.number(),
}).strict();

export type CostPerDayPoint = z.infer<typeof CostPerDayPointSchema>;

export const CostByModelPointSchema = z.object({
  label: z.string(),
  valueUsd: z.number(),
}).strict();

export type CostByModelPoint = z.infer<typeof CostByModelPointSchema>;

export const LlmChartsSchema = z.object({
  costPerDay: z.array(CostPerDayPointSchema).optional(),
  tokensPerDay: z.array(DayValuePointSchema).optional(),
  costByModel: z.array(CostByModelPointSchema).optional(),
}).strict();

export type LlmCharts = z.infer<typeof LlmChartsSchema>;

// ============================================================================
// LLM Call Row Schema
// ============================================================================

export const LlmCallRowSchema = z.object({
  ts: isoDateStringSchema,
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  latencyMs: z.number().nullable(),
  status: z.string(),
}).strict();

export type LlmCallRow = z.infer<typeof LlmCallRowSchema>;

// ============================================================================
// LLM Cost Data Schema
// ============================================================================

export const LlmCostDataSchema = z.object({
  v: z.literal(1),
  total: z.number(),
  kpis: LlmKpisSchema,
  charts: LlmChartsSchema.optional(),
  calls: z.array(LlmCallRowSchema).default([]),
}).strict();

export type LlmCostData = z.infer<typeof LlmCostDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const LlmCostResponseSchema = createResponseSchema(LlmCostDataSchema);

export type LlmCostResponse = z.infer<typeof LlmCostResponseSchema>;
