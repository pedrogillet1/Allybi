/**
 * Enhanced Document Metadata Types
 *
 * Supports:
 * - Language detection (en, pt, es, etc.)
 * - Category classification (financial, legal, personal, etc.)
 * - Entity extraction (people, places, organizations)
 * - Searchable text for keyword matching
 */

export interface DocumentEntities {
  people: string[];        // Names of people mentioned
  organizations: string[]; // Company names
  locations: string[];     // Places, addresses
  dates: string[];         // Important dates
  amounts: string[];       // Financial amounts
}

export interface EnhancedDocumentMetadata {
  // Core identification
  documentId: string;
  userId: string;
  filename: string;
  originalFilename: string;  // User's original filename
  fileExtension: string;     // pdf, docx, xlsx, etc.
  fileSize: number;          // bytes
  mimeType: string;

  // Content metadata
  language: string;          // en, pt, es, etc.
  category: string;          // financial, legal, personal, medical, etc.
  documentType: string;      // contract, receipt, passport, budget, etc.

  // Extracted entities
  entities: DocumentEntities;

  // Temporal metadata
  documentDate?: Date;       // Date mentioned in document (e.g., contract date)
  uploadDate: Date;
  lastModified: Date;

  // User-defined
  tags: string[];            // User-added tags
  folder?: string;           // User-defined folder

  // Processing metadata
  pageCount?: number;
  wordCount?: number;
  hasImages: boolean;
  hasTables: boolean;

  // Search optimization
  searchableText: string;    // Filename + key terms for keyword search
}

export interface MetadataFilters {
  language?: string;
  category?: string;
  documentType?: string;
  fileExtension?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface QueryAnalysis {
  mentionedDocuments: string[];
  isMultiDocument: boolean;
  metadataFilters: MetadataFilters;
  searchStrategy: {
    semanticWeight: number;
    keywordWeight: number;
  };
}
