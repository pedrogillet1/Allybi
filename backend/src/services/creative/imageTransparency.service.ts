/**
 * Helpers for generating slide-ready transparent PNG assets.
 *
 * Motivation:
 * Some model/image pipelines return "transparent background" icons as PNGs
 * with a flat matte (often white). When inserted into Slides/PPTX this shows
 * as an unwanted background box. We fix that here with a conservative
 * background-to-alpha conversion.
 */

export type Rgb = { r: number; g: number; b: number };

function clamp255(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n | 0;
}

function distSq(a: Rgb, r: number, g: number, b: number): number {
  const dr = a.r - r;
  const dg = a.g - g;
  const db = a.b - b;
  return dr * dr + dg * dg + db * db;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Returns true if the RGBA buffer uses transparency for any meaningful number
 * of pixels. (A tiny number can happen due to palette/tRNS quirks.)
 */
export function hasMeaningfulTransparency(params: {
  rgba: Buffer;
  width: number;
  height: number;
  sampleStridePx?: number;
  minTransparentFraction?: number;
}): boolean {
  const stride = Math.max(1, params.sampleStridePx ?? 16);
  const minFrac = Math.max(0.0005, params.minTransparentFraction ?? 0.0025);

  const { rgba, width, height } = params;
  const totalSamples = Math.max(
    1,
    Math.floor((width * height) / (stride * stride)),
  );

  let transparent = 0;
  let sampled = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4 + 3;
      const a = rgba[i] ?? 255;
      sampled += 1;
      if (a < 250) transparent += 1;
    }
  }

  // Use conservative estimate even when image is small.
  const frac = transparent / Math.max(1, Math.min(sampled, totalSamples));
  return frac >= minFrac;
}

/**
 * Estimate background color by sampling corners and edges.
 */
export function estimateFlatBackgroundRgb(params: {
  rgba: Buffer;
  width: number;
  height: number;
}): Rgb {
  const { rgba, width, height } = params;
  const samplesR: number[] = [];
  const samplesG: number[] = [];
  const samplesB: number[] = [];

  const push = (x: number, y: number) => {
    const xx = Math.max(0, Math.min(width - 1, x));
    const yy = Math.max(0, Math.min(height - 1, y));
    const idx = (yy * width + xx) * 4;
    const r = rgba[idx] ?? 0;
    const g = rgba[idx + 1] ?? 0;
    const b = rgba[idx + 2] ?? 0;
    const a = rgba[idx + 3] ?? 255;
    // Ignore already-transparent pixels in case the image has partial alpha.
    if (a < 250) return;
    samplesR.push(r);
    samplesG.push(g);
    samplesB.push(b);
  };

  // Sample a small patch in each corner.
  const patch = Math.max(
    2,
    Math.min(10, Math.floor(Math.min(width, height) / 20)),
  );
  for (let dy = 0; dy < patch; dy += 1) {
    for (let dx = 0; dx < patch; dx += 1) {
      push(dx, dy);
      push(width - 1 - dx, dy);
      push(dx, height - 1 - dy);
      push(width - 1 - dx, height - 1 - dy);
    }
  }

  // Sample edges at intervals.
  const step = Math.max(8, Math.floor(Math.min(width, height) / 16));
  for (let x = 0; x < width; x += step) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    push(0, y);
    push(width - 1, y);
  }

  return {
    r: clamp255(median(samplesR)),
    g: clamp255(median(samplesG)),
    b: clamp255(median(samplesB)),
  };
}

/**
 * Convert a flat background into transparency.
 *
 * This is intentionally conservative:
 * - Only knocks out pixels near the estimated background color.
 * - Feathered edge between t0 and t1 to preserve anti-aliasing.
 */
export function removeFlatBackgroundToTransparent(params: {
  rgba: Buffer;
  width: number;
  height: number;
  background: Rgb;
  t0?: number; // fully transparent threshold (RGB distance)
  t1?: number; // fully opaque threshold (RGB distance)
}): Buffer {
  const { rgba, width, height, background } = params;
  const t0 = Math.max(0, params.t0 ?? 12);
  const t1 = Math.max(t0 + 1, params.t1 ?? 38);
  const t0Sq = t0 * t0;
  const t1Sq = t1 * t1;

  const out = Buffer.from(rgba); // copy
  const nPx = width * height;

  for (let p = 0; p < nPx; p += 1) {
    const i = p * 4;
    const r = out[i] ?? 0;
    const g = out[i + 1] ?? 0;
    const b = out[i + 2] ?? 0;
    const a0 = out[i + 3] ?? 255;

    if (a0 === 0) continue;

    const d = distSq(background, r, g, b);

    let aFactor = 1;
    if (d <= t0Sq) {
      aFactor = 0;
    } else if (d >= t1Sq) {
      aFactor = 1;
    } else {
      const t = (d - t0Sq) / (t1Sq - t0Sq);
      aFactor = Math.max(0, Math.min(1, t));
    }

    const a = clamp255(Math.round(a0 * aFactor));
    out[i + 3] = a;
  }

  return out;
}

/**
 * Flood-fill background removal, starting from the outer border only.
 *
 * This prevents "white interiors" (holes/negative space) from being removed when the icon itself
 * uses the background color inside enclosed regions.
 */
export function removeFlatBackgroundToTransparentFloodFill(params: {
  rgba: Buffer;
  width: number;
  height: number;
  background: Rgb;
  t0?: number; // fully transparent threshold (RGB distance)
  t1?: number; // fully opaque threshold (RGB distance)
}): Buffer {
  const { rgba, width, height, background } = params;
  const t0 = Math.max(0, params.t0 ?? 12);
  const t1 = Math.max(t0 + 1, params.t1 ?? 38);
  const t0Sq = t0 * t0;
  const t1Sq = t1 * t1;

  const out = Buffer.from(rgba); // copy
  const nPx = width * height;

  const isBg = (p: number): boolean => {
    const i = p * 4;
    const a0 = out[i + 3] ?? 255;
    if (a0 === 0) return false;
    const r = out[i] ?? 0;
    const g = out[i + 1] ?? 0;
    const b = out[i + 2] ?? 0;
    const d = distSq(background, r, g, b);
    return d <= t0Sq;
  };

  const visited = new Uint8Array(nPx);
  const queue = new Uint32Array(nPx);
  let qh = 0;
  let qt = 0;

  const push = (p: number) => {
    if (visited[p]) return;
    visited[p] = 1;
    queue[qt++] = p >>> 0;
  };

  // Seed with border pixels that match background.
  for (let x = 0; x < width; x += 1) {
    const pTop = x;
    const pBot = (height - 1) * width + x;
    if (isBg(pTop)) push(pTop);
    if (isBg(pBot)) push(pBot);
  }
  for (let y = 0; y < height; y += 1) {
    const pLeft = y * width;
    const pRight = y * width + (width - 1);
    if (isBg(pLeft)) push(pLeft);
    if (isBg(pRight)) push(pRight);
  }

  // 4-neighbor flood-fill.
  while (qh < qt) {
    const p = queue[qh++]!;
    const x = p % width;
    const y = (p / width) | 0;

    // Make background transparent.
    out[p * 4 + 3] = 0;

    if (x > 0) {
      const n = p - 1;
      if (!visited[n] && isBg(n)) push(n);
    }
    if (x + 1 < width) {
      const n = p + 1;
      if (!visited[n] && isBg(n)) push(n);
    }
    if (y > 0) {
      const n = p - width;
      if (!visited[n] && isBg(n)) push(n);
    }
    if (y + 1 < height) {
      const n = p + width;
      if (!visited[n] && isBg(n)) push(n);
    }
  }

  // Feather a 1px halo near the removed background to preserve anti-aliasing.
  // If a pixel is close to bg color AND touches a transparent pixel, reduce its alpha.
  const alphaAt = (p: number) => out[p * 4 + 3] ?? 255;
  const touchesTransparent = (p: number): boolean => {
    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0 && alphaAt(p - 1) === 0) return true;
    if (x + 1 < width && alphaAt(p + 1) === 0) return true;
    if (y > 0 && alphaAt(p - width) === 0) return true;
    if (y + 1 < height && alphaAt(p + width) === 0) return true;
    return false;
  };

  for (let p = 0; p < nPx; p += 1) {
    const a0 = alphaAt(p);
    if (a0 === 0) continue;
    if (!touchesTransparent(p)) continue;

    const i = p * 4;
    const r = out[i] ?? 0;
    const g = out[i + 1] ?? 0;
    const b = out[i + 2] ?? 0;
    const d = distSq(background, r, g, b);
    if (d >= t1Sq) continue;

    const t = Math.max(0, Math.min(1, (d - t0Sq) / (t1Sq - t0Sq)));
    out[i + 3] = clamp255(Math.round(a0 * t));
  }

  return out;
}
