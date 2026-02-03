/**
 * User Types & Schemas
 * User analytics and activity data
 */

import { z } from 'zod';
import {
  DayValuePointSchema,
  createResponseSchema,
  isoDateStringSchema,
} from './_base';

// ============================================================================
// User Row Schema (No PII - masked email only)
// ============================================================================

export const UserRowSchema = z.object({
  userId: z.string(),
  emailMasked: z.string().nullable(),
  emailHash: z.string().nullable(),
  tier: z.string().nullable(),
  joinedAt: isoDateStringSchema.nullable(),
  lastActiveAt: isoDateStringSchema.nullable(),
  conversations7d: z.number(),
  documents7d: z.number(),
  storageBytes: z.number(),
}).strict();

export type UserRow = z.infer<typeof UserRowSchema>;

// ============================================================================
// User Activity Chart Point
// ============================================================================

export const UserActivityPointSchema = z.object({
  day: z.string(),
  dau: z.number(),
  wau: z.number(),
  mau: z.number(),
}).strict();

export type UserActivityPoint = z.infer<typeof UserActivityPointSchema>;

// ============================================================================
// User Charts Schema
// ============================================================================

export const UserChartsSchema = z.object({
  newUsersPerDay: z.array(DayValuePointSchema).optional(),
  active: z.array(UserActivityPointSchema).optional(),
}).strict();

export type UserCharts = z.infer<typeof UserChartsSchema>;

// ============================================================================
// Users Data Schema
// ============================================================================

export const UsersDataSchema = z.object({
  v: z.literal(1),
  total: z.number(),
  users: z.array(UserRowSchema).default([]),
  charts: UserChartsSchema.optional(),
}).strict();

export type UsersData = z.infer<typeof UsersDataSchema>;

// ============================================================================
// Response Envelope
// ============================================================================

export const UsersResponseSchema = createResponseSchema(UsersDataSchema);

export type UsersResponse = z.infer<typeof UsersResponseSchema>;
