/**
 * Tests for PPTX Preview Utilities
 * Tests path validation, resolution, and signed URL generation
 */

import {
  validateStoragePath,
  resolveStoragePathFromSlide,
  needsBackfill,
  createBackfilledSlide
} from '../services/pptxPreview.utils';

describe('PPTX Preview Utilities', () => {
  const mockDocumentId = 'doc-123-456-789';

  describe('validateStoragePath', () => {
    it('should accept valid slides path', () => {
      expect(validateStoragePath('slides/doc-123/slide-1-image-1.png')).toBe(true);
    });

    it('should accept valid slides composite path', () => {
      expect(validateStoragePath('slides/doc-123/slide-1-composite.png')).toBe(true);
    });

    it('should accept valid documents path', () => {
      expect(validateStoragePath('documents/user-123/file.pdf')).toBe(true);
    });

    it('should reject path traversal attacks', () => {
      expect(validateStoragePath('slides/../../../etc/passwd')).toBe(false);
      expect(validateStoragePath('slides/doc-123/../../../secrets')).toBe(false);
    });

    it('should reject double slashes', () => {
      expect(validateStoragePath('slides//doc-123/file.png')).toBe(false);
    });

    it('should reject invalid prefix', () => {
      expect(validateStoragePath('malicious/path/file.png')).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(validateStoragePath(null as any)).toBe(false);
      expect(validateStoragePath(undefined as any)).toBe(false);
      expect(validateStoragePath(123 as any)).toBe(false);
    });

    it('should enforce strict format for slides', () => {
      expect(validateStoragePath('slides/doc-123/random-file.png')).toBe(false);
      expect(validateStoragePath('slides/doc-123/slide-X-image-1.png')).toBe(false);
    });
  });

  describe('resolveStoragePathFromSlide', () => {
    it('should use storagePath when available (new format)', () => {
      const slide = {
        slideNumber: 1,
        storagePath: 'slides/doc-123/slide-1-composite.png',
        imageUrl: 'https://expired-signed-url.com/...'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      expect(resolved.isValid).toBe(true);
      expect(resolved.storagePath).toBe('slides/doc-123/slide-1-composite.png');
      expect(resolved.source).toBe('storagePath');
    });

    it('should extract from gcs:// URL format', () => {
      const slide = {
        slideNumber: 1,
        imageUrl: 'gcs://bucket-name/slides/doc-123/slide-1-image-1.png'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      expect(resolved.isValid).toBe(true);
      expect(resolved.storagePath).toBe('slides/doc-123/slide-1-image-1.png');
      expect(resolved.source).toBe('gcsUrl');
    });

    it('should extract from s3:// URL format', () => {
      const slide = {
        slideNumber: 1,
        imageUrl: 's3://bucket-name/slides/doc-123/slide-1-image-1.png'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      expect(resolved.isValid).toBe(true);
      expect(resolved.storagePath).toBe('slides/doc-123/slide-1-image-1.png');
      expect(resolved.source).toBe('s3Url');
    });

    it('should extract from signed HTTPS URL (fallback)', () => {
      const slide = {
        slideNumber: 1,
        imageUrl: 'https://s3.amazonaws.com/bucket/slides/doc-123/slide-1-composite.png?signature=xyz&expires=123'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      expect(resolved.isValid).toBe(true);
      expect(resolved.storagePath).toBe('slides/doc-123/slide-1-composite.png');
      expect(resolved.source).toBe('signedUrlExtraction');
    });

    it('should return invalid when no path found', () => {
      const slide = {
        slideNumber: 1,
        content: 'Just text, no images'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      expect(resolved.isValid).toBe(false);
      expect(resolved.storagePath).toBe(null);
      expect(resolved.source).toBe('none');
    });

    it('should reject malicious paths', () => {
      const slide = {
        slideNumber: 1,
        storagePath: '../../../etc/passwd'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      expect(resolved.isValid).toBe(false);
    });

    it('should handle user-provided malicious URLs', () => {
      const slide = {
        slideNumber: 1,
        imageUrl: 'https://evil.com/slides/../../../secrets/data.png?hack=true'
      };

      const resolved = resolveStoragePathFromSlide(slide, mockDocumentId);

      // Should extract path but then validation should fail
      expect(resolved.isValid).toBe(false);
    });
  });

  describe('needsBackfill', () => {
    it('should return false if storagePath already exists', () => {
      const slide = {
        storagePath: 'slides/doc-123/slide-1-composite.png'
      };
      const resolved = {
        isValid: true,
        storagePath: 'slides/doc-123/slide-1-composite.png',
        source: 'storagePath' as const
      };

      expect(needsBackfill(slide, resolved)).toBe(false);
    });

    it('should return true if path resolved from old format', () => {
      const slide = {
        imageUrl: 'https://s3.../slides/doc-123/slide-1-composite.png?sig=xyz'
      };
      const resolved = {
        isValid: true,
        storagePath: 'slides/doc-123/slide-1-composite.png',
        source: 'signedUrlExtraction' as const
      };

      expect(needsBackfill(slide, resolved)).toBe(true);
    });

    it('should return false if no valid path found', () => {
      const slide = {
        content: 'Text only'
      };
      const resolved = {
        isValid: false,
        storagePath: null,
        source: 'none' as const
      };

      expect(needsBackfill(slide, resolved)).toBe(false);
    });
  });

  describe('createBackfilledSlide', () => {
    it('should add storagePath to slide', () => {
      const slide = {
        slideNumber: 1,
        content: 'Hello',
        imageUrl: 'https://expired-url.com/...'
      };
      const storagePath = 'slides/doc-123/slide-1-composite.png';

      const backfilled = createBackfilledSlide(slide, storagePath);

      expect(backfilled.slideNumber).toBe(1);
      expect(backfilled.content).toBe('Hello');
      expect(backfilled.storagePath).toBe(storagePath);
      expect(backfilled.imageUrl).toBe('https://expired-url.com/...');
    });

    it('should preserve all original fields', () => {
      const slide = {
        slideNumber: 5,
        content: 'Slide content',
        textCount: 42,
        customField: 'custom value'
      };
      const storagePath = 'slides/doc-123/slide-5-composite.png';

      const backfilled = createBackfilledSlide(slide, storagePath);

      expect(backfilled.customField).toBe('custom value');
      expect(backfilled.textCount).toBe(42);
    });
  });
});

describe('Storage Path Patterns', () => {
  it('should match various document ID formats', () => {
    const patterns = [
      'slides/abc-123-def-456/slide-1-composite.png',
      'slides/doc_with_underscores/slide-10-image-1.png',
      'slides/DOC-CAPS-123/slide-999-composite.png'
    ];

    patterns.forEach(path => {
      expect(validateStoragePath(path)).toBe(true);
    });
  });

  it('should reject suspicious patterns', () => {
    const suspiciousPatterns = [
      'slides/<script>alert(1)</script>/slide-1.png',
      'slides/doc-123/../../secrets.png',
      'slides/doc-123/slide-1.png.exe',
      'slides/doc-123/slide-1-image-../../file.png'
    ];

    suspiciousPatterns.forEach(path => {
      expect(validateStoragePath(path)).toBe(false);
    });
  });
});
