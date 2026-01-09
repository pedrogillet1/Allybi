/**
 * SSE Streaming Schema - Zod Runtime Validation
 *
 * GUARDRAIL 1: Enforces contract for all SSE events
 * - Validates done payload before emission
 * - Ensures attachments/citations/actions conform to spec
 * - Provides type-safe validation functions
 */

import { z } from 'zod/v4';

// ============================================================================
// CITATION SCHEMA
// ============================================================================

export const CitationSchema = z.object({
  documentId: z.string().uuid(),
  documentName: z.string().min(1),
  pageNumber: z.number().int().positive().optional(),
  chunkId: z.string().optional(),
  snippet: z.string().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

// ============================================================================
// SOURCE SCHEMA (Frontend DocumentSources component)
// ============================================================================

export const SourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  pageNumbers: z.array(z.number().int().positive()).optional(),
});

export type Source = z.infer<typeof SourceSchema>;

// ============================================================================
// ATTACHMENT SCHEMA (File buttons)
// ============================================================================

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  folderPath: z.string().nullable().optional(),
  purpose: z.enum(['open', 'preview', 'compare']).optional(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

// ============================================================================
// ACTION SCHEMA (File operations)
// ============================================================================

export const FileActionSchema = z.object({
  type: z.literal('file_action'),
  action: z.enum(['OPEN', 'MOVE', 'RENAME', 'DELETE', 'CREATE_FOLDER']),
  payload: z.record(z.string(), z.any()).optional(),
});

export type FileAction = z.infer<typeof FileActionSchema>;

// ============================================================================
// DONE EVENT SCHEMA
// ============================================================================

// ============================================================================
// CONSTRAINTS SCHEMA
// ============================================================================

export const ResponseConstraintsSchema = z.object({
  buttonsOnly: z.boolean().optional(),
  jsonOnly: z.boolean().optional(),
  csvOnly: z.boolean().optional(),
  tableOnly: z.boolean().optional(),
  exactBullets: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

export type ResponseConstraints = z.infer<typeof ResponseConstraintsSchema>;

export const DoneEventSchema = z.object({
  type: z.literal('done'),

  // Message/conversation identifiers
  messageId: z.string().uuid().optional(),
  assistantMessageId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),

  // Answer content
  fullAnswer: z.string().optional(),
  formatted: z.string().optional(),

  // Formatting constraints for frontend rendering
  constraints: ResponseConstraintsSchema.optional(),

  // Citations and sources
  citations: z.array(CitationSchema).optional(),
  sources: z.array(SourceSchema).optional(),
  sourceDocumentIds: z.array(z.string().uuid()).optional(),

  // Processing metadata
  intent: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  documentsUsed: z.number().int().nonnegative().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  processingTime: z.number().nonnegative().optional(),

  // Stream state flags
  wasTruncated: z.boolean().optional(),
  wasAborted: z.boolean().optional(),

  // File action response fields
  attachments: z.array(AttachmentSchema).optional(),
  actions: z.array(FileActionSchema).optional(),
  referencedFileIds: z.array(z.string().uuid()).optional(),

  // Timestamp
  timestamp: z.number().optional(),
});

export type DoneEvent = z.infer<typeof DoneEventSchema>;

// ============================================================================
// OTHER EVENT SCHEMAS (for completeness)
// ============================================================================

export const ThinkingEventSchema = z.object({
  type: z.literal('thinking'),
  message: z.string(),
  timestamp: z.number().optional(),
});

export const IntentEventSchema = z.object({
  type: z.literal('intent'),
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  domain: z.string().optional(),
  depth: z.string().optional(),
  blockedByNegatives: z.boolean().optional(),
  family: z.string().optional(),
  subIntent: z.string().optional(),
  timestamp: z.number().optional(),
});

export const ContentEventSchema = z.object({
  type: z.literal('content'),
  content: z.string(),
  segment: z.number().int().positive().optional(),
  intent: z.string().optional(),
  timestamp: z.number().optional(),
});

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string(),
  code: z.string().optional(),
  timestamp: z.number().optional(),
});

// ============================================================================
// STREAM EVENT UNION
// ============================================================================

export const StreamEventSchema = z.discriminatedUnion('type', [
  ThinkingEventSchema,
  IntentEventSchema,
  ContentEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  // Add retrieving, generating, citation, metadata as needed
  z.object({ type: z.literal('retrieving'), message: z.string(), documentCount: z.number().optional(), timestamp: z.number().optional() }),
  z.object({ type: z.literal('generating'), message: z.string(), timestamp: z.number().optional() }),
  z.object({ type: z.literal('citation'), citations: z.array(CitationSchema), timestamp: z.number().optional() }),
  z.object({ type: z.literal('metadata'), processingTime: z.number().optional(), tokensUsed: z.number().optional(), documentsUsed: z.number().optional(), multiIntent: z.boolean().optional(), segmentCount: z.number().optional(), timestamp: z.number().optional() }),
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Validate a done event payload before emission
 * Returns validated data or error messages
 */
export function validateDoneEvent(payload: unknown): ValidationResult<DoneEvent> {
  const result = DoneEventSchema.safeParse(payload);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
  };
}

/**
 * Validate any stream event
 */
export function validateStreamEvent(event: unknown): ValidationResult<StreamEvent> {
  const result = StreamEventSchema.safeParse(event);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
  };
}

/**
 * Validate attachment array
 */
export function validateAttachments(attachments: unknown): ValidationResult<Attachment[]> {
  const result = z.array(AttachmentSchema).safeParse(attachments);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
  };
}

/**
 * Validate citations array
 */
export function validateCitations(citations: unknown): ValidationResult<Citation[]> {
  const result = z.array(CitationSchema).safeParse(citations);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
  };
}

// ============================================================================
// ASSERTION FUNCTIONS (throw on invalid)
// ============================================================================

/**
 * Assert done event is valid, throw if not
 * Use in development/testing
 */
export function assertValidDoneEvent(payload: unknown): DoneEvent {
  const result = validateDoneEvent(payload);
  if (!result.success) {
    throw new Error(`Invalid DoneEvent: ${result.errors?.join(', ')}`);
  }
  return result.data!;
}

/**
 * Create a validated done event with defaults
 * Ensures all required fields are present
 */
export function createDoneEvent(partial: Partial<DoneEvent>): DoneEvent {
  const event: DoneEvent = {
    type: 'done',
    timestamp: Date.now(),
    ...partial,
  };

  // Validate and return
  return assertValidDoneEvent(event);
}

// ============================================================================
// DOCUMENT MARKER VALIDATION
// ============================================================================

/**
 * Document marker regex pattern
 * Format: {{DOC::id=xxx::name="yyy"::ctx=zzz}}
 */
export const DOC_MARKER_PATTERN = /\{\{DOC::id=([a-f0-9-]+)::name="([^"]+)"::ctx=(list|text|browse|topic|search|action)\}\}/g;

/**
 * Extract document markers from text
 */
export function extractDocMarkers(text: string): Array<{
  id: string;
  name: string;
  ctx: 'list' | 'text' | 'browse' | 'topic' | 'search' | 'action';
}> {
  const markers: Array<{ id: string; name: string; ctx: 'list' | 'text' | 'browse' | 'topic' | 'search' | 'action' }> = [];
  let match;

  // Reset lastIndex for global regex
  DOC_MARKER_PATTERN.lastIndex = 0;

  while ((match = DOC_MARKER_PATTERN.exec(text)) !== null) {
    markers.push({
      id: match[1],
      name: match[2],
      ctx: match[3] as 'list' | 'text' | 'browse' | 'topic' | 'search' | 'action',
    });
  }

  return markers;
}

/**
 * Validate that formatted answer has valid markers matching attachments
 */
export function validateMarkersMatchAttachments(
  formatted: string | undefined,
  attachments: Attachment[] | undefined
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  if (!formatted) {
    return { valid: true, mismatches };
  }

  const markers = extractDocMarkers(formatted);
  const attachmentIds = new Set(attachments?.map(a => a.id) || []);

  for (const marker of markers) {
    if (!attachmentIds.has(marker.id)) {
      mismatches.push(`Marker id=${marker.id} not in attachments`);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const streamingSchema = {
  // Schemas
  DoneEventSchema,
  CitationSchema,
  SourceSchema,
  AttachmentSchema,
  FileActionSchema,
  StreamEventSchema,

  // Validation functions
  validateDoneEvent,
  validateStreamEvent,
  validateAttachments,
  validateCitations,

  // Assertion functions
  assertValidDoneEvent,
  createDoneEvent,

  // Marker utilities
  DOC_MARKER_PATTERN,
  extractDocMarkers,
  validateMarkersMatchAttachments,
};

export default streamingSchema;
