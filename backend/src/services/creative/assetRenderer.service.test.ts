import sharp from "sharp";

import { AssetRendererService } from "./assetRenderer.service";
import type { AssetSpec } from "./assetSpec.types";

function iconSpec(): AssetSpec {
  return {
    id: "t_icon",
    type: "icon",
    purpose: "test icon",
    size: { width: 128, height: 128 },
    backgroundMode: "transparent",
    styleMode: "minimal",
    styleHints: { palette: [] },
    constraints: {
      noText: true,
      noLogos: true,
      noWatermark: true,
      safeForCommercialUse: true,
      keepAspectRatio: true,
      preserveBrandColors: true,
      maxFileSizeKb: 1024,
      requiredNegativePrompts: [],
    },
    referenceUrls: [],
    notes: "test",
  };
}

describe("AssetRendererService (icon transparency)", () => {
  it("removes flat matte background for icon assets expecting transparency", async () => {
    // White background with a black square in the middle.
    const overlay = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const sourceBuffer = await sharp({
      create: { width: 128, height: 128, channels: 3, background: "#FFFFFF" },
    })
      .composite([{ input: overlay, left: 32, top: 32 }])
      .png()
      .toBuffer();

    const renderer = new AssetRendererService();
    const out = await renderer.render({
      sourceBuffer,
      spec: iconSpec(),
      formats: ["png"],
    });

    const { data, info } = await sharp(out.primary.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const alphaAt = (x: number, y: number) => {
      const idx = (y * info.width + x) * 4 + 3;
      return data[idx] ?? 255;
    };

    // Corners should become transparent.
    expect(alphaAt(0, 0)).toBeLessThan(10);
    expect(alphaAt(info.width - 1, 0)).toBeLessThan(10);
    expect(alphaAt(0, info.height - 1)).toBeLessThan(10);
    expect(alphaAt(info.width - 1, info.height - 1)).toBeLessThan(10);

    // Center should remain opaque (black square).
    expect(
      alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2)),
    ).toBeGreaterThan(245);
  });
});
