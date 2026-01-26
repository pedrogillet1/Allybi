/**
 * Request Schemas
 * Zod schemas for API request validation
 */

import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  language: z.enum(['en', 'pt', 'es']).optional(),
});

export const documentUploadSchema = z.object({
  folderId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

export const searchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  filters: z.object({
    documentTypes: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }).optional(),
  }).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type DocumentUploadRequest = z.infer<typeof documentUploadSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
