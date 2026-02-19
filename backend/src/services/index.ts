/**
 * Services Layer
 *
 * Architecture:
 * - core/: Shared runtime services (banks, routing, retrieval, compose, enforcement)
 * - chat/: Canonical chat runtime orchestration path
 * - retrieval/: Vector search, embeddings, ranking
 * - extraction/: Document text extraction (PDF, DOCX, PPTX, XLSX)
 * - ingestion/: Document upload processing
 * - documents/: Document-level operations (outline, compare, metadata)
 * - files/: File/folder management
 * - memory/: Conversation context and memory
 * - config/: Configuration services
 * - validation/: Answer validation and output contracts
 * - llm/: Multi-provider LLM abstraction (Gemini, OpenAI, Local)
 * - utils/: Shared utility helpers
 *
 * Import from specific service files directly to avoid duplicate-name barrel errors.
 */
