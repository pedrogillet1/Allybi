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

    console.log('[OCR] Processing scanned PDF - converting pages to images...');

    const { fromBuffer } = require('pdf2pic');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // Create temp directory for images
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-ocr-'));

    try {
      // Convert PDF pages to images
      const converter = fromBuffer(buffer, {
        density: 200, // DPI for quality
        saveFilename: 'page',
        savePath: tempDir,
        format: 'png',
        width: 2000,
        height: 2800,
      });

      // Get page count - try multiple methods
      let pageCount = 1;
      try {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const pdfData = await parser.getText();
        pageCount = pdfData.numpages || 1;

        // If pdf-parse reports low page count, check for page markers in text
        if (pageCount <= 1 && pdfData.text) {
          const markers = pdfData.text.match(/--\s*\d+\s*of\s*(\d+)\s*--/gi);
          if (markers && markers.length > 0) {
            const lastMarker = markers[markers.length - 1];
            const match = lastMarker.match(/of\s*(\d+)/i);
            if (match) {
              pageCount = parseInt(match[1], 10) || pageCount;
            }
          }
        }
      } catch (e) {
        // Fallback: try pdf-lib
        try {
          const { PDFDocument } = require('pdf-lib');
          const pdfDoc = await PDFDocument.load(buffer);
          pageCount = pdfDoc.getPageCount();
        } catch {}
      }

      console.log(`[OCR] PDF has ${pageCount} pages, converting to images...`);

      let fullText = '';
      let totalConfidence = 0;
      let confCount = 0;

      // Process each page (limit to first 50 for performance)
      const maxPages = Math.min(pageCount, 50);

      for (let i = 1; i <= maxPages; i++) {
        try {
          console.log(`[OCR] Processing page ${i}/${maxPages}...`);

          // Convert page to image
          const result = await converter(i);

          if (result?.path) {
            // Read image and OCR it
            const imageBuffer = fs.readFileSync(result.path);
            const ocrResult = await this.extractTextFromBuffer(imageBuffer, {
              mode: 'document',
              languageHints: ['pt', 'en'],
            });

            if (ocrResult.text) {
              fullText += ocrResult.text + '\f'; // Form feed as page separator

              if (typeof ocrResult.confidence === 'number') {
                totalConfidence += ocrResult.confidence;
                confCount++;
              }
            }

            // Clean up temp image
            fs.unlinkSync(result.path);
          }
        } catch (pageError: any) {
          console.warn(`[OCR] Failed to process page ${i}:`, pageError.message);
        }
      }

      const confidence = confCount > 0 ? totalConfidence / confCount : 0.7;

      console.log(`[OCR] Extracted ${fullText.length} chars from ${maxPages} pages, confidence: ${(confidence * 100).toFixed(1)}%`);

      return {
        text: fullText.trim(),
        pageCount: maxPages,
        confidence,
      };
    } finally {
      // Clean up temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
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
