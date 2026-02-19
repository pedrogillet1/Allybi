import * as crypto from "crypto";
import type { slides_v1 } from "googleapis";
import prisma from "../../config/database";
import { logger } from "../../infra/logger";
import {
  SlidesClientService,
  type SlidesRequestContext,
} from "../editing/slides/slidesClient.service";
import {
  SlidesLayoutService,
  type SlidesThemeProfile,
} from "../editing/slides/slidesLayout.service";

export interface StyleDNAContext extends SlidesRequestContext {}

export interface ExtractStyleDNAInput {
  userId: string;
  documentId: string;
  presentationId: string;
  forceRefresh?: boolean;
}

export interface StyleDNAProfile {
  version: "1.0";
  documentId: string;
  presentationId: string;
  primaryPalette: string[];
  accentPalette: string[];
  titleFontFamily: string;
  bodyFontFamily: string;
  titleFontSizePt: number;
  bodyFontSizePt: number;
  dominantLayouts: Array<{ layout: string; count: number }>;
  preferredImageStyle: "photo" | "illustration" | "mixed";
  titleTone: "formal" | "neutral" | "bold";
  visualDensity: "low" | "medium" | "high";
  spacingPreference: "airy" | "balanced" | "compact";
  confidence: number;
  extractedAt: string;
  fingerprint: string;
}

export interface StyleDNARepository {
  getByDocument(
    userId: string,
    documentId: string,
  ): Promise<StyleDNAProfile | null>;
  save(userId: string, documentId: string, dna: StyleDNAProfile): Promise<void>;
}

interface SlidesDataEnvelope {
  styleDNA?: StyleDNAProfile;
  [key: string]: unknown;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function hexFromColor(
  color:
    | slides_v1.Schema$OptionalColor
    | slides_v1.Schema$OpaqueColor
    | undefined,
): string | null {
  const opaque = (color as slides_v1.Schema$OptionalColor | undefined)
    ?.opaqueColor
    ? (color as slides_v1.Schema$OptionalColor).opaqueColor
    : (color as slides_v1.Schema$OpaqueColor | undefined);

  const rgb = opaque?.rgbColor;
  if (!rgb) return null;

  const clamp = (n: number | null | undefined): number => {
    if (typeof n !== "number" || Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n * 255)));
  };

  const r = clamp(rgb.red);
  const g = clamp(rgb.green);
  const b = clamp(rgb.blue);
  return `#${[r, g, b]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function safeParseJson(input: string | null): Record<string, unknown> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function extractShapeText(shape: slides_v1.Schema$Shape | undefined): string {
  const elements = asArray(shape?.text?.textElements);
  const chunks: string[] = [];

  for (const element of elements) {
    const content = element.textRun?.content;
    if (content && content.trim()) {
      chunks.push(content.trim());
    }
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function computeFingerprint(payload: Record<string, unknown>): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
}

class PrismaStyleDNARepository implements StyleDNARepository {
  async getByDocument(
    userId: string,
    documentId: string,
  ): Promise<StyleDNAProfile | null> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true },
    });

    if (!doc) {
      return null;
    }

    const meta = await prisma.documentMetadata.findUnique({
      where: { documentId },
      select: { slidesData: true },
    });

    const envelope = safeParseJson(
      meta?.slidesData ?? null,
    ) as SlidesDataEnvelope;
    return envelope.styleDNA ?? null;
  }

  async save(
    userId: string,
    documentId: string,
    dna: StyleDNAProfile,
  ): Promise<void> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true },
    });

    if (!doc) {
      throw new Error("Document not found for Style DNA save.");
    }

    const existing = await prisma.documentMetadata.findUnique({
      where: { documentId },
      select: { slidesData: true },
    });

    const envelope = safeParseJson(existing?.slidesData ?? null);
    envelope.styleDNA = dna;

    await prisma.documentMetadata.upsert({
      where: { documentId },
      update: {
        slidesData: JSON.stringify(envelope),
      },
      create: {
        documentId,
        slidesData: JSON.stringify(envelope),
      },
    });
  }
}

/**
 * Extracts and persists deck/brand style DNA for style-locked generation.
 */
export class StyleDNAService {
  constructor(
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
    private readonly slidesLayout: SlidesLayoutService = new SlidesLayoutService(),
    private readonly repository: StyleDNARepository = new PrismaStyleDNARepository(),
  ) {}

  async getStyleDNA(
    userId: string,
    documentId: string,
  ): Promise<StyleDNAProfile | null> {
    return this.repository.getByDocument(userId, documentId);
  }

  async extractAndStore(
    input: ExtractStyleDNAInput,
    ctx?: StyleDNAContext,
  ): Promise<StyleDNAProfile> {
    const userId = input.userId.trim();
    const documentId = input.documentId.trim();
    const presentationId = input.presentationId.trim();

    if (!userId || !documentId || !presentationId) {
      throw new Error(
        "userId, documentId and presentationId are required to extract Style DNA.",
      );
    }

    if (!input.forceRefresh) {
      const existing = await this.repository.getByDocument(userId, documentId);
      if (existing) {
        return existing;
      }
    }

    const [presentation, theme] = await Promise.all([
      this.slidesClient.getPresentation(presentationId, ctx),
      this.slidesLayout.detectTheme(presentationId, ctx),
    ]);

    const dna = this.buildProfile(
      documentId,
      presentationId,
      presentation,
      theme,
    );
    await this.repository.save(userId, documentId, dna);

    logger.info("[StyleDNA] extracted and stored", {
      userId,
      documentId,
      presentationId,
      correlationId: ctx?.correlationId,
      conversationId: ctx?.conversationId,
      clientMessageId: ctx?.clientMessageId,
      confidence: dna.confidence,
      fingerprint: dna.fingerprint,
    });

    return dna;
  }

  /**
   * Extract style DNA from an existing Google Slides presentation without storing it.
   * Useful for prompt-only deck visuals (no source document) and template-driven decks.
   */
  async extractEphemeralFromPresentation(
    input: {
      presentationId: string;
      documentId?: string;
    },
    ctx?: StyleDNAContext,
  ): Promise<StyleDNAProfile> {
    const presentationId = input.presentationId.trim();
    if (!presentationId) {
      throw new Error(
        "presentationId is required to extract ephemeral Style DNA.",
      );
    }

    const documentId = (
      input.documentId || `ephemeral-${presentationId}`
    ).trim();

    const [presentation, theme] = await Promise.all([
      this.slidesClient.getPresentation(presentationId, ctx),
      this.slidesLayout.detectTheme(presentationId, ctx),
    ]);

    const dna = this.buildProfile(
      documentId,
      presentationId,
      presentation,
      theme,
    );

    logger.info("[StyleDNA] extracted ephemeral", {
      presentationId,
      documentId,
      correlationId: ctx?.correlationId,
      conversationId: ctx?.conversationId,
      clientMessageId: ctx?.clientMessageId,
      confidence: dna.confidence,
      fingerprint: dna.fingerprint,
    });

    return dna;
  }

  mergeWithOverrides(
    base: StyleDNAProfile,
    overrides: Partial<StyleDNAProfile>,
  ): StyleDNAProfile {
    const merged: StyleDNAProfile = {
      ...base,
      ...overrides,
      version: "1.0",
      extractedAt: new Date().toISOString(),
      fingerprint: "",
    };

    merged.fingerprint = computeFingerprint({
      primaryPalette: merged.primaryPalette,
      accentPalette: merged.accentPalette,
      titleFontFamily: merged.titleFontFamily,
      bodyFontFamily: merged.bodyFontFamily,
      titleFontSizePt: merged.titleFontSizePt,
      bodyFontSizePt: merged.bodyFontSizePt,
      dominantLayouts: merged.dominantLayouts,
      preferredImageStyle: merged.preferredImageStyle,
      titleTone: merged.titleTone,
      visualDensity: merged.visualDensity,
      spacingPreference: merged.spacingPreference,
    });

    return merged;
  }

  private buildProfile(
    documentId: string,
    presentationId: string,
    presentation: slides_v1.Schema$Presentation,
    theme: SlidesThemeProfile,
  ): StyleDNAProfile {
    const slides = presentation.slides ?? [];

    const layoutCounts = new Map<string, number>();
    const titleSamples: string[] = [];
    const bodyWordCounts: number[] = [];
    const colorSamples: string[] = [];
    let visualShapes = 0;
    let textShapes = 0;

    for (const slide of slides) {
      const pageElements = slide.pageElements ?? [];
      const layoutName =
        (slide.slideProperties?.layoutObjectId || "unknown").trim() ||
        "unknown";
      layoutCounts.set(layoutName, (layoutCounts.get(layoutName) ?? 0) + 1);

      const bgHex = hexFromColor(
        slide.pageProperties?.pageBackgroundFill?.solidFill?.color,
      );
      if (bgHex) {
        colorSamples.push(bgHex);
      }

      for (const element of pageElements) {
        if (element.shape) {
          textShapes += 1;
          const placeholderType = element.shape.placeholder?.type;
          const text = extractShapeText(element.shape);

          if (
            (placeholderType === "TITLE" ||
              placeholderType === "CENTERED_TITLE") &&
            text
          ) {
            titleSamples.push(text);
          } else if (text) {
            bodyWordCounts.push(text.split(/\s+/).filter(Boolean).length);
          }
        } else if (
          element.image ||
          element.video ||
          element.wordArt ||
          element.table
        ) {
          visualShapes += 1;
        }
      }
    }

    const dominantLayouts = Array.from(layoutCounts.entries())
      .map(([layout, count]) => ({ layout, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const avgBodyWords =
      bodyWordCounts.length === 0
        ? 0
        : bodyWordCounts.reduce((sum, value) => sum + value, 0) /
          bodyWordCounts.length;

    const visualRatio =
      visualShapes === 0
        ? 0
        : visualShapes / Math.max(1, textShapes + visualShapes);
    const titleLength =
      titleSamples.length === 0
        ? 0
        : titleSamples.reduce((sum, text) => sum + text.length, 0) /
          titleSamples.length;

    const primaryPalette = uniq([
      theme.primaryTextColor,
      theme.backgroundColor,
      ...colorSamples.slice(0, 4),
    ]).filter(Boolean);

    const accentPalette = uniq([
      theme.accentColor,
      ...colorSamples.slice(4, 8),
    ]).filter(Boolean);

    const preferredImageStyle: StyleDNAProfile["preferredImageStyle"] =
      visualRatio > 0.5
        ? "photo"
        : visualRatio < 0.2
          ? "illustration"
          : "mixed";

    const titleTone: StyleDNAProfile["titleTone"] =
      titleLength > 55 ? "formal" : titleLength < 30 ? "bold" : "neutral";

    const visualDensity: StyleDNAProfile["visualDensity"] =
      avgBodyWords > 90 ? "high" : avgBodyWords > 45 ? "medium" : "low";

    const spacingPreference: StyleDNAProfile["spacingPreference"] =
      visualDensity === "high"
        ? "compact"
        : visualDensity === "low"
          ? "airy"
          : "balanced";

    const confidence = Math.max(
      0.45,
      Math.min(
        0.98,
        0.55 +
          Math.min(slides.length, 20) * 0.015 +
          (dominantLayouts.length > 0 ? 0.08 : 0) +
          (primaryPalette.length >= 2 ? 0.08 : 0),
      ),
    );

    const payloadForHash = {
      documentId,
      presentationId,
      primaryPalette,
      accentPalette,
      titleFontFamily: theme.titleFontFamily,
      bodyFontFamily: theme.bodyFontFamily,
      titleFontSizePt: theme.titleFontSizePt,
      bodyFontSizePt: theme.bodyFontSizePt,
      dominantLayouts,
      preferredImageStyle,
      titleTone,
      visualDensity,
      spacingPreference,
    };

    return {
      version: "1.0",
      documentId,
      presentationId,
      primaryPalette,
      accentPalette,
      titleFontFamily: theme.titleFontFamily,
      bodyFontFamily: theme.bodyFontFamily,
      titleFontSizePt: theme.titleFontSizePt,
      bodyFontSizePt: theme.bodyFontSizePt,
      dominantLayouts,
      preferredImageStyle,
      titleTone,
      visualDensity,
      spacingPreference,
      confidence,
      extractedAt: new Date().toISOString(),
      fingerprint: computeFingerprint(payloadForHash),
    };
  }
}

export default StyleDNAService;
