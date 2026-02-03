/**
 * Security Types & Schemas
 * Security events, auth failures, and audit logs (No raw PII - hashed IPs only)
 */

import { z } from 'zod';
import {
  DayValuePointSchema,
  createResponseSchema,
  isoDateStringSchema,
} from './_base';

// ============================================================================
// Security KPIs Schema
// ============================================================================

export const SecurityKpisSchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(),
  authFailures: z.number(),
  rateLimitTriggers: z.number(),
}).strict();

export type SecurityKpis = z.infer<typeof SecurityKpisSchema>;

// ============================================================================
// Security Charts Schema
// ============================================================================

export const SecurityChartsSchema = z.object({
  failedLoginsPerDay: z.array(DayValuePointSchema).optional(),
  rateLimitsPerDay: z.array(DayValuePointSchema).optional(),
  adminActionsPerDay: z.array(DayValuePointSchema).optional(),
}).strict();

export type SecurityCharts = z.infer<typeof SecurityChartsSchema>;

// ============================================================================
// Auth Event Schema (No raw IP - hash only)
// ============================================================================

export const AuthEventSchema = z.object({
  ts: isoDateStringSchema,
  userId: z.string().nullable(),
  userEmailMasked: z.string().nullable(),
  event: z.string(),
  ipHash: z.string().nullable(),
  result: z.string(),
}).strict();

export type AuthEvent = z.infer<typeof AuthEventSchema>;

// ============================================================================
// Rate Limit Event Schema (No raw IP - hash only)
// ============================================================================

export const RateLimitEventSchema = z.object({
  ts: isoDateStringSchema,
  route: z.string(),
  ipHash: z.string().nullable(),
  limiterName: z.string(),
}).strict();

export type RateLimitEvent = z.infer<typeof RateLimitEventSchema>;

// ============================================================================
// Admin Audit Event Schema
// ============================================================================

export const AdminAuditEventSchema = z.object({
  ts: isoDateStringSchema,
  admin: z.string(),
  action: z.string(),
  target: z.string(),
}).strict();

export type AdminAuditEvent = z.infer<typeof AdminAuditEventSchema>;

// ============================================================================
// Security Data Schema
// ============================================================================

export const SecurityDataSchema = z.object({
  v: z.literal(1),
  kpis: SecurityKpisSchema,
  charts: SecurityChartsSchema.optional(),
  authEvents: z.array(AuthEventSchema).default([]),
  rateLimitEvents: z.array(RateLimitEventSchema).default([]),
  adminAudit: z.array(AdminAuditEventSchema).default([]),
}).strict();

export type SecurityData = z.infer<typeof SecurityDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const SecurityResponseSchema = createResponseSchema(SecurityDataSchema);

export type SecurityResponse = z.infer<typeof SecurityResponseSchema>;
