/**
 * Unified Document Format
 * Standardized schema for all document types after processing
 * Provides consistent structure for querying, analysis, and retrieval
 */

export interface DocumentContent {
  markdown: string;
  plainText: string;
  wordCount: number;
  charCount: number;
}

export interface DocumentSection {
  level: number; // Heading level (1-6)
  heading: string;
  page?: number;
  startChar: number;
  endChar: number;
  content: string;
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'quote';
}

export interface DocumentTable {
  page?: number;
  tableNumber: number;
  rows: number;
  columns: number;
  markdown: string;
  confidence?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DocumentImage {
  page?: number;
  imageNumber: number;
  url: string;
  caption?: string;
  alt?: string;
  extractedText?: string; // If OCR was applied
  confidence?: number;
}

export interface DocumentChunk {
  chunkId: number;
  text: string;
  startChar: number;
  endChar: number;
  page?: number;
  section?: string;
  heading?: string;
  embedding?: number[]; // Vector embedding (3072 dimensions for text-embedding-3-large)
  metadata: {
    type?: 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'quote';
    heading?: string;
    section?: string;
    page?: number;
    elementTypes?: string[];
    elementCount?: number;
    oversized?: boolean;
    truncated?: boolean;
  };
}

export interface DocumentStructure {
  pages: number;
  sections: DocumentSection[];
  tables: DocumentTable[];
  images: DocumentImage[];
  outline: string[]; // Hierarchical outline (h1, h2, h3, etc.)
  hasTables: boolean;
  hasLists: boolean;
  hasCode: boolean;
  hasImages: boolean;
}

export interface DocumentMetadata {
  title: string;
  author?: string;
  creationDate?: string;
  modificationDate?: string;
  language: string;
  fileSize: number;
  mimeType: string;
  originalFormat: string; // pdf, docx, xlsx, pptx, html, csv, image, zip, etc.
  ocrConfidence?: number; // If OCR was used
  processingTime: number; // Milliseconds
  extractionMethod: 'native' | 'ocr' | 'hybrid'; // How text was extracted
  layoutType?: 'single-column' | 'two-column' | 'three-column' | 'complex';
  columnCount?: number;
  keywords?: string[];
  description?: string;
}

export interface DocumentEntity {
  type: 'person' | 'organization' | 'location' | 'date' | 'number' | 'email' | 'phone' | 'url';
  text: string;
  count: number;
  positions: number[]; // Character positions in document
}

export interface DocumentAnalysis {
  topics: string[]; // Extracted topics/themes
  entities: {
    people: string[];
    organizations: string[];
    locations: string[];
    dates: string[];
    numbers: string[];
    emails: string[];
    phones: string[];
    urls: string[];
  };
  summary: string; // AI-generated summary
  keyPoints: string[]; // Main points/takeaways
  sentiment?: 'positive' | 'neutral' | 'negative';
  complexity?: 'simple' | 'moderate' | 'complex';
  readingLevel?: number; // Flesch-Kincaid grade level
}

export interface ProcessingStats {
  totalChunks: number;
  avgChunkSize: number;
  maxChunkSize: number;
  minChunkSize: number;
  chunkingStrategy: 'fixed' | 'structure-aware' | 'semantic';
  embeddingsGenerated: number;
  tablesExtracted: number;
  imagesProcessed: number;
  ocrPagesProcessed: number;
}

/**
 * Main Unified Document Interface
 * This is the complete structure for a processed document
 */
export interface UnifiedDocument {
  // Core identifiers
  documentId: string;
  userId: string;
  filename: string;
  uploadedAt: Date;
  processedAt: Date;

  // Content
  content: DocumentContent;

  // Structure
  structure: DocumentStructure;

  // Metadata
  metadata: DocumentMetadata;

  // Chunks (for RAG/vector search)
  chunks: DocumentChunk[];

  // Analysis (optional - can be generated on-demand)
  analysis?: DocumentAnalysis;

  // Processing statistics
  stats: ProcessingStats;

  // Status
  status: 'processing' | 'completed' | 'failed';
  error?: string;
}

/**
 * Simplified document preview (for list views)
 */
export interface DocumentPreview {
  documentId: string;
  filename: string;
  title: string;
  uploadedAt: Date;
  fileSize: number;
  format: string;
  pageCount: number;
  wordCount: number;
  status: 'processing' | 'completed' | 'failed';
  thumbnail?: string;
}

/**
 * Document search result
 */
export interface DocumentSearchResult {
  documentId: string;
  filename: string;
  title: string;
  excerpt: string; // Relevant excerpt with highlighted terms
  relevanceScore: number;
  matchedChunks: Array<{
    chunkId: number;
    text: string;
    page?: number;
    section?: string;
    score: number;
  }>;
}

/**
 * Builder class for creating unified documents
 */
export class UnifiedDocumentBuilder {
  private document: Partial<UnifiedDocument> = {
    content: {
      markdown: '',
      plainText: '',
      wordCount: 0,
      charCount: 0,
    },
    structure: {
      pages: 0,
      sections: [],
      tables: [],
      images: [],
      outline: [],
      hasTables: false,
      hasLists: false,
      hasCode: false,
      hasImages: false,
    },
    metadata: {
      title: '',
      language: 'en',
      fileSize: 0,
      mimeType: '',
      originalFormat: '',
      processingTime: 0,
      extractionMethod: 'native',
    },
    chunks: [],
    stats: {
      totalChunks: 0,
      avgChunkSize: 0,
      maxChunkSize: 0,
      minChunkSize: 0,
      chunkingStrategy: 'structure-aware',
      embeddingsGenerated: 0,
      tablesExtracted: 0,
      imagesProcessed: 0,
      ocrPagesProcessed: 0,
    },
    status: 'processing',
  };

  setBasicInfo(documentId: string, userId: string, filename: string): this {
    this.document.documentId = documentId;
    this.document.userId = userId;
    this.document.filename = filename;
    this.document.uploadedAt = new Date();
    return this;
  }

  setContent(markdown: string, plainText?: string): this {
    this.document.content!.markdown = markdown;
    this.document.content!.plainText = plainText || markdown.replace(/[#*_`\[\]()]/g, '');
    this.document.content!.wordCount = markdown.split(/\s+/).filter(w => w.length > 0).length;
    this.document.content!.charCount = markdown.length;
    return this;
  }

  setMetadata(metadata: Partial<DocumentMetadata>): this {
    this.document.metadata = { ...this.document.metadata!, ...metadata };
    return this;
  }

  setStructure(structure: Partial<DocumentStructure>): this {
    this.document.structure = { ...this.document.structure!, ...structure };
    return this;
  }

  setChunks(chunks: DocumentChunk[]): this {
    this.document.chunks = chunks;
    this.document.stats!.totalChunks = chunks.length;

    if (chunks.length > 0) {
      const sizes = chunks.map(c => c.text.length);
      this.document.stats!.avgChunkSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      this.document.stats!.maxChunkSize = Math.max(...sizes);
      this.document.stats!.minChunkSize = Math.min(...sizes);
    }

    return this;
  }

  setAnalysis(analysis: DocumentAnalysis): this {
    this.document.analysis = analysis;
    return this;
  }

  setProcessingStats(stats: Partial<ProcessingStats>): this {
    this.document.stats = { ...this.document.stats!, ...stats };
    return this;
  }

  markCompleted(): this {
    this.document.status = 'completed';
    this.document.processedAt = new Date();
    return this;
  }

  markFailed(error: string): this {
    this.document.status = 'failed';
    this.document.error = error;
    this.document.processedAt = new Date();
    return this;
  }

  build(): UnifiedDocument {
    // Validate required fields
    if (!this.document.documentId || !this.document.userId || !this.document.filename) {
      throw new Error('Missing required fields: documentId, userId, or filename');
    }

    return this.document as UnifiedDocument;
  }
}
