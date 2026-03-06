/**
 * PPTX Slide Image Generator Service
 *
 * Renders PDF pages (converted from PPTX via LibreOffice) to PNG images
 * and uploads them to S3 for fast preview loading.
 *
 * Flow:
 * 1. Takes a PDF buffer (already converted from PPTX)
 * 2. Uses pdf-to-png-converter to render each page as PNG
 * 3. Uploads each PNG to S3 with path: slides/${documentId}/slide-${slideNumber}-composite.png
 * 4. Returns slidesData array with storagePath and hasImage: true
 */

import { pdfToPng, PngPageOutput } from "pdf-to-png-converter";
import {
  downloadFile,
  uploadFile,
  fileExists,
  getSignedUrl,
} from "../../config/storage";
import prisma from "../../config/database";
import { isPptxMime } from "../ingestion/extraction/ingestionMimeRegistry.service";
import { performanceConsole as previewLog } from "../../utils/logger";

export interface SlideImageData {
  slideNumber: number;
  storagePath: string;
  hasImage: boolean;
  imageUrl?: string;
  content?: string;
  textCount?: number;
}

export interface SlideGenerationResult {
  success: boolean;
  slidesData?: SlideImageData[];
  totalSlides?: number;
  error?: string;
  duration?: number;
}

// Storage path format for slide images
const getSlideStoragePath = (
  documentId: string,
  slideNumber: number,
): string => {
  return `slides/${documentId}/slide-${slideNumber}-composite.png`;
};

/**
 * Generate slide images from a PDF buffer
 */
export async function generateSlideImages(
  pdfBuffer: Buffer,
  documentId: string,
  options: {
    dpi?: number;
    signedUrlExpiration?: number;
  } = {},
): Promise<SlideGenerationResult> {
  const startTime = Date.now();
  const { dpi = 150, signedUrlExpiration = 604800 } = options;

  previewLog.log(
    `[SlideImageGen] Starting slide image generation for ${documentId.substring(0, 8)}...`,
  );

  try {
    const pdfArrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    );

    // 1. Convert PDF pages to PNG images
    previewLog.log(
      `[SlideImageGen] Converting PDF to PNG images (DPI: ${dpi})...`,
    );

    const pngPages: PngPageOutput[] = await pdfToPng(pdfArrayBuffer, {
      disableFontFace: true,
      useSystemFonts: true,
      viewportScale: dpi / 72,
    });

    previewLog.log(`[SlideImageGen] Converted ${pngPages.length} pages to PNG`);

    if (pngPages.length === 0) {
      return {
        success: false,
        error: "No pages found in PDF",
      };
    }

    // 2. Upload each page image to S3
    const slidesData: SlideImageData[] = [];
    let uploadedCount = 0;

    for (let i = 0; i < pngPages.length; i++) {
      const page = pngPages[i];
      const slideNumber = i + 1;
      const storagePath = getSlideStoragePath(documentId, slideNumber);
      const pageContent = page.content;

      try {
        if (!pageContent) {
          throw new Error("PNG page content missing");
        }
        await uploadFile(storagePath, pageContent, "image/png");
        uploadedCount++;

        const imageUrl = await getSignedUrl(storagePath, signedUrlExpiration);

        slidesData.push({
          slideNumber,
          storagePath,
          hasImage: true,
          imageUrl,
        });

        previewLog.log(
          `   Uploaded slide ${slideNumber}/${pngPages.length}: ${storagePath}`,
        );
      } catch (uploadError: any) {
        previewLog.error(
          `   Failed to upload slide ${slideNumber}:`,
          uploadError.message,
        );

        slidesData.push({
          slideNumber,
          storagePath: "",
          hasImage: false,
        });
      }
    }

    const duration = Date.now() - startTime;
    previewLog.log(
      `[SlideImageGen] Generated ${uploadedCount}/${pngPages.length} slide images in ${duration}ms`,
    );

    return {
      success: uploadedCount > 0,
      slidesData,
      totalSlides: pngPages.length,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    previewLog.error(`[SlideImageGen] Error:`, error.message);

    return {
      success: false,
      error: error.message,
      duration,
    };
  }
}

/**
 * Generate slide images for a PPTX document that already has a converted PDF
 */
export async function generateSlideImagesForDocument(
  documentId: string,
  userId: string,
): Promise<SlideGenerationResult> {
  previewLog.log(
    `[SlideImageGen] Processing document ${documentId.substring(0, 8)}...`,
  );

  try {
    // 1. Get document metadata to find PDF key
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true },
    });

    if (!document) {
      return { success: false, error: "Document not found" };
    }

    if (document.userId !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    // 2. Verify it's a PPTX
    const isPptx = isPptxMime(document.mimeType);

    if (!isPptx) {
      return { success: false, error: "Not a PowerPoint file" };
    }

    // 3. Check for existing slide images
    const existingSlidesData = document.metadata?.slidesData;
    if (existingSlidesData) {
      let parsedSlides: any[] = [];
      try {
        parsedSlides =
          typeof existingSlidesData === "string"
            ? JSON.parse(existingSlidesData)
            : existingSlidesData;
      } catch (e) {}

      const slidesWithImages = parsedSlides.filter(
        (s: any) => s.hasImage && s.storagePath,
      );
      if (slidesWithImages.length > 0) {
        // Verify files actually exist in the current storage provider before skipping.
        // After a migration (e.g. S3 -> GCS) the metadata may be stale.
        const probeExists = await fileExists(slidesWithImages[0].storagePath);
        if (probeExists) {
          previewLog.log(
            `[SlideImageGen] Document already has ${slidesWithImages.length} slide images, skipping`,
          );
          return {
            success: true,
            slidesData: parsedSlides,
            totalSlides: parsedSlides.length,
          };
        }
        previewLog.log(
          `[SlideImageGen] Slide files not found in current storage, regenerating...`,
        );
      }
    }

    // 4. Update status to processing
    await updateSlideGenerationStatus(documentId, "processing");

    // 5. Find the preview PDF
    const previewPdfKey =
      document.metadata?.previewPdfKey ||
      `${userId}/${documentId}-converted.pdf`;

    const pdfExists = await fileExists(previewPdfKey);
    if (!pdfExists) {
      previewLog.warn(`[SlideImageGen] Preview PDF not found: ${previewPdfKey}`);
      await updateSlideGenerationStatus(
        documentId,
        "failed",
        "Preview PDF not available",
      );
      return {
        success: false,
        error:
          "Preview PDF not available. PDF conversion may still be in progress.",
      };
    }

    // 6. Download the PDF
    previewLog.log(`[SlideImageGen] Downloading PDF: ${previewPdfKey}`);
    const pdfBuffer = await downloadFile(previewPdfKey);

    // 7. Generate slide images
    const result = await generateSlideImages(pdfBuffer, documentId);

    if (!result.success) {
      await updateSlideGenerationStatus(documentId, "failed", result.error);
      return result;
    }

    // 8. Update document metadata with slidesData
    await prisma.documentMetadata.upsert({
      where: { documentId },
      update: {
        slidesData: JSON.stringify(result.slidesData),
        slideGenerationStatus: "completed",
        slideGenerationError: null,
      },
      create: {
        documentId,
        slidesData: JSON.stringify(result.slidesData),
        slideGenerationStatus: "completed",
      },
    });

    previewLog.log(
      `[SlideImageGen] Updated metadata with ${result.slidesData?.length} slides`,
    );

    return result;
  } catch (error: any) {
    previewLog.error(`[SlideImageGen] Error processing document:`, error.message);
    await updateSlideGenerationStatus(documentId, "failed", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Update slide generation status in metadata
 */
async function updateSlideGenerationStatus(
  documentId: string,
  status: string,
  error?: string,
): Promise<void> {
  await prisma.documentMetadata.upsert({
    where: { documentId },
    update: {
      slideGenerationStatus: status,
      slideGenerationError: error || null,
    },
    create: {
      documentId,
      slideGenerationStatus: status,
      slideGenerationError: error || null,
    },
  });
}

/**
 * Check if a document needs slide image generation
 */
export function needsSlideImageGeneration(
  mimeType: string,
  slidesData: any,
  slideGenerationStatus: string | null,
): boolean {
  const isPptx = isPptxMime(mimeType);

  if (!isPptx) return false;

  if (
    slideGenerationStatus === "completed" ||
    slideGenerationStatus === "processing"
  ) {
    let parsedSlides: any[] = [];
    try {
      parsedSlides =
        typeof slidesData === "string" ? JSON.parse(slidesData) : slidesData;
    } catch (e) {}

    if (Array.isArray(parsedSlides) && parsedSlides.length > 0) {
      const slidesWithImages = parsedSlides.filter(
        (s: any) => s.hasImage && s.storagePath,
      );
      if (slidesWithImages.length > 0) {
        return false;
      }
    }
  }

  return true;
}

export default {
  generateSlideImages,
  generateSlideImagesForDocument,
  needsSlideImageGeneration,
  getSlideStoragePath,
};
