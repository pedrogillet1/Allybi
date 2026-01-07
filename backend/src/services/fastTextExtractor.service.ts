/**
 * FastTextExtractorService
 *
 * FAST AVAILABILITY PIPELINE - Must complete in < 1 second
 *
 * This service extracts raw text from uploaded files SYNCHRONOUSLY
 * to enable immediate chat availability. Heavy processing (OCR,
 * embeddings) happens in background workers.
 *
 * Supported formats:
 * - PDF: Text layer only (no OCR)
 * - DOCX: XML text extraction
 * - PPTX: Slide text extraction
 * - XLSX: Cell string extraction
 * - TXT/MD/CSV: Direct read
 * - Images: NO extraction here (background OCR only)
 */

// pdf-parse v2 uses PDFParse class
const { PDFParse } = require('pdf-parse');
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const PREVIEW_TEXT_LENGTH = 10000; // First 10k chars for preview
const MAX_TEXT_LENGTH = 500000; // 500k chars max for rawText

interface ExtractionResult {
  success: boolean;
  rawText: string | null;
  previewText: string | null;
  error?: string;
  extractionTimeMs: number;
}

export class FastTextExtractorService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET || 'koda-user-file';
  }

  /**
   * Extract text from a file stored in S3
   * Target: < 1 second for most files
   */
  async extractFromS3(s3Key: string, mimeType: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      // Get file from S3
      const buffer = await this.getFileFromS3(s3Key);
      if (!buffer) {
        return {
          success: false,
          rawText: null,
          previewText: null,
          error: 'Failed to retrieve file from S3',
          extractionTimeMs: Date.now() - startTime,
        };
      }

      // Extract based on mime type
      const result = await this.extractFromBuffer(buffer, mimeType);

      return {
        ...result,
        extractionTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error('[FastTextExtractor] Error:', error.message);
      return {
        success: false,
        rawText: null,
        previewText: null,
        error: error.message,
        extractionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract text from a buffer directly
   */
  async extractFromBuffer(buffer: Buffer, mimeType: string): Promise<Omit<ExtractionResult, 'extractionTimeMs'>> {
    try {
      let rawText: string | null = null;

      // Route to appropriate extractor
      if (mimeType === 'application/pdf') {
        rawText = await this.extractPdfText(buffer);
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        rawText = await this.extractDocxText(buffer);
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        rawText = await this.extractXlsxText(buffer);
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        rawText = await this.extractPptxText(buffer);
      } else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
        rawText = buffer.toString('utf-8');
      } else if (mimeType.startsWith('image/')) {
        // Images require OCR - not done in fast pipeline
        return {
          success: true,
          rawText: null,
          previewText: '[Image file - processing in background]',
        };
      } else {
        return {
          success: false,
          rawText: null,
          previewText: null,
          error: `Unsupported mime type: ${mimeType}`,
        };
      }

      // Truncate if needed
      if (rawText && rawText.length > MAX_TEXT_LENGTH) {
        rawText = rawText.substring(0, MAX_TEXT_LENGTH);
      }

      // Generate preview
      const previewText = rawText ? rawText.substring(0, PREVIEW_TEXT_LENGTH) : null;

      return {
        success: true,
        rawText,
        previewText,
      };
    } catch (error: any) {
      console.error('[FastTextExtractor] Extraction error:', error.message);
      return {
        success: false,
        rawText: null,
        previewText: null,
        error: error.message,
      };
    }
  }

  /**
   * Extract text from PDF using text layer only (no OCR)
   */
  private async extractPdfText(buffer: Buffer): Promise<string | null> {
    try {
      // pdf-parse v2 API
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      const text = data.text?.trim();

      if (!text || text.length < 10) {
        // Likely scanned PDF - needs OCR in background
        return null;
      }

      return text;
    } catch (error: any) {
      console.error('[FastTextExtractor] PDF extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Extract text from DOCX using mammoth
   */
  private async extractDocxText(buffer: Buffer): Promise<string | null> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || null;
    } catch (error: any) {
      console.error('[FastTextExtractor] DOCX extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Extract text from XLSX - all cells as text
   */
  private async extractXlsxText(buffer: Buffer): Promise<string | null> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const textParts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        textParts.push(`=== ${sheetName} ===`);

        // Convert to array of arrays
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

        for (const row of rows) {
          const rowText = row
            .map(cell => String(cell).trim())
            .filter(cell => cell.length > 0)
            .join(' | ');
          if (rowText) {
            textParts.push(rowText);
          }
        }
      }

      return textParts.join('\n');
    } catch (error: any) {
      console.error('[FastTextExtractor] XLSX extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Extract text from PPTX slides
   * Uses basic XML parsing since pptx libraries can be slow
   */
  private async extractPptxText(buffer: Buffer): Promise<string | null> {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer);
      const textParts: string[] = [];

      // Get all slide XML files
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
          return numA - numB;
        });

      for (const slideFile of slideFiles) {
        const content = await zip.files[slideFile].async('string');
        // Extract text between <a:t> tags
        const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const slideText = textMatches
          .map(match => match.replace(/<\/?a:t>/g, '').trim())
          .filter(text => text.length > 0)
          .join(' ');

        if (slideText) {
          textParts.push(slideText);
        }
      }

      return textParts.join('\n\n');
    } catch (error: any) {
      console.error('[FastTextExtractor] PPTX extraction failed:', error.message);
      return null;
    }
  }

  /**
   * Get file buffer from S3
   */
  private async getFileFromS3(s3Key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error: any) {
      console.error('[FastTextExtractor] S3 fetch error:', error.message);
      return null;
    }
  }
}

// Singleton instance
export const fastTextExtractor = new FastTextExtractorService();
