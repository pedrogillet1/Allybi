/**
 * Google Cloud Vision OCR Service
 *
 * Fast document OCR using Google Cloud Vision API.
 * Converts PDF pages to images and processes them in parallel batches.
 */

import { ImageAnnotatorClient } from '@google-cloud/vision';
import path from 'path';

const pdfToPng = require('pdf-to-png-converter').pdfToPng;

interface OCRResult {
  text: string;
  pageCount: number;
  confidence: number;
  processingTime?: number;
}

class GoogleVisionOCRService {
  private client: ImageAnnotatorClient | null = null;
  private initError: string | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const keyFilePath = process.env.GCS_KEY_FILE ||
        path.join(__dirname, '../../gcp-service-account.json');

      if (!process.env.ENABLE_GOOGLE_CLOUD_VISION || process.env.ENABLE_GOOGLE_CLOUD_VISION !== 'true') {
        this.initError = 'Google Cloud Vision not enabled (ENABLE_GOOGLE_CLOUD_VISION != true)';
        console.warn('⚠️ [GoogleVisionOCR] Not enabled');
        return;
      }

      this.client = new ImageAnnotatorClient({
        keyFilename: keyFilePath
      });

      this.isInitialized = true;
      console.log('✅ [GoogleVisionOCR] Service initialized');
    } catch (error: any) {
      this.initError = error.message;
      console.error('❌ [GoogleVisionOCR] Initialization failed:', error.message);
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && this.client !== null;
  }

  getInitializationError(): string | null {
    return this.initError;
  }

  /**
   * Process a scanned PDF by converting pages to images and OCRing in parallel
   */
  async processScannedPDF(buffer: Buffer): Promise<OCRResult> {
    if (!this.isAvailable() || !this.client) {
      throw new Error('Google Vision OCR not available: ' + (this.initError || 'Unknown error'));
    }

    const startTime = Date.now();
    console.log('🔍 [GoogleVisionOCR] Starting OCR...');

    try {
      // Step 1: Convert PDF to images
      console.log('📄 [GoogleVisionOCR] Converting PDF pages to images...');
      const pngPages = await pdfToPng(buffer, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: 1.5, // Balance between quality and speed
        outputFormat: 'buffer',
      });

      console.log(`📄 [GoogleVisionOCR] Converted ${pngPages.length} pages`);

      // Step 2: Process pages in parallel batches of 5
      const BATCH_SIZE = 5;
      const pageTexts: string[] = new Array(pngPages.length).fill('');

      for (let i = 0; i < pngPages.length; i += BATCH_SIZE) {
        const batch = pngPages.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (page: any, idx: number) => {
          const pageNum = i + idx;
          try {
            const [result] = await this.client!.textDetection({
              image: { content: page.content.toString('base64') }
            });
            return {
              pageNum,
              text: result.textAnnotations?.[0]?.description || ''
            };
          } catch (err: any) {
            console.warn(`⚠️ [GoogleVisionOCR] Page ${pageNum + 1} failed:`, err.message);
            return { pageNum, text: `[Page ${pageNum + 1}: OCR failed]` };
          }
        });

        const results = await Promise.all(batchPromises);
        for (const r of results) {
          pageTexts[r.pageNum] = r.text;
        }

        console.log(`🔍 [GoogleVisionOCR] Processed pages ${i + 1}-${Math.min(i + BATCH_SIZE, pngPages.length)} of ${pngPages.length}`);
      }

      // Step 3: Combine results
      const fullText = pageTexts
        .map((text, i) => `--- Page ${i + 1} ---\n${text}`)
        .join('\n\n');

      const processingTime = Date.now() - startTime;
      console.log(`✅ [GoogleVisionOCR] Completed in ${(processingTime / 1000).toFixed(1)}s`);

      return {
        text: fullText,
        pageCount: pngPages.length,
        confidence: 0.9,
        processingTime
      };
    } catch (error: any) {
      console.error('❌ [GoogleVisionOCR] Processing failed:', error.message);
      throw new Error(`Google Vision OCR failed: ${error.message}`);
    }
  }

  /**
   * Process a single image for OCR
   */
  async processImage(buffer: Buffer): Promise<OCRResult> {
    if (!this.isAvailable() || !this.client) {
      throw new Error('Google Vision OCR not available');
    }

    const startTime = Date.now();

    try {
      const [result] = await this.client.textDetection({
        image: { content: buffer.toString('base64') }
      });

      const text = result.textAnnotations?.[0]?.description || '';

      return {
        text,
        pageCount: 1,
        confidence: 0.9,
        processingTime: Date.now() - startTime
      };
    } catch (error: any) {
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }
}

const googleVisionOCR = new GoogleVisionOCRService();
export default googleVisionOCR;
