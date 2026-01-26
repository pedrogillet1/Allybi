/**
 * ⚠️ FROZEN SUBSYSTEM ⚠️
 *
 * This module is production-hardened and contract-locked.
 * Do not modify without:
 *   1. Updating golden snapshots (backend/src/tests/__snapshots__/pptx-*.snapshot.json)
 *   2. Running canary checks (npm run canary:pptx)
 *   3. Updating PPTX_PREVIEW_FUTURE_CHANGES.md
 *   4. Verifying drift metrics remain zero
 *
 * See: PPTX_PREVIEW_FUTURE_CHANGES.md for modification guidelines
 * Contact: Backend Team (@pptx-preview-owner)
 */

/**
 * PPTX Preview Plan Service
 * Canonical decision function for determining preview strategy
 * Eliminates "two systems" drift - ONE decision point for all preview paths
 */

import prisma from '../config/database';
import { fileExists } from '../config/storage';
import {
  PreviewPlan,
  PreviewType,
  PreviewPlanReason
} from '../schemas/pptxPreview.schema';
import { incrementCounter } from './pptxPreviewMetrics.service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

interface DocumentWithMetadata {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  metadata: {
    previewPdfStatus: string | null;
    previewPdfKey: string | null;
    previewPdfError: string | null;
    previewPdfAttempts: number | null;
    slidesData: any;
    slideGenerationStatus: string | null;
  } | null;
}

// ══════════════════════════════════════════════════════════════════════════
// CANONICAL PREVIEW PLAN DECISION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get the canonical preview plan for a PPTX document
 * This is THE single source of truth for preview decisions
 *
 * Priority:
 * 1. PDF ready → use PDF viewer
 * 2. PDF failed but slides ready → use slides viewer
 * 3. PDF/slides processing → show loading state
 * 4. Neither ready → show error
 *
 * @param documentId - Document ID to get preview plan for
 * @param userId - User ID for authorization
 * @returns PreviewPlan with strategy and reason
 */
export async function getPreviewPlan(
  documentId: string,
  userId: string
): Promise<PreviewPlan> {
  console.log(`\n[PREVIEW_PLAN] Getting plan for document ${documentId.substring(0, 8)}...`);

  try {
    // 1. Get document with metadata
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { metadata: true }
    }) as DocumentWithMetadata | null;

    if (!document) {
      console.error(`[PREVIEW_PLAN] Document not found`);
      return {
        previewType: 'pptx-unsupported',
        reason: 'UNSUPPORTED',
        assetsReady: false,
        previewPdfStatus: null,
        message: 'Document not found'
      };
    }

    // 2. Verify user owns document
    if (document.userId !== userId) {
      console.error(`[PREVIEW_PLAN] Unauthorized access attempt`);
      return {
        previewType: 'pptx-unsupported',
        reason: 'UNSUPPORTED',
        assetsReady: false,
        previewPdfStatus: null,
        message: 'Unauthorized'
      };
    }

    // 3. Verify it's a PPTX
    const isPptx = document.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                   document.mimeType?.includes('presentation') ||
                   document.mimeType?.includes('powerpoint');

    if (!isPptx) {
      console.error(`[PREVIEW_PLAN] Not a PPTX document: ${document.mimeType}`);
      return {
        previewType: 'pptx-unsupported',
        reason: 'UNSUPPORTED',
        assetsReady: false,
        previewPdfStatus: null,
        message: 'Not a PowerPoint file'
      };
    }

    const previewPdfStatus = document.metadata?.previewPdfStatus;
    const previewPdfKey = document.metadata?.previewPdfKey;
    const previewPdfError = document.metadata?.previewPdfError;
    const previewPdfAttempts = document.metadata?.previewPdfAttempts || 0;
    const slidesData = document.metadata?.slidesData;
    const slideGenerationStatus = document.metadata?.slideGenerationStatus;

    console.log(`[PREVIEW_PLAN] PDF status: ${previewPdfStatus}, Slides status: ${slideGenerationStatus}`);

    // ═════════════════════════════════════════════════════════════════════
    // CASE 1: PDF IS READY (Best quality preview)
    // ═════════════════════════════════════════════════════════════════════
    if (previewPdfStatus === 'ready' && previewPdfKey) {
      // Verify file actually exists
      const pdfExists = await fileExists(previewPdfKey);
      if (pdfExists) {
        console.log(`✅ [PREVIEW_PLAN] PDF ready → pptx-pdf`);
        return {
          previewType: 'pptx-pdf',
          reason: 'PDF_READY',
          assetsReady: true,
          previewPdfStatus: 'ready',
          previewUrl: `/api/documents/${documentId}/preview-pdf`,
          message: 'PDF preview available'
        };
      } else {
        console.warn(`⚠️  [PREVIEW_PLAN] PDF status 'ready' but file missing: ${previewPdfKey}`);
        // Fall through to check slides
      }
    }

    // Check for legacy PDFs (no metadata but file exists)
    const legacyPdfKey = `${userId}/${documentId}-converted.pdf`;
    const legacyPdfExists = await fileExists(legacyPdfKey);
    if (legacyPdfExists) {
      console.log(`✅ [PREVIEW_PLAN] Legacy PDF found → pptx-pdf`);
      return {
        previewType: 'pptx-pdf',
        reason: 'PDF_READY',
        assetsReady: true,
        previewPdfStatus: 'ready',
        previewUrl: `/api/documents/${documentId}/preview-pdf`,
        message: 'PDF preview available'
      };
    }

    // ═════════════════════════════════════════════════════════════════════
    // CASE 2: PDF FAILED BUT SLIDES READY (Fallback with images)
    // ═════════════════════════════════════════════════════════════════════
    if (previewPdfStatus === 'failed' && slideGenerationStatus === 'completed' && slidesData) {
      let slideCount = 0;
      let parsedSlides: any[] = [];
      try {
        parsedSlides = typeof slidesData === 'string' ? JSON.parse(slidesData) : slidesData;
        slideCount = Array.isArray(parsedSlides) ? parsedSlides.length : 0;
      } catch (e) {}

      if (slideCount > 0) {
        // ✅ DRIFT DETECTION: Plan says assetsReady=true but verify slides actually have storage paths
        const slidesWithPaths = parsedSlides.filter((slide: any) =>
          slide.storagePath || slide.imageUrl || slide.image_url
        );

        if (slidesWithPaths.length === 0 && slideCount > 0) {
          console.error(`🚨 [PLAN_DRIFT] Plan says assetsReady=true for slides but NO slides have storage paths! docId=${documentId.substring(0, 8)}, slideCount=${slideCount}, slideGenerationStatus=${slideGenerationStatus}`);
          incrementCounter('pptx_plan_drift_total', {
            type: 'slides_ready_no_paths',
            docId: documentId.substring(0, 8)
          });
          // Don't return assetsReady=true if we have no actual paths
          return {
            previewType: 'pptx-processing',
            reason: 'SLIDES_PROCESSING',
            assetsReady: false,
            previewPdfStatus: 'failed',
            slidesStatus: 'processing',
            message: 'Preview is being regenerated...'
          };
        }

        console.log(`✅ [PREVIEW_PLAN] PDF failed, slides ready (${slideCount}, ${slidesWithPaths.length} with paths) → pptx-slides`);
        return {
          previewType: 'pptx-slides',
          reason: 'PDF_FAILED_SLIDES_READY',
          assetsReady: true,
          previewPdfStatus: 'failed',
          slidesStatus: 'ready',
          previewUrl: `/api/documents/${documentId}/slides`,
          totalSlides: slideCount,
          message: 'Slide preview available (PDF conversion failed)',
          canRetry: previewPdfAttempts < 3,
          attempts: previewPdfAttempts
        };
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // CASE 3: PDF UNAVAILABLE BUT SLIDES READY (LibreOffice not available)
    // ═════════════════════════════════════════════════════════════════════
    if (slideGenerationStatus === 'completed' && slidesData) {
      let slideCount = 0;
      let parsedSlides: any[] = [];
      try {
        parsedSlides = typeof slidesData === 'string' ? JSON.parse(slidesData) : slidesData;
        slideCount = Array.isArray(parsedSlides) ? parsedSlides.length : 0;
      } catch (e) {}

      if (slideCount > 0) {
        // ✅ DRIFT DETECTION: Verify slides have storage paths
        const slidesWithPaths = parsedSlides.filter((slide: any) =>
          slide.storagePath || slide.imageUrl || slide.image_url
        );

        if (slidesWithPaths.length === 0 && slideCount > 0) {
          console.error(`🚨 [PLAN_DRIFT] Plan says assetsReady=true for slides but NO slides have storage paths! docId=${documentId.substring(0, 8)}, slideCount=${slideCount}, slideGenerationStatus=${slideGenerationStatus}`);
          incrementCounter('pptx_plan_drift_total', {
            type: 'slides_ready_no_paths',
            docId: documentId.substring(0, 8)
          });
          return {
            previewType: 'pptx-processing',
            reason: 'SLIDES_PROCESSING',
            assetsReady: false,
            previewPdfStatus: previewPdfStatus as any,
            slidesStatus: 'processing',
            message: 'Preview is being regenerated...'
          };
        }

        console.log(`✅ [PREVIEW_PLAN] Slides ready (${slideCount}, ${slidesWithPaths.length} with paths), no PDF → pptx-slides`);
        return {
          previewType: 'pptx-slides',
          reason: 'PDF_UNAVAILABLE_SLIDES_READY',
          assetsReady: true,
          previewPdfStatus: previewPdfStatus as any,
          slidesStatus: 'ready',
          previewUrl: `/api/documents/${documentId}/slides`,
          totalSlides: slideCount,
          message: 'Slide preview available'
        };
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // CASE 4: PDF PROCESSING (Show loading state)
    // ═════════════════════════════════════════════════════════════════════
    if (previewPdfStatus === 'pending' || previewPdfStatus === 'processing') {
      console.log(`⏳ [PREVIEW_PLAN] PDF processing → pptx-processing`);
      return {
        previewType: 'pptx-processing',
        reason: 'PDF_PROCESSING',
        assetsReady: false,
        previewPdfStatus: previewPdfStatus as any,
        message: 'PDF preview is being generated...',
        attempts: previewPdfAttempts
      };
    }

    // ═════════════════════════════════════════════════════════════════════
    // CASE 5: SLIDES PROCESSING (Show loading state)
    // ═════════════════════════════════════════════════════════════════════
    if (slideGenerationStatus === 'pending' || slideGenerationStatus === 'processing') {
      console.log(`⏳ [PREVIEW_PLAN] Slides processing → pptx-processing`);
      return {
        previewType: 'pptx-processing',
        reason: 'SLIDES_PROCESSING',
        assetsReady: false,
        previewPdfStatus: previewPdfStatus as any,
        slidesStatus: slideGenerationStatus as any,
        message: 'Preview is being generated...'
      };
    }

    // ═════════════════════════════════════════════════════════════════════
    // CASE 6: NOTHING READY (Error state)
    // ═════════════════════════════════════════════════════════════════════
    console.warn(`⚠️  [PREVIEW_PLAN] No preview available`);
    return {
      previewType: 'pptx-processing',
      reason: 'PROCESSING',
      assetsReady: false,
      previewPdfStatus: previewPdfStatus as any,
      message: previewPdfError || 'Preview is being generated. Please check back in a moment.',
      canRetry: previewPdfAttempts < 3,
      attempts: previewPdfAttempts
    };

  } catch (error: any) {
    console.error(`❌ [PREVIEW_PLAN] Error:`, error.message);
    return {
      previewType: 'pptx-unsupported',
      reason: 'UNSUPPORTED',
      assetsReady: false,
      previewPdfStatus: null,
      message: `Error determining preview: ${error.message}`
    };
  }
}

export default {
  getPreviewPlan
};
