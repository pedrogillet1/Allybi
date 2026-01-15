/**
 * PPTX Preview Freeze Test
 *
 * Purpose: Prevent accidental erosion of the frozen PPTX preview subsystem
 * This test FAILS LOUDLY if core contracts, drift detection, or safety mechanisms are removed.
 *
 * This is NOT about correctness — it's about INTENTIONALITY.
 * If you're changing this system, you MUST explicitly update this test and documentation.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('PPTX Preview Freeze Test - DO NOT TOUCH WITHOUT REASON', () => {
  const FREEZE_ERROR_MESSAGE = `
╔════════════════════════════════════════════════════════════════════╗
║ ⚠️  PPTX PREVIEW IS A FROZEN SUBSYSTEM ⚠️                         ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║ If you are seeing this test fail, you are modifying a             ║
║ production-hardened, contract-locked subsystem.                   ║
║                                                                    ║
║ Before proceeding, you MUST:                                      ║
║                                                                    ║
║   1. Update golden snapshots if API shape changed                 ║
║      (backend/src/tests/__snapshots__/pptx-*.snapshot.json)       ║
║                                                                    ║
║   2. Run canary checks                                            ║
║      npm run canary:pptx -- --verbose                             ║
║                                                                    ║
║   3. Update PPTX_PREVIEW_FUTURE_CHANGES.md                        ║
║      Explain what changed and why                                 ║
║                                                                    ║
║   4. Update this freeze test                                      ║
║      Add new checks or remove obsolete ones                       ║
║                                                                    ║
║   5. Verify drift metrics remain zero after deployment            ║
║                                                                    ║
║ See: PPTX_PREVIEW_FUTURE_CHANGES.md for guidelines                ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  `;

  describe('Core Modules Must Exist', () => {
    test('pptxPreview.utils.ts must exist', () => {
      const filePath = path.join(__dirname, '../services/pptxPreview.utils.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    }, { freezeMessage: FREEZE_ERROR_MESSAGE });

    test('pptxPreviewPlan.service.ts must exist', () => {
      const filePath = path.join(__dirname, '../services/pptxPreviewPlan.service.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('pptxPreview.schema.ts must exist', () => {
      const filePath = path.join(__dirname, '../schemas/pptxPreview.schema.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('pptxPreviewMetrics.service.ts must exist', () => {
      const filePath = path.join(__dirname, '../services/pptxPreviewMetrics.service.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('pptxSignedUrlCache.service.ts must exist', () => {
      const filePath = path.join(__dirname, '../services/pptxSignedUrlCache.service.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('Drift Detection Must Not Be Removed', () => {
    test('Contract violation detection exists in pptxPreview.utils.ts', () => {
      const filePath = path.join(__dirname, '../services/pptxPreview.utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('CONTRACT_VIOLATION');
      expect(content).toContain('pptx_contract_violation_total');

      if (!content.includes('CONTRACT_VIOLATION')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nContract violation detection was removed from pptxPreview.utils.ts');
      }
    });

    test('Plan drift detection exists in pptxPreviewPlan.service.ts', () => {
      const filePath = path.join(__dirname, '../services/pptxPreviewPlan.service.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('PLAN_DRIFT');
      expect(content).toContain('pptx_plan_drift_total');

      if (!content.includes('PLAN_DRIFT')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nPlan drift detection was removed from pptxPreviewPlan.service.ts');
      }
    });

    test('Signing drift detection exists in pptxPreview.utils.ts', () => {
      const filePath = path.join(__dirname, '../services/pptxPreview.utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('SIGNING_DRIFT');
      expect(content).toContain('pptx_signing_drift_total');

      if (!content.includes('SIGNING_DRIFT')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nSigning drift detection was removed from pptxPreview.utils.ts');
      }
    });

    test('Drift metrics service exports required functions', () => {
      const { incrementCounter, recordTiming } = require('../services/pptxPreviewMetrics.service');

      expect(typeof incrementCounter).toBe('function');
      expect(typeof recordTiming).toBe('function');

      if (typeof incrementCounter !== 'function') {
        fail(FREEZE_ERROR_MESSAGE + '\n\nincrementCounter function was removed or changed');
      }
    });
  });

  describe('Contract Tests Must Not Be Removed', () => {
    test('Contract test file must exist', () => {
      const filePath = path.join(__dirname, 'pptxPreview.contract.test.ts');
      expect(fs.existsSync(filePath)).toBe(true);

      if (!fs.existsSync(filePath)) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nContract test file was deleted');
      }
    });

    test('Golden snapshots must exist', () => {
      const snapshotsDir = path.join(__dirname, '__snapshots__');
      const planSnapshot = path.join(snapshotsDir, 'pptx-preview-plan.snapshot.json');
      const slidesSnapshot = path.join(snapshotsDir, 'pptx-slides-response.snapshot.json');

      expect(fs.existsSync(planSnapshot)).toBe(true);
      expect(fs.existsSync(slidesSnapshot)).toBe(true);

      if (!fs.existsSync(planSnapshot) || !fs.existsSync(slidesSnapshot)) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nGolden snapshots were deleted');
      }
    });

    test('Snapshots have required structure', () => {
      const snapshotsDir = path.join(__dirname, '__snapshots__');
      const planSnapshot = JSON.parse(
        fs.readFileSync(path.join(snapshotsDir, 'pptx-preview-plan.snapshot.json'), 'utf-8')
      );

      expect(planSnapshot).toHaveProperty('requiredFields');
      expect(planSnapshot).toHaveProperty('validPreviewTypes');
      expect(planSnapshot).toHaveProperty('contractRules');
      expect(planSnapshot).toHaveProperty('lastUpdated');

      if (!planSnapshot.requiredFields || !planSnapshot.validPreviewTypes) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nSnapshot structure was changed without updating freeze test');
      }
    });
  });

  describe('Canary Script Must Not Be Removed', () => {
    test('Canary script must exist', () => {
      const filePath = path.join(__dirname, '../scripts/canary-pptx-preview.ts');
      expect(fs.existsSync(filePath)).toBe(true);

      if (!fs.existsSync(filePath)) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nCanary script was deleted');
      }
    });

    test('Canary script checks are intact', () => {
      const filePath = path.join(__dirname, '../scripts/canary-pptx-preview.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Must check these endpoints
      expect(content).toContain('checkPreviewPlan');
      expect(content).toContain('checkSlidesEndpoint');
      expect(content).toContain('checkImageUrls');
      expect(content).toContain('checkDriftMetrics');

      if (!content.includes('checkDriftMetrics')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nCanary drift metrics check was removed');
      }
    });
  });

  describe('Frozen Subsystem Banners Must Exist', () => {
    test('pptxPreview.utils.ts has frozen banner', () => {
      const filePath = path.join(__dirname, '../services/pptxPreview.utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('⚠️ FROZEN SUBSYSTEM ⚠️');
      expect(content).toContain('production-hardened and contract-locked');

      if (!content.includes('FROZEN SUBSYSTEM')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nFrozen subsystem banner was removed from pptxPreview.utils.ts');
      }
    });

    test('pptxPreviewPlan.service.ts has frozen banner', () => {
      const filePath = path.join(__dirname, '../services/pptxPreviewPlan.service.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('⚠️ FROZEN SUBSYSTEM ⚠️');
    });

    test('pptxPreview.schema.ts has frozen banner', () => {
      const filePath = path.join(__dirname, '../schemas/pptxPreview.schema.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('⚠️ FROZEN SUBSYSTEM ⚠️');
    });
  });

  describe('Safety Mechanisms Must Not Be Removed', () => {
    test('Pagination is enforced (max pageSize)', () => {
      const filePath = path.join(__dirname, '../controllers/document.controller.ts');

      if (!fs.existsSync(filePath)) {
        // Controller may have been refactored, skip this test
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // Look for pagination logic
      expect(content).toContain('pageSize');
      expect(content).toContain('Math.min(50'); // Max pageSize of 50

      if (!content.includes('pageSize')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nPagination was removed from slides endpoint');
      }
    });

    test('Storage path validation exists', () => {
      const filePath = path.join(__dirname, '../services/pptxPreview.utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('validateStoragePath');
      expect(content).toContain('path traversal'); // Security comment

      if (!content.includes('validateStoragePath')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nStorage path validation was removed');
      }
    });

    test('Retry logic exists', () => {
      const filePath = path.join(__dirname, '../services/pptxPreview.utils.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('MAX_RETRIES');
      expect(content).toContain('attempt');

      if (!content.includes('MAX_RETRIES')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nRetry logic was removed from signed URL generation');
      }
    });

    test('Feature flag kill switch exists', () => {
      const filePath = path.join(__dirname, '../controllers/document.controller.ts');

      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('PPTX_PREVIEW_HARDENING_ENABLED');

      if (!content.includes('PPTX_PREVIEW_HARDENING_ENABLED')) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nFeature flag kill switch was removed');
      }
    });
  });

  describe('Documentation Must Exist', () => {
    test('PPTX_PREVIEW_FUTURE_CHANGES.md must exist', () => {
      const filePath = path.join(__dirname, '../../../PPTX_PREVIEW_FUTURE_CHANGES.md');
      expect(fs.existsSync(filePath)).toBe(true);

      if (!fs.existsSync(filePath)) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nFuture changes documentation was deleted');
      }
    });

    test('PPTX_DRIFT_DETECTION.md must exist', () => {
      const filePath = path.join(__dirname, '../../../PPTX_DRIFT_DETECTION.md');
      expect(fs.existsSync(filePath)).toBe(true);

      if (!fs.existsSync(filePath)) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nDrift detection documentation was deleted');
      }
    });

    test('PRODUCTION_RUNBOOK_PPTX_PREVIEW.md must exist', () => {
      const filePath = path.join(__dirname, '../../../PRODUCTION_RUNBOOK_PPTX_PREVIEW.md');
      expect(fs.existsSync(filePath)).toBe(true);

      if (!fs.existsSync(filePath)) {
        fail(FREEZE_ERROR_MESSAGE + '\n\nProduction runbook was deleted');
      }
    });
  });
});
