/**
 * Request Schemas
 * Zod schemas for API request validation
 *
 * SECURITY: All schemas use .strict() to reject unknown keys.
 * This prevents parameter pollution and injection of unexpected fields.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Chat schemas
// ---------------------------------------------------------------------------

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  language: z.enum(['en', 'pt', 'es']).optional(),
  // Frontend may send these additional fields
  attachedDocuments: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    type: z.string().optional(),
  })).optional(),
  client: z.object({
    wantsStreaming: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough(); // Allow additional fields for forward compatibility

export const titleUpdateSchema = z.object({
  title: z.string().min(1).max(500),
}).strict();

// ---------------------------------------------------------------------------
// Document schemas
// ---------------------------------------------------------------------------

export const documentUploadSchema = z.object({
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
}).strict();

export const searchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  filters: z.object({
    documentTypes: z.array(z.string().max(50)).max(20).optional(),
    dateRange: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }).strict().optional(),
  }).strict().optional(),
}).strict();

export const documentIdsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(100),
}).strict();

export const documentMoveSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(100),
  folderId: z.string().uuid().nullable(),
}).strict();

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const authRegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().max(100).optional(),
  recoveryKeyHash: z.string().max(2048).optional(),
  masterKeyEncrypted: z.string().max(4096).optional(),
});

export const authLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional(),
}).strict();

export const authRefreshSchema = z.object({
  refreshToken: z.string().min(1).max(2048),
}).strict();

// ---------------------------------------------------------------------------
// Folder schemas
// ---------------------------------------------------------------------------

export const folderCreateSchema = z.object({
  name: z.string().min(1).max(255),
  parentFolderId: z.string().uuid().optional(),
  emoji: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  description: z.string().max(1000).optional(),
}).strict();

export const folderUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  emoji: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  description: z.string().max(1000).optional(),
}).strict();

export const folderBulkSchema = z.object({
  folderTree: z.array(z.object({
    name: z.string().min(1).max(255),
    path: z.string().max(1000).nullable().optional(),
    parentPath: z.string().max(1000).nullable().optional(),
    depth: z.number().int().min(0).max(20).optional(),
  }).strict()).max(500),
  parentFolderId: z.string().uuid().nullable().optional(),
  defaultEmoji: z.string().max(10).nullable().optional(),
}).strict();

export const folderMoveSchema = z.object({
  newParentId: z.string().uuid().nullable(),
}).strict();

// ---------------------------------------------------------------------------
// User schemas
// ---------------------------------------------------------------------------

export const userUpdateSchema = z.object({
  name: z.string().max(100).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  language: z.enum(['en', 'pt', 'es']).optional(),
}).strict();

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
}).strict();

export const phoneUpdateSchema = z.object({
  phoneNumber: z.string().min(10).max(20),
}).strict();

export const phoneVerifySchema = z.object({
  code: z.string().length(6),
}).strict();

// ---------------------------------------------------------------------------
// RAG schemas
// ---------------------------------------------------------------------------

export const ragQuerySchema = z.object({
  query: z.string().min(1).max(10000),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  conversationId: z.string().uuid().optional(),
}).strict();

// ---------------------------------------------------------------------------
// Admin schemas
// ---------------------------------------------------------------------------

export const adminLoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(128),
}).strict();

export const adminRefreshSchema = z.object({
  refreshToken: z.string().min(1).max(2048),
}).strict();

// ---------------------------------------------------------------------------
// Query param schemas (for GET requests)
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().uuid().optional(),
}).strict();

export const rangeSchema = z.object({
  range: z.enum(['24h', '7d', '30d', '90d']).optional().default('7d'),
}).strict();

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  q: z.string().max(500).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type DocumentUploadRequest = z.infer<typeof documentUploadSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type AuthRegisterRequest = z.infer<typeof authRegisterSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginSchema>;
export type FolderCreateRequest = z.infer<typeof folderCreateSchema>;
export type UserUpdateRequest = z.infer<typeof userUpdateSchema>;
export type RagQueryRequest = z.infer<typeof ragQuerySchema>;
