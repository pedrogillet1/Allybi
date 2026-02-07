/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PDF Generator for Document Scanner
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates single PDF from multiple scanned page images using pdf-lib.
 * Each page is sized to match its image aspect ratio.
 */

import { PDFDocument } from 'pdf-lib';
import { canvasToBlob } from './scannerUtils';

/**
 * Generate a single PDF from multiple scanned page images
 *
 * @param {Array<{canvas: HTMLCanvasElement, rotation: number}>} pages - Scanned pages
 * @param {Object} options - Generation options
 * @returns {Promise<File>} - PDF File object ready for upload
 */
export async function generatePDF(pages, options = {}) {
  const {
    quality = 0.8,
    title = null,
  } = options;

  if (!pages || pages.length === 0) {
    throw new Error('No pages to generate PDF');
  }

  // Create new PDF document
  const pdfDoc = await PDFDocument.create();

  // Set metadata
  const now = new Date();
  const timestamp = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(/[/:]/g, '.').replace(', ', ' ');

  const documentTitle = title || `Scan ${timestamp}`;
  pdfDoc.setTitle(documentTitle);
  pdfDoc.setCreator('Koda Document Scanner');
  pdfDoc.setProducer('Koda');
  pdfDoc.setCreationDate(now);
  pdfDoc.setModificationDate(now);

  // Process each page
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const canvas = page.canvas;

    if (!canvas) continue;

    // Convert canvas to JPEG blob
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const imageBytes = await blob.arrayBuffer();

    // Embed image in PDF
    const image = await pdfDoc.embedJpg(imageBytes);

    // Get image dimensions
    const { width, height } = image;

    // Create page sized to image (in points, 72 DPI)
    // For reasonable print quality, we scale down large images
    const MAX_DIMENSION = 842; // A4 width in points
    let pageWidth = width;
    let pageHeight = height;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      pageWidth = width * scale;
      pageHeight = height * scale;
    }

    // Add page and draw image
    const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  // Serialize PDF
  const pdfBytes = await pdfDoc.save();

  // Create File object
  const filename = `${documentTitle.replace(/[^a-zA-Z0-9\s-]/g, '')}.pdf`;
  const file = new File([pdfBytes], filename, {
    type: 'application/pdf',
    lastModified: now.getTime()
  });

  return file;
}

/**
 * Generate filename for scanned document
 *
 * @returns {string} - Formatted filename
 */
export function generateScanFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');

  return `Scan ${year}-${month}-${day} ${hour}.${minute}.pdf`;
}

/**
 * Estimate PDF file size before generation
 *
 * @param {Array<{canvas: HTMLCanvasElement}>} pages - Pages to estimate
 * @param {number} quality - JPEG quality
 * @returns {number} - Estimated size in bytes
 */
export function estimatePDFSize(pages, quality = 0.8) {
  let totalPixels = 0;

  for (const page of pages) {
    if (page.canvas) {
      totalPixels += page.canvas.width * page.canvas.height;
    }
  }

  // Rough estimate: JPEG at quality 0.8 is about 0.5-1 byte per pixel
  // PDF overhead is minimal for image-only documents
  const bytesPerPixel = 0.3 + (0.5 * quality);

  return Math.round(totalPixels * bytesPerPixel);
}

/**
 * Format file size for display
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
