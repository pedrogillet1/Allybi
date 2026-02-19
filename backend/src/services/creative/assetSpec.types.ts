import { z } from "zod";

export const AssetTypeSchema = z.enum([
  "image",
  "icon",
  "illustration",
  "background",
  "diagram",
  "chart",
  "mockup",
]);

export const BackgroundModeSchema = z.enum([
  "transparent",
  "solid",
  "gradient",
  "photo",
]);

export const StyleModeSchema = z.enum([
  "photoreal",
  "3d",
  "flat",
  "line-art",
  "minimal",
  "isometric",
  "brand-match",
]);

export const AssetSizeSchema = z
  .object({
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
  })
  .strict();

export const AssetConstraintSchema = z
  .object({
    noText: z.boolean().default(true),
    noLogos: z.boolean().default(true),
    noWatermark: z.boolean().default(true),
    safeForCommercialUse: z.boolean().default(true),
    keepAspectRatio: z.boolean().default(true),
    preserveBrandColors: z.boolean().default(true),
    maxFileSizeKb: z.number().int().positive().max(20000).default(4096),
    requiredNegativePrompts: z.array(z.string().min(1)).max(32).default([]),
  })
  .strict();

export const AssetStyleHintsSchema = z
  .object({
    palette: z
      .array(z.string().regex(/^#([0-9A-Fa-f]{6})$/))
      .max(12)
      .default([]),
    typographyHint: z.string().trim().max(120).optional(),
    compositionHint: z.string().trim().max(240).optional(),
    textureHint: z.string().trim().max(120).optional(),
  })
  .strict();

export const AssetSpecSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    type: AssetTypeSchema,
    purpose: z.string().trim().min(3).max(300),
    size: AssetSizeSchema,
    backgroundMode: BackgroundModeSchema.default("transparent"),
    styleMode: StyleModeSchema.default("brand-match"),
    styleHints: AssetStyleHintsSchema.default({
      palette: [],
    }),
    constraints: AssetConstraintSchema.default({
      noText: true,
      noLogos: true,
      noWatermark: true,
      safeForCommercialUse: true,
      keepAspectRatio: true,
      preserveBrandColors: true,
      maxFileSizeKb: 4096,
      requiredNegativePrompts: [],
    }),
    referenceUrls: z.array(z.string().url()).max(8).default([]),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const AssetSpecBatchSchema = z
  .object({
    version: z.literal("1.0").default("1.0"),
    assets: z.array(AssetSpecSchema).min(1).max(30),
  })
  .strict();

export type AssetType = z.infer<typeof AssetTypeSchema>;
export type BackgroundMode = z.infer<typeof BackgroundModeSchema>;
export type StyleMode = z.infer<typeof StyleModeSchema>;
export type AssetSize = z.infer<typeof AssetSizeSchema>;
export type AssetConstraints = z.infer<typeof AssetConstraintSchema>;
export type AssetStyleHints = z.infer<typeof AssetStyleHintsSchema>;
export type AssetSpec = z.infer<typeof AssetSpecSchema>;
export type AssetSpecBatch = z.infer<typeof AssetSpecBatchSchema>;

export function parseAssetSpec(input: unknown): AssetSpec {
  return AssetSpecSchema.parse(input);
}

export function parseAssetSpecBatch(input: unknown): AssetSpecBatch {
  return AssetSpecBatchSchema.parse(input);
}

export function normalizeAssetSpec(spec: AssetSpec): AssetSpec {
  const parsed = parseAssetSpec(spec);
  const ratio = parsed.size.width / parsed.size.height;

  const normalizedWidth = Math.max(64, Math.min(parsed.size.width, 8192));
  const normalizedHeight = Math.max(64, Math.min(parsed.size.height, 8192));

  // Preserve ratio for obviously invalid distortions if keepAspectRatio is on.
  const adjusted = parsed.constraints.keepAspectRatio
    ? {
        width: normalizedWidth,
        height: Math.max(64, Math.round(normalizedWidth / ratio)),
      }
    : {
        width: normalizedWidth,
        height: normalizedHeight,
      };

  return {
    ...parsed,
    size: adjusted,
  };
}
