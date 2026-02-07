import { google, slides_v1 } from 'googleapis';
import type { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../infra/logger';

export interface SlidesRequestContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface SlidesClientOptions {
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface SlideThumbnailResult {
  slideObjectId: string;
  contentUrl: string;
  width?: number;
  height?: number;
}

export class SlidesClientError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly status?: number;

  constructor(message: string, options: { code: string; retryable: boolean; status?: number }) {
    super(message);
    this.name = 'SlidesClientError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

const DEFAULT_OPTIONS: Required<SlidesClientOptions> = {
  maxRetries: 3,
  baseBackoffMs: 250,
  maxBackoffMs: 4000,
};

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/presentations.readonly',
] as const;

/**
 * Google Slides API wrapper with retry/backoff and typed error mapping.
 */
export class SlidesClientService {
  private readonly auth: GoogleAuth;
  private readonly client: slides_v1.Slides;
  private readonly options: Required<SlidesClientOptions>;

  constructor(auth?: GoogleAuth, options?: SlidesClientOptions) {
    this.auth = auth ?? new google.auth.GoogleAuth({ scopes: [...DEFAULT_SCOPES] });
    this.client = google.slides({ version: 'v1', auth: this.auth });
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  async getPresentation(
    presentationId: string,
    ctx?: SlidesRequestContext,
  ): Promise<slides_v1.Schema$Presentation> {
    this.assertPresentationId(presentationId);

    return this.withRetry('getPresentation', ctx, async () => {
      const response = await this.client.presentations.get({ presentationId });
      if (!response.data) {
        throw new SlidesClientError('Google Slides API returned an empty presentation payload.', {
          code: 'EMPTY_PRESENTATION_PAYLOAD',
          retryable: false,
        });
      }

      return response.data;
    });
  }

  async batchUpdate(
    presentationId: string,
    requests: slides_v1.Schema$Request[],
    ctx?: SlidesRequestContext,
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    this.assertPresentationId(presentationId);
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new SlidesClientError('batchUpdate requires at least one request.', {
        code: 'INVALID_BATCH_REQUESTS',
        retryable: false,
      });
    }

    if (requests.length > 500) {
      throw new SlidesClientError('batchUpdate request count exceeds Google API limit (500).', {
        code: 'BATCH_LIMIT_EXCEEDED',
        retryable: false,
      });
    }

    return this.withRetry('batchUpdate', ctx, async () => {
      const response = await this.client.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });

      if (!response.data) {
        throw new SlidesClientError('Google Slides API returned an empty batchUpdate payload.', {
          code: 'EMPTY_BATCH_UPDATE_PAYLOAD',
          retryable: false,
        });
      }

      return response.data;
    });
  }

  async getSlideThumbnails(
    presentationId: string,
    slideObjectIds: string[],
    ctx?: SlidesRequestContext,
  ): Promise<SlideThumbnailResult[]> {
    this.assertPresentationId(presentationId);
    const uniqueSlideIds = Array.from(new Set(slideObjectIds.map((value) => value.trim()).filter(Boolean)));

    if (uniqueSlideIds.length === 0) {
      return [];
    }

    const results: SlideThumbnailResult[] = [];
    for (const slideObjectId of uniqueSlideIds) {
      const thumbnail = await this.withRetry(
        'getSlideThumbnail',
        ctx,
        async (): Promise<{ contentUrl: string; width?: number; height?: number }> => {
        const response = await this.client.presentations.pages.getThumbnail({
          presentationId,
          pageObjectId: slideObjectId,
          'thumbnailProperties.thumbnailSize': 'LARGE',
          'thumbnailProperties.mimeType': 'PNG',
        });

        const contentUrl = response.data?.contentUrl ?? undefined;
        if (!contentUrl) {
          throw new SlidesClientError(`Missing thumbnail URL for slide ${slideObjectId}.`, {
            code: 'EMPTY_THUMBNAIL_PAYLOAD',
            retryable: false,
          });
        }

        return {
          contentUrl,
          width: response.data?.width ?? undefined,
          height: response.data?.height ?? undefined,
        };
      });

      results.push({
        slideObjectId,
        contentUrl: thumbnail.contentUrl,
        width: thumbnail.width ?? undefined,
        height: thumbnail.height ?? undefined,
      });
    }

    return results;
  }

  private async withRetry<T>(
    operation: string,
    ctx: SlidesRequestContext | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.maxRetries) {
      attempt += 1;
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const mapped = this.mapError(error);
        const isLastAttempt = attempt > this.options.maxRetries;

        if (!mapped.retryable || isLastAttempt) {
          logger.error(`[SlidesClient] ${operation} failed`, {
            attempt,
            correlationId: ctx?.correlationId,
            userId: ctx?.userId,
            conversationId: ctx?.conversationId,
            clientMessageId: ctx?.clientMessageId,
            code: mapped.code,
            status: mapped.status,
          });
          throw mapped;
        }

        const backoffMs = this.computeBackoff(attempt);
        logger.warn(`[SlidesClient] ${operation} transient failure, retrying`, {
          attempt,
          backoffMs,
          correlationId: ctx?.correlationId,
          code: mapped.code,
          status: mapped.status,
        });

        await this.sleep(backoffMs);
      }
    }

    throw this.mapError(lastError);
  }

  private mapError(error: unknown): SlidesClientError {
    if (error instanceof SlidesClientError) {
      return error;
    }

    const e = error as {
      message?: string;
      status?: number;
      code?: string | number;
      response?: { status?: number };
    };

    const status = e?.status ?? e?.response?.status;
    const message = e?.message ?? 'Unknown Google Slides API error';
    const code = String(e?.code ?? 'UNKNOWN');

    if (status === 404) {
      return new SlidesClientError('Presentation or slide not found.', {
        code: 'NOT_FOUND',
        retryable: false,
        status,
      });
    }

    if (status === 401 || status === 403) {
      return new SlidesClientError('Slides authentication/authorization failed.', {
        code: 'AUTH_ERROR',
        retryable: false,
        status,
      });
    }

    if ([408, 429, 500, 502, 503, 504].includes(status ?? -1)) {
      return new SlidesClientError(message, {
        code: 'TRANSIENT_API_ERROR',
        retryable: true,
        status,
      });
    }

    if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(code)) {
      return new SlidesClientError(message, {
        code: 'NETWORK_ERROR',
        retryable: true,
        status,
      });
    }

    return new SlidesClientError(message, {
      code: 'API_ERROR',
      retryable: false,
      status,
    });
  }

  private computeBackoff(attempt: number): number {
    const exponential = this.options.baseBackoffMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * 100);
    return Math.min(this.options.maxBackoffMs, exponential + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertPresentationId(presentationId: string): void {
    if (!presentationId || !presentationId.trim()) {
      throw new SlidesClientError('presentationId is required.', {
        code: 'INVALID_PRESENTATION_ID',
        retryable: false,
      });
    }
  }
}

export default SlidesClientService;
