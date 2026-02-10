import * as path from 'path';
import * as fs from 'fs/promises';
import type { slides_v1 } from 'googleapis';

import { SlidesClientService, type SlidesRequestContext } from './slidesClient.service';
import { SlidesEditorService } from './slidesEditor.service';

type TextAlign = 'START' | 'CENTER' | 'END' | 'JUSTIFIED';

export type KodaLayoutKey =
  | 'TITLE'
  | 'SECTION_HEADER'
  | 'TITLE_AND_BODY'
  | 'TITLE_AND_TWO_COLUMNS'
  | 'TITLE_ONLY'
  | 'SECTION_TITLE_AND_DESCRIPTION';

export interface HtmlTemplateCompileResult {
  domain: string;
  presentationId: string;
  url: string;
  // Base required layouts (guaranteed present)
  layoutKeys: KodaLayoutKey[];
  // All layout marker keys created (includes variants like TITLE_AND_BODY:problem_solution)
  templateLayoutMarkers: string[];
  warnings: string[];
}

interface ExtractedTag {
  tag: string;
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  // Present only for text tags
  textStyle?: {
    fontFamily: string;
    fontWeight: number;
    fontStyle: string;
    fontSizePx: number;
    lineHeightPx: number | null;
    color: string;
    textAlign: string;
  };
}

interface RenderedSlide {
  backgroundPng: Buffer;
  rootWidthPx: number;
  rootHeightPx: number;
  tags: ExtractedTag[];
}

function stripQuotes(s: string): string {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function firstFontFamily(cssFontFamily: string): string {
  const parts = String(cssFontFamily || '')
    .split(',')
    .map((p) => stripQuotes(p.trim()))
    .filter(Boolean);
  return parts[0] || 'Arial';
}

function parseRgbColorToHex(color: string): string {
  const c = String(color || '').trim();
  const m = c.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (!m) return '#000000';
  const r = Math.max(0, Math.min(255, parseInt(m[1], 10)));
  const g = Math.max(0, Math.min(255, parseInt(m[2], 10)));
  const b = Math.max(0, Math.min(255, parseInt(m[3], 10)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

function hexToRgb(hex: string): slides_v1.Schema$RgbColor {
  const normalized = String(hex || '').replace('#', '').trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return { red: 0, green: 0, blue: 0 };
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

function cssTextAlignToSlides(align: string): TextAlign {
  const a = String(align || '').toLowerCase();
  if (a === 'center') return 'CENTER';
  if (a === 'right' || a === 'end') return 'END';
  if (a === 'justify') return 'JUSTIFIED';
  return 'START';
}

function cssPxToPt(px: number): number {
  // CSS px at 96dpi: 1px = 0.75pt
  return px * 0.75;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toObjectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requiredLayouts(): KodaLayoutKey[] {
  return [
    'TITLE',
    'SECTION_HEADER',
    'TITLE_AND_BODY',
    'TITLE_AND_TWO_COLUMNS',
    'TITLE_ONLY',
    'SECTION_TITLE_AND_DESCRIPTION',
  ];
}

function tagIsText(tag: string): boolean {
  const t = String(tag || '').trim();
  if (!t.startsWith('koda:')) return false;
  if (tagIsLayoutMarker(t)) return false;
  if (tagIsVisualFrame(t)) return false;
  // Any other koda:* tag is treated as an editable text slot.
  return true;
}

function tagIsVisualFrame(tag: string): boolean {
  return tag.startsWith('koda:visual_frame:');
}

function tagIsLayoutMarker(tag: string): boolean {
  return tag.startsWith('koda:layout:');
}

function inferLayoutMarker(tags: ExtractedTag[]): { layoutKey: KodaLayoutKey; markerBase: string } | null {
  const marker = tags.find((t) => tagIsLayoutMarker(t.tag));
  if (!marker) return null;
  const raw = marker.tag.replace('koda:layout:', '').trim();
  // Allow koda:layout:style:KEY, take the last part as KEY
  const parts = raw.split(':').map((p) => p.trim()).filter(Boolean);
  const key = (parts[parts.length - 1] || '').trim() as KodaLayoutKey;
  if (!requiredLayouts().includes(key)) return null;

  // Preserve the original marker prefix (e.g. koda:layout:business:TITLE_AND_BODY)
  // so template libraries can be style-scoped and variants remain unambiguous.
  const markerBase = `koda:layout:${raw}`;
  return { layoutKey: key, markerBase };
}

function inferVariantNameFromFilename(filePath: string): string {
  const base = path.basename(filePath).replace(/\.html$/i, '');
  const stripped = base.replace(/^slide_\d+_/, '').replace(/^slide-?\d+-?/, '');
  const safe = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return safe || 'variant';
}

function slideHasMinimumTags(layoutKey: KodaLayoutKey, tags: Set<string>): boolean {
  const has = (t: string) => tags.has(t);
  const hasAnyContentSlot = (() => {
    for (const t of tags) {
      const tt = String(t || '').trim();
      if (!tt.startsWith('koda:')) continue;
      if (tt === 'koda:title' || tt === 'koda:subtitle') continue;
      if (tagIsLayoutMarker(tt) || tagIsVisualFrame(tt)) continue;
      return true;
    }
    return false;
  })();
  if (layoutKey === 'TITLE') return has('koda:title');
  if (layoutKey === 'TITLE_ONLY') return has('koda:title');
  if (layoutKey === 'SECTION_HEADER') return has('koda:title');
  if (layoutKey === 'TITLE_AND_BODY') return has('koda:title') && (has('koda:body') || has('koda:subtitle') || hasAnyContentSlot);
  if (layoutKey === 'SECTION_TITLE_AND_DESCRIPTION') return has('koda:title') && (has('koda:body') || has('koda:subtitle') || hasAnyContentSlot);
  if (layoutKey === 'TITLE_AND_TWO_COLUMNS') {
    return has('koda:title') && (has('koda:body') || has('koda:body:left') || has('koda:body:right') || has('koda:subtitle') || hasAnyContentSlot);
  }
  return false;
}

/**
 * Compile HTML/CSS slide archetypes into a Google Slides template library.
 *
 * Strategy:
 * - Render each HTML slide in Chromium and screenshot as background PNG (high-fidelity design)
 * - Overlay editable text boxes + image frames positioned from DOM bounding boxes
 * - Attach Koda automation tags via Alt Text "Description" on each element
 */
export class HtmlTemplateCompilerService {
  constructor(
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
    private readonly slidesEditor: SlidesEditorService = new SlidesEditorService(),
  ) {}

  async compileDomainTemplate(params: {
    domain: string;
    sourceDir: string;
    title: string;
    driveAssetsFolderId?: string;
    includeVariants?: boolean;
    ctx?: SlidesRequestContext;
  }): Promise<HtmlTemplateCompileResult> {
    const warnings: string[] = [];
    const domain = params.domain.trim();
    const sourceDir = path.resolve(params.sourceDir.trim());
    const title = params.title.trim() || `Koda Template - ${domain}`;

    const htmlFiles = (await fs.readdir(sourceDir))
      .filter((f) => f.toLowerCase().endsWith('.html'))
      .map((f) => path.resolve(sourceDir, f));

    if (htmlFiles.length === 0) {
      throw new Error(`No .html files found in ${sourceDir}`);
    }

    const puppeteer = require('puppeteer') as any;

    // In sandboxed environments, Chromium often cannot write Crashpad/user-data into ~/Library.
    // Force all state into /tmp to avoid macOS permission issues.
    const tmpRoot = `/tmp/koda-puppeteer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const browser = await puppeteer.launch({
      headless: 'new',
      userDataDir: `${tmpRoot}/profile`,
      env: { ...process.env, HOME: `${tmpRoot}/home` },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--disable-crash-reporter',
        '--disable-breakpad',
        '--disable-features=Crashpad',
        `--crash-dumps-dir=${tmpRoot}/crash`,
      ],
    });

    // Collect all slides that have a recognizable layout marker.
    const slides: Array<{
      filePath: string;
      layoutKey: KodaLayoutKey;
      markerBase: string;
      variant: string;
      rendered: RenderedSlide;
    }> = [];

    try {
      for (const filePath of htmlFiles) {
        const rendered = await this.renderHtmlSlide(browser, filePath);
        const inferred = inferLayoutMarker(rendered.tags);
        if (!inferred) {
          warnings.push(`Skipping ${path.basename(filePath)} (missing/unknown koda:layout marker)`);
          continue;
        }
        const { layoutKey, markerBase } = inferred;

        const tagSet = new Set(rendered.tags.map((t) => t.tag));
        if (!slideHasMinimumTags(layoutKey, tagSet)) {
          warnings.push(`Skipping ${path.basename(filePath)} (layout ${layoutKey} missing required koda:* tags)`);
          continue;
        }

        slides.push({
          filePath,
          layoutKey,
          markerBase,
          variant: inferVariantNameFromFilename(filePath),
          rendered,
        });
      }
    } finally {
      await browser.close();
    }

    const missing = requiredLayouts().filter((k) => !slides.some((s) => s.layoutKey === k));
    if (missing.length) {
      throw new Error(`Missing required layouts for ${domain}: ${missing.join(', ')}`);
    }

    const created = await this.slidesClient.createPresentation(title, params.ctx);

    // Default: compile only the 6 core archetypes (stable, fillable).
    // Optional: includeVariants=true will compile all additional HTML slides as variants.
    const templateLayoutMarkers: string[] = [];
    const usedBaseForKey = new Set<KodaLayoutKey>();

    // Sort: required layouts first, then by filename.
    const byPriority = (a: typeof slides[number], b: typeof slides[number]) => {
      const ra = requiredLayouts().indexOf(a.layoutKey);
      const rb = requiredLayouts().indexOf(b.layoutKey);
      if (ra !== rb) return ra - rb;
      return a.filePath.localeCompare(b.filePath);
    };

    const orderedAll = [...slides].sort(byPriority);
    const includeVariants = params.includeVariants === true;

    const ordered = includeVariants
      ? orderedAll
      : (() => {
          // Prefer known canonical filenames if present; otherwise first slide per layout key.
          const preferredByKey: Record<KodaLayoutKey, string[]> = {
            TITLE: ['slide_1_title', 'slide_01_title', 'title'],
            SECTION_HEADER: ['slide_2_section_header', 'slide_02_section_header', 'section_header'],
            TITLE_AND_BODY: ['slide_3_title_body', 'slide_03_title_body', 'title_body'],
            TITLE_AND_TWO_COLUMNS: ['slide_4_two_columns', 'slide_04_two_columns', 'two_columns'],
            TITLE_ONLY: ['slide_5_title_only', 'slide_05_title_only', 'title_only'],
            SECTION_TITLE_AND_DESCRIPTION: ['slide_6_section_desc', 'slide_06_section_desc', 'section_desc'],
          };

          const out: typeof orderedAll = [];
          for (const key of requiredLayouts()) {
            const candidates = orderedAll.filter((s) => s.layoutKey === key);
            if (candidates.length === 0) continue;

            const patterns = preferredByKey[key] || [];
            const picked =
              candidates.find((c) => patterns.some((p) => path.basename(c.filePath).toLowerCase().includes(p))) ||
              candidates[0];
            out.push(picked);
          }
          return out;
        })();

    for (const s of ordered) {
      const isBase = !usedBaseForKey.has(s.layoutKey);
      const marker = isBase
        ? s.markerBase
        : `${s.markerBase}:${s.variant}`;

      if (isBase) usedBaseForKey.add(s.layoutKey);

      await this.createArchetypeSlide(created.presentationId, marker, s.rendered, {
        driveAssetsFolderId: params.driveAssetsFolderId,
        ctx: params.ctx,
      });
      templateLayoutMarkers.push(marker.replace('koda:layout:', ''));
    }

    return {
      domain,
      presentationId: created.presentationId,
      url: created.url,
      layoutKeys: requiredLayouts(),
      templateLayoutMarkers,
      warnings,
    };
  }

  private async createArchetypeSlide(
    presentationId: string,
    layoutMarker: string,
    rendered: RenderedSlide,
    opts: { driveAssetsFolderId?: string; ctx?: SlidesRequestContext },
  ): Promise<void> {
    // IMPORTANT: Use a single Slides batchUpdate per archetype slide to avoid hitting
    // "write requests per minute per user" quota limits.
    const slideObjectId = toObjectId('slide');

    // Compute mapping from HTML pixel space to Slides points space.
    const slideWidthPt = 720;
    const slideHeightPt = 405;
    const ptPerPxX = slideWidthPt / Math.max(1, rendered.rootWidthPx);
    const ptPerPxY = slideHeightPt / Math.max(1, rendered.rootHeightPx);
    const ptPerPx = Math.min(ptPerPxX, ptPerPxY);

    // Upload background PNG to Drive to get an HTTPS URL fetchable by Slides.
    const uploaded = await this.slidesClient.uploadPublicAsset(
      {
        filename: `koda-bg-${layoutMarker.replace(/[^a-zA-Z0-9:_-]+/g, '_')}-${Date.now()}.png`,
        mimeType: 'image/png',
        buffer: rendered.backgroundPng,
        parentFolderId: opts.driveAssetsFolderId,
      },
      opts.ctx,
    );

    try {
      const bgObjectId = toObjectId('bg');
      const requests: slides_v1.Schema$Request[] = [];

      // 1) Create slide
      requests.push({
        createSlide: {
          objectId: slideObjectId,
          slideLayoutReference: { predefinedLayout: 'BLANK' as any },
        },
      });

      // 2) Background image (full-bleed)
      requests.push({
        createImage: {
          objectId: bgObjectId,
          url: uploaded.url,
          elementProperties: {
            pageObjectId: slideObjectId,
            size: {
              width: { magnitude: slideWidthPt, unit: 'PT' },
              height: { magnitude: slideHeightPt, unit: 'PT' },
            },
            transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: 'PT' },
          },
        },
      });
      requests.push({
        replaceImage: {
          imageObjectId: bgObjectId,
          url: uploaded.url,
          imageReplaceMethod: 'CENTER_CROP' as any,
        },
      });

      // 3) Layout marker (tiny invisible)
      const markerObjectId = toObjectId('marker');
      requests.push({
        createShape: {
          objectId: markerObjectId,
          shapeType: 'RECTANGLE' as any,
          elementProperties: {
            pageObjectId: slideObjectId,
            size: { width: { magnitude: 1, unit: 'PT' }, height: { magnitude: 1, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: slideWidthPt - 1, translateY: slideHeightPt - 1, unit: 'PT' },
          },
        },
      });
      requests.push({
        updatePageElementAltText: {
          objectId: markerObjectId,
          description: layoutMarker,
        },
      });
      requests.push({
        updateShapeProperties: {
          objectId: markerObjectId,
          shapeProperties: {
            shapeBackgroundFill: { propertyState: 'NOT_RENDERED' },
            outline: { propertyState: 'NOT_RENDERED' },
          },
          fields: 'shapeBackgroundFill,outline',
        },
      });

      // 4) Overlay tagged elements (text + visual frames).
      for (const t of rendered.tags) {
        const tag = (t.tag || '').trim();
        if (!tag) continue;
        if (tagIsLayoutMarker(tag)) continue;

        const xPt = clamp(t.leftPx * ptPerPx, 0, slideWidthPt);
        const yPt = clamp(t.topPx * ptPerPx, 0, slideHeightPt);
        const wPt = clamp(t.widthPx * ptPerPx, 1, slideWidthPt);
        const hPt = clamp(t.heightPx * ptPerPx, 1, slideHeightPt);

        const elementProperties: slides_v1.Schema$PageElementProperties = {
          pageObjectId: slideObjectId,
          size: { width: { magnitude: wPt, unit: 'PT' }, height: { magnitude: hPt, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: xPt, translateY: yPt, unit: 'PT' },
        };

        if (tagIsText(tag)) {
          const objectId = toObjectId('txt');
          requests.push({
            createShape: {
              objectId,
              shapeType: 'TEXT_BOX' as any,
              elementProperties,
            },
          });
          requests.push({
            updatePageElementAltText: {
              objectId,
              description: tag,
            },
          });
          requests.push({
            updateShapeProperties: {
              objectId,
              shapeProperties: {
                shapeBackgroundFill: { propertyState: 'NOT_RENDERED' },
                outline: { propertyState: 'NOT_RENDERED' },
              },
              fields: 'shapeBackgroundFill,outline',
            },
          });
          requests.push({
            insertText: {
              objectId,
              insertionIndex: 0,
              text: '.',
            },
          });

          const css = t.textStyle;
          if (css) {
            const fontFamily = firstFontFamily(css.fontFamily);
            const colorHex = parseRgbColorToHex(css.color);
            const fontSizePt = cssPxToPt(css.fontSizePx);
            const isBold = css.fontWeight >= 600;
            const isItalic = String(css.fontStyle || '').toLowerCase().includes('italic');

            const textStyle: slides_v1.Schema$TextStyle = {
              weightedFontFamily: { fontFamily, weight: isBold ? 700 : 400 },
              fontSize: { magnitude: clamp(fontSizePt, 8, 72), unit: 'PT' },
              foregroundColor: { opaqueColor: { rgbColor: hexToRgb(colorHex) } },
              bold: isBold || undefined,
              italic: isItalic || undefined,
            };
            requests.push({
              updateTextStyle: {
                objectId,
                style: textStyle,
                fields: 'weightedFontFamily,fontSize,foregroundColor,bold,italic',
                textRange: { type: 'ALL' },
              },
            });

            const alignment = cssTextAlignToSlides(css.textAlign);
            const paragraphStyle: slides_v1.Schema$ParagraphStyle = { alignment };
            if (css.lineHeightPx && css.fontSizePx > 0) {
              const pct = clamp((css.lineHeightPx / css.fontSizePx) * 100, 85, 175);
              paragraphStyle.lineSpacing = pct;
            }
            requests.push({
              updateParagraphStyle: {
                objectId,
                style: paragraphStyle,
                fields: css.lineHeightPx ? 'alignment,lineSpacing' : 'alignment',
                textRange: { type: 'ALL' },
              },
            });
          }

          continue;
        }

        if (tagIsVisualFrame(tag)) {
          const objectId = toObjectId('frame');
          requests.push({
            createShape: {
              objectId,
              shapeType: 'RECTANGLE' as any,
              elementProperties,
            },
          });
          requests.push({
            updatePageElementAltText: {
              objectId,
              description: tag,
            },
          });
          requests.push({
            updateShapeProperties: {
              objectId,
              shapeProperties: {
                shapeBackgroundFill: { propertyState: 'NOT_RENDERED' },
                outline: { propertyState: 'NOT_RENDERED' },
              },
              fields: 'shapeBackgroundFill,outline',
            },
          });
          continue;
        }
      }

      await this.slidesClient.batchUpdate(presentationId, requests, opts.ctx);

      // Throttle write rate to stay well under Slides per-minute quotas.
      const delayMs = parseInt(process.env.KODA_SLIDES_WRITE_DELAY_MS || '2000', 10);
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } finally {
      // Best-effort cleanup. Slides embeds the bytes; we don't need the Drive file afterward.
      await this.slidesClient.deleteDriveFile(uploaded.fileId, opts.ctx).catch(() => {});
    }
  }

  private async renderHtmlSlide(browser: any, filePath: string): Promise<RenderedSlide> {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

      const url = `file://${filePath}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Prefer the pack's slide root; fall back to body.
      const rootSelector = (await page.$('.slide-container')) ? '.slide-container' : 'body';

      const extracted: { rootWidthPx: number; rootHeightPx: number; tags: ExtractedTag[] } = await page.evaluate(
        (sel: string) => {
          const root = (document.querySelector(sel) as HTMLElement) || document.body;
          const rootRect = root.getBoundingClientRect();

          const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-koda-description]'));
          const tags = nodes
            .map((el) => {
              const tag = (el.getAttribute('data-koda-description') || '').trim();
              if (!tag) return null;

              // Expand body boxes to their container to avoid content-driven bounding boxes
              // (otherwise only the placeholder paragraphs size the box).
              const isBody =
                tag === 'koda:body' ||
                tag === 'koda:body:left' ||
                tag === 'koda:body:right' ||
                tag === 'koda:body:1' ||
                tag === 'koda:body:2';
              if (isBody) {
                el.style.width = '100%';
                el.style.height = '100%';
                el.style.maxHeight = 'none';
              }

              // Prepare background render:
              // - keep frames visible (panels)
              // - hide placeholder copy in tagged text nodes
              // - hide layout markers
              const isLayout = tag.startsWith('koda:layout:');
              const isText = tag.startsWith('koda:') && !isLayout && !tag.startsWith('koda:visual_frame:');
              const isFrame = tag.startsWith('koda:visual_frame:');

              if (isLayout) {
                el.style.display = 'none';
              }

              if (isFrame) {
                // Remove placeholder labels, keep panel/background. Also remove "template preview" dashed borders.
                el.innerHTML = '';
                el.style.borderStyle = 'solid';
                el.style.borderWidth = '0px';
              }

              if (isText) {
                // Keep layout, remove visible text in screenshot.
                el.style.opacity = '0';
              }

              const rect = el.getBoundingClientRect();

              const wantsTextStyle = isText;

              const style = wantsTextStyle ? window.getComputedStyle(el) : null;

              return {
                tag,
                leftPx: rect.left - rootRect.left,
                topPx: rect.top - rootRect.top,
                widthPx: rect.width,
                heightPx: rect.height,
                textStyle: style
                  ? {
                      fontFamily: style.fontFamily,
                      fontWeight: parseInt(style.fontWeight || '400', 10) || 400,
                      fontStyle: style.fontStyle,
                      fontSizePx: parseFloat(style.fontSize || '16') || 16,
                      lineHeightPx:
                        style.lineHeight && style.lineHeight !== 'normal'
                          ? parseFloat(style.lineHeight)
                          : null,
                      color: style.color,
                      textAlign: style.textAlign,
                    }
                  : undefined,
              };
            })
            .filter(Boolean);

          return {
            rootWidthPx: rootRect.width,
            rootHeightPx: rootRect.height,
            tags: tags as any,
          };
        },
        rootSelector,
      );

      const rootHandle = await page.$(rootSelector);
      if (!rootHandle) {
        throw new Error(`Failed to locate slide root for ${path.basename(filePath)} (selector=${rootSelector})`);
      }

      const backgroundPng: Buffer = await rootHandle.screenshot({ type: 'png' });

      return {
        backgroundPng,
        rootWidthPx: Math.max(1, Math.round(extracted.rootWidthPx)),
        rootHeightPx: Math.max(1, Math.round(extracted.rootHeightPx)),
        tags: extracted.tags,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }
}

export default HtmlTemplateCompilerService;
