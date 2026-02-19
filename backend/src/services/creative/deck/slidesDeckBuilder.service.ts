import type { slides_v1 } from "googleapis";
import * as crypto from "crypto";
import {
  SlidesClientService,
  type SlidesRequestContext,
} from "../../editing/slides/slidesClient.service";
import {
  SlidesEditorService,
  type SlidesLayoutType,
} from "../../editing/slides/slidesEditor.service";
import { SlidesLayoutService } from "../../editing/slides/slidesLayout.service";
import type { DeckPlan, DeckSlidePlan } from "./deckPlan.types";
import { DeckVisualsService } from "./deckVisuals.service";
import { logger } from "../../../infra/logger";

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

type DeckStyle = "business" | "legal" | "stats" | "medical" | "book" | "script";

function deckStyleFromPlan(plan: DeckPlan, fallback: DeckStyle): DeckStyle {
  const style = (plan as any)?.style;
  if (style === "legal") return "legal";
  if (style === "stats") return "stats";
  if (style === "medical") return "medical";
  if (style === "book") return "book";
  if (style === "script") return "script";
  if (style === "business") return "business";
  return fallback;
}

function parseTemplateIds(raw: string | undefined | null): string[] {
  return String(raw || "")
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function chooseStable(ids: string[], seed: string): string {
  if (ids.length === 1) return ids[0];
  const h = crypto.createHash("sha256").update(seed).digest();
  const n = h.readUInt32BE(0);
  return ids[n % ids.length];
}

function resolveTemplateId(
  style: DeckStyle,
  ctx?: SlidesRequestContext,
): string {
  const mode = (
    process.env.KODA_SLIDES_TEMPLATE_VARIANT_MODE || "stable"
  ).trim(); // stable|random|first|best

  const listEnv = (() => {
    if (style === "legal") return process.env.KODA_SLIDES_TEMPLATE_LEGAL_IDS;
    if (style === "stats") return process.env.KODA_SLIDES_TEMPLATE_STATS_IDS;
    if (style === "medical")
      return process.env.KODA_SLIDES_TEMPLATE_MEDICAL_IDS;
    if (style === "book") return process.env.KODA_SLIDES_TEMPLATE_BOOK_IDS;
    if (style === "script") return process.env.KODA_SLIDES_TEMPLATE_SCRIPT_IDS;
    return process.env.KODA_SLIDES_TEMPLATE_BUSINESS_IDS;
  })();

  const singleEnv = (() => {
    if (style === "legal") return process.env.KODA_SLIDES_TEMPLATE_LEGAL_ID;
    if (style === "stats") return process.env.KODA_SLIDES_TEMPLATE_STATS_ID;
    if (style === "medical") return process.env.KODA_SLIDES_TEMPLATE_MEDICAL_ID;
    if (style === "book") return process.env.KODA_SLIDES_TEMPLATE_BOOK_ID;
    if (style === "script") return process.env.KODA_SLIDES_TEMPLATE_SCRIPT_ID;
    return process.env.KODA_SLIDES_TEMPLATE_BUSINESS_ID;
  })();

  const ids = parseTemplateIds(listEnv);
  const candidates = ids.length ? ids : parseTemplateIds(singleEnv);
  if (candidates.length === 0) return "";

  if (mode === "first") return candidates[0];
  if (mode === "random")
    return candidates[Math.floor(Math.random() * candidates.length)];
  // "best" is slide-level; template-level defaults to stable selection.

  const seed = [
    ctx?.userId || "",
    ctx?.conversationId || "",
    ctx?.correlationId || "",
    style,
  ].join("|");
  return chooseStable(candidates, seed);
}

function chooseFromPool(
  pool: Array<{ slideId: string; markerId: string }>,
  seed: string,
): { slideId: string; markerId: string } | null {
  if (pool.length === 0) return null;
  const mode = (
    process.env.KODA_SLIDES_TEMPLATE_VARIANT_MODE || "stable"
  ).trim();
  if (mode === "first") return pool[0];
  if (mode === "random") return pool[Math.floor(Math.random() * pool.length)];
  const ids = pool.map((v) => `${v.slideId}::${v.markerId}`);
  const picked = chooseStable(ids, seed);
  const [slideId, markerId] = picked.split("::");
  return { slideId, markerId };
}

type SlideFeatureIndex = Map<
  string,
  { descriptions: Set<string>; placeholders: Set<string> }
>;

function buildSlideFeatureIndex(
  presentation: slides_v1.Schema$Presentation,
): SlideFeatureIndex {
  const idx: SlideFeatureIndex = new Map();

  for (const slide of presentation.slides ?? []) {
    if (!slide.objectId) continue;
    const descriptions = new Set<string>();
    const placeholders = new Set<string>();

    for (const el of slide.pageElements ?? []) {
      const desc = (el.description || "").trim();
      if (desc) descriptions.add(desc);
      const ph = el.shape?.placeholder?.type;
      if (ph) placeholders.add(String(ph));
    }

    idx.set(slide.objectId, { descriptions, placeholders });
  }

  return idx;
}

function scoreCandidate(
  features:
    | { descriptions: Set<string>; placeholders: Set<string> }
    | undefined,
  slidePlan: DeckSlidePlan,
): number {
  if (!features) return 0;
  const d = features.descriptions;
  const p = features.placeholders;

  const hasTitle =
    d.has("koda:title") || p.has("TITLE") || p.has("CENTERED_TITLE");
  const hasSubtitle = d.has("koda:subtitle") || p.has("SUBTITLE");
  const hasBody = d.has("koda:body") || p.has("BODY");
  const hasLeft = d.has("koda:body:left") || d.has("koda:body:1");
  const hasRight = d.has("koda:body:right") || d.has("koda:body:2");

  let score = 0;
  if (hasTitle) score += 10;
  if (slidePlan.subtitle && hasSubtitle) score += 12;
  if ((slidePlan.bullets?.length || 0) > 0 && hasBody) score += 12;

  if (slidePlan.layout === "TITLE_AND_TWO_COLUMNS") {
    if (hasLeft) score += 20;
    if (hasRight) score += 20;
  }

  const kind = slidePlan.visual?.kind;
  if (kind && kind !== "none") {
    const base = `koda:visual_frame:${kind}`;
    const main = `${base}:main`;
    const hasExact =
      d.has(base) ||
      d.has(main) ||
      Array.from(d).some((x) => x.startsWith(`${base}:`));

    // Avoid counting icon frames as support for base slide visuals.
    const anyMatchingFrame = Array.from(d).some(
      (x) =>
        x.startsWith("koda:visual_frame:") &&
        !x.startsWith("koda:visual_frame:icon"),
    );

    if (hasExact) score += 40;
    else if (anyMatchingFrame) score += 18;
  }

  // Prefer templates that use explicit tags (more reliable than placeholders)
  const tagCount =
    Number(d.has("koda:title")) +
    Number(d.has("koda:subtitle")) +
    Number(d.has("koda:body")) +
    Number(d.has("koda:body:left") || d.has("koda:body:1")) +
    Number(d.has("koda:body:right") || d.has("koda:body:2"));
  score += tagCount * 2;

  // Advanced blocks: prefer archetypes that expose the needed slot tags.
  const blocks = (slidePlan as any).blocks as any[] | undefined;
  if (blocks && Array.isArray(blocks) && blocks.length > 0) {
    const want: string[] = [];
    const wantFrames: string[] = [];

    for (const block of blocks) {
      const type = String(block?.type || "").trim();
      if (type === "cards_vertical") {
        const items: any[] = Array.isArray(block?.items) ? block.items : [];
        const n = Math.max(1, Math.min(6, items.length || 1));
        const wantsIcons = items.some((it) =>
          String(it?.iconPrompt || "").trim(),
        );
        for (let i = 1; i <= n; i += 1) {
          want.push(`koda:card:${i}:title`, `koda:card:${i}:body`);
          if (wantsIcons) wantFrames.push(`koda:visual_frame:icon:card:${i}`);
        }
        if (block.note) want.push("koda:note");
      } else if (type === "grid_2x2") {
        const items: any[] = Array.isArray(block?.items) ? block.items : [];
        const wantsIcons = items.some((it) =>
          String(it?.iconPrompt || "").trim(),
        );
        for (let i = 1; i <= 4; i += 1) {
          want.push(`koda:grid:${i}:title`, `koda:grid:${i}:body`);
          if (wantsIcons) wantFrames.push(`koda:visual_frame:icon:grid:${i}`);
        }
      } else if (type === "values_5") {
        const items: any[] = Array.isArray(block?.items) ? block.items : [];
        const wantsIcons = items.some((it) =>
          String(it?.iconPrompt || "").trim(),
        );
        for (let i = 1; i <= 5; i += 1) {
          want.push(`koda:value:${i}:title`, `koda:value:${i}:body`);
          if (wantsIcons) wantFrames.push(`koda:visual_frame:icon:value:${i}`);
        }
      } else if (type === "triptych_pillars") {
        for (let i = 1; i <= 3; i += 1) {
          want.push(
            `koda:pillar:${i}:number`,
            `koda:pillar:${i}:title`,
            `koda:pillar:${i}:body`,
          );
        }
      } else if (type === "top3_banner") {
        const items: any[] = Array.isArray(block?.items) ? block.items : [];
        const wantsIcons = items.some((it) =>
          String(it?.iconPrompt || "").trim(),
        );
        for (let i = 1; i <= 3; i += 1) {
          want.push(`koda:concept:${i}:title`, `koda:concept:${i}:body`);
          if (wantsIcons)
            wantFrames.push(`koda:visual_frame:icon:concept:${i}`);
        }
        wantFrames.push("koda:visual_frame:banner:main");
      } else if (type === "table_4x3") {
        // 1 header row + 3 body rows, 3 columns: tags are 1-based (row 1..4, col 1..3).
        for (let r = 1; r <= 4; r += 1) {
          for (let c = 1; c <= 3; c += 1) {
            want.push(`koda:table:${r}:${c}`);
          }
        }
      } else if (type === "kpi_grid_4") {
        const items: any[] = Array.isArray(block?.items) ? block.items : [];
        const wantsIcons = items.some((it) =>
          String(it?.iconPrompt || "").trim(),
        );
        for (let i = 1; i <= 4; i += 1) {
          want.push(
            `koda:kpi:${i}:label`,
            `koda:kpi:${i}:value`,
            `koda:kpi:${i}:delta`,
          );
          if (wantsIcons) wantFrames.push(`koda:visual_frame:icon:kpi:${i}`);
        }
      }
    }

    for (const tag of want) {
      if (d.has(tag)) score += 18;
    }
    for (const frame of wantFrames) {
      if (d.has(frame)) score += 22;
    }
  }

  return score;
}

function isUsableCandidate(
  features:
    | { descriptions: Set<string>; placeholders: Set<string> }
    | undefined,
  slidePlan: DeckSlidePlan,
): boolean {
  if (!features) return false;
  const d = features.descriptions;
  const p = features.placeholders;

  const hasTitle =
    d.has("koda:title") || p.has("TITLE") || p.has("CENTERED_TITLE");
  const hasSubtitle = d.has("koda:subtitle") || p.has("SUBTITLE");
  const hasBody = d.has("koda:body") || p.has("BODY");
  const hasLeft = d.has("koda:body:left") || d.has("koda:body:1");
  const hasRight = d.has("koda:body:right") || d.has("koda:body:2");
  const hasAnyBodyTarget = hasBody || hasLeft || hasRight;

  // Always require a title target unless the slide is intentionally blank (we don't generate those).
  if (!hasTitle) return false;

  // Section header slides should have subtitle too; otherwise they render oddly.
  if (slidePlan.layout === "SECTION_HEADER") return hasSubtitle || hasBody;

  // Two-column slides should have at least two body targets (tags or placeholders).
  if (slidePlan.layout === "TITLE_AND_TWO_COLUMNS") {
    // We can't reliably count body boxes from the feature index (it stores sets),
    // so accept any explicit body tagging and let applySlideContent route bullets.
    return (hasLeft && hasRight) || hasBody || p.has("BODY");
  }

  // Most content slides should have a body target.
  const hasContent =
    Boolean((slidePlan.subtitle || "").trim()) ||
    Boolean(slidePlan.bullets?.length);
  if (
    hasContent &&
    slidePlan.layout !== "TITLE" &&
    slidePlan.layout !== "TITLE_ONLY"
  ) {
    return hasAnyBodyTarget || hasSubtitle;
  }

  // If blocks exist, require at least the first slot tag to prevent empty duplicates.
  const blocks = (slidePlan as any).blocks as any[] | undefined;
  if (blocks && Array.isArray(blocks) && blocks.length > 0) {
    for (const block of blocks) {
      const type = String(block?.type || "").trim();
      if (type === "cards_vertical") {
        const items: any[] = Array.isArray(block?.items) ? block.items : [];
        const n = Math.max(1, Math.min(6, items.length || 1));
        return (
          d.has(`koda:card:${n}:title`) || d.has("koda:body") || p.has("BODY")
        );
      }
      if (type === "grid_2x2")
        return (
          d.has("koda:grid:4:title") || d.has("koda:body") || p.has("BODY")
        );
      if (type === "values_5")
        return (
          d.has("koda:value:5:title") || d.has("koda:body") || p.has("BODY")
        );
      if (type === "triptych_pillars")
        return (
          d.has("koda:pillar:3:title") || d.has("koda:body") || p.has("BODY")
        );
      if (type === "top3_banner")
        return (
          d.has("koda:concept:3:title") || d.has("koda:body") || p.has("BODY")
        );
      if (type === "table_4x3")
        return d.has("koda:table:4:3") || d.has("koda:body") || p.has("BODY");
      if (type === "kpi_grid_4")
        return d.has("koda:kpi:4:value") || d.has("koda:body") || p.has("BODY");
    }
  }

  return true;
}

function findPlaceholderObjectId(
  presentation: slides_v1.Schema$Presentation,
  slideObjectId: string,
  placeholderTypes: string[],
): string | null {
  const slide = asArray(presentation.slides).find(
    (s) => s.objectId === slideObjectId,
  );
  if (!slide) return null;

  const pageElements = asArray(slide.pageElements);
  for (const el of pageElements) {
    const type = el.shape?.placeholder?.type;
    if (!type) continue;
    if (placeholderTypes.includes(type) && el.objectId) return el.objectId;
  }
  return null;
}

function findElementByDescription(
  presentation: slides_v1.Schema$Presentation,
  slideObjectId: string,
  description: string,
): string | null {
  const slide = asArray(presentation.slides).find(
    (s) => s.objectId === slideObjectId,
  );
  if (!slide) return null;
  const el = asArray(slide.pageElements).find(
    (e) => (e.description || "").trim() === description,
  );
  return el?.objectId ?? null;
}

function findElementsByDescription(
  presentation: slides_v1.Schema$Presentation,
  slideObjectId: string,
  description: string,
): string[] {
  const slide = asArray(presentation.slides).find(
    (s) => s.objectId === slideObjectId,
  );
  if (!slide) return [];
  return asArray(slide.pageElements)
    .filter((e) => (e.description || "").trim() === description)
    .map((e) => e.objectId)
    .filter((id): id is string => Boolean(id));
}

function findAllPlaceholderObjectIds(
  presentation: slides_v1.Schema$Presentation,
  slideObjectId: string,
  placeholderTypes: string[],
): string[] {
  const slide = asArray(presentation.slides).find(
    (s) => s.objectId === slideObjectId,
  );
  if (!slide) return [];

  const pageElements = asArray(slide.pageElements);
  return pageElements
    .filter((el) => {
      const type = el.shape?.placeholder?.type;
      if (!type) return false;
      return placeholderTypes.includes(type);
    })
    .map((el) => el.objectId)
    .filter((id): id is string => Boolean(id));
}

function mapLayout(layout: DeckSlidePlan["layout"]): SlidesLayoutType {
  if (layout === "TITLE") return "TITLE";
  if (layout === "TITLE_ONLY") return "TITLE_ONLY";
  if (layout === "SECTION_HEADER") return "SECTION_HEADER";
  if (layout === "TITLE_AND_TWO_COLUMNS") return "TITLE_AND_TWO_COLUMNS";
  if (layout === "SECTION_TITLE_AND_DESCRIPTION")
    return "SECTION_TITLE_AND_DESCRIPTION";
  return "TITLE_AND_BODY";
}

export class SlidesDeckBuilderService {
  constructor(
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
    private readonly slidesEditor: SlidesEditorService = new SlidesEditorService(),
    private readonly slidesLayout: SlidesLayoutService = new SlidesLayoutService(),
    private readonly visuals: DeckVisualsService = new DeckVisualsService(),
  ) {}

  private safeEmitStage(
    cb:
      | ((input: {
          stage: string;
          key: string;
          params?: Record<string, string | number | boolean | null>;
        }) => void)
      | undefined,
    input: {
      stage: string;
      key: string;
      params?: Record<string, string | number | boolean | null>;
    },
  ): void {
    try {
      cb?.(input);
    } catch {
      // Never let UI progress reporting break deck creation.
    }
  }

  private blocksToFallbackBullets(blocks: any[]): string[] {
    const out: string[] = [];
    const push = (s: string) => {
      const cleaned = String(s || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned) return;
      out.push(cleaned);
    };

    for (const block of Array.isArray(blocks) ? blocks : []) {
      const type = String(block?.type || "").trim();

      if (
        (type === "cards_vertical" ||
          type === "grid_2x2" ||
          type === "values_5" ||
          type === "top3_banner") &&
        Array.isArray(block.items)
      ) {
        for (const item of block.items) {
          const title = String(item?.title || "").trim();
          const body = String(item?.body || "").trim();
          if (title && body) push(`${title}: ${body}`);
          else if (title) push(title);
          else if (body) push(body);
        }
        continue;
      }

      if (type === "triptych_pillars" && Array.isArray(block.items)) {
        for (const item of block.items) {
          const num = String(item?.number || "").trim();
          const title = String(item?.title || "").trim();
          const body = String(item?.body || "").trim();
          const prefix = [num, title].filter(Boolean).join(" ");
          if (prefix && body) push(`${prefix}: ${body}`);
          else push(prefix || body);
        }
        continue;
      }

      if (type === "kpi_grid_4" && Array.isArray(block.items)) {
        for (const item of block.items) {
          const label = String(item?.label || "").trim();
          const value = String(item?.value || "").trim();
          const delta = String(item?.delta || "").trim();
          const tail = [value, delta ? `(${delta})` : ""]
            .filter(Boolean)
            .join(" ");
          if (label && tail) push(`${label}: ${tail}`);
          else if (label) push(label);
        }
        continue;
      }

      if (type === "table_4x3") {
        const headers: string[] = Array.isArray(block.headers)
          ? block.headers
          : [];
        const rows: any[] = Array.isArray(block.rows) ? block.rows : [];
        if (headers.length === 3) push(headers.join(" | "));
        for (const row of rows.slice(0, 3)) {
          const parts = Array.isArray(row)
            ? row.map((c) => String(c || "").trim()).filter(Boolean)
            : [];
          if (parts.length === 3) push(parts.join(" | "));
        }
      }
    }

    return out.slice(0, 8);
  }

  async createDeck(
    title: string,
    plan: DeckPlan,
    ctx?: SlidesRequestContext,
    opts?: {
      deckStyle?: DeckStyle;
      // First source document (used for StyleDNA storage + future citations).
      sourceDocumentId?: string;
      brandName?: string;
      language?: "en" | "pt" | "es";
      includeVisuals?: boolean;
      onStage?: (input: {
        stage: string;
        key: string;
        params?: Record<string, string | number | boolean | null>;
      }) => void;
    },
  ): Promise<{
    presentationId: string;
    url: string;
    slideObjectIds: string[];
  }> {
    const requestedStyle = opts?.deckStyle || "business";
    const style = deckStyleFromPlan(plan, requestedStyle);

    const templateId = resolveTemplateId(style, ctx).trim();
    if (!templateId) {
      logger.warn(
        "[SlidesDeckBuilder] No template configured; falling back to default Slides layouts (plain decks)",
        {
          style,
          correlationId: ctx?.correlationId,
          userId: ctx?.userId,
          conversationId: ctx?.conversationId,
          variantMode:
            process.env.KODA_SLIDES_TEMPLATE_VARIANT_MODE || "stable",
          hint: `Set KODA_SLIDES_TEMPLATE_${style.toUpperCase()}_ID or KODA_SLIDES_TEMPLATE_${style.toUpperCase()}_IDS`,
        },
      );
    } else {
      logger.info("[SlidesDeckBuilder] Using template", {
        style,
        templateId,
        correlationId: ctx?.correlationId,
        userId: ctx?.userId,
        conversationId: ctx?.conversationId,
        variantMode: process.env.KODA_SLIDES_TEMPLATE_VARIANT_MODE || "stable",
      });
    }

    const created = templateId
      ? await this.slidesClient.copyPresentationFromTemplate(
          templateId,
          title,
          ctx,
        )
      : await this.slidesClient.createPresentation(title, ctx);

    // Template-driven mode: duplicate tagged layout archetypes from the copied template
    // and then delete the archetype slides to leave only generated content.
    const slideObjectIds: string[] = [];
    const usedTemplateSlideIds: string[] = [];

    if (templateId) {
      const templatePresentation = await this.slidesClient.getPresentation(
        created.presentationId,
        ctx,
      );
      const featureIndex = buildSlideFeatureIndex(templatePresentation);

      const layoutIndex = this.buildTemplateLayoutIndex(templatePresentation);
      const layoutToTemplateSlideId = new Map<
        string,
        { slideId: string; markerId: string }
      >(Array.from(layoutIndex.entries()));

      for (let i = 0; i < plan.slides.length; i += 1) {
        const slidePlan = plan.slides[i];
        const layoutKey = slidePlan.layout || "TITLE_AND_BODY";
        const styleLayoutKey = `${style}:${layoutKey}`;

        const template =
          (() => {
            const seed = [
              ctx?.userId || "",
              ctx?.conversationId || "",
              ctx?.correlationId || "",
              style,
              layoutKey,
              String(i + 1),
            ].join("|");

            const mode = (
              process.env.KODA_SLIDES_TEMPLATE_VARIANT_MODE || "stable"
            ).trim();

            const pool: Array<{ slideId: string; markerId: string }> = [];

            // Include exact matches as candidates (style-specific preferred).
            const exactStyle =
              layoutToTemplateSlideId.get(styleLayoutKey) || null;
            const exactBase = layoutToTemplateSlideId.get(layoutKey) || null;
            if (exactStyle)
              pool.push({
                slideId: exactStyle.slideId,
                markerId: exactStyle.markerId,
              });
            if (exactBase)
              pool.push({
                slideId: exactBase.slideId,
                markerId: exactBase.markerId,
              });

            // Include variants (suffix markers) as candidates.
            const stylePrefix = `${styleLayoutKey}:`;
            const basePrefix = `${layoutKey}:`;
            for (const [k, v] of layoutToTemplateSlideId.entries()) {
              if (k.startsWith(stylePrefix))
                pool.push({ slideId: v.slideId, markerId: v.markerId });
            }
            for (const [k, v] of layoutToTemplateSlideId.entries()) {
              if (k.startsWith(basePrefix))
                pool.push({ slideId: v.slideId, markerId: v.markerId });
            }

            // De-dupe by slideId (markerId differs per key, but slideId is what we duplicate).
            const dedup = new Map<
              string,
              { slideId: string; markerId: string }
            >();
            for (const c of pool) {
              if (!dedup.has(c.slideId)) dedup.set(c.slideId, c);
            }
            const candidates = Array.from(dedup.values());
            const usableCandidates = candidates.filter((c) =>
              isUsableCandidate(featureIndex.get(c.slideId), slidePlan),
            );

            // If "first", behave like the old logic (exact-first).
            if (mode === "first") {
              const picked = exactStyle || exactBase || null;
              if (
                picked &&
                isUsableCandidate(featureIndex.get(picked.slideId), slidePlan)
              )
                return picked;
              // Fall back to any usable candidate (deterministically picked).
              return chooseFromPool(usableCandidates, seed);
            }

            // "best": score candidates for this slide plan (visual frames, columns, tags).
            if (mode === "best") {
              let best: { slideId: string; markerId: string } | null = null;
              let bestScore = -1;
              for (const c of usableCandidates.length
                ? usableCandidates
                : candidates) {
                const score = scoreCandidate(
                  featureIndex.get(c.slideId),
                  slidePlan,
                );
                if (score > bestScore) {
                  bestScore = score;
                  best = c;
                }
              }
              // Tie-break deterministically if needed.
              const poolForTies = usableCandidates.length
                ? usableCandidates
                : candidates;
              if (best && poolForTies.length > 1) {
                const tied = poolForTies.filter(
                  (c) =>
                    scoreCandidate(featureIndex.get(c.slideId), slidePlan) ===
                    bestScore,
                );
                if (tied.length > 1) {
                  return chooseFromPool(tied, seed);
                }
              }
              return best;
            }

            // stable/random: choose among all candidates (including exact base).
            return chooseFromPool(
              usableCandidates.length ? usableCandidates : candidates,
              seed,
            );
          })() ||
          layoutToTemplateSlideId.get(`${style}:TITLE_AND_BODY`) ||
          layoutToTemplateSlideId.get("TITLE_AND_BODY") ||
          null;

        let templateSlideId =
          template?.slideId ||
          asArray(templatePresentation.slides)[0]?.objectId ||
          null;
        let templateMarkerId = template?.markerId || null;

        if (!templateSlideId) {
          throw new Error("No template slide available to duplicate.");
        }

        // Hard guard: never duplicate a slide that cannot accept the content.
        // This prevents blank slides when a template pack has a broken/marker-only archetype.
        if (!isUsableCandidate(featureIndex.get(templateSlideId), slidePlan)) {
          const fallback =
            layoutToTemplateSlideId.get(`${style}:TITLE_AND_BODY`) ||
            layoutToTemplateSlideId.get("TITLE_AND_BODY") ||
            null;
          if (
            fallback?.slideId &&
            isUsableCandidate(featureIndex.get(fallback.slideId), slidePlan)
          ) {
            logger.warn(
              "[SlidesDeckBuilder] Selected template slide is unusable; falling back to TITLE_AND_BODY",
              {
                requestedLayout: layoutKey,
                pickedTemplateSlideId: templateSlideId,
                fallbackTemplateSlideId: fallback.slideId,
                style,
                correlationId: ctx?.correlationId,
              },
            );
            templateSlideId = fallback.slideId;
            templateMarkerId = fallback.markerId;
          }
        }

        const { objectIdMap } = await this.slidesEditor.duplicateObject(
          created.presentationId,
          templateSlideId,
          ctx,
        );
        const duplicatedSlideId = objectIdMap[templateSlideId];
        if (!duplicatedSlideId) {
          throw new Error(
            `Failed to resolve duplicated slide id for template slide ${templateSlideId}`,
          );
        }

        // Remove the layout marker element from the duplicated slide to avoid polluting output.
        const markerId = templateMarkerId
          ? objectIdMap[templateMarkerId]
          : null;
        if (markerId) {
          await this.slidesEditor.deleteObject(
            created.presentationId,
            markerId,
            ctx,
          );
        }

        slideObjectIds.push(duplicatedSlideId);
        usedTemplateSlideIds.push(templateSlideId);
      }

      // Move duplicates to the front in the desired (plan) order.
      // duplicateObject inserts copies right after their source, so when the same
      // template slide is reused the order reverses. Moving one-by-one in reverse
      // to position 0 produces the correct final order.
      for (let i = slideObjectIds.length - 1; i >= 0; i--) {
        await this.slidesEditor.updateSlidesPosition(
          created.presentationId,
          [slideObjectIds[i]],
          0,
          ctx,
        );
      }

      // Delete all template archetype slides (keep masters/theme).
      const allLibrarySlides = Array.from(
        new Set(
          Array.from(layoutToTemplateSlideId.values()).map((v) => v.slideId),
        ),
      );
      for (const templateSlideId of allLibrarySlides) {
        await this.slidesEditor.deleteObject(
          created.presentationId,
          templateSlideId,
          ctx,
        );
      }
    } else {
      // Non-template fallback: createSlides with predefined layouts.
      for (const slidePlan of plan.slides) {
        const { slideObjectId } = await this.slidesEditor.addSlide(
          created.presentationId,
          mapLayout(slidePlan.layout),
          undefined,
          ctx,
        );
        slideObjectIds.push(slideObjectId);

        this.safeEmitStage(opts?.onStage, {
          stage: "composing",
          key: "allybi.stage.slides.filling_slide",
          params: {
            current: slidePlan.index || slideObjectIds.length,
            total: plan.slides.length,
            title: slidePlan.title || "",
            snippet: (slidePlan.bullets || []).slice(0, 3).join(" | "),
          },
        });
        await this.applySlideContent(
          created.presentationId,
          slideObjectId,
          slidePlan,
          ctx,
        );
        await this.slidesLayout.enforceSafeDefaults(
          created.presentationId,
          slideObjectId,
          ctx,
        );
      }

      return {
        presentationId: created.presentationId,
        url: created.url,
        slideObjectIds,
      };
    }

    // Apply text content using template placeholders.
    for (let i = 0; i < plan.slides.length; i += 1) {
      this.safeEmitStage(opts?.onStage, {
        stage: "composing",
        key: "allybi.stage.slides.filling_slide",
        params: {
          current: i + 1,
          total: plan.slides.length,
          title: plan.slides[i]?.title || "",
          snippet: (plan.slides[i]?.bullets || []).slice(0, 3).join(" | "),
        },
      });
      await this.applySlideContent(
        created.presentationId,
        slideObjectIds[i],
        plan.slides[i],
        ctx,
      );
    }

    // Visual pass (best-effort; no-ops unless enabled + configured).
    if (ctx?.userId && opts?.includeVisuals !== false) {
      await this.visuals.applyVisuals({
        userId: ctx.userId,
        sourceDocumentId: opts?.sourceDocumentId,
        presentationId: created.presentationId,
        slideObjectIds,
        planSlides: plan.slides,
        language: opts?.language || "en",
        deckStyle: style,
        brandName: opts?.brandName,
        ctx,
        onStage: opts?.onStage,
      });
    }

    // Layout pass: enforce safe defaults at the end (pixel-perfect alignment/sizing guardrails).
    this.safeEmitStage(opts?.onStage, {
      stage: "finalizing",
      key: "allybi.stage.slides.layout",
      params: { total: slideObjectIds.length },
    });
    for (let i = 0; i < slideObjectIds.length; i += 1) {
      await this.slidesLayout
        .enforceSafeDefaults(created.presentationId, slideObjectIds[i], ctx)
        .catch(() => {});
    }

    return {
      presentationId: created.presentationId,
      url: created.url,
      slideObjectIds,
    };
  }

  private async applySlideContent(
    presentationId: string,
    slideObjectId: string,
    slidePlan: DeckSlidePlan,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const presentation = await this.slidesClient.getPresentation(
      presentationId,
      ctx,
    );
    const sanitizeCopy = (s: string) =>
      String(s || "")
        // Avoid literal truncation artifacts in PPTX exports.
        .replace(/…/g, "")
        .replace(/\.{3,}/g, "")
        .trim();
    const tryAutofit = async (objectId: string | null | undefined) => {
      if (!objectId) return;
      await this.slidesEditor
        .setTextAutofit(presentationId, objectId, "TEXT_AUTOFIT", ctx)
        .catch(() => {});
    };
    const forceAutofitOnSlide = async () => {
      // Best-effort safety net: templates or exporters can ignore per-element autofit updates.
      // Force TEXT_AUTOFIT on all text-bearing shapes on the slide.
      const slide = (presentation.slides ?? []).find(
        (s) => s.objectId === slideObjectId,
      );
      if (!slide) return;
      const ids = (slide.pageElements ?? [])
        .map((el) => (el.shape?.text ? el.objectId : null))
        .filter((id): id is string => Boolean(id && id.trim()));
      for (const id of ids) {
        await this.slidesEditor
          .setTextAutofit(presentationId, id, "TEXT_AUTOFIT", ctx)
          .catch(() => {});
      }
    };
    const finish = async () => {
      await forceAutofitOnSlide().catch(() => {});
    };

    // Prefer template-tagged placeholders; fall back to placeholder types.
    const titleObjectId =
      findElementByDescription(presentation, slideObjectId, "koda:title") ??
      findPlaceholderObjectId(presentation, slideObjectId, [
        "CENTERED_TITLE",
        "TITLE",
      ]) ??
      findPlaceholderObjectId(presentation, slideObjectId, ["TITLE"]);

    if (titleObjectId) {
      await this.slidesEditor.replaceText(
        presentationId,
        titleObjectId,
        sanitizeCopy(slidePlan.title),
        ctx,
      );
      await tryAutofit(titleObjectId);
    }

    const subtitleText = sanitizeCopy(slidePlan.subtitle || "");
    let bullets =
      slidePlan.bullets && slidePlan.bullets.length
        ? slidePlan.bullets.map(sanitizeCopy)
        : [];

    // Subtitle is filled independently when available.
    const subtitleObjectId =
      findElementByDescription(presentation, slideObjectId, "koda:subtitle") ??
      findPlaceholderObjectId(presentation, slideObjectId, ["SUBTITLE"]);
    if (subtitleObjectId) {
      if (subtitleText) {
        await this.slidesEditor.replaceText(
          presentationId,
          subtitleObjectId,
          subtitleText,
          ctx,
        );
      } else {
        await this.slidesEditor
          .clearText(presentationId, subtitleObjectId, ctx)
          .catch(() => {});
      }
      await tryAutofit(subtitleObjectId);
    }

    // Optional citations footer (for citation-heavy archetypes).
    // If the template exposes `koda:citation`, we fill it from speakerNotes when present.
    const citationObjectId = findElementByDescription(
      presentation,
      slideObjectId,
      "koda:citation",
    );
    if (citationObjectId) {
      const notes = String(slidePlan.speakerNotes || "").trim();
      let citation = "";
      if (notes) {
        const lines = notes
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const startIdx = lines.findIndex((l) => /^sources?:/i.test(l));
        const candidates = (
          startIdx >= 0 ? lines.slice(startIdx + 1) : lines
        ).filter(
          (l) =>
            l.includes("http://") ||
            l.includes("https://") ||
            /^\[[0-9]+\]/.test(l),
        );
        citation = candidates.slice(0, 3).join("  ");
        citation = citation.replace(/\*\*/g, "").replace(/__/g, "").trim();
      }
      if (citation) {
        await this.slidesEditor.replaceText(
          presentationId,
          citationObjectId,
          citation.slice(0, 260),
          ctx,
        );
      } else {
        await this.slidesEditor
          .clearText(presentationId, citationObjectId, ctx)
          .catch(() => {});
      }
      await tryAutofit(citationObjectId);
    }

    // Advanced slot fill: blocks/cards/grids/pillars.
    // If blocks are present, prefer them over generic body bullets.
    const blocks = (slidePlan as any).blocks as any[] | undefined;
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      let anyFilled = false;
      const fill = async (tag: string, text: string) => {
        const objectId = findElementByDescription(
          presentation,
          slideObjectId,
          tag,
        );
        if (!objectId) return;
        anyFilled = true;
        const cleaned = String(text || "").trim();
        if (!cleaned) {
          await this.slidesEditor
            .clearText(presentationId, objectId, ctx)
            .catch(() => {});
          await tryAutofit(objectId);
          return;
        }
        await this.slidesEditor.replaceText(
          presentationId,
          objectId,
          sanitizeCopy(cleaned),
          ctx,
        );
        await tryAutofit(objectId);
      };

      for (const block of blocks) {
        const type = String(block?.type || "").trim();
        if (type === "cards_vertical" && Array.isArray(block.items)) {
          const items = block.items as any[];
          for (let i = 0; i < 6; i += 1) {
            const item = items[i] || {};
            await fill(`koda:card:${i + 1}:title`, item.title || "");
            await fill(`koda:card:${i + 1}:body`, item.body || "");
          }
          await fill("koda:note", block.note ? String(block.note) : "");
          continue;
        }

        if (type === "grid_2x2" && Array.isArray(block.items)) {
          const items = block.items as any[];
          for (let i = 0; i < 4; i += 1) {
            const item = items[i] || {};
            await fill(`koda:grid:${i + 1}:title`, item.title || "");
            await fill(`koda:grid:${i + 1}:body`, item.body || "");
          }
          continue;
        }

        if (type === "values_5" && Array.isArray(block.items)) {
          const items = block.items as any[];
          for (let i = 0; i < 5; i += 1) {
            const item = items[i] || {};
            await fill(`koda:value:${i + 1}:title`, item.title || "");
            await fill(`koda:value:${i + 1}:body`, item.body || "");
          }
          continue;
        }

        if (type === "triptych_pillars" && Array.isArray(block.items)) {
          const items = block.items as any[];
          for (let i = 0; i < 3; i += 1) {
            const item = items[i] || {};
            const numberFallback = String(i + 1).padStart(2, "0");
            await fill(
              `koda:pillar:${i + 1}:number`,
              item.number || numberFallback,
            );
            await fill(`koda:pillar:${i + 1}:title`, item.title || "");
            await fill(`koda:pillar:${i + 1}:body`, item.body || "");
          }
          continue;
        }

        if (type === "top3_banner" && Array.isArray(block.items)) {
          const items = block.items as any[];
          for (let i = 0; i < 3; i += 1) {
            const item = items[i] || {};
            await fill(`koda:concept:${i + 1}:title`, item.title || "");
            await fill(`koda:concept:${i + 1}:body`, item.body || "");
          }
          continue;
        }

        if (type === "table_4x3") {
          const headers: string[] = Array.isArray(block.headers)
            ? block.headers
            : [];
          const rows: any[] = Array.isArray(block.rows) ? block.rows : [];
          // Tags are 1-based row/col. Row 1 is header, rows 2..4 are body rows.
          for (let c = 0; c < 3; c += 1) {
            await fill(`koda:table:1:${c + 1}`, headers[c] || "");
          }
          for (let r = 0; r < Math.min(3, rows.length); r += 1) {
            const row = Array.isArray(rows[r]) ? rows[r] : [];
            for (let c = 0; c < 3; c += 1) {
              await fill(`koda:table:${r + 2}:${c + 1}`, row[c] || "");
            }
          }
          // Clear any remaining unused rows to avoid placeholder bleed-through.
          for (let r = Math.min(3, rows.length); r < 3; r += 1) {
            for (let c = 0; c < 3; c += 1) {
              await fill(`koda:table:${r + 2}:${c + 1}`, "");
            }
          }
          continue;
        }

        if (type === "kpi_grid_4" && Array.isArray(block.items)) {
          for (let i = 0; i < Math.min(4, block.items.length); i += 1) {
            const item = block.items[i] || {};
            await fill(`koda:kpi:${i + 1}:label`, item.label || "");
            await fill(`koda:kpi:${i + 1}:value`, item.value || "");
            await fill(`koda:kpi:${i + 1}:delta`, item.delta || "");
          }
          // Clear unused slots
          for (let i = Math.min(4, block.items.length); i < 4; i += 1) {
            await fill(`koda:kpi:${i + 1}:label`, "");
            await fill(`koda:kpi:${i + 1}:value`, "");
            await fill(`koda:kpi:${i + 1}:delta`, "");
          }
          continue;
        }
      }

      // If we filled at least one block slot, do not also fill generic body placeholder from bullets.
      // Otherwise, fall back to legacy fill (templates without block tags).
      if (anyFilled) {
        await finish();
        return;
      }

      // If the template doesn't expose block tags and bullets are missing, synthesize fallback bullets.
      if (!bullets.length) {
        const fallback = this.blocksToFallbackBullets(blocks);
        if (fallback.length) bullets = fallback;
      }
    }

    // Body placement:
    // - Normal layouts: a single body target
    // - Two-column: prefer explicit left/right tags; fall back to multiple BODY placeholders
    const isTwoColumn = slidePlan.layout === "TITLE_AND_TWO_COLUMNS";

    const explicitLeft =
      findElementByDescription(presentation, slideObjectId, "koda:body:left") ??
      findElementByDescription(presentation, slideObjectId, "koda:body:1");
    const explicitRight =
      findElementByDescription(
        presentation,
        slideObjectId,
        "koda:body:right",
      ) ?? findElementByDescription(presentation, slideObjectId, "koda:body:2");

    const taggedBodies = findElementsByDescription(
      presentation,
      slideObjectId,
      "koda:body",
    );
    const placeholderBodies = findAllPlaceholderObjectIds(
      presentation,
      slideObjectId,
      ["BODY"],
    );

    const fallbackBodies = taggedBodies.length
      ? taggedBodies
      : placeholderBodies;

    const leftBodyId = explicitLeft || fallbackBodies[0] || null;
    const rightBodyId = explicitRight || fallbackBodies[1] || null;

    // If there are no bullets and we didn't set subtitle (or there's no subtitle box),
    // allow subtitle to be used as body content.
    const fallbackBodyText =
      !bullets.length && subtitleText && !subtitleObjectId ? subtitleText : "";

    if (isTwoColumn && bullets.length && leftBodyId && rightBodyId) {
      const mid = Math.ceil(bullets.length / 2);
      const leftBullets = bullets.slice(0, mid);
      const rightBullets = bullets.slice(mid);

      await this.slidesEditor.rewriteBullets(
        presentationId,
        leftBodyId,
        leftBullets,
        ctx,
      );
      await tryAutofit(leftBodyId);
      if (rightBullets.length) {
        await this.slidesEditor.rewriteBullets(
          presentationId,
          rightBodyId,
          rightBullets,
          ctx,
        );
        await tryAutofit(rightBodyId);
      } else {
        await this.slidesEditor
          .clearText(presentationId, rightBodyId, ctx)
          .catch(() => {});
        await tryAutofit(rightBodyId);
      }
      await finish();
      return;
    }

    const bodyObjectId =
      findElementByDescription(presentation, slideObjectId, "koda:body") ??
      findPlaceholderObjectId(presentation, slideObjectId, ["BODY"]) ??
      // As a last resort, use subtitle placeholder if template is subtitle-only.
      findElementByDescription(presentation, slideObjectId, "koda:subtitle") ??
      findPlaceholderObjectId(presentation, slideObjectId, ["SUBTITLE"]);

    if (!bodyObjectId) {
      await finish();
      return;
    }

    if (bullets.length > 0) {
      await this.slidesEditor.rewriteBullets(
        presentationId,
        bodyObjectId,
        bullets,
        ctx,
      );
      await tryAutofit(bodyObjectId);
      await finish();
      return;
    }

    if (fallbackBodyText) {
      await this.slidesEditor.replaceText(
        presentationId,
        bodyObjectId,
        fallbackBodyText,
        ctx,
      );
      await tryAutofit(bodyObjectId);
      await finish();
      return;
    }

    // No bullets and no fallback body: clear template placeholder text (e.g. "." stubs).
    await this.slidesEditor
      .clearText(presentationId, bodyObjectId, ctx)
      .catch(() => {});
    await tryAutofit(bodyObjectId);
    await finish();
  }

  /**
   * Index template slides by layout marker.
   *
   * Convention: Each archetype slide contains a tiny shape/page element with description:
   *   koda:layout:TITLE
   *   koda:layout:TITLE_AND_BODY
   *   koda:layout:TITLE_AND_TWO_COLUMNS
   *   koda:layout:TITLE_ONLY
   *   koda:layout:SECTION_HEADER
   *   koda:layout:SECTION_TITLE_AND_DESCRIPTION
   */
  private buildTemplateLayoutIndex(
    presentation: slides_v1.Schema$Presentation,
  ): Map<string, { slideId: string; markerId: string }> {
    const map = new Map<string, { slideId: string; markerId: string }>();
    const slides = presentation.slides ?? [];

    for (const slide of slides) {
      if (!slide.objectId) continue;
      for (const el of slide.pageElements ?? []) {
        const desc = (el.description || "").trim();
        if (!desc.startsWith("koda:layout:")) continue;
        const raw = desc.replace("koda:layout:", "").trim();
        if (!raw) continue;

        // Supported marker formats:
        // - koda:layout:TITLE_AND_BODY
        // - koda:layout:business:TITLE_AND_BODY
        const parts = raw
          .split(":")
          .map((p) => p.trim())
          .filter(Boolean);
        const key =
          parts.length >= 2 ? `${parts[0]}:${parts.slice(1).join(":")}` : raw;

        if (!map.has(key) && el.objectId)
          map.set(key, { slideId: slide.objectId, markerId: el.objectId });
      }
    }

    return map;
  }
}

export default SlidesDeckBuilderService;
