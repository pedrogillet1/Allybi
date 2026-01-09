/**
 * DocumentMetadataService - Handles metadata queries about documents
 *
 * This service handles queries like:
 * - "what's my largest file" → Direct DB query for max size
 * - "show only PDFs" → Filter by mimeType/extension
 * - "how many documents do I have" → Count query
 * - "what file types do I have" → Distinct extension query
 * - "list files in folder X" → Folder path filtering
 *
 * CRITICAL: These are METADATA queries, NOT RAG queries.
 * They should NEVER go through the LLM - just DB queries.
 */

import { PrismaClient } from '@prisma/client';
import { ConversationContext, DocumentReference } from './conversationContext.service';

// Types of metadata queries we support
export type MetadataQueryType =
  | 'count_all'           // "how many files"
  | 'count_by_type'       // "how many PDFs"
  | 'largest_file'        // "what's my biggest file"
  | 'smallest_file'       // "what's my smallest file"
  | 'newest_file'         // "what's my most recent file"
  | 'oldest_file'         // "what's my oldest file"
  | 'list_by_type'        // "show me all PDFs"
  | 'list_by_folder'      // "what's in folder X"
  | 'list_types'          // "what file types do I have"
  | 'total_size'          // "how much storage am I using"
  | 'list_all';           // "list all my files"

export interface MetadataQueryResult {
  type: MetadataQueryType;
  answer: string;
  data: {
    count?: number;
    files?: DocumentReference[];
    file?: DocumentReference;
    types?: string[];
    totalSize?: number;
    folder?: string;
  };
}

// File type mappings for natural language
const FILE_TYPE_MAPPINGS: Record<string, string[]> = {
  'pdf': ['application/pdf'],
  'pdfs': ['application/pdf'],
  'word': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
  'word documents': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'],
  'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'excel': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  'spreadsheets': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'powerpoint': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'],
  'presentations': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'],
  'pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'images': ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
  'png': ['image/png'],
  'jpg': ['image/jpeg'],
  'jpeg': ['image/jpeg'],
  'text': ['text/plain'],
  'txt': ['text/plain'],
  'csv': ['text/csv'],
};

// Extension to friendly name
const EXTENSION_NAMES: Record<string, string> = {
  'pdf': 'PDF',
  'docx': 'Word document',
  'doc': 'Word document',
  'xlsx': 'Excel spreadsheet',
  'xls': 'Excel spreadsheet',
  'pptx': 'PowerPoint',
  'ppt': 'PowerPoint',
  'png': 'PNG image',
  'jpg': 'JPEG image',
  'jpeg': 'JPEG image',
  'txt': 'text file',
  'csv': 'CSV file',
};

export class DocumentMetadataService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Detect if this is a metadata query (not a RAG query).
   * Returns the query type or null if not a metadata query.
   */
  detectMetadataQuery(text: string): MetadataQueryType | null {
    const lower = text.toLowerCase().trim();

    // Count queries
    if (/how\s+many\s+(files?|documents?|pdfs?|images?)/i.test(lower)) {
      if (/pdfs?|word|excel|powerpoint|images?|spreadsheets?|presentations?/i.test(lower)) {
        return 'count_by_type';
      }
      return 'count_all';
    }

    // Size queries
    if (/largest|biggest|heaviest/i.test(lower) && /file|document/i.test(lower)) {
      return 'largest_file';
    }
    if (/smallest|lightest|tiniest/i.test(lower) && /file|document/i.test(lower)) {
      return 'smallest_file';
    }
    if (/total\s+(size|storage)|how\s+much\s+space/i.test(lower)) {
      return 'total_size';
    }

    // Date queries
    if (/newest|most\s+recent|latest|last\s+uploaded/i.test(lower) && /file|document/i.test(lower)) {
      return 'newest_file';
    }
    if (/oldest|first|earliest/i.test(lower) && /file|document/i.test(lower)) {
      return 'oldest_file';
    }

    // List queries
    if (/show\s+(me\s+)?(only\s+)?(all\s+)?/i.test(lower) || /list\s+(all\s+)?/i.test(lower)) {
      // Check for file type filtering
      for (const fileType of Object.keys(FILE_TYPE_MAPPINGS)) {
        if (lower.includes(fileType)) {
          return 'list_by_type';
        }
      }

      // Check for folder filtering
      if (/in\s+(folder|directory)/i.test(lower) || /folder\s+\w+/i.test(lower)) {
        return 'list_by_folder';
      }

      // Generic list
      if (/files?|documents?/i.test(lower)) {
        return 'list_all';
      }
    }

    // What types do I have
    if (/what\s+(file\s+)?types?|which\s+(file\s+)?types?|what\s+kinds?\s+of\s+files?/i.test(lower)) {
      return 'list_types';
    }

    return null;
  }

  /**
   * Extract file type from query for filtering.
   */
  extractFileType(text: string): string | null {
    const lower = text.toLowerCase();

    for (const [key, _] of Object.entries(FILE_TYPE_MAPPINGS)) {
      if (lower.includes(key)) {
        return key;
      }
    }

    return null;
  }

  /**
   * Execute a metadata query directly from the context documents.
   * CRITICAL: Uses pre-loaded documents from ConversationContext, NOT new DB queries.
   */
  executeFromContext(
    queryType: MetadataQueryType,
    context: ConversationContext,
    options?: { fileType?: string; folder?: string }
  ): MetadataQueryResult {
    const docs = context.documents;

    switch (queryType) {
      case 'count_all':
        return {
          type: 'count_all',
          answer: `You have ${docs.length} document${docs.length === 1 ? '' : 's'} uploaded.`,
          data: { count: docs.length }
        };

      case 'count_by_type': {
        const mimeTypes = options?.fileType ? FILE_TYPE_MAPPINGS[options.fileType] : null;
        if (!mimeTypes) {
          return this.executeFromContext('count_all', context);
        }
        const filtered = docs.filter(d => mimeTypes.includes(d.mimeType));
        const typeName = options?.fileType || 'matching';
        return {
          type: 'count_by_type',
          answer: `You have ${filtered.length} ${typeName} file${filtered.length === 1 ? '' : 's'}.`,
          data: { count: filtered.length, files: filtered }
        };
      }

      case 'largest_file': {
        if (docs.length === 0) {
          return {
            type: 'largest_file',
            answer: "You don't have any documents uploaded yet.",
            data: {}
          };
        }
        const largest = [...docs].sort((a, b) => b.size - a.size)[0];
        return {
          type: 'largest_file',
          answer: `Your largest file is "${largest.filename}" (${this.formatSize(largest.size)}) in ${largest.folderPath || '/'}`,
          data: { file: largest }
        };
      }

      case 'smallest_file': {
        if (docs.length === 0) {
          return {
            type: 'smallest_file',
            answer: "You don't have any documents uploaded yet.",
            data: {}
          };
        }
        const smallest = [...docs].sort((a, b) => a.size - b.size)[0];
        return {
          type: 'smallest_file',
          answer: `Your smallest file is "${smallest.filename}" (${this.formatSize(smallest.size)}) in ${smallest.folderPath || '/'}`,
          data: { file: smallest }
        };
      }

      case 'newest_file': {
        if (docs.length === 0) {
          return {
            type: 'newest_file',
            answer: "You don't have any documents uploaded yet.",
            data: {}
          };
        }
        const newest = [...docs].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        return {
          type: 'newest_file',
          answer: `Your most recent file is "${newest.filename}" uploaded on ${this.formatDate(newest.createdAt)} in ${newest.folderPath || '/'}`,
          data: { file: newest }
        };
      }

      case 'oldest_file': {
        if (docs.length === 0) {
          return {
            type: 'oldest_file',
            answer: "You don't have any documents uploaded yet.",
            data: {}
          };
        }
        const oldest = [...docs].sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )[0];
        return {
          type: 'oldest_file',
          answer: `Your oldest file is "${oldest.filename}" uploaded on ${this.formatDate(oldest.createdAt)} in ${oldest.folderPath || '/'}`,
          data: { file: oldest }
        };
      }

      case 'list_by_type': {
        const mimeTypes = options?.fileType ? FILE_TYPE_MAPPINGS[options.fileType] : null;
        if (!mimeTypes) {
          return this.executeFromContext('list_all', context);
        }
        const filtered = docs.filter(d => mimeTypes.includes(d.mimeType));
        const typeName = options?.fileType || 'matching';

        if (filtered.length === 0) {
          return {
            type: 'list_by_type',
            answer: `You don't have any ${typeName} files.`,
            data: { count: 0, files: [] }
          };
        }

        const list = filtered.slice(0, 10).map((d, i) =>
          `${i + 1}. ${d.filename} (${this.formatSize(d.size)}) - ${d.folderPath || '/'}`
        ).join('\n');

        const more = filtered.length > 10 ? `\n... and ${filtered.length - 10} more` : '';

        return {
          type: 'list_by_type',
          answer: `You have ${filtered.length} ${typeName} file${filtered.length === 1 ? '' : 's'}:\n\n${list}${more}`,
          data: { count: filtered.length, files: filtered }
        };
      }

      case 'list_by_folder': {
        const folderPath = options?.folder || '/';
        const filtered = docs.filter(d =>
          d.folderPath.toLowerCase().includes(folderPath.toLowerCase())
        );

        if (filtered.length === 0) {
          return {
            type: 'list_by_folder',
            answer: `No files found in folder "${folderPath}".`,
            data: { count: 0, files: [], folder: folderPath }
          };
        }

        const list = filtered.slice(0, 10).map((d, i) =>
          `${i + 1}. ${d.filename} (${this.formatSize(d.size)})`
        ).join('\n');

        const more = filtered.length > 10 ? `\n... and ${filtered.length - 10} more` : '';

        return {
          type: 'list_by_folder',
          answer: `Files in "${folderPath}" (${filtered.length} files):\n\n${list}${more}`,
          data: { count: filtered.length, files: filtered, folder: folderPath }
        };
      }

      case 'list_types': {
        const types = new Set<string>();
        for (const doc of docs) {
          const ext = doc.filename.split('.').pop()?.toLowerCase();
          if (ext) {
            types.add(EXTENSION_NAMES[ext] || ext.toUpperCase());
          }
        }

        if (types.size === 0) {
          return {
            type: 'list_types',
            answer: "You don't have any documents uploaded yet.",
            data: { types: [] }
          };
        }

        const typeList = Array.from(types).sort().join(', ');
        return {
          type: 'list_types',
          answer: `You have the following file types: ${typeList}`,
          data: { types: Array.from(types) }
        };
      }

      case 'total_size': {
        const total = docs.reduce((sum, d) => sum + (d.size || 0), 0);
        return {
          type: 'total_size',
          answer: `Your documents total ${this.formatSize(total)} across ${docs.length} files.`,
          data: { totalSize: total, count: docs.length }
        };
      }

      case 'list_all': {
        if (docs.length === 0) {
          return {
            type: 'list_all',
            answer: "You don't have any documents uploaded yet.",
            data: { count: 0, files: [] }
          };
        }

        const list = docs.slice(0, 15).map((d, i) =>
          `${i + 1}. ${d.filename} (${this.formatSize(d.size)}) - ${d.folderPath || '/'}`
        ).join('\n');

        const more = docs.length > 15 ? `\n... and ${docs.length - 15} more` : '';

        return {
          type: 'list_all',
          answer: `You have ${docs.length} document${docs.length === 1 ? '' : 's'}:\n\n${list}${more}`,
          data: { count: docs.length, files: docs }
        };
      }

      default:
        return {
          type: 'count_all',
          answer: `You have ${docs.length} documents.`,
          data: { count: docs.length }
        };
    }
  }

  /**
   * Format file size for human reading.
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  /**
   * Format date for human reading.
   */
  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

// Singleton instance
let instance: DocumentMetadataService | null = null;

export function getDocumentMetadataService(prisma: PrismaClient): DocumentMetadataService {
  if (!instance) {
    instance = new DocumentMetadataService(prisma);
  }
  return instance;
}
