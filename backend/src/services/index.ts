/**
 * Services Layer - Centralized exports
 *
 * Architecture:
 * - app/: Controller-facing facades (ChatAppService, DocumentAppService, etc.)
 * - core/: Brain orchestration (kodaOrchestrator → intent → scope → retrieval → compose → gates)
 * - retrieval/: Vector search, embeddings, ranking
 * - extraction/: Document text extraction (PDF, DOCX, PPTX, XLSX)
 * - ingestion/: Document upload processing
 * - documents/: Document-level operations (outline, compare, metadata)
 * - files/: File/folder management
 * - memory/: Conversation context and memory
 * - analytics/: Query telemetry and feedback
 * - config/: Configuration services
 * - validation/: Answer validation and output contracts
 */

export * from './app';
export * from './core';
export * from './retrieval';
export * from './extraction';
export * from './ingestion';
export * from './documents';
export * from './files';
export * from './memory';
export * from './analytics';
export * from './config';
export * from './validation';
