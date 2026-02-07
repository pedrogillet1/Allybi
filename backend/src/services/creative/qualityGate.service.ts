import type { AssetSpec } from './assetSpec.types';
import type { StyleDNAProfile } from './styleDNA.service';

export interface RenderedAssetSignals {
  width: number;
  height: number;
  dominantColors: string[];
  detectedText?: string;
  fileSizeBytes: number;
  mimeType: string;
}

export interface PlacementFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QualityGateInput {
  spec: AssetSpec;
  styleDNA: StyleDNAProfile;
  rendered: RenderedAssetSignals;
  placementFrame?: PlacementFrame;
}

export type QualitySeverity = 'LOW' | 'MED' | 'HIGH';

export interface QualityIssue {
  code:
    | 'DIMENSION_MISMATCH'
    | 'TEXT_DETECTED_WHEN_FORBIDDEN'
    | 'BRAND_COLOR_DRIFT'
    | 'OVERSIZED_FILE'
    | 'ALIGNMENT_DRIFT'
    | 'READABILITY_LOW';
  severity: QualitySeverity;
  message: string;
  suggestion?: string;
}

export interface QualityGateResult {
  pass: boolean;
  score: number;
  readability: number;
  alignment: number;
  brandConsistency: number;
  fileCompliance: number;
  issues: QualityIssue[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim();
  const match = normalized.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return null;

  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  };
}

function rgbDistance(a: string, b: string): number {
  const left = parseHex(a);
  const right = parseHex(b);
  if (!left || !right) return 441.67295593;

  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function aspectRatio(width: number, height: number): number {
  if (height <= 0) return 0;
  return width / height;
}

/**
 * Quality gate for generated assets (readability, alignment, brand consistency).
 */
export class QualityGateService {
  evaluate(input: QualityGateInput): QualityGateResult {
    const issues: QualityIssue[] = [];

    const expectedAspect = aspectRatio(input.spec.size.width, input.spec.size.height);
    const actualAspect = aspectRatio(input.rendered.width, input.rendered.height);

    const aspectDelta = expectedAspect > 0 ? Math.abs(actualAspect - expectedAspect) / expectedAspect : 1;
    const dimensionError =
      Math.abs(input.rendered.width - input.spec.size.width) / Math.max(1, input.spec.size.width) +
      Math.abs(input.rendered.height - input.spec.size.height) / Math.max(1, input.spec.size.height);

    const alignment = clamp01(1 - Math.min(1, aspectDelta * 1.3 + dimensionError * 0.5));

    if (alignment < 0.75) {
      issues.push({
        code: 'DIMENSION_MISMATCH',
        severity: alignment < 0.5 ? 'HIGH' : 'MED',
        message: `Rendered dimensions ${input.rendered.width}x${input.rendered.height} differ from expected ${input.spec.size.width}x${input.spec.size.height}.`,
        suggestion: 'Re-render using exact target dimensions and lock aspect ratio.',
      });
    }

    if (input.placementFrame) {
      const frameAspect = aspectRatio(input.placementFrame.width, input.placementFrame.height);
      const placementDelta = frameAspect > 0 ? Math.abs(actualAspect - frameAspect) / frameAspect : 1;
      if (placementDelta > 0.18) {
        issues.push({
          code: 'ALIGNMENT_DRIFT',
          severity: placementDelta > 0.35 ? 'HIGH' : 'MED',
          message: `Asset aspect ratio is misaligned with placement frame (${placementDelta.toFixed(2)} delta).`,
          suggestion: 'Use contain mode or regenerate at frame ratio to avoid crop/stretch.',
        });
      }
    }

    const detectedText = input.rendered.detectedText?.trim() || '';
    let readability = 1;

    if (input.spec.constraints.noText && detectedText.length > 0) {
      readability = 0.25;
      issues.push({
        code: 'TEXT_DETECTED_WHEN_FORBIDDEN',
        severity: 'HIGH',
        message: 'Detected embedded text even though asset constraints require text-free output.',
        suggestion: 'Regenerate with stronger negative prompt for text overlays.',
      });
    } else if (!input.spec.constraints.noText && detectedText.length > 0) {
      const wordCount = detectedText.split(/\s+/).filter(Boolean).length;
      readability = clamp01(1 - Math.max(0, wordCount - 25) / 80);
      if (readability < 0.7) {
        issues.push({
          code: 'READABILITY_LOW',
          severity: 'MED',
          message: `Detected text payload appears too dense (${wordCount} words) for slide readability.`,
          suggestion: 'Reduce text amount or split content across separate layout blocks.',
        });
      }
    }

    const allowedColors = [...input.styleDNA.primaryPalette, ...input.styleDNA.accentPalette]
      .map((value) => value.trim())
      .filter(Boolean);

    let brandConsistency = 1;
    if (allowedColors.length > 0 && input.rendered.dominantColors.length > 0) {
      const distances = input.rendered.dominantColors
        .map((color) => {
          const nearest = allowedColors.map((brand) => rgbDistance(color, brand));
          return Math.min(...nearest);
        })
        .filter((distance) => Number.isFinite(distance));

      const avgDistance =
        distances.length === 0
          ? 441.67295593
          : distances.reduce((sum, value) => sum + value, 0) / distances.length;

      brandConsistency = clamp01(1 - avgDistance / 220);

      if (brandConsistency < 0.72) {
        issues.push({
          code: 'BRAND_COLOR_DRIFT',
          severity: brandConsistency < 0.45 ? 'HIGH' : 'MED',
          message: `Dominant colors drift from brand palette (avg RGB distance ${avgDistance.toFixed(1)}).`,
          suggestion: 'Regenerate using strict palette lock and lower creative temperature.',
        });
      }
    }

    const maxBytes = input.spec.constraints.maxFileSizeKb * 1024;
    const fileCompliance = clamp01(1 - Math.max(0, input.rendered.fileSizeBytes - maxBytes) / Math.max(1, maxBytes));

    if (input.rendered.fileSizeBytes > maxBytes) {
      issues.push({
        code: 'OVERSIZED_FILE',
        severity: input.rendered.fileSizeBytes > maxBytes * 1.5 ? 'HIGH' : 'MED',
        message: `Rendered asset size ${(input.rendered.fileSizeBytes / 1024).toFixed(1)}KB exceeds limit ${(maxBytes / 1024).toFixed(1)}KB.`,
        suggestion: 'Re-encode as WebP or reduce dimensions/quality.',
      });
    }

    const score = clamp01(readability * 0.25 + alignment * 0.3 + brandConsistency * 0.3 + fileCompliance * 0.15);

    const hasHighIssue = issues.some((issue) => issue.severity === 'HIGH');
    const pass = score >= 0.72 && !hasHighIssue;

    return {
      pass,
      score,
      readability,
      alignment,
      brandConsistency,
      fileCompliance,
      issues,
    };
  }
}

export default QualityGateService;
