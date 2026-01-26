/**
 * Mistral OCR Service
 *
 * Uses Mistral's Pixtral vision model for high-quality OCR on scanned PDFs.
 * Converts PDF pages to images and extracts text using AI vision.
 */

import { Mistral } from '@mistralai/mistralai';
import { config } from '../config/env';

// PDF to image conversion
const pdfToPng = require('pdf-to-png-converter').pdfToPng;

interface OCRResult {
  text: string;
  pageCount: number;
  confidence: number;
  processingTime?: number;
}

interface PageOCRResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

class MistralOCRService {
  private client: Mistral | null = null;
  private initError: string | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const apiKey = config.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;

      if (!apiKey) {
        this.initError = 'MISTRAL_API_KEY not configured';
        console.warn('⚠️ [MistralOCR] API key not configured - OCR will be unavailable');
        return;
      }

      this.client = new Mistral({ apiKey });
      this.isInitialized = true;
      console.log('✅ [MistralOCR] Service initialized');
    } catch (error: any) {
      this.initError = error.message;
      console.error('❌ [MistralOCR] Initialization failed:', error.message);
    }
  }

  /**
   * Check if the OCR service is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Get initialization error if any
   */
  getInitializationError(): string | null {
    return this.initError;
  }

  /**
   * Check if a PDF appears to be scanned (image-based)
   */
  async isScannedPDF(buffer: Buffer): Promise<boolean> {
    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();

      const text = data.text || '';
      const pageCount = data.numpages || 1;
      const avgCharsPerPage = text.length / pageCount;

      // If less than 100 chars per page, likely scanned
      return avgCharsPerPage < 100;
    } catch (error) {
      console.warn('⚠️ [MistralOCR] Could not determine if PDF is scanned:', error);
      return false;
    }
  }

  /**
   * Process a scanned PDF using Mistral's vision model
   */
  async processScannedPDF(buffer: Buffer): Promise<OCRResult> {
    if (!this.isAvailable()) {
      throw new Error('Mistral OCR service is not available: ' + (this.initError || 'Unknown error'));
    }

    const startTime = Date.now();
    console.log('🔍 [MistralOCR] Starting OCR processing...');

    try {
      // Step 1: Convert PDF pages to images
      console.log('📄 [MistralOCR] Converting PDF pages to images...');
      const pngPages = await pdfToPng(buffer, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: 2.0, // Higher resolution for better OCR
        outputFormat: 'buffer',
      });

      console.log(`📄 [MistralOCR] Converted ${pngPages.length} pages to images`);

      // Step 2: Process each page with Mistral Vision
      const pageResults: PageOCRResult[] = [];

      for (let i = 0; i < pngPages.length; i++) {
        const page = pngPages[i];
        console.log(`🔍 [MistralOCR] Processing page ${i + 1}/${pngPages.length}...`);

        try {
          const pageResult = await this.extractTextFromImage(page.content, i + 1);
          pageResults.push(pageResult);
        } catch (pageError: any) {
          console.error(`⚠️ [MistralOCR] Error on page ${i + 1}:`, pageError.message);
          pageResults.push({
            pageNumber: i + 1,
            text: `[Page ${i + 1}: OCR failed - ${pageError.message}]`,
            confidence: 0
          });
        }

        // Small delay to avoid rate limiting
        if (i < pngPages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Step 3: Combine results
      const combinedText = pageResults
        .map(p => `--- Page ${p.pageNumber} ---\n${p.text}`)
        .join('\n\n');

      const avgConfidence = pageResults.length > 0
        ? pageResults.reduce((sum, p) => sum + p.confidence, 0) / pageResults.length
        : 0;

      const processingTime = Date.now() - startTime;
      console.log(`✅ [MistralOCR] Completed in ${processingTime}ms`);

      return {
        text: combinedText,
        pageCount: pngPages.length,
        confidence: avgConfidence,
        processingTime
      };
    } catch (error: any) {
      console.error('❌ [MistralOCR] Processing failed:', error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Extract text from a single image using Mistral's Pixtral model
   */
  private async extractTextFromImage(imageBuffer: Buffer, pageNumber: number): Promise<PageOCRResult> {
    if (!this.client) {
      throw new Error('Mistral client not initialized');
    }

    // Convert buffer to base64 data URL
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    try {
      const response = await this.client.chat.complete({
        model: 'pixtral-12b-2409', // Mistral's vision model
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract ALL text from this scanned document page.

Rules:
1. Preserve the original formatting and structure as much as possible
2. Include headers, paragraphs, lists, and tables
3. For tables, use markdown table format
4. Do not summarize or interpret - extract exactly what is written
5. If text is unclear, mark it as [unclear]
6. Preserve line breaks where they appear in the document

Output ONLY the extracted text, no explanations.`
              },
              {
                type: 'image_url',
                imageUrl: dataUrl
              }
            ]
          }
        ],
        maxTokens: 4096,
        temperature: 0.1 // Low temperature for accurate extraction
      });

      const extractedText = response.choices?.[0]?.message?.content || '';

      // Clean up the text
      const cleanedText = typeof extractedText === 'string'
        ? extractedText.trim()
        : '';

      return {
        pageNumber,
        text: cleanedText,
        confidence: cleanedText.length > 50 ? 0.9 : 0.5
      };
    } catch (error: any) {
      console.error(`❌ [MistralOCR] Vision API error on page ${pageNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Process a single image for OCR
   */
  async processImage(buffer: Buffer): Promise<OCRResult> {
    if (!this.isAvailable()) {
      throw new Error('Mistral OCR service is not available: ' + (this.initError || 'Unknown error'));
    }

    const startTime = Date.now();

    try {
      const result = await this.extractTextFromImage(buffer, 1);

      return {
        text: result.text,
        pageCount: 1,
        confidence: result.confidence,
        processingTime: Date.now() - startTime
      };
    } catch (error: any) {
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }
}

// Singleton instance
const mistralOCRService = new MistralOCRService();

export default mistralOCRService;
export { MistralOCRService, OCRResult };
