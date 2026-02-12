import * as crypto from 'crypto';
import sharp from 'sharp';

import type { AssetSpec } from './assetSpec.types';
import {
  estimateFlatBackgroundRgb,
  hasMeaningfulTransparency,
  removeFlatBackgroundToTransparentFloodFill,
} from './imageTransparency.service';

export type RenderFormat = 'png' | 'webp';

export interface RendererContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface RenderAssetInput {
  sourceBuffer: Buffer;
  spec: AssetSpec;
  formats?: RenderFormat[];
  fitMode?: 'cover' | 'contain';
  backgroundHex?: string;
}

export interface RenderedFormatOutput {
  format: RenderFormat;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  buffer: Buffer;
}

export interface AssetRenderResult {
  primary: RenderedFormatOutput;
  alternates: RenderedFormatOutput[];
  thumbnail: {
    mimeType: 'image/webp';
    width: number;
    height: number;
    byteSize: number;
    sha256: string;
    buffer: Buffer;
  };
}

function normalizeHex(hex: string): string {
  const clean = hex.trim();
  const match = clean.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return '#FFFFFF';
  return `#${match[1].toUpperCase()}`;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureFormats(formats?: RenderFormat[]): RenderFormat[] {
  const fallback: RenderFormat[] = ['png', 'webp'];
  if (!formats || formats.length === 0) return fallback;
  return Array.from(new Set(formats));
}

function fitFor(spec: AssetSpec, requested: 'cover' | 'contain' | undefined): 'cover' | 'contain' {
  if (requested) return requested;
  return spec.backgroundMode === 'transparent' ? 'contain' : 'cover';
}

/**
 * Asset renderer for dimension enforcement, optimization, and thumbnail generation.
 */
export class AssetRendererService {
  async render(input: RenderAssetInput, _ctx?: RendererContext): Promise<AssetRenderResult> {
    if (!Buffer.isBuffer(input.sourceBuffer) || input.sourceBuffer.length === 0) {
      throw new Error('sourceBuffer is required for asset rendering.');
    }

    const formats = ensureFormats(input.formats);
    const fitMode = fitFor(input.spec, input.fitMode);
    const targetWidth = input.spec.size.width;
    const targetHeight = input.spec.size.height;
    const bgHex = normalizeHex(input.backgroundHex ?? input.spec.styleHints.palette[0] ?? '#FFFFFF');

    let base: sharp.Sharp = sharp(input.sourceBuffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: fitMode,
        position: 'centre',
        background:
          input.spec.backgroundMode === 'transparent'
            ? { r: 0, g: 0, b: 0, alpha: 0 }
            : this.hexToRgba(bgHex),
        withoutEnlargement: false,
      })
      .withMetadata({ orientation: 1 });

    base = await this.maybeRemoveIconBackground(base, input.spec);

    const rendered: RenderedFormatOutput[] = [];

    for (const format of formats) {
      const output = await this.encodeWithBudget(
        base.clone(),
        format,
        input.spec.constraints.maxFileSizeKb * 1024,
        input.spec,
      );
      rendered.push(output);
    }

    if (rendered.length === 0) {
      throw new Error('No output formats were rendered.');
    }

    const primary = rendered[0];
    const alternates = rendered.slice(1);

    const thumbnailBuffer = await sharp(primary.buffer)
      .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer();

    const thumbnailMeta = await sharp(thumbnailBuffer).metadata();

    return {
      primary,
      alternates,
      thumbnail: {
        mimeType: 'image/webp',
        width: thumbnailMeta.width ?? 320,
        height: thumbnailMeta.height ?? 320,
        byteSize: thumbnailBuffer.length,
        sha256: sha256(thumbnailBuffer),
        buffer: thumbnailBuffer,
      },
    };
  }

  private async maybeRemoveIconBackground(
    image: sharp.Sharp,
    spec: AssetSpec,
  ): Promise<sharp.Sharp> {
    // Only attempt matte removal for assets that explicitly want transparency.
    // This is primarily needed for icons, which are often returned on a flat white background.
    const wantsTransparentBg = spec.backgroundMode === 'transparent';
    const isIcon = spec.type === 'icon';
    if (!wantsTransparentBg || !isIcon) return image;

    // Convert to raw RGBA so we can inspect and manipulate alpha.
    const { data, info } = await image
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // If the image already uses transparency, keep it as-is.
    if (hasMeaningfulTransparency({ rgba: data, width: info.width, height: info.height })) {
      return image;
    }

    const bg = estimateFlatBackgroundRgb({ rgba: data, width: info.width, height: info.height });
    const processed = removeFlatBackgroundToTransparentFloodFill({
      rgba: data,
      width: info.width,
      height: info.height,
      background: bg,
    });

    return sharp(processed, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).withMetadata({ orientation: 1 });
  }

  private async encodeWithBudget(
    image: sharp.Sharp,
    format: RenderFormat,
    maxBytes: number,
    spec?: AssetSpec,
  ): Promise<RenderedFormatOutput> {
    let encoded: Buffer;

    if (format === 'png') {
      const needsRealAlpha =
        spec?.backgroundMode === 'transparent' ||
        spec?.type === 'icon';
      const pngOpts = (quality: number) => ({
        compressionLevel: 9 as const,
        effort: 10 as const,
        // Palette/quantization can cause visible halos on semi-transparent edges in Office renderers.
        // For icons/transparent assets, keep full RGBA (palette=false).
        palette: needsRealAlpha ? false : true,
        quality,
      });

      encoded = await image
        .png(pngOpts(90))
        .toBuffer();

      if (encoded.length > maxBytes) {
        encoded = await image
          .png(pngOpts(72))
          .toBuffer();
      }
    } else {
      let quality = 88;
      encoded = await image.webp({ quality, effort: 6 }).toBuffer();

      while (encoded.length > maxBytes && quality > 45) {
        quality -= 8;
        encoded = await image.webp({ quality, effort: 6 }).toBuffer();
      }
    }

    const metadata = await sharp(encoded).metadata();

    return {
      format,
      mimeType: format === 'png' ? 'image/png' : 'image/webp',
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      byteSize: encoded.length,
      sha256: sha256(encoded),
      buffer: encoded,
    };
  }

  private hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
    const normalized = normalizeHex(hex).replace('#', '');
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
      alpha: 1,
    };
  }
}

export default AssetRendererService;
