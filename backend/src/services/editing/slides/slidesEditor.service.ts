import type { slides_v1 } from "googleapis";
import {
  SlidesClientError,
  SlidesClientService,
  type SlidesRequestContext,
} from "./slidesClient.service";
import { SlidesValidatorsService } from "./slidesValidators.service";

export type SlidesLayoutType =
  | "BLANK"
  | "CAPTION_ONLY"
  | "TITLE"
  | "TITLE_AND_BODY"
  | "TITLE_AND_TWO_COLUMNS"
  | "TITLE_ONLY"
  | "SECTION_HEADER"
  | "SECTION_TITLE_AND_DESCRIPTION";

export interface AddSlideResult {
  slideObjectId: string;
  insertionIndex: number;
}

export interface RewriteBulletsResult {
  objectId: string;
  lineCount: number;
}

export interface CreateShapeResult {
  objectId: string;
}

const MAX_TEXT_LENGTH = 25000;

function sanitizeText(input: string, fieldName: string): string {
  const normalized = input.replace(/\r/g, "").trim();
  if (!normalized) {
    throw new SlidesClientError(`${fieldName} is required.`, {
      code: "INVALID_TEXT",
      retryable: false,
    });
  }

  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new SlidesClientError(
      `${fieldName} exceeds safe length limit (${MAX_TEXT_LENGTH}).`,
      {
        code: "TEXT_TOO_LARGE",
        retryable: false,
      },
    );
  }

  return normalized;
}

function toObjectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

type TextStyleSnapshot = {
  textStyle: slides_v1.Schema$TextStyle;
  textFields: string;
  paragraphStyle: slides_v1.Schema$ParagraphStyle;
  paragraphFields: string;
};

/**
 * Slides editing service (create/update text/image with strict validation).
 */
export class SlidesEditorService {
  private readonly validators: SlidesValidatorsService;

  constructor(
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
  ) {
    this.validators = new SlidesValidatorsService(this.slidesClient);
  }

  private static readonly INVISIBLE_TEXT = "\u200B"; // Zero-width space to keep shapes from being auto-removed.

  async duplicateObject(
    presentationId: string,
    objectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<{ objectIdMap: Record<string, string> }> {
    const sourceObjectId = this.validators.assertObjectId(objectId, "objectId");
    const response = await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          duplicateObject: {
            objectId: sourceObjectId,
          },
        },
      ],
      ctx,
    );

    const reply = (response.replies?.[0] as any)?.duplicateObject as any;
    // googleapis typings differ across versions; handle both shapes.
    const objectIdMap = (reply?.objectIdMap ??
      reply?.objectIds ??
      {}) as Record<string, string>;
    // Some API versions return the new ID directly as reply.objectId instead of in the map.
    if (!objectIdMap[sourceObjectId] && reply?.objectId) {
      objectIdMap[sourceObjectId] = reply.objectId;
    }
    return { objectIdMap };
  }

  async deleteObject(
    presentationId: string,
    objectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          deleteObject: {
            objectId: targetObjectId,
          },
        },
      ],
      ctx,
    );
  }

  async updateSlidesPosition(
    presentationId: string,
    slideObjectIds: string[],
    insertionIndex: number,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const cleaned = slideObjectIds.map((id) => id.trim()).filter(Boolean);
    if (cleaned.length === 0) return;

    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          updateSlidesPosition: {
            slideObjectIds: cleaned,
            insertionIndex: Math.max(0, insertionIndex),
          },
        },
      ],
      ctx,
    );
  }

  async createImage(
    presentationId: string,
    slideObjectId: string,
    imageUrl: string,
    opts?: {
      imageObjectId?: string;
      elementProperties?: slides_v1.Schema$PageElementProperties;
      replaceMethod?: "CENTER_CROP" | "CENTER_INSIDE";
    },
    ctx?: SlidesRequestContext,
  ): Promise<{ imageObjectId: string }> {
    const targetSlideId = this.validators.assertObjectId(
      slideObjectId,
      "slideObjectId",
    );
    const normalizedUrl = imageUrl.trim();
    if (!/^https:\/\//i.test(normalizedUrl)) {
      throw new SlidesClientError("imageUrl must be an HTTPS URL.", {
        code: "INVALID_IMAGE_URL",
        retryable: false,
      });
    }

    const imageObjectId = opts?.imageObjectId?.trim() || toObjectId("img");
    const elementProperties: slides_v1.Schema$PageElementProperties =
      opts?.elementProperties ?? {
        pageObjectId: targetSlideId,
        transform: {
          scaleX: 1,
          scaleY: 1,
          translateX: 40,
          translateY: 90,
          unit: "PT",
        },
      };

    const request: slides_v1.Schema$Request = {
      createImage: {
        objectId: imageObjectId,
        url: normalizedUrl,
        elementProperties,
      },
    };

    // If replaceMethod is specified, we can replace after create; for createImage, Slides doesn't
    // accept a crop mode. We'll keep create + optional replaceImage to enforce crop.
    await this.slidesClient.batchUpdate(presentationId, [request], ctx);

    if (opts?.replaceMethod) {
      await this.slidesClient.batchUpdate(
        presentationId,
        [
          {
            replaceImage: {
              imageObjectId,
              url: normalizedUrl,
              imageReplaceMethod: opts.replaceMethod,
            },
          },
        ],
        ctx,
      );
    }

    return { imageObjectId };
  }

  async createShape(
    presentationId: string,
    slideObjectId: string,
    shapeType: slides_v1.Schema$CreateShapeRequest["shapeType"],
    elementProperties: slides_v1.Schema$PageElementProperties,
    opts?: {
      objectId?: string;
      altTextDescription?: string;
      altTextTitle?: string;
      // If provided, inserts text at index 0.
      initialText?: string;
      // If true, removes fill + outline for the shape.
      noFillNoOutline?: boolean;
    },
    ctx?: SlidesRequestContext,
  ): Promise<CreateShapeResult> {
    const targetSlideId = this.validators.assertObjectId(
      slideObjectId,
      "slideObjectId",
    );
    const objectId = opts?.objectId?.trim() || toObjectId("shape");

    if (!elementProperties?.pageObjectId) {
      elementProperties = { ...elementProperties, pageObjectId: targetSlideId };
    }

    const requests: slides_v1.Schema$Request[] = [
      {
        createShape: {
          objectId,
          shapeType,
          elementProperties,
        },
      },
    ];

    if (opts?.altTextDescription || opts?.altTextTitle) {
      requests.push({
        updatePageElementAltText: {
          objectId,
          title: opts.altTextTitle || undefined,
          description: opts.altTextDescription || undefined,
        },
      });
    }

    if (opts?.noFillNoOutline) {
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

    if (opts?.initialText) {
      const text = sanitizeText(opts.initialText, "initialText");
      requests.push({
        insertText: {
          objectId,
          insertionIndex: 0,
          text,
        },
      });
    }

    await this.slidesClient.batchUpdate(presentationId, requests, ctx);
    return { objectId };
  }

  async setAltText(
    presentationId: string,
    objectId: string,
    params: { title?: string; description?: string },
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    const title = params.title?.trim() || undefined;
    const description = params.description?.trim() || undefined;
    if (!title && !description) return;

    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          updatePageElementAltText: {
            objectId: targetObjectId,
            title,
            description,
          },
        },
      ],
      ctx,
    );
  }

  async updateTextStyle(
    presentationId: string,
    objectId: string,
    style: slides_v1.Schema$TextStyle,
    fields: string,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          updateTextStyle: {
            objectId: targetObjectId,
            style,
            fields,
            textRange: { type: "ALL" },
          },
        },
      ],
      ctx,
    );
  }

  async setTextAutofit(
    presentationId: string,
    objectId: string,
    autofitType: "TEXT_AUTOFIT" | "SHAPE_AUTOFIT" | "NONE" = "TEXT_AUTOFIT",
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          updateShapeProperties: {
            objectId: targetObjectId,
            shapeProperties: {
              autofit: {
                autofitType,
              },
            },
            // Fields mask behavior has varied across exporters; keep it explicit.
            fields: "autofit.autofitType",
          },
        },
        {
          // Back-compat: some API paths accept only the parent field.
          updateShapeProperties: {
            objectId: targetObjectId,
            shapeProperties: {
              autofit: {
                autofitType,
              },
            },
            fields: "autofit",
          },
        },
      ],
      ctx,
    );
  }

  async updateZOrder(
    presentationId: string,
    objectId: string,
    operation:
      | "BRING_TO_FRONT"
      | "BRING_FORWARD"
      | "SEND_BACKWARD"
      | "SEND_TO_BACK",
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          // googleapis typings use plural, API accepts a single objectId too.
          updatePageElementsZOrder: {
            pageElementObjectIds: [targetObjectId],
            operation,
          } as any,
        },
      ],
      ctx,
    );
  }

  async updateParagraphStyle(
    presentationId: string,
    objectId: string,
    style: slides_v1.Schema$ParagraphStyle,
    fields: string,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    await this.slidesClient.batchUpdate(
      presentationId,
      [
        {
          updateParagraphStyle: {
            objectId: targetObjectId,
            style,
            fields,
            textRange: { type: "ALL" },
          },
        },
      ],
      ctx,
    );
  }

  async addSlide(
    presentationId: string,
    layout: SlidesLayoutType,
    insertionIndex?: number,
    ctx?: SlidesRequestContext,
  ): Promise<AddSlideResult> {
    const normalizedLayout = this.assertLayout(layout);
    const presentation = await this.slidesClient.getPresentation(
      presentationId,
      ctx,
    );

    const totalSlides = presentation.slides?.length ?? 0;
    const index = this.resolveInsertionIndex(insertionIndex, totalSlides);
    const slideObjectId = toObjectId("slide");

    const request: slides_v1.Schema$Request = {
      createSlide: {
        objectId: slideObjectId,
        insertionIndex: index,
        slideLayoutReference: { predefinedLayout: normalizedLayout },
      },
    };

    await this.slidesClient.batchUpdate(presentationId, [request], ctx);

    return {
      slideObjectId,
      insertionIndex: index,
    };
  }

  async replaceText(
    presentationId: string,
    objectId: string,
    newText: string,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    const sanitized = sanitizeText(newText, "newText");

    const snapshot = await this.snapshotTextDefaults(
      presentationId,
      targetObjectId,
      ctx,
    );
    const hasExisting = await this.placeholderHasText(
      presentationId,
      targetObjectId,
      ctx,
    );

    const requests: slides_v1.Schema$Request[] = [];
    if (hasExisting) {
      requests.push({
        deleteText: {
          objectId: targetObjectId,
          textRange: { type: "ALL" },
        },
      });
    }
    requests.push({
      insertText: {
        objectId: targetObjectId,
        insertionIndex: 0,
        text: sanitized,
      },
    });

    // Re-apply template text styling so inserted text matches the archetype design.
    if (snapshot) {
      if (snapshot.textFields) {
        requests.push({
          updateTextStyle: {
            objectId: targetObjectId,
            style: snapshot.textStyle,
            fields: snapshot.textFields,
            textRange: { type: "ALL" },
          },
        });
      }
      if (snapshot.paragraphFields) {
        requests.push({
          updateParagraphStyle: {
            objectId: targetObjectId,
            style: snapshot.paragraphStyle,
            fields: snapshot.paragraphFields,
            textRange: { type: "ALL" },
          },
        });
      }
    }

    await this.slidesClient.batchUpdate(presentationId, requests, ctx);
  }

  /**
   * Clear all text from a shape/text placeholder.
   *
   * Slides APIs + template placeholders can behave oddly when a shape is truly empty.
   * By default we keep a zero-width run so the shape persists but visually appears blank.
   */
  async clearText(
    presentationId: string,
    objectId: string,
    ctx?: SlidesRequestContext,
    opts?: { keepShape?: boolean },
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    const keepShape = opts?.keepShape ?? true;

    const snapshot = await this.snapshotTextDefaults(
      presentationId,
      targetObjectId,
      ctx,
    );
    const hasExisting = await this.placeholderHasText(
      presentationId,
      targetObjectId,
      ctx,
    );

    const requests: slides_v1.Schema$Request[] = [];
    if (hasExisting) {
      requests.push({
        deleteText: {
          objectId: targetObjectId,
          textRange: { type: "ALL" },
        },
      });
    }

    if (keepShape) {
      requests.push({
        insertText: {
          objectId: targetObjectId,
          insertionIndex: 0,
          text: SlidesEditorService.INVISIBLE_TEXT,
        },
      });

      // Preserve template styling even for the invisible sentinel.
      if (snapshot) {
        if (snapshot.textFields) {
          requests.push({
            updateTextStyle: {
              objectId: targetObjectId,
              style: snapshot.textStyle,
              fields: snapshot.textFields,
              textRange: { type: "ALL" },
            },
          });
        }
        if (snapshot.paragraphFields) {
          requests.push({
            updateParagraphStyle: {
              objectId: targetObjectId,
              style: snapshot.paragraphStyle,
              fields: snapshot.paragraphFields,
              textRange: { type: "ALL" },
            },
          });
        }
      }
    }

    if (requests.length === 0) return;
    await this.slidesClient.batchUpdate(presentationId, requests, ctx);
  }

  async rewriteBullets(
    presentationId: string,
    objectId: string,
    bulletLines: string[],
    ctx?: SlidesRequestContext,
  ): Promise<RewriteBulletsResult> {
    const targetObjectId = this.validators.assertObjectId(objectId, "objectId");
    const cleaned = bulletLines
      .map((line) => line.replace(/\r/g, "").trim())
      .filter(Boolean);

    if (cleaned.length === 0) {
      throw new SlidesClientError(
        "bulletLines must contain at least one non-empty line.",
        {
          code: "INVALID_BULLET_LINES",
          retryable: false,
        },
      );
    }

    const textPayload = sanitizeText(cleaned.join("\n"), "bullet text");

    const snapshot = await this.snapshotTextDefaults(
      presentationId,
      targetObjectId,
      ctx,
    );
    const hasExisting = await this.placeholderHasText(
      presentationId,
      targetObjectId,
      ctx,
    );

    const requests: slides_v1.Schema$Request[] = [];
    if (hasExisting) {
      requests.push({
        deleteText: {
          objectId: targetObjectId,
          textRange: { type: "ALL" },
        },
      });
    }
    requests.push(
      {
        insertText: {
          objectId: targetObjectId,
          insertionIndex: 0,
          text: textPayload,
        },
      },
      {
        createParagraphBullets: {
          objectId: targetObjectId,
          textRange: { type: "ALL" },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      },
    );

    // Re-apply template text styling so bullets match the archetype design.
    if (snapshot) {
      if (snapshot.textFields) {
        requests.push({
          updateTextStyle: {
            objectId: targetObjectId,
            style: snapshot.textStyle,
            fields: snapshot.textFields,
            textRange: { type: "ALL" },
          },
        });
      }
      if (snapshot.paragraphFields) {
        requests.push({
          updateParagraphStyle: {
            objectId: targetObjectId,
            style: snapshot.paragraphStyle,
            fields: snapshot.paragraphFields,
            textRange: { type: "ALL" },
          },
        });
      }
    }

    await this.slidesClient.batchUpdate(presentationId, requests, ctx);

    return {
      objectId: targetObjectId,
      lineCount: cleaned.length,
    };
  }

  async replaceImage(
    presentationId: string,
    imageObjectId: string,
    imageUrl: string,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const targetObjectId = this.validators.assertObjectId(
      imageObjectId,
      "imageObjectId",
    );
    const normalizedUrl = imageUrl.trim();

    if (!/^https:\/\//i.test(normalizedUrl)) {
      throw new SlidesClientError("imageUrl must be an HTTPS URL.", {
        code: "INVALID_IMAGE_URL",
        retryable: false,
      });
    }

    const request: slides_v1.Schema$Request = {
      replaceImage: {
        imageObjectId: targetObjectId,
        url: normalizedUrl,
        imageReplaceMethod: "CENTER_CROP",
      },
    };

    await this.slidesClient.batchUpdate(presentationId, [request], ctx);
  }

  /**
   * Check if a placeholder shape already has text content.
   * Empty placeholders cause deleteText to fail with startIndex == endIndex.
   */
  private async placeholderHasText(
    presentationId: string,
    objectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<boolean> {
    try {
      const presentation = await this.slidesClient.getPresentation(
        presentationId,
        ctx,
      );
      for (const slide of presentation.slides ?? []) {
        for (const el of slide.pageElements ?? []) {
          if (el.objectId === objectId) {
            const textContent = el.shape?.text?.textElements ?? [];
            // textElements always has at least one entry (the newline); real text has more
            const hasRealText = textContent.some(
              (te) =>
                te.textRun?.content &&
                te.textRun.content.replace(/\n/g, "").length > 0,
            );
            return hasRealText;
          }
        }
      }
    } catch {
      /* fall through — assume empty */
    }
    return false;
  }

  private async snapshotTextDefaults(
    presentationId: string,
    objectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<TextStyleSnapshot | null> {
    try {
      const presentation = await this.slidesClient.getPresentation(
        presentationId,
        ctx,
      );

      for (const slide of presentation.slides ?? []) {
        for (const el of slide.pageElements ?? []) {
          if (el.objectId !== objectId) continue;
          const textEls = el.shape?.text?.textElements ?? [];

          const firstRun = textEls.find((te) => te.textRun?.style)?.textRun
            ?.style;
          const firstParagraph = textEls.find((te) => te.paragraphMarker?.style)
            ?.paragraphMarker?.style;

          const textStyle: slides_v1.Schema$TextStyle = {};
          const textFields: string[] = [];
          if (firstRun?.weightedFontFamily) {
            textStyle.weightedFontFamily = firstRun.weightedFontFamily;
            textFields.push("weightedFontFamily");
          }
          if (firstRun?.fontSize) {
            textStyle.fontSize = firstRun.fontSize;
            textFields.push("fontSize");
          }
          if (firstRun?.foregroundColor) {
            textStyle.foregroundColor = firstRun.foregroundColor;
            textFields.push("foregroundColor");
          }
          if (typeof firstRun?.bold === "boolean") {
            textStyle.bold = firstRun.bold;
            textFields.push("bold");
          }
          if (typeof firstRun?.italic === "boolean") {
            textStyle.italic = firstRun.italic;
            textFields.push("italic");
          }

          const paragraphStyle: slides_v1.Schema$ParagraphStyle = {};
          const paragraphFields: string[] = [];
          if (firstParagraph?.alignment) {
            paragraphStyle.alignment = firstParagraph.alignment;
            paragraphFields.push("alignment");
          }
          if (typeof firstParagraph?.lineSpacing === "number") {
            paragraphStyle.lineSpacing = firstParagraph.lineSpacing;
            paragraphFields.push("lineSpacing");
          }

          if (textFields.length === 0 && paragraphFields.length === 0) {
            return null;
          }

          return {
            textStyle,
            textFields: textFields.join(","),
            paragraphStyle,
            paragraphFields: paragraphFields.join(","),
          };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private assertLayout(layout: SlidesLayoutType): SlidesLayoutType {
    const validLayouts: SlidesLayoutType[] = [
      "BLANK",
      "CAPTION_ONLY",
      "TITLE",
      "TITLE_AND_BODY",
      "TITLE_AND_TWO_COLUMNS",
      "TITLE_ONLY",
      "SECTION_HEADER",
      "SECTION_TITLE_AND_DESCRIPTION",
    ];

    if (!validLayouts.includes(layout)) {
      throw new SlidesClientError(`Unsupported slide layout: ${layout}`, {
        code: "INVALID_SLIDE_LAYOUT",
        retryable: false,
      });
    }

    return layout;
  }

  private resolveInsertionIndex(
    index: number | undefined,
    totalSlides: number,
  ): number {
    if (index === undefined) {
      return totalSlides;
    }

    if (!Number.isInteger(index) || index < 0 || index > totalSlides) {
      throw new SlidesClientError("insertionIndex is out of bounds.", {
        code: "INVALID_INSERTION_INDEX",
        retryable: false,
      });
    }

    return index;
  }
}

export default SlidesEditorService;
