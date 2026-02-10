import { Router, Response } from "express";
import prisma from "../config/database";
import { downloadFile, uploadFile, getSignedUrl } from "../config/storage";
import { SlidesClientService } from "../services/editing/slides/slidesClient.service";
import { UPLOAD_CONFIG } from "../config/upload.config";
import { createNanoBananaClientFromEnv } from "../services/creative/nanoBananaFactory";
import RevisionService from "../services/documents/revision.service";
import { addDocumentJob } from "../queues/document.queue";
import * as crypto from "crypto";

type SlidesStudioContext = {
  userId: string;
  correlationId?: string;
  conversationId?: string;
  clientMessageId?: string;
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function safeJsonParseObject(value: unknown): Record<string, any> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as any) : {};
  } catch {
    return {};
  }
}

function isPptxMime(mimeType: string | null | undefined): boolean {
  const mime = String(mimeType || "").toLowerCase();
  return (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime.includes("presentationml")
  );
}

function getSlidesLinkFromPptxMetadata(pptxMetadata: unknown): { presentationId: string; url: string } | null {
  const obj = safeJsonParseObject(pptxMetadata);
  const link = obj?.editingSlides;
  const id = typeof link?.presentationId === "string" ? link.presentationId.trim() : "";
  const url = typeof link?.url === "string" ? link.url.trim() : "";
  if (!id) return null;
  return { presentationId: id, url: url || `https://docs.google.com/presentation/d/${id}/edit` };
}

function setSlidesLinkInPptxMetadata(pptxMetadata: unknown, link: { presentationId: string; url: string }): string {
  const obj = safeJsonParseObject(pptxMetadata);
  obj.editingSlides = { presentationId: link.presentationId, url: link.url };
  return JSON.stringify(obj);
}

function toPt(dim: any): number {
  const mag = typeof dim?.magnitude === "number" ? dim.magnitude : 0;
  const unit = String(dim?.unit || "PT").toUpperCase();
  if (unit === "EMU") return mag / 12700;
  return mag;
}

function transformToMatrixPt(t: any): { a: number; b: number; c: number; d: number; tx: number; ty: number; unit: "PT" } {
  const unit = String(t?.unit || "PT").toUpperCase();
  const txRaw = typeof t?.translateX === "number" ? t.translateX : 0;
  const tyRaw = typeof t?.translateY === "number" ? t.translateY : 0;
  const tx = unit === "EMU" ? txRaw / 12700 : txRaw;
  const ty = unit === "EMU" ? tyRaw / 12700 : tyRaw;
  return {
    a: typeof t?.scaleX === "number" ? t.scaleX : 1,
    b: typeof t?.shearY === "number" ? t.shearY : 0,
    c: typeof t?.shearX === "number" ? t.shearX : 0,
    d: typeof t?.scaleY === "number" ? t.scaleY : 1,
    tx,
    ty,
    unit: "PT",
  };
}

function boundsFromElementPt(el: any): { x: number; y: number; w: number; h: number } | null {
  const props = (el as any)?.elementProperties;
  const size = props?.size;
  const t = props?.transform;
  if (!size || !t) return null;

  const w = toPt(size.width);
  const h = toPt(size.height);
  const m = transformToMatrixPt(t);

  const pts = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ].map((p) => ({
    x: m.a * p.x + m.c * p.y + m.tx,
    y: m.b * p.x + m.d * p.y + m.ty,
  }));

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

async function ensureSlidesPresentationForDoc(params: {
  docId: string;
  userId: string;
  ctx: SlidesStudioContext;
  slidesClient: SlidesClientService;
}): Promise<{ presentationId: string; presentationUrl: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: params.docId, userId: params.userId },
    include: { metadata: true },
  });
  if (!doc) throw new Error("Document not found");
  if (!doc.encryptedFilename) throw new Error("Document storage key missing");
  if (!isPptxMime(doc.mimeType)) throw new Error("Studio is only available for PPTX documents");

  const meta: any = doc.metadata || {};
  const link = getSlidesLinkFromPptxMetadata(meta?.pptxMetadata);
  if (link?.presentationId) {
    return { presentationId: link.presentationId, presentationUrl: link.url };
  }

  const bytes = await downloadFile(doc.encryptedFilename);
  const imported = await params.slidesClient.importPptxToPresentation(
    {
      pptxBuffer: bytes,
      filename: doc.filename || "deck.pptx",
      parentFolderId: process.env.GOOGLE_SLIDES_FOLDER_ID || undefined,
    },
    {
      userId: params.userId,
      correlationId: params.ctx.correlationId,
      conversationId: params.ctx.conversationId,
      clientMessageId: params.ctx.clientMessageId,
    },
  );

  const nextPptxMetadata = setSlidesLinkInPptxMetadata(meta?.pptxMetadata, {
    presentationId: imported.presentationId,
    url: imported.url,
  });

  await prisma.documentMetadata.upsert({
    where: { documentId: doc.id },
    update: { pptxMetadata: nextPptxMetadata } as any,
    create: { documentId: doc.id, pptxMetadata: nextPptxMetadata } as any,
  });

  return { presentationId: imported.presentationId, presentationUrl: imported.url };
}

function ctxFromReq(req: any): SlidesStudioContext {
  return {
    userId: String(req.user?.id || ""),
    correlationId: asString(req.headers["x-correlation-id"]),
    conversationId: asString(req.headers["x-conversation-id"]),
    clientMessageId: asString(req.headers["x-client-message-id"]),
  };
}

const router = Router({ mergeParams: true });

/**
 * GET /api/documents/:id/studio/slides/scene
 * Returns a viewer-friendly "scene graph" for slide selection/editing.
 */
router.get("/scene", async (req: any, res: Response): Promise<void> => {
  const ctx = ctxFromReq(req);
  const userId = ctx.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const slidesClient = new SlidesClientService();
    const { presentationId, presentationUrl } = await ensureSlidesPresentationForDoc({
      docId: req.params.id,
      userId,
      ctx,
      slidesClient,
    });

    const slideNumberRaw = String(req.query.slideNumber || "all").trim().toLowerCase();
    const includeThumbnails = String(req.query.includeThumbnails || "1").trim() !== "0";
    const includeElements = String(req.query.includeElements || "1").trim() !== "0";

    const presentation = await slidesClient.getPresentation(presentationId, {
      userId,
      correlationId: ctx.correlationId,
      conversationId: ctx.conversationId,
      clientMessageId: ctx.clientMessageId,
    });

    const pageSize = {
      widthPt: toPt((presentation as any)?.pageSize?.width),
      heightPt: toPt((presentation as any)?.pageSize?.height),
    };

    const slides = presentation.slides ?? [];
    const slideIndex = (() => {
      if (slideNumberRaw === "all") return null;
      const n = parseInt(slideNumberRaw, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n - 1;
    })();

    const targetSlides = slideIndex === null ? slides : (slides[slideIndex] ? [slides[slideIndex]] : []);
    const slideObjectIds = targetSlides.map((s: any) => String(s?.objectId || "")).filter(Boolean);

    const thumbs = includeThumbnails
      ? await slidesClient.getSlideThumbnails(presentationId, slideObjectIds, {
          userId,
          correlationId: ctx.correlationId,
          conversationId: ctx.conversationId,
          clientMessageId: ctx.clientMessageId,
        })
      : [];
    const thumbMap = new Map(thumbs.map((t) => [t.slideObjectId, t]));

    const sceneSlides = targetSlides.map((slide: any, i: number) => {
      const slideObjectId = String(slide?.objectId || "");
      const thumb = thumbMap.get(slideObjectId) || null;
      const slideNumber = slideIndex === null ? (slides.findIndex((s: any) => s?.objectId === slideObjectId) + 1) : (parseInt(slideNumberRaw, 10) || (i + 1));

      const elements = includeElements
        ? (slide.pageElements ?? []).map((el: any, zIndex: number) => {
            const objectId = String(el?.objectId || "");
            const kind = el?.shape
              ? "shape"
              : el?.image
                ? "image"
                : el?.table
                  ? "table"
                  : el?.elementGroup
                    ? "group"
                    : "unknown";

            const boundsPt = boundsFromElementPt(el);
            const transform = transformToMatrixPt((el as any)?.elementProperties?.transform);

            // Best-effort text extraction for shapes.
            const textElements = (el?.shape?.text?.textElements ?? []) as any[];
            const runs = textElements
              .map((te) => {
                const content = te?.textRun?.content;
                if (typeof content !== "string") return null;
                const startIndex = typeof te?.startIndex === "number" ? te.startIndex : null;
                const endIndex = typeof te?.endIndex === "number" ? te.endIndex : null;
                return {
                  kind: "run",
                  content,
                  startIndex,
                  endIndex,
                  style: te?.textRun?.style ?? null,
                };
              })
              .filter(Boolean);

            return {
              objectId,
              kind,
              zIndex,
              boundsPt,
              transform,
              placeholderType: el?.shape?.placeholder?.type ? String(el.shape.placeholder.type) : null,
              text: el?.shape?.text
                ? (() => {
                    const raw = runs.map((r: any) => String(r.content || "")).join("");
                    const summary = raw.replace(/\s+/g, " ").trim();
                    const hasAny = raw.replace(/\n/g, "").trim().length > 0;
                    return {
                      isText: true,
                      raw: hasAny ? raw : "",
                      summary,
                      runs,
                    };
                  })()
                : null,
            };
          })
          .filter((e: any) => e?.objectId && e?.boundsPt)
        : [];

      return {
        slideNumber,
        slideObjectId,
        thumbnail: thumb
          ? {
              url: thumb.contentUrl,
              widthPx: thumb.width ?? null,
              heightPx: thumb.height ?? null,
            }
          : null,
        elements,
      };
    });

    res.json({
      documentId: req.params.id,
      domain: "slides",
      presentationId,
      presentationUrl,
      pageSize,
      slideCount: slides.length,
      slides: sceneSlides,
    });
  } catch (e: any) {
    console.error("GET /documents/:id/studio/slides/scene error:", e);
    res.status(500).json({ error: e?.message || "Failed to load slides scene" });
  }
});

/**
 * POST /api/documents/:id/studio/slides/batch
 * Apply a batch of editing ops via a single Slides batchUpdate.
 */
router.post("/batch", async (req: any, res: Response): Promise<void> => {
  const ctx = ctxFromReq(req);
  const userId = ctx.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const slidesClient = new SlidesClientService();
    const { presentationId, presentationUrl } = await ensureSlidesPresentationForDoc({
      docId: req.params.id,
      userId,
      ctx,
      slidesClient,
    });

    const ops = Array.isArray(req.body?.ops) ? req.body.ops : [];
    if (!ops.length) {
      res.status(400).json({ error: "ops is required" });
      return;
    }

    // Prefetch once; used for lightweight style snapshots (optional).
    const presentation = await slidesClient.getPresentation(presentationId, {
      userId,
      correlationId: ctx.correlationId,
      conversationId: ctx.conversationId,
      clientMessageId: ctx.clientMessageId,
    });

    const requests: any[] = [];

    const findElement = (objectId: string): any | null => {
      for (const slide of presentation.slides ?? []) {
        for (const el of slide.pageElements ?? []) {
          if (el?.objectId === objectId) return el;
        }
      }
      return null;
    };

    const elementHasRealText = (objectId: string): boolean => {
      const el = findElement(objectId);
      const textEls = el?.shape?.text?.textElements ?? [];
      const hasRun = (textEls as any[]).some((te) => {
        const c = te?.textRun?.content;
        return typeof c === "string" && c.replace(/\n/g, "").length > 0;
      });
      return hasRun;
    };

    const snapshotTextDefaults = (objectId: string): { textStyle: any; textFields: string; paragraphStyle: any; paragraphFields: string } | null => {
      const el = findElement(objectId);
      const textEls = el?.shape?.text?.textElements ?? [];
      const firstRun = (textEls as any[]).find((te) => te?.textRun?.style)?.textRun?.style;
      const firstParagraph = (textEls as any[]).find((te) => te?.paragraphMarker?.style)?.paragraphMarker?.style;
      const textStyle: any = {};
      const textFields: string[] = [];
      if (firstRun?.weightedFontFamily) { textStyle.weightedFontFamily = firstRun.weightedFontFamily; textFields.push("weightedFontFamily"); }
      if (firstRun?.fontSize) { textStyle.fontSize = firstRun.fontSize; textFields.push("fontSize"); }
      if (firstRun?.foregroundColor) { textStyle.foregroundColor = firstRun.foregroundColor; textFields.push("foregroundColor"); }
      if (typeof firstRun?.bold === "boolean") { textStyle.bold = firstRun.bold; textFields.push("bold"); }
      if (typeof firstRun?.italic === "boolean") { textStyle.italic = firstRun.italic; textFields.push("italic"); }
      const paragraphStyle: any = {};
      const paragraphFields: string[] = [];
      if (firstParagraph?.alignment) { paragraphStyle.alignment = firstParagraph.alignment; paragraphFields.push("alignment"); }
      if (typeof firstParagraph?.lineSpacing === "number") { paragraphStyle.lineSpacing = firstParagraph.lineSpacing; paragraphFields.push("lineSpacing"); }
      if (!textFields.length && !paragraphFields.length) return null;
      return { textStyle, textFields: textFields.join(","), paragraphStyle, paragraphFields: paragraphFields.join(",") };
    };

    for (const op of ops) {
      const type = asString(op?.type);
      if (!type) continue;

      if (type === "set_text") {
        const objectId = asString(op?.objectId);
        const text = String(op?.text ?? "").replace(/\r/g, "");
        if (!objectId) continue;

        // Delete existing text (only if non-empty), then insert. Empty placeholders can make deleteText fail.
        if (elementHasRealText(objectId)) {
          requests.push({ deleteText: { objectId, textRange: { type: "ALL" } } });
        }
        if (text.trim().length > 0) {
          requests.push({ insertText: { objectId, insertionIndex: 0, text: text.trimEnd() } });
        }

        const snap = snapshotTextDefaults(objectId);
        if (snap?.textFields) {
          requests.push({
            updateTextStyle: {
              objectId,
              style: snap.textStyle,
              fields: snap.textFields,
              textRange: { type: "ALL" },
            },
          });
        }
        if (snap?.paragraphFields) {
          requests.push({
            updateParagraphStyle: {
              objectId,
              style: snap.paragraphStyle,
              fields: snap.paragraphFields,
              textRange: { type: "ALL" },
            },
          });
        }
      } else if (type === "set_text_style") {
        const objectId = asString(op?.objectId);
        const fields = asString(op?.fields) || "";
        const style = op?.style && typeof op.style === "object" ? op.style : null;
        if (!objectId || !fields || !style) continue;
        const range = op?.range && typeof op.range === "object" ? op.range : null;
        const startIndex = typeof range?.start === "number" ? range.start : null;
        const endIndex = typeof range?.end === "number" ? range.end : null;
        requests.push({
          updateTextStyle: {
            objectId,
            style,
            fields,
            textRange: (startIndex !== null && endIndex !== null)
              ? { type: "FIXED_RANGE", startIndex, endIndex }
              : { type: "ALL" },
          },
        });
      } else if (type === "set_paragraph_style") {
        const objectId = asString(op?.objectId);
        const fields = asString(op?.fields) || "";
        const style = op?.style && typeof op.style === "object" ? op.style : null;
        if (!objectId || !fields || !style) continue;
        requests.push({
          updateParagraphStyle: {
            objectId,
            style,
            fields,
            textRange: { type: "ALL" },
          },
        });
      } else if (type === "set_bullets") {
        const objectId = asString(op?.objectId);
        const enabled = op?.enabled !== false;
        if (!objectId) continue;
        const preset = String(op?.preset || "BULLET_DISC_CIRCLE_SQUARE").trim() || "BULLET_DISC_CIRCLE_SQUARE";
        const range = op?.range && typeof op.range === "object" ? op.range : null;
        const startIndex = typeof range?.start === "number" ? range.start : null;
        const endIndex = typeof range?.end === "number" ? range.end : null;
        const textRange =
          startIndex !== null && endIndex !== null
            ? { type: "FIXED_RANGE", startIndex, endIndex }
            : { type: "ALL" };

        if (enabled) {
          requests.push({
            createParagraphBullets: {
              objectId,
              textRange,
              bulletPreset: preset as any,
            },
          });
        } else {
          requests.push({
            deleteParagraphBullets: {
              objectId,
              textRange,
            },
          });
        }
      } else if (type === "replace_image") {
        const imageObjectId = asString(op?.imageObjectId);
        const url = asString(op?.url);
        if (!imageObjectId || !url || !/^https:\/\//i.test(url)) continue;
        requests.push({
          replaceImage: {
            imageObjectId,
            url,
            imageReplaceMethod: "CENTER_CROP",
          },
        });
      } else if (type === "create_image") {
        const slideObjectId = asString(op?.slideObjectId);
        const url = asString(op?.url);
        if (!slideObjectId || !url || !/^https:\/\//i.test(url)) continue;
        const objectId = asString(op?.objectId) || `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const props = op?.elementProperties && typeof op.elementProperties === "object" ? op.elementProperties : null;

        const elementProperties =
          props && props.transform
            ? props
            : {
                pageObjectId: slideObjectId,
                size: {
                  width: { magnitude: 420, unit: "PT" },
                  height: { magnitude: 240, unit: "PT" },
                },
                transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: 120, unit: "PT" },
              };

        requests.push({
          createImage: {
            objectId,
            url,
            elementProperties,
          },
        });
      } else if (type === "set_slide_background") {
        const slideObjectId = asString(op?.slideObjectId);
        const colorHex = asString(op?.colorHex);
        if (!slideObjectId || !colorHex || !/^#?[0-9a-f]{6}$/i.test(colorHex)) continue;
        const hex = colorHex.startsWith("#") ? colorHex.slice(1) : colorHex;
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        requests.push({
          updatePageProperties: {
            objectId: slideObjectId,
            pageProperties: {
              pageBackgroundFill: {
                solidFill: {
                  color: { rgbColor: { red: r, green: g, blue: b } },
                },
              },
            },
            fields: "pageBackgroundFill.solidFill.color",
          },
        });
      } else if (type === "create_shape") {
        const slideObjectId = asString(op?.slideObjectId);
        if (!slideObjectId) continue;

        const shapeType = String(op?.shapeType || "TEXT_BOX").trim() || "TEXT_BOX";
        const objectId = asString(op?.objectId) || `shape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const props = op?.elementProperties && typeof op.elementProperties === "object" ? op.elementProperties : null;
        const elementProperties =
          props && (props as any).transform
            ? { ...(props as any), pageObjectId: (props as any).pageObjectId || slideObjectId }
            : {
                pageObjectId: slideObjectId,
                size: {
                  width: { magnitude: 460, unit: "PT" },
                  height: { magnitude: 120, unit: "PT" },
                },
                transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: 120, unit: "PT" },
              };

        requests.push({
          createShape: {
            objectId,
            shapeType,
            elementProperties,
          },
        });

        if (op?.noFillNoOutline === true) {
          requests.push({
            updateShapeProperties: {
              objectId,
              shapeProperties: {
                shapeBackgroundFill: { propertyState: "NOT_RENDERED" },
                outline: { propertyState: "NOT_RENDERED" },
              },
              fields: "shapeBackgroundFill,outline",
            },
          });
        }

        const initialText = typeof op?.initialText === "string" ? String(op.initialText).replace(/\r/g, "") : "";
        if (initialText.trim().length > 0) {
          requests.push({
            insertText: { objectId, insertionIndex: 0, text: initialText.trimEnd() },
          });
        }
      } else if (type === "delete_element") {
        const objectId = asString(op?.objectId);
        if (!objectId) continue;
        requests.push({ deleteObject: { objectId } });
      } else if (type === "z_order") {
        const objectId = asString(op?.objectId);
        const operation = String(op?.operation || "").trim().toUpperCase();
        if (!objectId) continue;
        if (!["BRING_FORWARD", "BRING_TO_FRONT", "SEND_BACKWARD", "SEND_TO_BACK"].includes(operation)) continue;
        requests.push({
          updatePageElementsZOrder: {
            pageElementObjectIds: [objectId],
            operation,
          },
        });
      } else if (type === "add_slide") {
        const layout = String(op?.layout || "TITLE_AND_BODY").trim() || "TITLE_AND_BODY";
        const afterSlideObjectId = asString(op?.afterSlideObjectId);
        const requestedIndex = typeof op?.insertionIndex === "number" ? op.insertionIndex : null;
        const totalSlides = presentation.slides?.length ?? 0;

        let insertionIndex = totalSlides;
        if (afterSlideObjectId) {
          const idx = (presentation.slides ?? []).findIndex((s: any) => s?.objectId === afterSlideObjectId);
          if (idx >= 0) insertionIndex = idx + 1;
        } else if (requestedIndex !== null) {
          insertionIndex = Math.max(0, Math.min(totalSlides, Math.floor(requestedIndex)));
        }

        const slideObjectId = asString(op?.slideObjectId) || `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        requests.push({
          createSlide: {
            objectId: slideObjectId,
            insertionIndex,
            slideLayoutReference: { predefinedLayout: layout },
          },
        });
      } else if (type === "delete_slide") {
        const slideObjectId = asString(op?.slideObjectId);
        if (!slideObjectId) continue;
        requests.push({
          deleteObject: {
            objectId: slideObjectId,
          },
        });
      } else if (type === "update_transform") {
        const objectId = asString(op?.objectId);
        const transform = op?.transform && typeof op.transform === "object" ? op.transform : null;
        const applyMode = String(op?.applyMode || "ABSOLUTE").toUpperCase();
        if (!objectId || !transform) continue;
        requests.push({
          updatePageElementTransform: {
            objectId,
            transform: {
              scaleX: typeof transform.a === "number" ? transform.a : 1,
              shearY: typeof transform.b === "number" ? transform.b : 0,
              shearX: typeof transform.c === "number" ? transform.c : 0,
              scaleY: typeof transform.d === "number" ? transform.d : 1,
              translateX: typeof transform.tx === "number" ? transform.tx : 0,
              translateY: typeof transform.ty === "number" ? transform.ty : 0,
              unit: "PT",
            },
            applyMode: applyMode === "RELATIVE" ? "RELATIVE" : "ABSOLUTE",
          },
        });
      }
    }

    if (!requests.length) {
      res.status(400).json({ error: "No valid ops to apply" });
      return;
    }

    await slidesClient.batchUpdate(presentationId, requests as any, {
      userId,
      correlationId: ctx.correlationId,
      conversationId: ctx.conversationId,
      clientMessageId: ctx.clientMessageId,
    });

    res.json({ ok: true, presentationId, presentationUrl });
  } catch (e: any) {
    console.error("POST /documents/:id/studio/slides/batch error:", e);
    res.status(500).json({ error: e?.message || "Failed to apply slide ops" });
  }
});

/**
 * POST /api/documents/:id/studio/slides/generate-asset
 * Prompt -> image buffer -> HTTPS URL (fetchable by Google Slides).
 */
router.post("/generate-asset", async (req: any, res: Response): Promise<void> => {
  const ctx = ctxFromReq(req);
  const userId = ctx.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const kind = String(req.body?.kind || "image").trim().toLowerCase();
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const client = createNanoBananaClientFromEnv();
    if (!client) {
      res.status(503).json({ error: "NanoBanana is not configured (missing GEMINI_API_KEY/GOOGLE_API_KEY)" });
      return;
    }

    const baseSystem =
      kind === "icon"
        ? "Generate a single minimal vector-like icon. Transparent background. No text, no watermark, no logos."
        : kind === "background"
          ? "Generate a full-bleed 16:9 background image with clean negative space for text. No text, no watermark, no logos."
          : "Generate a clean, modern illustration for a slide. No text, no watermark, no logos.";

    const dims =
      kind === "icon" ? { width: 512, height: 512 } : kind === "background" ? { width: 1920, height: 1080 } : { width: 1536, height: 864 };

    const generation = await client.generate({
      systemPrompt: baseSystem,
      userPrompt: prompt,
      width: dims.width,
      height: dims.height,
    });

    const mimeType = generation.mimeType || "image/png";
    const ext = mimeType === "image/webp" ? "webp" : "png";
    const filename = `allybi-${kind}-${Date.now()}.${ext}`;

    // In dev/local storage mode, make a temporary public Drive asset (Slides requires HTTPS).
    // In prod (GCS/S3), upload to app storage and return a signed URL.
    if (UPLOAD_CONFIG.STORAGE_PROVIDER === "local") {
      const slidesClient = new SlidesClientService();
      const uploaded = await slidesClient.uploadPublicAsset(
        { filename, mimeType, buffer: generation.imageBuffer },
        {
          userId,
          correlationId: ctx.correlationId,
          conversationId: ctx.conversationId,
          clientMessageId: ctx.clientMessageId,
        },
      );
      res.json({
        ok: true,
        url: uploaded.url,
        mimeType,
        model: generation.model,
        providerRequestId: generation.providerRequestId,
      });
      return;
    }

    const key = `creative/studio-assets/${userId}/${crypto.randomUUID()}.${ext}`;
    await uploadFile(key, generation.imageBuffer, mimeType);
    const url = await getSignedUrl(key, 3600);
    res.json({
      ok: true,
      url,
      mimeType,
      model: generation.model,
      providerRequestId: generation.providerRequestId,
    });
  } catch (e: any) {
    console.error("POST /documents/:id/studio/slides/generate-asset error:", e);
    res.status(500).json({ error: e?.message || "Failed to generate asset" });
  }
});

/**
 * POST /api/documents/:id/studio/slides/export
 * Export current Slides presentation back to PPTX and store as revision or overwrite.
 */
router.post("/export", async (req: any, res: Response): Promise<void> => {
  const ctx = ctxFromReq(req);
  const userId = ctx.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const slidesClient = new SlidesClientService();
    const { presentationId } = await ensureSlidesPresentationForDoc({
      docId: req.params.id,
      userId,
      ctx,
      slidesClient,
    });

    const mode = String(req.body?.mode || "revision").trim().toLowerCase();
    const pptxBytes = await slidesClient.exportPresentationToPptx(presentationId, {
      userId,
      correlationId: ctx.correlationId,
      conversationId: ctx.conversationId,
      clientMessageId: ctx.clientMessageId,
    });

    const sourceDoc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, filename: true, mimeType: true, folderId: true },
    });
    if (!sourceDoc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const mimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const revisionService = new RevisionService();

    if (mode !== "overwrite") {
      const created = await revisionService.createRevision(
        {
          userId,
          sourceDocumentId: sourceDoc.id,
          contentBuffer: pptxBytes,
          mimeType,
          filename: sourceDoc.filename || "deck.pptx",
          metadata: { source: "pptx_studio", slidesPresentationId: presentationId },
          enqueueReindex: true,
          reason: "PPTX Studio export",
        },
        {
          correlationId: ctx.correlationId,
          userId,
          conversationId: ctx.conversationId,
          clientMessageId: ctx.clientMessageId,
        },
      );

      res.json({ ok: true, mode: "revision", documentId: created.id, filename: created.filename });
      return;
    }

    const storageKey = `users/${userId}/docs/${sourceDoc.id}/${Date.now()}-${(sourceDoc.filename || "deck.pptx").replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
    await uploadFile(storageKey, pptxBytes, mimeType);

    await prisma.document.update({
      where: { id: sourceDoc.id },
      data: {
        encryptedFilename: storageKey,
        fileSize: pptxBytes.length,
        mimeType,
        status: "uploaded",
        error: null,
      },
    });

    await addDocumentJob({
      documentId: sourceDoc.id,
      userId,
      filename: sourceDoc.filename || "deck.pptx",
      mimeType,
      encryptedFilename: storageKey,
    });

    res.json({ ok: true, mode: "overwrite", documentId: sourceDoc.id });
  } catch (e: any) {
    console.error("POST /documents/:id/studio/slides/export error:", e);
    res.status(500).json({ error: e?.message || "Failed to export PPTX" });
  }
});

export default router;
