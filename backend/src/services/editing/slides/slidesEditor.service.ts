import type { slides_v1 } from 'googleapis';
import {
  SlidesClientError,
  SlidesClientService,
  type SlidesRequestContext,
} from './slidesClient.service';
import { SlidesValidatorsService } from './slidesValidators.service';

export type SlidesLayoutType =
  | 'BLANK'
  | 'CAPTION_ONLY'
  | 'TITLE'
  | 'TITLE_AND_BODY'
  | 'TITLE_AND_TWO_COLUMNS'
  | 'TITLE_ONLY'
  | 'SECTION_HEADER'
  | 'SECTION_TITLE_AND_DESCRIPTION';

export interface AddSlideResult {
  slideObjectId: string;
  insertionIndex: number;
}

export interface RewriteBulletsResult {
  objectId: string;
  lineCount: number;
}

const MAX_TEXT_LENGTH = 25000;

function sanitizeText(input: string, fieldName: string): string {
  const normalized = input.replace(/\r/g, '').trim();
  if (!normalized) {
    throw new SlidesClientError(`${fieldName} is required.`, {
      code: 'INVALID_TEXT',
      retryable: false,
    });
  }

  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new SlidesClientError(`${fieldName} exceeds safe length limit (${MAX_TEXT_LENGTH}).`, {
      code: 'TEXT_TOO_LARGE',
      retryable: false,
    });
  }

  return normalized;
}

function toObjectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Slides editing service (create/update text/image with strict validation).
 */
export class SlidesEditorService {
  private readonly validators: SlidesValidatorsService;

  constructor(private readonly slidesClient: SlidesClientService = new SlidesClientService()) {
    this.validators = new SlidesValidatorsService(this.slidesClient);
  }

  async addSlide(
    presentationId: string,
    layout: SlidesLayoutType,
    insertionIndex?: number,
    ctx?: SlidesRequestContext,
  ): Promise<AddSlideResult> {
    const normalizedLayout = this.assertLayout(layout);
    const presentation = await this.slidesClient.getPresentation(presentationId, ctx);

    const totalSlides = presentation.slides?.length ?? 0;
    const index = this.resolveInsertionIndex(insertionIndex, totalSlides);
    const slideObjectId = toObjectId('slide');

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
    const targetObjectId = this.validators.assertObjectId(objectId, 'objectId');
    const sanitized = sanitizeText(newText, 'newText');

    const requests: slides_v1.Schema$Request[] = [
      {
        deleteText: {
          objectId: targetObjectId,
          textRange: { type: 'ALL' },
        },
      },
      {
        insertText: {
          objectId: targetObjectId,
          insertionIndex: 0,
          text: sanitized,
        },
      },
    ];

    await this.slidesClient.batchUpdate(presentationId, requests, ctx);
  }

  async rewriteBullets(
    presentationId: string,
    objectId: string,
    bulletLines: string[],
    ctx?: SlidesRequestContext,
  ): Promise<RewriteBulletsResult> {
    const targetObjectId = this.validators.assertObjectId(objectId, 'objectId');
    const cleaned = bulletLines
      .map((line) => line.replace(/\r/g, '').trim())
      .filter(Boolean);

    if (cleaned.length === 0) {
      throw new SlidesClientError('bulletLines must contain at least one non-empty line.', {
        code: 'INVALID_BULLET_LINES',
        retryable: false,
      });
    }

    const textPayload = sanitizeText(cleaned.join('\n'), 'bullet text');

    const requests: slides_v1.Schema$Request[] = [
      {
        deleteText: {
          objectId: targetObjectId,
          textRange: { type: 'ALL' },
        },
      },
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
          textRange: { type: 'ALL' },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        },
      },
    ];

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
    const targetObjectId = this.validators.assertObjectId(imageObjectId, 'imageObjectId');
    const normalizedUrl = imageUrl.trim();

    if (!/^https:\/\//i.test(normalizedUrl)) {
      throw new SlidesClientError('imageUrl must be an HTTPS URL.', {
        code: 'INVALID_IMAGE_URL',
        retryable: false,
      });
    }

    const request: slides_v1.Schema$Request = {
      replaceImage: {
        imageObjectId: targetObjectId,
        url: normalizedUrl,
        imageReplaceMethod: 'CENTER_CROP',
      },
    };

    await this.slidesClient.batchUpdate(presentationId, [request], ctx);
  }

  private assertLayout(layout: SlidesLayoutType): SlidesLayoutType {
    const validLayouts: SlidesLayoutType[] = [
      'BLANK',
      'CAPTION_ONLY',
      'TITLE',
      'TITLE_AND_BODY',
      'TITLE_AND_TWO_COLUMNS',
      'TITLE_ONLY',
      'SECTION_HEADER',
      'SECTION_TITLE_AND_DESCRIPTION',
    ];

    if (!validLayouts.includes(layout)) {
      throw new SlidesClientError(`Unsupported slide layout: ${layout}`, {
        code: 'INVALID_SLIDE_LAYOUT',
        retryable: false,
      });
    }

    return layout;
  }

  private resolveInsertionIndex(index: number | undefined, totalSlides: number): number {
    if (index === undefined) {
      return totalSlides;
    }

    if (!Number.isInteger(index) || index < 0 || index > totalSlides) {
      throw new SlidesClientError('insertionIndex is out of bounds.', {
        code: 'INVALID_INSERTION_INDEX',
        retryable: false,
      });
    }

    return index;
  }
}

export default SlidesEditorService;
