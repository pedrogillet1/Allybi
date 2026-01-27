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
