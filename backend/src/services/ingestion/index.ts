/**
 * Document Ingestion Layer
 *
 * This barrel export centralizes all document ingestion utilities.
 * These services are ONLY used for document upload/processing, NOT for RAG queries.
 *
 * The RAG V3 pipeline (KodaOrchestrator, KodaRetrievalEngine, etc.) should NEVER
 * import from this folder. It only consumes processed documents from the database.
 *
 * Services included:
 * - fileValidator: Multi-layer file validation (type, size, integrity, password)
 * - markdownConversion: Converts documents to markdown format
 * - docxConverter: Converts DOCX to PDF
 * - excelProcessor: Extracts data from Excel files
 * - pptxImageExtractor: Extracts images from PPTX files
 * - titleGeneration: Generates document titles using LLM
 */

// File Validation
export { default as fileValidator, ValidationErrorCode } from './fileValidator.service';
export type { ValidationResult } from './fileValidator.service';

// Document Conversion
export { default as markdownConversionService } from './markdownConversion.service';
export { convertDocxToPdf } from './docx-converter.service';

// File Processing
export { default as excelProcessor } from './excelProcessor.service';
export { PPTXImageExtractorService } from './pptxImageExtractor.service';

// Title Generation
export { generateDocumentTitleOnly, generateTitleArtifacts } from './titleGeneration.service';
export type { TitleMode, TitleParams, TitleResult } from './titleGeneration.service';
