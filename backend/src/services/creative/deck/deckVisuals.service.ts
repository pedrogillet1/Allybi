import type { slides_v1 } from "googleapis";
import * as crypto from "crypto";

import { uploadFile, getSignedUrl } from "../../../config/storage";
import { UPLOAD_CONFIG } from "../../../config/upload.config";
import { logger } from "../../../infra/logger";
import {
  SlidesClientService,
  type SlidesRequestContext,
} from "../../editing/slides/slidesClient.service";
import { SlidesEditorService } from "../../editing/slides/slidesEditor.service";
import { StyleDNAService } from "../styleDNA.service";
import {
  PromptBuilderService,
  type SlideBlueprint,
} from "../promptBuilder.service";
import { AssetRendererService } from "../assetRenderer.service";
import type { AssetSpec } from "../assetSpec.types";
import { createNanoBananaClientFromEnv } from "../nanoBananaFactory";
import type { DeckSlidePlan } from "./deckPlan.types";

type DeckStyle = "business" | "legal" | "stats" | "medical" | "book" | "script";
type VisualKind = "hero" | "backdrop" | "diagram" | "banner" | "icon";

function visualTag(kind: VisualKind): string {
  return `koda:visual:${kind}`;
}

function visualFrameTag(kind: VisualKind): string {
  return `koda:visual_frame:${kind}`;
}

function frameKindPrefix(kind: VisualKind): string {
  return `koda:visual_frame:${kind}:`;
}

function isIconFrame(desc: string): boolean {
  return desc.startsWith("koda:visual_frame:icon");
}

function preferNonIconFrames(descs: string[]): string[] {
  const nonIcon = descs.filter((d) => !isIconFrame(d));
  return nonIcon.length ? nonIcon : descs;
}

function chooseBestFrameDescription(params: {
  kind: VisualKind;
  allFrameDescs: string[];
}): string | null {
  const { kind } = params;
  const all = preferNonIconFrames(params.allFrameDescs);

  // Prefer explicit ":main" for base visuals to avoid accidentally picking an icon slot.
  const main = `koda:visual_frame:${kind}:main`;
  if (all.includes(main)) return main;

  const exact = `koda:visual_frame:${kind}`;
  if (all.includes(exact)) return exact;

  // Any other frame of the same kind.
  const prefix = frameKindPrefix(kind);
  const sameKind = all.find((d) => d.startsWith(prefix));
  if (sameKind) return sameKind;

  // Fallback: any non-icon frame.
  const anyNonIcon = all.find((d) => !isIconFrame(d));
  return anyNonIcon || all[0] || null;
}

function buildBlueprint(
  slideIndex: number,
  slidePlan: DeckSlidePlan,
  style: DeckStyle,
): SlideBlueprint {
  const goal =
    `${slidePlan.title}${slidePlan.subtitle ? ` — ${slidePlan.subtitle}` : ""}`.trim();
  return {
    slideIndex,
    slideGoal: goal,
    audience: style === "legal" ? "Legal audience" : "Business audience",
    narrativeTone: style === "legal" ? "formal" : "bold",
    blocks: [
      { id: "title", role: "title", intent: slidePlan.title, maxChars: 60 },
      ...(slidePlan.subtitle
        ? [
            {
              id: "subtitle",
              role: "subtitle" as const,
              intent: slidePlan.subtitle,
              maxChars: 180,
            },
          ]
        : []),
      ...(slidePlan.bullets?.length
        ? [
            {
              id: "body",
              role: "body" as const,
              intent: slidePlan.bullets.join(" | "),
              maxChars: style === "legal" ? 900 : 420,
            },
          ]
        : []),
      ...(slidePlan.visual?.prompt
        ? [
            {
              id: "visual",
              role: "visual" as const,
              intent: slidePlan.visual.prompt,
              maxChars: 220,
            },
          ]
        : [
            {
              id: "visual",
              role: "visual" as const,
              intent: "Support the slide goal with an on-brand visual.",
              maxChars: 220,
            },
          ]),
    ],
  };
}

function buildAssetSpec(params: {
  kind: VisualKind;
  slideIndex: number;
  slidePlan: DeckSlidePlan;
  style: DeckStyle;
  prompt: string;
}): AssetSpec {
  const { kind, slideIndex, slidePlan, style, prompt } = params;
  const purposeBase = prompt || slidePlan.visual?.prompt || slidePlan.title;
  const isBackdrop = kind === "backdrop";
  const isHero = kind === "hero";
  const isIcon = kind === "icon";
  const isBanner = kind === "banner";

  return {
    id: `deck_${slideIndex}_${kind}_${crypto.randomUUID().slice(0, 8)}`,
    type: isIcon
      ? "icon"
      : isBackdrop
        ? "background"
        : isHero
          ? "illustration"
          : "diagram",
    purpose: `${purposeBase} (slide visual: ${kind}, style=${style})`,
    size: isIcon
      ? { width: 512, height: 512 }
      : isBanner
        ? { width: 1920, height: 700 }
        : { width: 1920, height: 1080 },
    backgroundMode: isBackdrop ? "gradient" : "transparent",
    styleMode: "brand-match",
    styleHints: {
      palette: [],
      compositionHint: isIcon
        ? "single minimal icon, agency style, geometric, consistent stroke weight, no text"
        : isBackdrop
          ? "full-bleed 16:9 background, leave clean negative space for text overlays"
          : isHero
            ? "hero visual with strong focal point and clean edges"
            : isBanner
              ? "wide banner diagram for a process or timeline, no text"
              : "clean diagram style, icon-like elements, no text",
    },
    constraints: {
      noText: true,
      noLogos: true,
      noWatermark: true,
      safeForCommercialUse: true,
      keepAspectRatio: true,
      preserveBrandColors: true,
      maxFileSizeKb: 4096,
      requiredNegativePrompts: [],
    },
    referenceUrls: [],
    notes: prompt || slidePlan.visual?.prompt,
  };
}

function findElementByDescription(
  presentation: slides_v1.Schema$Presentation,
  slideObjectId: string,
  description: string,
): slides_v1.Schema$PageElement | null {
  const slide = (presentation.slides ?? []).find(
    (s) => s.objectId === slideObjectId,
  );
  if (!slide) return null;
  const el = (slide.pageElements ?? []).find(
    (e) => (e.description || "").trim() === description,
  );
  return el ?? null;
}

function findElementsByDescription(
  presentation: slides_v1.Schema$Presentation,
  slideObjectId: string,
  description: string,
): slides_v1.Schema$PageElement[] {
  const slide = (presentation.slides ?? []).find(
    (s) => s.objectId === slideObjectId,
  );
  if (!slide) return [];
  return (slide.pageElements ?? []).filter(
    (e) => (e.description || "").trim() === description,
  );
}

function elementPropsForFrame(
  el: slides_v1.Schema$PageElement,
): slides_v1.Schema$PageElementProperties | null {
  const props = (el as any).elementProperties as
    | slides_v1.Schema$PageElementProperties
    | undefined;
  if (!props?.transform) return null;
  // For createImage, we need pageObjectId on elementProperties
  return {
    pageObjectId: props.pageObjectId,
    size: props.size,
    transform: props.transform,
  };
}

type FrameElementProps = {
  pageObjectId: string;
  size?: slides_v1.Schema$Size;
  transform?: slides_v1.Schema$AffineTransform;
};

function insetElementPropsForIcon(
  props: FrameElementProps,
  fraction = 0.68,
): FrameElementProps {
  const f = Math.max(0.1, Math.min(1, fraction));
  const w0 = props.size?.width?.magnitude ?? null;
  const h0 = props.size?.height?.magnitude ?? null;
  if (!w0 || !h0 || w0 <= 0 || h0 <= 0) return props;

  const w = w0 * f;
  const h = h0 * f;

  const t = props.transform || ({} as any);
  const sx = typeof t.scaleX === "number" ? t.scaleX : 1;
  const sy = typeof t.scaleY === "number" ? t.scaleY : 1;

  // Translate to keep the inset box centered inside the original frame.
  const dx = ((w0 - w) * sx) / 2;
  const dy = ((h0 - h) * sy) / 2;

  return {
    ...props,
    size: {
      ...props.size,
      width: { ...props.size!.width!, magnitude: w },
      height: { ...props.size!.height!, magnitude: h },
    },
    transform: {
      ...t,
      translateX: (typeof t.translateX === "number" ? t.translateX : 0) + dx,
      translateY: (typeof t.translateY === "number" ? t.translateY : 0) + dy,
    },
  };
}

/**
 * Apply Nano Banana visuals to an existing Google Slides deck.
 * Assumes the deck already exists and has template markers (descriptions) for placement.
 */
export class DeckVisualsService {
  constructor(
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
    private readonly slidesEditor: SlidesEditorService = new SlidesEditorService(),
    private readonly styleDNA: StyleDNAService = new StyleDNAService(),
    private readonly prompts: PromptBuilderService = new PromptBuilderService(),
    private readonly renderer: AssetRendererService = new AssetRendererService(),
  ) {}

  private async uploadVisualToFetchableUrl(params: {
    userId: string;
    presentationId: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    ctx?: SlidesRequestContext;
  }): Promise<{ url: string; cleanup?: () => Promise<void> }> {
    // When running locally, GCS signed URLs are typically not available or useful.
    // But Slides still requires an HTTPS URL fetchable by Google.
    // Solution: upload to Drive as a public asset and use its "uc" URL.
    if (UPLOAD_CONFIG.STORAGE_PROVIDER === "local") {
      const uploaded = await this.slidesClient.uploadPublicAsset(
        {
          filename: params.filename,
          mimeType: params.mimeType,
          buffer: params.buffer,
        },
        params.ctx,
      );

      // Deleting immediately can be flaky if Slides fetches the URL asynchronously.
      // Keep by default; allow opt-in cleanup.
      const shouldDelete =
        process.env.KODA_SLIDES_DELETE_TEMP_ASSETS === "true";
      const cleanup = shouldDelete
        ? async () => {
            // Small delay to reduce intermittent missing-image issues.
            await new Promise((r) => setTimeout(r, 2500));
            await this.slidesClient.deleteDriveFile(
              uploaded.fileId,
              params.ctx,
            );
          }
        : undefined;

      return { url: uploaded.url, cleanup };
    }

    // Production path: store in configured storage (typically GCS) and serve via signed URL.
    const key = `creative/assets/${params.userId}/${params.presentationId}/${crypto.randomUUID()}.png`;
    await uploadFile(key, params.buffer, params.mimeType);
    const url = await getSignedUrl(key, 3600);
    return { url };
  }

  async applyVisuals(params: {
    userId: string;
    sourceDocumentId?: string;
    presentationId: string;
    slideObjectIds: string[];
    planSlides: DeckSlidePlan[];
    language: "en" | "pt" | "es";
    deckStyle: DeckStyle;
    brandName?: string;
    ctx?: SlidesRequestContext;
    onStage?: (input: {
      stage: string;
      key: string;
      params?: Record<string, string | number | boolean | null>;
    }) => void;
  }): Promise<void> {
    const enable = process.env.KODA_SLIDES_ENABLE_VISUALS === "true";
    if (!enable) return;

    const client = createNanoBananaClientFromEnv();
    if (!client) {
      logger.warn(
        "[DeckVisuals] Nano Banana is not configured (missing GEMINI_API_KEY); skipping visuals",
      );
      return;
    }

    const presentationId = params.presentationId.trim();
    const userId = params.userId.trim();
    const sourceDocumentId = (params.sourceDocumentId || "").trim() || null;
    if (!presentationId || !userId) return;

    const styleDNA = sourceDocumentId
      ? await this.styleDNA.extractAndStore(
          {
            userId,
            documentId: sourceDocumentId,
            presentationId,
          },
          {
            correlationId: params.ctx?.correlationId,
            userId,
            conversationId: params.ctx?.conversationId,
            clientMessageId: params.ctx?.clientMessageId,
          },
        )
      : await this.styleDNA.extractEphemeralFromPresentation(
          { presentationId },
          {
            correlationId: params.ctx?.correlationId,
            userId,
            conversationId: params.ctx?.conversationId,
            clientMessageId: params.ctx?.clientMessageId,
          },
        );

    // We need presentation payload to locate placement markers.
    const presentation = await this.slidesClient.getPresentation(
      presentationId,
      params.ctx,
    );

    const anyFrameDescriptionsBySlide = new Map<string, string[]>();
    for (const s of presentation.slides ?? []) {
      if (!s.objectId) continue;
      const frames = (s.pageElements ?? [])
        .map((e) => (e.description || "").trim())
        .filter((d) => d.startsWith("koda:visual_frame:"));
      anyFrameDescriptionsBySlide.set(s.objectId, frames);
    }

    for (let i = 0; i < params.planSlides.length; i += 1) {
      const slidePlan = params.planSlides[i];
      const slideObjectId = params.slideObjectIds[i];
      if (!slideObjectId) continue;

      // Conservative modes: visuals are opt-in only unless explicitly requested with a prompt.
      const force = process.env.KODA_SLIDES_VISUALS_FORCE === "true";
      const kind = slidePlan.visual?.kind;

      // Base slide visual (hero/backdrop/diagram) still follows conservative policy.
      const baseVisualAllowed = (() => {
        if (!kind || kind === "none") return false;
        if (force) return true;
        if (
          (params.deckStyle === "legal" ||
            params.deckStyle === "medical" ||
            params.deckStyle === "stats") &&
          !slidePlan.visual?.prompt
        )
          return false;
        return true;
      })();

      type Task = { kind: VisualKind; prompt: string; targetTag?: string };
      const tasks: Task[] = [];

      if (baseVisualAllowed) {
        tasks.push({
          kind: kind as VisualKind,
          prompt:
            slidePlan.visual?.prompt ||
            "Support the slide goal with an on-brand visual.",
        });
      }

      // Explicit multi-visuals (e.g., icons per card slot).
      const explicit = (slidePlan as any).visuals as
        | Array<{ id: string; kind: string; prompt: string; targetTag: string }>
        | undefined;
      if (explicit && Array.isArray(explicit)) {
        for (const v of explicit) {
          const vk = String(v?.kind || "").trim() as VisualKind;
          const targetTag = String(v?.targetTag || "").trim();
          const prompt = String(v?.prompt || "").trim();
          if (!vk || !targetTag || !prompt) continue;
          tasks.push({ kind: vk, prompt, targetTag });
        }
      } else {
        // Derive icon tasks from blocks when present (business premium templates).
        const blocks = (slidePlan as any).blocks as any[] | undefined;
        if (blocks && Array.isArray(blocks)) {
          for (const block of blocks) {
            const type = String(block?.type || "").trim();
            const items: any[] = Array.isArray(block?.items) ? block.items : [];

            const addIconTasks = (prefix: string) => {
              for (let j = 0; j < items.length; j += 1) {
                const item = items[j] || {};
                const p = String(item.iconPrompt || "").trim();
                if (!p) continue;
                tasks.push({
                  kind: "icon",
                  prompt: p,
                  targetTag: `koda:visual_frame:icon:${prefix}:${j + 1}`,
                });
              }
            };

            if (type === "cards_vertical") addIconTasks("card");
            else if (type === "grid_2x2") addIconTasks("grid");
            else if (type === "values_5") addIconTasks("value");
            else if (type === "kpi_grid_4") addIconTasks("kpi");
            else if (type === "top3_banner") {
              addIconTasks("concept");
              const bannerPrompt = String(
                block.bannerDiagramPrompt || "",
              ).trim();
              if (bannerPrompt) {
                tasks.push({
                  kind: "banner",
                  prompt: bannerPrompt,
                  targetTag: "koda:visual_frame:banner:main",
                });
              }
            }
          }
        }
      }

      if (tasks.length === 0) continue;

      try {
        params.onStage?.({
          stage: "composing",
          key: "allybi.stage.slides.rendering_visuals",
          params: {
            current: i + 1,
            total: params.planSlides.length,
            title: slidePlan.title || "",
          },
        });
      } catch {}

      const blueprint = buildBlueprint(i + 1, slidePlan, params.deckStyle);
      const cache = (this as any)._taskCache as
        | Map<string, { url: string; cleanup?: () => Promise<void> }>
        | undefined;
      const taskCache: Map<
        string,
        { url: string; cleanup?: () => Promise<void> }
      > = cache || new Map();
      (this as any)._taskCache = taskCache;

      for (let ti = 0; ti < tasks.length; ti += 1) {
        const task = tasks[ti];
        try {
          try {
            params.onStage?.({
              stage: "composing",
              key: "allybi.stage.slides.rendering_visuals_task",
              params: {
                current: i + 1,
                total: params.planSlides.length,
                task: ti + 1,
                tasks: tasks.length,
                kind: task.kind,
              },
            });
          } catch {}

          const cacheKey = `${params.deckStyle}|${task.kind}|${task.prompt}`;
          let uploaded = taskCache.get(cacheKey);

          if (!uploaded) {
            const spec = buildAssetSpec({
              kind: task.kind,
              slideIndex: i + 1,
              slidePlan,
              style: params.deckStyle,
              prompt: task.prompt,
            });

            const prompt = this.prompts.build({
              language: params.language === "pt" ? "pt" : "en",
              brandName: params.brandName,
              styleDNA,
              blueprint,
              assets: [spec],
              globalConstraints: {
                preservePalette: true,
                maxVisualComplexity:
                  task.kind === "icon"
                    ? "low"
                    : task.kind === "diagram" || task.kind === "banner"
                      ? "medium"
                      : "high",
                avoidTextInAssets: true,
              },
            });

            const generation = await client.generate({
              systemPrompt: prompt.systemPrompt,
              userPrompt: prompt.userPrompt,
              negativePrompt: prompt.negativePrompt,
              width: spec.size.width,
              height: spec.size.height,
            });

            const rendered = await this.renderer.render({
              sourceBuffer: generation.imageBuffer,
              spec,
              formats: ["png"],
              fitMode: task.kind === "backdrop" ? "cover" : "contain",
            });

            uploaded = await this.uploadVisualToFetchableUrl({
              userId,
              presentationId,
              buffer: rendered.primary.buffer,
              mimeType: rendered.primary.mimeType,
              filename: `koda-visual-${presentationId}-s${i + 1}-${task.kind}.png`,
              ctx: params.ctx,
            });

            taskCache.set(cacheKey, uploaded);
          }

          const url = uploaded.url;

          // Placement path A: explicit targetTag (frame-driven).
          if (task.targetTag) {
            const frames = findElementsByDescription(
              presentation,
              slideObjectId,
              task.targetTag,
            );
            if (frames.length === 0) continue;

            let placed = 0;
            for (const frame of frames) {
              // If the template already contains an image element, replacing it preserves
              // z-order and exact geometry better than creating a new image.
              if (frame.image && frame.objectId) {
                await this.slidesEditor.replaceImage(
                  presentationId,
                  frame.objectId,
                  url,
                  params.ctx,
                );
                continue;
              }

              const rawProps = frame ? elementPropsForFrame(frame) : null;
              let elementProperties = rawProps
                ? ({
                    ...rawProps,
                    pageObjectId: rawProps.pageObjectId || slideObjectId,
                  } as FrameElementProps)
                : null;
              if (elementProperties && task.kind === "icon") {
                elementProperties = insetElementPropsForIcon(elementProperties);
              }

              placed += 1;
              await this.slidesEditor.createImage(
                presentationId,
                slideObjectId,
                url,
                {
                  imageObjectId: `img_${crypto.randomUUID().replace(/-/g, "")}_${placed}`,
                  elementProperties: elementProperties ?? undefined,
                  replaceMethod:
                    task.kind === "icon" ? "CENTER_INSIDE" : "CENTER_CROP",
                },
                params.ctx,
              );
            }
            continue;
          }

          // Placement path B: legacy single visual per slide (koda:visual:* or koda:visual_frame:*).
          const visualKind = task.kind as VisualKind;
          const tag = visualTag(visualKind);
          const targets = findElementsByDescription(
            presentation,
            slideObjectId,
            tag,
          );
          const imageTargets = targets
            .filter((t) => t.image && t.objectId)
            .map((t) => t.objectId!) as string[];
          if (imageTargets.length > 0) {
            for (const imageObjectId of imageTargets) {
              await this.slidesEditor.replaceImage(
                presentationId,
                imageObjectId,
                url,
                params.ctx,
              );
            }
            continue;
          }

          // Prefer ":main" frames (e.g. koda:visual_frame:diagram:main) to avoid filling icon slots.
          const anyFrames =
            anyFrameDescriptionsBySlide.get(slideObjectId) || [];
          const bestDesc = chooseBestFrameDescription({
            kind: visualKind,
            allFrameDescs: anyFrames,
          });
          let placements = bestDesc
            ? findElementsByDescription(presentation, slideObjectId, bestDesc)
            : [];

          // Secondary fallbacks (older packs may only include the base tag without suffix).
          if (placements.length === 0) {
            const frameTag = visualFrameTag(visualKind);
            placements = findElementsByDescription(
              presentation,
              slideObjectId,
              frameTag,
            );
          }

          if (placements.length === 0) continue;

          let placed = 0;
          for (const frame of placements) {
            const rawProps = frame ? elementPropsForFrame(frame) : null;
            let elementProperties = rawProps
              ? ({
                  ...rawProps,
                  pageObjectId: rawProps.pageObjectId || slideObjectId,
                } as FrameElementProps)
              : null;
            if (elementProperties && task.kind === "icon") {
              elementProperties = insetElementPropsForIcon(elementProperties);
            }

            placed += 1;
            await this.slidesEditor.createImage(
              presentationId,
              slideObjectId,
              url,
              {
                imageObjectId: `img_${crypto.randomUUID().replace(/-/g, "")}_${placed}`,
                elementProperties: elementProperties ?? undefined,
                replaceMethod:
                  visualKind === "backdrop" ? "CENTER_CROP" : "CENTER_CROP",
              },
              params.ctx,
            );
          }
        } catch (err: any) {
          logger.warn("[DeckVisuals] Visual generation failed (continuing)", {
            slideIndex: i + 1,
            kind: task.kind,
            error: err?.message || String(err),
          });
        }
      }
    }
  }
}

export default DeckVisualsService;
