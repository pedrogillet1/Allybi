import {
  AssetSpecSchema,
  type AssetSpec,
  type BackgroundMode,
  type StyleMode,
} from "./assetSpec.types";
import type { StyleDNAProfile } from "./styleDNA.service";

export interface SlideBlueprintBlock {
  id: string;
  role: "title" | "subtitle" | "body" | "visual" | "chart" | "footer";
  intent: string;
  maxChars?: number;
}

export interface SlideBlueprint {
  slideIndex: number;
  slideGoal: string;
  audience?: string;
  narrativeTone?: "neutral" | "formal" | "casual" | "bold";
  blocks: SlideBlueprintBlock[];
}

export interface PromptBuilderInput {
  language: "en" | "pt";
  brandName?: string;
  styleDNA: StyleDNAProfile;
  blueprint: SlideBlueprint;
  assets: AssetSpec[];
  globalConstraints?: {
    preservePalette?: boolean;
    maxVisualComplexity?: "low" | "medium" | "high";
    avoidTextInAssets?: boolean;
    requiredElements?: string[];
  };
}

export interface PromptPackage {
  systemPrompt: string;
  userPrompt: string;
  negativePrompt: string;
  audit: {
    styleFingerprint: string;
    styleLockRules: string[];
    assetIds: string[];
  };
}

function quote(value: string): string {
  return `"${value.replace(/\s+/g, " ").trim()}"`;
}

function localize(language: "en" | "pt", en: string, pt: string): string {
  return language === "pt" ? pt : en;
}

function describeBackground(
  mode: BackgroundMode,
  language: "en" | "pt",
): string {
  const table: Record<BackgroundMode, { en: string; pt: string }> = {
    transparent: { en: "transparent background", pt: "fundo transparente" },
    solid: { en: "solid background", pt: "fundo sólido" },
    gradient: { en: "gradient background", pt: "fundo em degradê" },
    photo: { en: "photo background", pt: "fundo fotográfico" },
  };
  return table[mode][language];
}

function describeStyleMode(mode: StyleMode, language: "en" | "pt"): string {
  const table: Record<StyleMode, { en: string; pt: string }> = {
    photoreal: { en: "photoreal style", pt: "estilo fotorrealista" },
    "3d": { en: "3D style", pt: "estilo 3D" },
    flat: { en: "flat style", pt: "estilo flat" },
    "line-art": { en: "line-art style", pt: "estilo line-art" },
    minimal: { en: "minimal style", pt: "estilo minimalista" },
    isometric: { en: "isometric style", pt: "estilo isométrico" },
    "brand-match": { en: "brand-matched style", pt: "estilo alinhado à marca" },
  };
  return table[mode][language];
}

function styleLockRules(input: PromptBuilderInput): string[] {
  const rules: string[] = [];
  const { styleDNA, globalConstraints } = input;

  rules.push(
    `Use title font family ${quote(styleDNA.titleFontFamily)} and body font family ${quote(styleDNA.bodyFontFamily)}.`,
  );
  rules.push(
    `Keep title size around ${styleDNA.titleFontSizePt}pt and body size around ${styleDNA.bodyFontSizePt}pt.`,
  );
  rules.push(
    `Preserve primary palette: ${styleDNA.primaryPalette.join(", ") || "none detected"}.`,
  );

  if (styleDNA.accentPalette.length > 0) {
    rules.push(`Use accents only from: ${styleDNA.accentPalette.join(", ")}.`);
  }

  rules.push(
    `Maintain ${styleDNA.visualDensity} visual density and ${styleDNA.spacingPreference} spacing.`,
  );
  rules.push(
    `Prefer ${styleDNA.preferredImageStyle} imagery and ${styleDNA.titleTone} title tone.`,
  );

  if (globalConstraints?.preservePalette) {
    rules.push("Do not introduce colors outside the allowed palettes.");
  }

  if (globalConstraints?.avoidTextInAssets !== false) {
    rules.push("Avoid rendering text inside generated visual assets.");
  }

  if (globalConstraints?.maxVisualComplexity) {
    rules.push(
      `Visual complexity must stay ${globalConstraints.maxVisualComplexity} or lower.`,
    );
  }

  for (const required of globalConstraints?.requiredElements ?? []) {
    rules.push(`Required element: ${required}`);
  }

  return rules;
}

function assetInstructions(
  assets: AssetSpec[],
  language: "en" | "pt",
): string[] {
  const lines: string[] = [];

  for (const rawAsset of assets) {
    const asset = AssetSpecSchema.parse(rawAsset);
    const core = [
      `ID=${asset.id}`,
      `type=${asset.type}`,
      `purpose=${asset.purpose}`,
      `size=${asset.size.width}x${asset.size.height}`,
      describeBackground(asset.backgroundMode, language),
      describeStyleMode(asset.styleMode, language),
    ].join(" | ");

    lines.push(core);

    if (asset.styleHints.palette.length > 0) {
      lines.push(
        localize(
          language,
          `palette hints: ${asset.styleHints.palette.join(", ")}`,
          `paleta sugerida: ${asset.styleHints.palette.join(", ")}`,
        ),
      );
    }

    if (asset.styleHints.compositionHint) {
      lines.push(
        localize(
          language,
          `composition: ${asset.styleHints.compositionHint}`,
          `composição: ${asset.styleHints.compositionHint}`,
        ),
      );
    }

    if (asset.constraints.requiredNegativePrompts.length > 0) {
      lines.push(
        localize(
          language,
          `must avoid: ${asset.constraints.requiredNegativePrompts.join(", ")}`,
          `deve evitar: ${asset.constraints.requiredNegativePrompts.join(", ")}`,
        ),
      );
    }
  }

  return lines;
}

function blueprintInstructions(
  blueprint: SlideBlueprint,
  language: "en" | "pt",
): string[] {
  const lines: string[] = [];

  lines.push(
    localize(
      language,
      `Slide goal: ${blueprint.slideGoal}`,
      `Objetivo do slide: ${blueprint.slideGoal}`,
    ),
  );

  if (blueprint.audience) {
    lines.push(
      localize(
        language,
        `Audience: ${blueprint.audience}`,
        `Audiência: ${blueprint.audience}`,
      ),
    );
  }

  if (blueprint.narrativeTone) {
    lines.push(
      localize(
        language,
        `Narrative tone: ${blueprint.narrativeTone}`,
        `Tom narrativo: ${blueprint.narrativeTone}`,
      ),
    );
  }

  lines.push(localize(language, "Blueprint blocks:", "Blocos do blueprint:"));

  for (const block of blueprint.blocks) {
    const maxChars = block.maxChars ? ` (maxChars=${block.maxChars})` : "";
    lines.push(`- [${block.role}] ${block.intent}${maxChars}`);
  }

  return lines;
}

function negativePrompt(input: PromptBuilderInput): string {
  const language = input.language;
  const base = [
    localize(
      language,
      "low quality, artifacts, blurry, distorted anatomy",
      "baixa qualidade, artefatos, borrado, anatomia distorcida",
    ),
    localize(
      language,
      "wrong brand colors, random fonts, inconsistent style",
      "cores de marca erradas, fontes aleatórias, estilo inconsistente",
    ),
    localize(
      language,
      "text overlays, watermarks, logos, copyrighted marks",
      "texto sobreposto, marca d'água, logos, marcas registradas",
    ),
  ];

  const extra = input.assets.flatMap(
    (asset) => asset.constraints.requiredNegativePrompts,
  );
  return [...base, ...extra].join(", ");
}

/**
 * Builds style-locked prompts from Style DNA + slide blueprint + asset specs.
 */
export class PromptBuilderService {
  build(input: PromptBuilderInput): PromptPackage {
    const assets = input.assets.map((asset) => AssetSpecSchema.parse(asset));

    const lockRules = styleLockRules({ ...input, assets });
    const blueprint = blueprintInstructions(input.blueprint, input.language);
    const assetLines = assetInstructions(assets, input.language);

    const systemPromptSections = [
      localize(
        input.language,
        "You are a creative generation engine for slide assets. Follow style lock rules exactly.",
        "Você é um motor de geração criativa para assets de slides. Siga as regras de style lock exatamente.",
      ),
      localize(input.language, "Style lock rules:", "Regras de style lock:"),
      ...lockRules.map((rule) => `- ${rule}`),
      localize(
        input.language,
        "Never reveal chain-of-thought. Output only the requested creative deliverable.",
        "Nunca revele cadeia de raciocínio. Retorne apenas o entregável criativo solicitado.",
      ),
    ];

    const userPromptSections = [
      localize(
        input.language,
        `Brand: ${input.brandName ?? "N/A"}`,
        `Marca: ${input.brandName ?? "N/A"}`,
      ),
      localize(
        input.language,
        `Slide index: ${input.blueprint.slideIndex}`,
        `Índice do slide: ${input.blueprint.slideIndex}`,
      ),
      ...blueprint,
      localize(
        input.language,
        "Asset specifications:",
        "Especificações dos assets:",
      ),
      ...assetLines,
      localize(
        input.language,
        "Return one coherent generation plan respecting all constraints.",
        "Retorne um plano único de geração respeitando todas as restrições.",
      ),
    ];

    return {
      systemPrompt: systemPromptSections.join("\n"),
      userPrompt: userPromptSections.join("\n"),
      negativePrompt: negativePrompt({ ...input, assets }),
      audit: {
        styleFingerprint: input.styleDNA.fingerprint,
        styleLockRules: lockRules,
        assetIds: assets.map((asset) => asset.id),
      },
    };
  }
}

export default PromptBuilderService;
