/**
 * OCR Cleanup Service
 * Cleans and normalizes OCR output
 */

export class OCRCleanupService {
  /**
   * Clean OCR text by removing common artifacts
   */
  clean(text: string): string {
    return text
      // Remove repeated characters (common OCR error)
      .replace(/(.)\1{3,}/g, '$1$1')
      // Fix common OCR substitutions
      .replace(/[|l](?=[a-z])/g, 'I')
      .replace(/0(?=[a-zA-Z])/g, 'O')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();
  }

  /**
   * Detect if text appears to be OCR output
   */
  isOCRText(text: string): boolean {
    // Check for common OCR artifacts
    const artifacts = [
      /[|l]{3,}/,           // Multiple pipes or l's
      /\s{5,}/,             // Excessive whitespace
      /[^\x20-\x7E]{5,}/,   // Non-printable characters
    ];
    
    return artifacts.some(pattern => pattern.test(text));
  }
}

export const ocrCleanup = new OCRCleanupService();
