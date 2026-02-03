/**
 * Query Types & Schemas
 * Query/retrieval analytics data (No raw query text - hash only)
 */

import { z } from 'zod';
import {
  DomainSchema,
  DayValuePointSchema,
  createResponseSchema,
  isoDateStringSchema,
} from './_base';

// ============================================================================
// Query KPIs Schema
// ============================================================================

export const QueryKpisSchema = z.object({
  queries: z.number(),
  avgTopScore: z.number().nullable(),
  weakEvidenceCount: z.number(),
  weakEvidenceRate: z.number(),
}).strict();

export type QueryKpis = z.infer<typeof QueryKpisSchema>;

// ============================================================================
// Query Chart Schemas
// ============================================================================

export const QueriesByDomainPointSchema = z.object({
  day: z.string(),
  finance: z.number(),
  legal: z.number(),
  medical: z.number(),
  general: z.number(),
  other: z.number(),
}).strict();

export type QueriesByDomainPoint = z.infer<typeof QueriesByDomainPointSchema>;

export const DomainValuePointSchema = z.object({
  domain: DomainSchema,
  value: z.number().nullable(),
}).strict();

export type DomainValuePoint = z.infer<typeof DomainValuePointSchema>;

export const FallbackRateByDomainSchema = z.object({
  domain: DomainSchema,
  value: z.number(),
}).strict();

export type FallbackRateByDomain = z.infer<typeof FallbackRateByDomainSchema>;

export const QueryChartsSchema = z.object({
  byDomain: z.array(QueriesByDomainPointSchema).optional(),
  fallbackRateByDomain: z.array(FallbackRateByDomainSchema).optional(),
  avgScoreByDomain: z.array(DomainValuePointSchema).optional(),
}).strict();

export type QueryCharts = z.infer<typeof QueryChartsSchema>;

// ============================================================================
// Query Feed Item Schema (No raw query - hash + length only)
// ============================================================================

export const QueryFeedItemSchema = z.object({
  ts: isoDateStringSchema,
  userId: z.string().nullable(),
  userEmailMasked: z.string().nullable(),
  queryHash: z.string().nullable(),
  queryLength: z.number().nullable(),
  language: z.string().nullable(),
  intent: z.string().nullable(),
  domain: DomainSchema.nullable(),
  keywords: z.array(z.string()).default([]),
  result: z.string().nullable(),
  score: z.number().nullable(),
  fallbackUsed: z.boolean(),
  docScopeApplied: z.boolean(),
  chunksUsed: z.number().nullable(),
}).strict();

export type QueryFeedItem = z.infer<typeof QueryFeedItemSchema>;

// ============================================================================
// Queries Data Schema
// ============================================================================

export const QueriesDataSchema = z.object({
  v: z.literal(1),
  total: z.number(),
  kpis: QueryKpisSchema,
  charts: QueryChartsSchema.optional(),
  feed: z.array(QueryFeedItemSchema).default([]),
}).strict();

export type QueriesData = z.infer<typeof QueriesDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const QueriesResponseSchema = createResponseSchema(QueriesDataSchema);

export type QueriesResponse = z.infer<typeof QueriesResponseSchema>;
