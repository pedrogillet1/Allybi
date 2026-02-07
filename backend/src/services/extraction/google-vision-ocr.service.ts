// src/services/extraction/googleVisionOcr.service.ts
import { ImageAnnotatorClient } from '@google-cloud/vision';

export type OcrMode = 'document' | 'text';

export interface OcrOptions {
  mode?: OcrMode;                 // 'document' is best for invoices/IDs/scans
  languageHints?: string[];       // e.g. ['pt', 'en']
  maxChars?: number;              // safety cap for huge outputs
  stripHyphenLineBreaks?: boolean;// join "line-\nbreak" => "linebreak"
}

export interface OcrResult {
  text: string;
  confidence?: number;            // avg confidence if available
  blocks?: Array<{
    text: string;
    confidence?: number;
    boundingBox?: { x: number; y: number }[];
  }>;
  warnings: string[];
}

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * GOOGLE VISION OCR SERVICE
 *
 * Env options (choose ONE approach):
 * 1) Standard: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 * 2) Inline JSON: set GOOGLE_VISION_CREDENTIALS_JSON='{"type":"service_account",...}'
 *    (or base64) set GOOGLE_VISION_CREDENTIALS_B64='eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwuLi59'
 *
 * Optional:
 * - GOOGLE_CLOUD_PROJECT
 */
export class GoogleVisionOcrService {
  private client: ImageAnnotatorClient | null = null;
  private initError: string | null = null;

  constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      // If GOOGLE_APPLICATION_CREDENTIALS is set, Google SDK will pick it up automatically.
      const b64 = process.env.GOOGLE_VISION_CREDENTIALS_B64;
      const json = process.env.GOOGLE_VISION_CREDENTIALS_JSON;

      if (b64) {
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const creds = safeJsonParse(decoded);
        if (!creds) throw new Error('Invalid GOOGLE_VISION_CREDENTIALS_B64 (not valid JSON).');

        this.client = new ImageAnnotatorClient({
          credentials: creds,
          projectId: process.env.GOOGLE_CLOUD_PROJECT || creds.project_id,
        });
        return;
      }

      if (json) {
        const creds = safeJsonParse(json);
        if (!creds) throw new Error('Invalid GOOGLE_VISION_CREDENTIALS_JSON (not valid JSON).');

        this.client = new ImageAnnotatorClient({
          credentials: creds,
          projectId: process.env.GOOGLE_CLOUD_PROJECT || creds.project_id,
        });
        return;
      }

      // Fallback to default credentials chain (GOOGLE_APPLICATION_CREDENTIALS or metadata)
      this.client = new ImageAnnotatorClient({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      });
    } catch (e: any) {
      this.client = null;
      this.initError = e?.message || String(e);
    }
  }

  isAvailable(): boolean {
    return !!this.client && !this.initError;
  }

  getInitError(): string | null {
    return this.initError;
  }

  getInitializationError(): string | null {
    return this.initError;
  }

  /**
   * Process a scanned PDF using Google Vision's document text detection.
   * Converts PDF pages to images using pdf2pic, then OCRs each page.
   */
  async processScannedPDF(
    buffer: Buffer
  ): Promise<{ text: string; pageCount: number; confidence: number }> {
    if (!this.client) {
      throw new Error(this.initError || 'Google Vision not initialized');
    }

    // Determine total page count
    let totalPages = 1;
    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      totalPages = pdfData.numpages || 1;
      if (totalPages <= 1 && pdfData.text) {
        const markers = pdfData.text.match(/--\s*\d+\s*of\s*(\d+)\s*--/gi);
        if (markers && markers.length > 0) {
          const last = markers[markers.length - 1].match(/of\s*(\d+)/i);
          if (last) totalPages = parseInt(last[1], 10) || totalPages;
        }
      }
    } catch {
      try {
        const { PDFDocument } = require('pdf-lib');
        const pdfDoc = await PDFDocument.load(buffer);
        totalPages = pdfDoc.getPageCount();
      } catch {}
    }

    const maxPages = Math.min(totalPages, 50);
    console.log(`[OCR] Processing scanned PDF — ${maxPages} pages via batchAnnotateFiles...`);

    // Google Vision batchAnnotateFiles handles PDFs natively (max 5 pages per sync request)
    // Process ALL batches in parallel for maximum throughput
    const BATCH_SIZE = 5;

    const batches: { start: number; end: number; pageRange: number[] }[] = [];
    for (let start = 1; start <= maxPages; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, maxPages);
      const pageRange = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      batches.push({ start, end, pageRange });
    }

    console.log(`[OCR] Launching ${batches.length} parallel batch requests...`);

    const batchResults = await Promise.all(
      batches.map(async ({ start, end, pageRange }) => {
        try {
          const [result] = await this.client!.batchAnnotateFiles({
            requests: [{
              inputConfig: {
                content: buffer,
                mimeType: 'application/pdf',
              },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' as any }],
              pages: pageRange,
            }],
          });

          let batchText = '';
          let batchConfidence = 0;
          let batchConfCount = 0;
          const responses = result.responses?.[0]?.responses || [];
          for (const resp of responses) {
            const pageText = resp.fullTextAnnotation?.text || '';
            if (pageText) {
              batchText += pageText + '\f';
            }
            const blocks = resp.fullTextAnnotation?.pages?.flatMap((p: any) => p.blocks || []) || [];
            const confs = blocks.map((b: any) => b.confidence).filter((c: any): c is number => typeof c === 'number');
            if (confs.length > 0) {
              batchConfidence += confs.reduce((a: number, b: number) => a + b, 0) / confs.length;
              batchConfCount++;
            }
          }

          return { start, batchText, batchConfidence, batchConfCount };
        } catch (batchErr: any) {
          console.warn(`[OCR] Batch pages ${start}-${end} failed:`, batchErr.message);
          return { start, batchText: '', batchConfidence: 0, batchConfCount: 0 };
        }
      })
    );

    // Reassemble in page order (sort by start page)
    batchResults.sort((a, b) => a.start - b.start);

    let fullText = '';
    let totalConfidence = 0;
    let confCount = 0;
    for (const { batchText, batchConfidence, batchConfCount } of batchResults) {
      fullText += batchText;
      totalConfidence += batchConfidence;
      confCount += batchConfCount;
    }

    const confidence = confCount > 0 ? totalConfidence / confCount : 0.7;
    console.log(`[OCR] Extracted ${fullText.length} chars from ${maxPages} pages, confidence: ${(confidence * 100).toFixed(1)}%`);

    return {
      text: fullText.trim(),
      pageCount: maxPages,
      confidence,
    };
  }

  /**
   * OCR from an image buffer with automatic retry for transient errors.
   * Handles RST_STREAM errors, INTERNAL, and UNAVAILABLE gRPC codes.
   *
   * @param buffer - Image buffer to process
   * @param options - OCR options
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns OCR result
   */
  async extractTextWithRetry(
    buffer: Buffer,
    options: OcrOptions = {},
    maxRetries = 3
  ): Promise<OcrResult> {
    // gRPC status codes for transient errors:
    // 2 = UNKNOWN, 13 = INTERNAL, 14 = UNAVAILABLE
    const TRANSIENT_CODES = [2, 13, 14];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.extractTextFromBuffer(buffer, options);
      } catch (err: any) {
        const isTransient =
          TRANSIENT_CODES.includes(err.code) ||
          err.message?.includes('RST_STREAM') ||
          err.message?.includes('INTERNAL') ||
          err.message?.includes('UNAVAILABLE');

        if (isTransient && attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s (capped at 8s)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          console.log(
            `[OCR] Transient error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${err.message}`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    // Unreachable, but TypeScript needs this
    throw new Error('OCR retry exhausted without result');
  }

  /**
   * OCR from an image buffer (PNG/JPG/PDF page image, etc).
   */
  async extractTextFromBuffer(
    buffer: Buffer,
    options: OcrOptions = {}
  ): Promise<OcrResult> {
    const warnings: string[] = [];
    if (!this.client) {
      const msg = this.initError
        ? `Google Vision not initialized: ${this.initError}`
        : 'Google Vision not initialized (missing credentials?)';
      throw new Error(msg);
    }

    const {
      mode = 'document',
      languageHints = ['en', 'pt'],
      maxChars = 200_000,
      stripHyphenLineBreaks = true,
    } = options;

    // Basic guard
    if (!buffer || buffer.length === 0) {
      return { text: '', warnings: ['EMPTY_BUFFER'] };
    }

    // Google API call
    const image = { content: buffer };

    const request =
      mode === 'document'
        ? {
            image,
            imageContext: { languageHints },
          }
        : {
            image,
            imageContext: { languageHints },
          };

    let rawText = '';
    let confidence: number | undefined;
    let blocks: OcrResult['blocks'] | undefined;

    if (mode === 'document') {
      const [res] = await this.client.documentTextDetection(request as any);
      const fullText = res.fullTextAnnotation?.text || '';
      rawText = fullText;

      // Try to compute an average confidence from pages/blocks if present
      const pageBlocks =
        res.fullTextAnnotation?.pages?.flatMap((p) => p.blocks || []) || [];

      if (pageBlocks.length > 0) {
        const confs = pageBlocks
          .map((b) => b.confidence)
          .filter((c): c is number => typeof c === 'number');

        if (confs.length > 0) {
          confidence = confs.reduce((a, b) => a + b, 0) / confs.length;
        }

        // Optional: return blocks (trimmed)
        blocks = pageBlocks.slice(0, 120).map((b) => ({
          text:
            b.paragraphs
              ?.flatMap((p) => p.words || [])
              .flatMap((w) => w.symbols || [])
              .map((s) => s.text)
              .join('') || '',
          confidence: b.confidence ?? undefined,
          boundingBox:
            b.boundingBox?.vertices?.map((v) => ({
              x: v.x || 0,
              y: v.y || 0,
            })) || [],
        }));
      }
    } else {
      const [res] = await this.client.textDetection(request as any);
      rawText = res.fullTextAnnotation?.text || (res.textAnnotations?.[0]?.description ?? '');
    }

    // Normalize output
    let text = rawText.replace(/\r\n/g, '\n');

    // Join hyphenated line breaks: "credi-\ncard" -> "credicard" (optional)
    if (stripHyphenLineBreaks) {
      text = text.replace(/(\w)-\n(\w)/g, '$1$2');
    }

    // Collapse excessive blank lines
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    // Cap size
    if (text.length > maxChars) {
      warnings.push('TRUNCATED_OUTPUT');
      text = text.slice(0, maxChars);
    }

    if (!text) warnings.push('NO_TEXT_DETECTED');

    return { text, confidence, blocks, warnings };
  }
}

// Singleton export (optional)
let _instance: GoogleVisionOcrService | null = null;

export function getGoogleVisionOcrService(): GoogleVisionOcrService {
  if (!_instance) _instance = new GoogleVisionOcrService();
  return _instance;
}

export default getGoogleVisionOcrService();
