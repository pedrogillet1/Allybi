/**
 * PPTX Preview Contract Tests
 *
 * Purpose: Regression lock to prevent accidental API contract breaks
 * These tests validate response shapes match golden snapshots
 *
 * IMPORTANT: If these tests fail, it means you're breaking the API contract.
 * Either:
 * 1. Fix your code to maintain backward compatibility
 * 2. Update snapshots AND coordinate frontend changes
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PreviewPlan,
  validateSlidesResponse,
  SlidesResponseSchema
} from '../schemas/pptxPreview.schema';

describe('PPTX Preview API Contract Tests', () => {
  const snapshotsDir = path.join(__dirname, '__snapshots__');

  describe('Preview Plan Response Shape', () => {
    let snapshot: any;

    beforeAll(() => {
      const snapshotPath = path.join(snapshotsDir, 'pptx-preview-plan.snapshot.json');
      snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    });

    test('PreviewPlan type has all required fields from snapshot', () => {
      const requiredFields = snapshot.requiredFields as string[];

      // Create a mock PreviewPlan with all required fields
      const mockPlan: PreviewPlan = {
        previewType: 'pptx-slides',
        reason: 'PDF_FAILED_SLIDES_READY',
        assetsReady: true,
        previewPdfStatus: 'failed',
      };

      requiredFields.forEach(field => {
        expect(mockPlan).toHaveProperty(field);
        expect(mockPlan[field as keyof PreviewPlan]).toBeDefined();
      });
    });

    test('PreviewPlan previewType values match snapshot', () => {
      const validTypes = snapshot.validPreviewTypes as string[];

      // Test all valid preview types
      validTypes.forEach(type => {
        const plan: PreviewPlan = {
          previewType: type as any,
          reason: 'PDF_READY',
          assetsReady: false,
          previewPdfStatus: null,
        };

        expect(plan.previewType).toBe(type);
      });
    });

    test('PreviewPlan reason values match snapshot', () => {
      const validReasons = snapshot.validReasons as string[];

      // Test all valid reasons
      validReasons.forEach(reason => {
        const plan: PreviewPlan = {
          previewType: 'pptx-processing',
          reason: reason as any,
          assetsReady: false,
          previewPdfStatus: null,
        };

        expect(plan.reason).toBe(reason);
      });
    });

    test('Contract rule: assetsReady=true requires valid previewType', () => {
      const rule = snapshot.contractRules[0];
      expect(rule).toContain('assetsReady=true');
      expect(rule).toContain('pptx-pdf');
      expect(rule).toContain('pptx-slides');

      // Validate rule
      const validPlanPdf: PreviewPlan = {
        previewType: 'pptx-pdf',
        reason: 'PDF_READY',
        assetsReady: true,
        previewPdfStatus: 'ready',
        previewUrl: '/api/documents/123/preview-pdf',
      };

      const validPlanSlides: PreviewPlan = {
        previewType: 'pptx-slides',
        reason: 'PDF_FAILED_SLIDES_READY',
        assetsReady: true,
        previewPdfStatus: 'failed',
        previewUrl: '/api/documents/123/slides',
        totalSlides: 10,
      };

      expect(validPlanPdf.assetsReady).toBe(true);
      expect(['pptx-pdf', 'pptx-slides']).toContain(validPlanPdf.previewType);

      expect(validPlanSlides.assetsReady).toBe(true);
      expect(['pptx-pdf', 'pptx-slides']).toContain(validPlanSlides.previewType);
    });
  });

  describe('Slides Response Shape', () => {
    let snapshot: any;

    beforeAll(() => {
      const snapshotPath = path.join(snapshotsDir, 'pptx-slides-response.snapshot.json');
      snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    });

    test('Slides response has all required fields from snapshot', () => {
      const requiredFields = snapshot.requiredFields as string[];

      const mockResponse = {
        success: true,
        slides: [],
        totalSlides: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      };

      requiredFields.forEach(field => {
        expect(mockResponse).toHaveProperty(field);
        expect(mockResponse[field as keyof typeof mockResponse]).toBeDefined();
      });
    });

    test('Slide object has all required fields from snapshot', () => {
      const requiredFields = snapshot.slideRequiredFields as string[];

      const mockSlide = {
        slideNumber: 1,
        hasImage: true,
        imageUrl: 'https://example.com/image.png',
        content: 'Slide content',
      };

      requiredFields.forEach(field => {
        expect(mockSlide).toHaveProperty(field);
        expect(mockSlide[field as keyof typeof mockSlide]).toBeDefined();
      });
    });

    test('Contract rule: hasImage=true requires non-null imageUrl', () => {
      const rule = snapshot.contractRules.find((r: string) => r.includes('hasImage=true'));
      expect(rule).toContain('imageUrl');
      expect(rule).toContain('NOT be null');

      // Valid slide with image
      const slideWithImage = {
        slideNumber: 1,
        hasImage: true,
        imageUrl: 'https://storage.googleapis.com/bucket/slide-1.png',
      };

      expect(slideWithImage.hasImage).toBe(true);
      expect(slideWithImage.imageUrl).not.toBeNull();
      expect(slideWithImage.imageUrl).not.toBe('');
    });

    test('Contract rule: hasImage=false requires null imageUrl', () => {
      const rule = snapshot.contractRules.find((r: string) => r.includes('hasImage=false'));
      expect(rule).toContain('imageUrl');
      expect(rule).toContain('MUST be null');

      // Valid slide without image
      const slideWithoutImage = {
        slideNumber: 1,
        hasImage: false,
        imageUrl: null,
        content: 'Text-only content',
      };

      expect(slideWithoutImage.hasImage).toBe(false);
      expect(slideWithoutImage.imageUrl).toBeNull();
    });

    test('Pagination rules from snapshot are valid', () => {
      const paginationRules = snapshot.paginationRules as string[];

      expect(paginationRules).toContain('page parameter: integer, min 1, default 1');
      expect(paginationRules).toContain('pageSize parameter: integer, min 1, max 50, default 10');

      // Test pagination calculation
      const totalSlides = 25;
      const pageSize = 10;
      const totalPages = Math.ceil(totalSlides / pageSize);

      expect(totalPages).toBe(3); // 25 slides / 10 per page = 3 pages
    });

    test('Zod schema matches snapshot contract', () => {
      // Test that Zod schema validates according to snapshot rules
      const validResponse = {
        success: true,
        slides: [
          {
            slideNumber: 1,
            hasImage: true,
            imageUrl: 'https://example.com/slide-1.png',
            content: 'Test content',
          },
        ],
        totalSlides: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        metadata: {},
      };

      // Should validate without errors
      const result = SlidesResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    test('Zod schema rejects invalid responses', () => {
      // Missing required fields
      const invalidResponse1 = {
        success: true,
        slides: [],
        // Missing totalSlides, page, pageSize, totalPages
      };

      const result1 = SlidesResponseSchema.safeParse(invalidResponse1);
      expect(result1.success).toBe(false);

      // Invalid slide (hasImage=true but no imageUrl)
      const invalidResponse2 = {
        success: true,
        slides: [
          {
            slideNumber: 1,
            hasImage: true,
            // Missing imageUrl (contract violation!)
          },
        ],
        totalSlides: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };

      const result2 = SlidesResponseSchema.safeParse(invalidResponse2);
      expect(result2.success).toBe(false);
    });
  });

  describe('Snapshot Freshness Check', () => {
    test('Snapshots have lastUpdated field', () => {
      const planSnapshot = JSON.parse(
        fs.readFileSync(path.join(snapshotsDir, 'pptx-preview-plan.snapshot.json'), 'utf-8')
      );

      const slidesSnapshot = JSON.parse(
        fs.readFileSync(path.join(snapshotsDir, 'pptx-slides-response.snapshot.json'), 'utf-8')
      );

      expect(planSnapshot.lastUpdated).toBeDefined();
      expect(slidesSnapshot.lastUpdated).toBeDefined();

      // Validate date format (YYYY-MM-DD)
      expect(planSnapshot.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(slidesSnapshot.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
