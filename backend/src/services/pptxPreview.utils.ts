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
 * PPTX Preview Utilities
 * Provides bulletproof helpers for storage path validation and signed URL generation
 * PRODUCTION HARDENED: Retry logic, caching, metrics
 */

import { getSignedUrl, fileExists } from '../config/storage';
import { signedUrlCache } from './pptxSignedUrlCache.service';
import { incrementCounter, recordTiming } from './pptxPreviewMetrics.service';

// ══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════════════

/** Signed URL expiration for slide images (1 hour) */
export const SLIDE_IMAGE_URL_EXPIRATION = 3600;

/** Valid storage path prefixes for security */
const VALID_STORAGE_PREFIXES = ['slides/', 'documents/', 'thumbnails/'];

/** Storage path regex patterns */
const STORAGE_PATH_PATTERNS = {
  slides: /^slides\/[\w-]+\/slide-\d+-(?:image-\d+|composite)\.png$/,
  gcsUrl: /^gcs:\/\/[^\/]+\/(.+)$/,
  s3Url: /^s3:\/\/[^\/]+\/(.+)$/,
  httpsSignedUrl: /(slides\/[^?]+\.png)/
};

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface ResolvedStoragePath {
  isValid: boolean;
  storagePath: string | null;
  source: 'storagePath' | 'gcsUrl' | 's3Url' | 'signedUrlExtraction' | 'none';
  reason?: string;
}

export interface SlideImageUrlResult {
  imageUrl: string | null;
  hasImage: boolean;
  error?: string;
}

// ══════════════════════════════════════════════════════════════════════════
// PATH VALIDATION & RESOLUTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Validates a storage path for security
 * Prevents path traversal and ensures proper format
 */
export function validateStoragePath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  // Security: No path traversal
  if (path.includes('..') || path.includes('//')) {
    return false;
  }

  // Security: Must start with valid prefix
  const hasValidPrefix = VALID_STORAGE_PREFIXES.some(prefix => path.startsWith(prefix));
  if (!hasValidPrefix) {
    return false;
  }

  // For slides, enforce strict format
  if (path.startsWith('slides/')) {
    return STORAGE_PATH_PATTERNS.slides.test(path);
  }

  return true;
}

/**
 * Canonical function to resolve storage path from slide data
 * Handles new format (storagePath), old formats (gcsPath, imageUrl), and fallback extraction
 *
 * Priority:
 * 1. storagePath (new format) - most reliable
 * 2. gcsPath if it's a path, not a URL
 * 3. Extract from gcs:// URL
 * 4. Extract from s3:// URL
 * 5. Extract from signed HTTPS URL (last resort)
 */
export function resolveStoragePathFromSlide(
  slide: any,
  documentId: string
): ResolvedStoragePath {
  // 1. Try storagePath (new format - most reliable)
  if (slide.storagePath && typeof slide.storagePath === 'string') {
    if (validateStoragePath(slide.storagePath)) {
      console.log(`🔐 [RESOLVE] Using storagePath: ${slide.storagePath}`);
      return {
        isValid: true,
        storagePath: slide.storagePath,
        source: 'storagePath'
      };
    } else {
      console.warn(`⚠️  [RESOLVE] Invalid storagePath format: ${slide.storagePath}`);
    }
  }

  // 2. Try gcsPath if it's a direct path (not a URL)
  if (slide.gcsPath && typeof slide.gcsPath === 'string') {
    if (!slide.gcsPath.startsWith('http') && !slide.gcsPath.startsWith('gcs://')) {
      if (validateStoragePath(slide.gcsPath)) {
        console.log(`🔐 [RESOLVE] Using gcsPath as path: ${slide.gcsPath}`);
        return {
          isValid: true,
          storagePath: slide.gcsPath,
          source: 'storagePath'
        };
      }
    }
  }

  // 3. Try imageUrl with various formats
  if (slide.imageUrl && typeof slide.imageUrl === 'string') {
    // 3a. GCS URL format: gcs://bucket-name/path
    const gcsMatch = slide.imageUrl.match(STORAGE_PATH_PATTERNS.gcsUrl);
    if (gcsMatch && gcsMatch[1]) {
      const path = gcsMatch[1];
      if (validateStoragePath(path)) {
        console.log(`🔐 [RESOLVE] Extracted from gcs:// URL: ${path}`);
        return {
          isValid: true,
          storagePath: path,
          source: 'gcsUrl'
        };
      }
    }

    // 3b. S3 URL format: s3://bucket-name/path
    const s3Match = slide.imageUrl.match(STORAGE_PATH_PATTERNS.s3Url);
    if (s3Match && s3Match[1]) {
      const path = s3Match[1];
      if (validateStoragePath(path)) {
        console.log(`🔐 [RESOLVE] Extracted from s3:// URL: ${path}`);
        return {
          isValid: true,
          storagePath: path,
          source: 's3Url'
        };
      }
    }

    // 3c. Signed HTTPS URL - extract path (last resort, backward compatibility)
    if (slide.imageUrl.includes('slides/') && slide.imageUrl.includes('.png')) {
      const match = slide.imageUrl.match(STORAGE_PATH_PATTERNS.httpsSignedUrl);
      if (match && match[1]) {
        const path = match[1];
        if (validateStoragePath(path)) {
          console.log(`🔐 [RESOLVE] [FALLBACK] Extracted from signed URL: ${path}`);
          return {
            isValid: true,
            storagePath: path,
            source: 'signedUrlExtraction'
          };
        }
      }
    }
  }

  // No valid path found
  console.warn(`⚠️  [RESOLVE] No valid storage path found for slide ${slide.slideNumber || 'unknown'}`);
  return {
    isValid: false,
    storagePath: null,
    source: 'none',
    reason: 'No valid storage path in slide data'
  };
}

// ══════════════════════════════════════════════════════════════════════════
// SIGNED URL GENERATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Generate a fresh signed URL for a slide image with error handling
 * PRODUCTION HARDENED: Cache lookup, retry logic, metrics
 * Returns null if file doesn't exist or generation fails
 */
export async function generateSlideImageUrl(
  storagePath: string,
  slideNumber: number,
  docId?: string,
  userId?: string,
  requestId?: string
): Promise<SlideImageUrlResult> {
  const startTime = Date.now();
  const logPrefix = requestId ? `[${requestId}]` : '';
  const MAX_RETRIES = 1;
  let attempt = 0;

  try {
    // Validate path first
    if (!validateStoragePath(storagePath)) {
      console.error(`${logPrefix} ❌ [SIGNED_URL] Invalid storage path: ${storagePath}`);
      incrementCounter('pptx_signed_url_generated_total', { status: 'invalid_path' });
      return {
        imageUrl: null,
        hasImage: false,
        error: 'Invalid storage path'
      };
    }

    // Check cache if docId provided
    if (docId) {
      const cached = signedUrlCache.get(docId, storagePath, userId);
      if (cached) {
        console.log(`${logPrefix} ♻️  [SIGNED_URL] Cache hit for slide ${slideNumber}: ${storagePath}`);
        incrementCounter('pptx_signed_url_generated_total', { status: 'cached' });
        const duration = Date.now() - startTime;
        recordTiming('pptx_signed_url_duration_ms', duration, { source: 'cache' });
        return {
          imageUrl: cached,
          hasImage: true
        };
      }
    }

    // Check if file exists
    const exists = await fileExists(storagePath);
    if (!exists) {
      console.warn(`${logPrefix} ⚠️  [MISSING_OBJECT] File not found: ${storagePath}`);
      incrementCounter('pptx_missing_object_total', { docId: docId || 'unknown' });
      const duration = Date.now() - startTime;
      recordTiming('pptx_signed_url_duration_ms', duration, { source: 'missing' });
      return {
        imageUrl: null,
        hasImage: false,
        error: 'File not found in storage'
      };
    }

    // Generate signed URL with retry logic
    let signedUrl: string | null = null;

    while (attempt <= MAX_RETRIES) {
      try {
        signedUrl = await getSignedUrl(storagePath, SLIDE_IMAGE_URL_EXPIRATION);
        break; // Success
      } catch (error: any) {
        attempt++;
        if (attempt > MAX_RETRIES) {
          throw error; // Exhausted retries
        }
        console.warn(`${logPrefix} ⚠️  [SIGNED_URL] Retry ${attempt}/${MAX_RETRIES} for slide ${slideNumber}`);
        // Brief backoff before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!signedUrl) {
      throw new Error('Failed to generate signed URL after retries');
    }

    // Cache the result if docId provided
    if (docId) {
      signedUrlCache.set(docId, storagePath, signedUrl, userId);
    }

    console.log(`${logPrefix} ✅ [SIGNED_URL] Generated for slide ${slideNumber}: ${storagePath}`);
    incrementCounter('pptx_signed_url_generated_total', { status: 'success' });
    const duration = Date.now() - startTime;
    recordTiming('pptx_signed_url_duration_ms', duration, { source: 'generated' });

    // ✅ DRIFT DETECTION: Contract violation check
    // This should NEVER happen, but if it does, we need to know
    if (!signedUrl || signedUrl.trim() === '') {
      console.error(`${logPrefix} 🚨 [CONTRACT_VIOLATION] hasImage=true but imageUrl is empty! docId=${docId}, slideNumber=${slideNumber}, userId=${userId}, requestId=${requestId}`);
      incrementCounter('pptx_contract_violation_total', {
        type: 'empty_url_with_hasImage',
        docId: docId?.substring(0, 8) || 'unknown'
      });
      return {
        imageUrl: null,
        hasImage: false,
        error: 'Internal error: signed URL generation succeeded but URL is empty'
      };
    }

    return {
      imageUrl: signedUrl,
      hasImage: true
    };
  } catch (error: any) {
    console.error(`${logPrefix} ❌ [SIGNED_URL] Error for slide ${slideNumber}:`, error.message);
    incrementCounter('pptx_signed_url_generated_total', { status: 'error' });
    incrementCounter('pptx_errors_total', { stage: 'url_generation' });

    // ✅ DRIFT DETECTION: Signing drift (file exists but signing failed after retries)
    // This indicates storage provider behavior change or auth issue
    if (attempt > MAX_RETRIES) {
      console.error(`${logPrefix} 🚨 [SIGNING_DRIFT] File exists but signing failed after ${MAX_RETRIES + 1} attempts! storagePath=${storagePath}, docId=${docId}, userId=${userId}, requestId=${requestId}, error=${error.message}`);
      incrementCounter('pptx_signing_drift_total', {
        attempts: String(MAX_RETRIES + 1),
        docId: docId?.substring(0, 8) || 'unknown'
      });
    }

    const duration = Date.now() - startTime;
    recordTiming('pptx_signed_url_duration_ms', duration, { source: 'error' });
    return {
      imageUrl: null,
      hasImage: false,
      error: error.message
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// BACKFILL DETECTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check if a slide needs backfill (has valid path but missing storagePath field)
 */
export function needsBackfill(slide: any, resolvedPath: ResolvedStoragePath): boolean {
  // Has storagePath already - no backfill needed
  if (slide.storagePath && typeof slide.storagePath === 'string') {
    return false;
  }

  // Successfully resolved path from old format - needs backfill
  if (resolvedPath.isValid && resolvedPath.storagePath) {
    return true;
  }

  return false;
}

/**
 * Create a backfilled slide with storagePath added
 */
export function createBackfilledSlide(slide: any, storagePath: string): any {
  return {
    ...slide,
    storagePath // Add the missing storagePath field
  };
}

export default {
  validateStoragePath,
  resolveStoragePathFromSlide,
  generateSlideImageUrl,
  needsBackfill,
  createBackfilledSlide,
  SLIDE_IMAGE_URL_EXPIRATION
};
