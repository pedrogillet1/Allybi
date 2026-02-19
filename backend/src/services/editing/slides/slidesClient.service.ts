import { google, slides_v1 } from "googleapis";
import type { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { logger } from "../../../infra/logger";

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
  /**
   * Minimum delay between write operations (batchUpdate/create/copy/import).
   * Helps avoid "Write requests per minute per user" quota errors.
   */
  minWriteIntervalMs?: number;
}

export interface SlideThumbnailResult {
  slideObjectId: string;
  contentUrl: string;
  width?: number;
  height?: number;
}

export interface ImportPptxResult {
  presentationId: string;
  url: string;
}

export class SlidesClientError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      code: string;
      retryable: boolean;
      status?: number;
      retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = "SlidesClientError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

const DEFAULT_OPTIONS: Required<SlidesClientOptions> = {
  // Deck building can legitimately hit per-minute quotas; allow a longer recovery window.
  maxRetries: 8,
  baseBackoffMs: 1000,
  maxBackoffMs: 70000,
  minWriteIntervalMs: Math.max(
    0,
    parseInt(process.env.KODA_SLIDES_WRITE_DELAY_MS || "1200", 10) || 0,
  ),
};

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/presentations.readonly",
  // Needed for copying template presentations (Drive files.copy) and basic file ops.
  // Keep broad scope to avoid drive.file limitations when templates are not app-owned.
  "https://www.googleapis.com/auth/drive",
] as const;

/**
 * Google Slides API wrapper with retry/backoff and typed error mapping.
 */
export class SlidesClientService {
  private readonly auth: GoogleAuth;
  private readonly client: slides_v1.Slides;
  private readonly drive: ReturnType<typeof google.drive>;
  private readonly options: Required<SlidesClientOptions>;
  private static lastWriteAtMs = 0;
  private static writeOps = new Set<string>([
    "createPresentation",
    "copyPresentationFromTemplate",
    "importPptxToPresentation",
    "exportPresentationToPptx", // Drive export counts as a "read", but keep it in the same lane to avoid thrash.
    "batchUpdate",
    "deleteDriveFile",
  ]);

  constructor(auth?: GoogleAuth, options?: SlidesClientOptions) {
    this.auth = auth ?? SlidesClientService.resolveAuth();
    this.client = google.slides({ version: "v1", auth: this.auth });
    this.drive = google.drive({ version: "v3", auth: this.auth });
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  /**
   * Resolve auth for Slides API.
   * Prefers ADC (authorized_user) over the GCP service account
   * since the service account may lack Workspace API permissions.
   */
  private static resolveAuth(): GoogleAuth {
    const adcPath = path.join(
      process.env.HOME || "~",
      ".config",
      "gcloud",
      "application_default_credentials.json",
    );

    if (fs.existsSync(adcPath)) {
      try {
        const adc = JSON.parse(fs.readFileSync(adcPath, "utf-8"));
        if (adc.type === "authorized_user" && adc.refresh_token) {
          logger.info(
            "[SlidesClient] Using ADC (authorized_user) for Slides auth",
          );
          return new google.auth.GoogleAuth({
            credentials: {
              type: "authorized_user",
              client_id: adc.client_id,
              client_secret: adc.client_secret,
              refresh_token: adc.refresh_token,
            } as any,
            scopes: [...DEFAULT_SCOPES],
          });
        }
      } catch {
        /* fall through */
      }
    }

    return new google.auth.GoogleAuth({ scopes: [...DEFAULT_SCOPES] });
  }

  async getPresentation(
    presentationId: string,
    ctx?: SlidesRequestContext,
  ): Promise<slides_v1.Schema$Presentation> {
    this.assertPresentationId(presentationId);

    return this.withRetry("getPresentation", ctx, async () => {
      const response = await this.client.presentations.get({ presentationId });
      if (!response.data) {
        throw new SlidesClientError(
          "Google Slides API returned an empty presentation payload.",
          {
            code: "EMPTY_PRESENTATION_PAYLOAD",
            retryable: false,
          },
        );
      }

      return response.data;
    });
  }

  async createPresentation(
    title: string,
    ctx?: SlidesRequestContext,
  ): Promise<{ presentationId: string; url: string }> {
    const normalizedTitle = String(title || "").trim() || "Untitled";

    return this.withRetry("createPresentation", ctx, async () => {
      const response = await this.client.presentations.create({
        requestBody: { title: normalizedTitle },
      });

      const presentationId = response.data?.presentationId;
      if (!presentationId) {
        throw new SlidesClientError(
          "Google Slides API returned an empty create payload.",
          {
            code: "EMPTY_CREATE_PRESENTATION_PAYLOAD",
            retryable: false,
          },
        );
      }

      return {
        presentationId,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      };
    });
  }

  /**
   * Import a PPTX buffer into Google Drive as a Google Slides presentation.
   * This is the bridge that enables "edit PPTX bytes" workflows via Slides API.
   */
  async importPptxToPresentation(
    params: {
      pptxBuffer: Buffer;
      filename: string;
      parentFolderId?: string;
    },
    ctx?: SlidesRequestContext,
  ): Promise<ImportPptxResult> {
    const filename =
      String(params.filename || "").trim() || `deck-${Date.now()}.pptx`;
    const parentFolderId = (params.parentFolderId || "").trim() || null;

    if (!Buffer.isBuffer(params.pptxBuffer) || params.pptxBuffer.length === 0) {
      throw new SlidesClientError("pptxBuffer must contain bytes.", {
        code: "INVALID_PPTX_BUFFER",
        retryable: false,
      });
    }

    return this.withRetry("importPptxToPresentation", ctx, async () => {
      const uploaded = await this.drive.files.create({
        requestBody: {
          name: `edit-${Date.now()}-${filename}`,
          mimeType: "application/vnd.google-apps.presentation",
          ...(parentFolderId ? { parents: [parentFolderId] } : {}),
        },
        media: {
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          body: Readable.from(params.pptxBuffer),
        },
        fields: "id",
      });

      const presentationId = uploaded.data?.id;
      if (!presentationId) {
        throw new SlidesClientError(
          "Google Drive API returned an empty import payload.",
          {
            code: "EMPTY_DRIVE_IMPORT_PAYLOAD",
            retryable: false,
          },
        );
      }

      return {
        presentationId,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      };
    });
  }

  /**
   * Export a Google Slides presentation into PPTX bytes.
   */
  async exportPresentationToPptx(
    presentationId: string,
    ctx?: SlidesRequestContext,
  ): Promise<Buffer> {
    this.assertPresentationId(presentationId);

    return this.withRetry("exportPresentationToPptx", ctx, async () => {
      const exported = await this.drive.files.export(
        {
          fileId: presentationId,
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        { responseType: "arraybuffer" },
      );

      const buf = Buffer.from(exported.data as ArrayBuffer);
      if (!buf.length) {
        throw new SlidesClientError(
          "Google Drive export returned empty PPTX bytes.",
          {
            code: "EMPTY_PPTX_EXPORT",
            retryable: false,
          },
        );
      }
      return buf;
    });
  }

  /**
   * Create a new Google Slides presentation by copying an existing template (Drive).
   * This is the foundation for "template-driven" deck generation (high design).
   */
  async copyPresentationFromTemplate(
    templatePresentationId: string,
    title: string,
    ctx?: SlidesRequestContext,
  ): Promise<{ presentationId: string; url: string }> {
    this.assertPresentationId(templatePresentationId);
    const normalizedTitle = String(title || "").trim() || "Untitled";

    return this.withRetry("copyPresentationFromTemplate", ctx, async () => {
      const response = await this.drive.files.copy({
        fileId: templatePresentationId,
        requestBody: {
          name: normalizedTitle,
        },
        fields: "id",
      });

      const presentationId = response.data?.id;
      if (!presentationId) {
        throw new SlidesClientError(
          "Google Drive API returned an empty copy payload.",
          {
            code: "EMPTY_COPY_PRESENTATION_PAYLOAD",
            retryable: false,
          },
        );
      }

      return {
        presentationId,
        url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      };
    });
  }

  async batchUpdate(
    presentationId: string,
    requests: slides_v1.Schema$Request[],
    ctx?: SlidesRequestContext,
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    this.assertPresentationId(presentationId);
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new SlidesClientError(
        "batchUpdate requires at least one request.",
        {
          code: "INVALID_BATCH_REQUESTS",
          retryable: false,
        },
      );
    }

    if (requests.length > 500) {
      throw new SlidesClientError(
        "batchUpdate request count exceeds Google API limit (500).",
        {
          code: "BATCH_LIMIT_EXCEEDED",
          retryable: false,
        },
      );
    }

    return this.withRetry("batchUpdate", ctx, async () => {
      const response = await this.client.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
      });

      if (!response.data) {
        throw new SlidesClientError(
          "Google Slides API returned an empty batchUpdate payload.",
          {
            code: "EMPTY_BATCH_UPDATE_PAYLOAD",
            retryable: false,
          },
        );
      }

      return response.data;
    });
  }

  /**
   * Upload a binary asset (e.g., PNG) to Google Drive and make it publicly readable.
   *
   * This is useful for Slides createImage(), which requires an HTTPS URL fetchable by Google.
   * The returned URL is a public "uc" download link. It can be deleted immediately after
   * inserting the image into a Slides deck, since Slides embeds the image bytes.
   */
  async uploadPublicAsset(
    params: {
      filename: string;
      mimeType: string;
      buffer: Buffer;
      parentFolderId?: string;
    },
    ctx?: SlidesRequestContext,
  ): Promise<{ fileId: string; url: string }> {
    const filename =
      String(params.filename || "").trim() || `asset-${Date.now()}`;
    const mimeType =
      String(params.mimeType || "").trim() || "application/octet-stream";
    const parentFolderId = (params.parentFolderId || "").trim() || null;

    return this.withRetry("uploadPublicAsset", ctx, async () => {
      const created = await this.drive.files.create({
        requestBody: {
          name: filename,
          ...(parentFolderId ? { parents: [parentFolderId] } : {}),
        },
        media: {
          mimeType,
          body: Readable.from(params.buffer),
        },
        fields: "id",
      });

      const fileId = created.data?.id;
      if (!fileId) {
        throw new SlidesClientError(
          "Google Drive API returned an empty upload payload.",
          {
            code: "EMPTY_DRIVE_UPLOAD_PAYLOAD",
            retryable: false,
          },
        );
      }

      // Make the file publicly readable so Slides can fetch it.
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          type: "anyone",
          role: "reader",
        },
      });

      return {
        fileId,
        url: `https://drive.google.com/uc?export=download&id=${fileId}`,
      };
    });
  }

  async deleteDriveFile(
    fileId: string,
    ctx?: SlidesRequestContext,
  ): Promise<void> {
    const id = String(fileId || "").trim();
    if (!id) return;

    await this.withRetry("deleteDriveFile", ctx, async () => {
      await this.drive.files.delete({ fileId: id });
    });
  }

  async getSlideThumbnails(
    presentationId: string,
    slideObjectIds: string[],
    ctx?: SlidesRequestContext,
  ): Promise<SlideThumbnailResult[]> {
    this.assertPresentationId(presentationId);
    const uniqueSlideIds = Array.from(
      new Set(slideObjectIds.map((value) => value.trim()).filter(Boolean)),
    );

    if (uniqueSlideIds.length === 0) {
      return [];
    }

    const results: SlideThumbnailResult[] = [];
    for (const slideObjectId of uniqueSlideIds) {
      const thumbnail = await this.withRetry(
        "getSlideThumbnail",
        ctx,
        async (): Promise<{
          contentUrl: string;
          width?: number;
          height?: number;
        }> => {
          const response = await this.client.presentations.pages.getThumbnail({
            presentationId,
            pageObjectId: slideObjectId,
            "thumbnailProperties.thumbnailSize": "LARGE",
            "thumbnailProperties.mimeType": "PNG",
          });

          const contentUrl = response.data?.contentUrl ?? undefined;
          if (!contentUrl) {
            throw new SlidesClientError(
              `Missing thumbnail URL for slide ${slideObjectId}.`,
              {
                code: "EMPTY_THUMBNAIL_PAYLOAD",
                retryable: false,
              },
            );
          }

          return {
            contentUrl,
            width: response.data?.width ?? undefined,
            height: response.data?.height ?? undefined,
          };
        },
      );

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
        await this.throttleWrites(operation);
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

        const backoffMs = this.computeBackoff(attempt, mapped);
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

  private async throttleWrites(operation: string): Promise<void> {
    if (!SlidesClientService.writeOps.has(operation)) return;
    const min = this.options.minWriteIntervalMs;
    if (!Number.isFinite(min) || min <= 0) return;
    const now = Date.now();
    const wait = Math.max(0, SlidesClientService.lastWriteAtMs + min - now);
    if (wait > 0) await this.sleep(wait);
    SlidesClientService.lastWriteAtMs = Date.now();
  }

  private mapError(error: unknown): SlidesClientError {
    if (error instanceof SlidesClientError) {
      return error;
    }

    const e = error as {
      message?: string;
      status?: number;
      code?: string | number;
      response?: {
        status?: number;
        headers?: Record<string, string | string[] | undefined>;
        data?: any;
      };
    };

    const status = e?.status ?? e?.response?.status;
    const message = e?.message ?? "Unknown Google Slides API error";
    const code = String(e?.code ?? "UNKNOWN");
    const headers = (e as any)?.response?.headers as
      | Record<string, any>
      | undefined;
    const retryAfterRaw = headers?.["retry-after"] ?? headers?.["Retry-After"];
    const retryAfterSeconds = (() => {
      if (Array.isArray(retryAfterRaw)) return Number(retryAfterRaw[0]);
      const n = Number(retryAfterRaw);
      return Number.isFinite(n) ? n : null;
    })();
    const retryAfterMsFromHeader =
      retryAfterSeconds != null
        ? Math.max(0, Math.floor(retryAfterSeconds * 1000))
        : undefined;

    // Slides "write requests per minute per user" quota is per API principal; header isn't always present.
    const isWriteQuota =
      status === 429 && /write requests per minute per user/i.test(message);
    const retryAfterMs = isWriteQuota
      ? Math.max(retryAfterMsFromHeader || 0, 65000)
      : retryAfterMsFromHeader;

    if (status === 404) {
      return new SlidesClientError("Presentation or slide not found.", {
        code: "NOT_FOUND",
        retryable: false,
        status,
      });
    }

    if (status === 401 || status === 403) {
      return new SlidesClientError(
        "Slides authentication/authorization failed.",
        {
          code: "AUTH_ERROR",
          retryable: false,
          status,
        },
      );
    }

    if ([408, 429, 500, 502, 503, 504].includes(status ?? -1)) {
      return new SlidesClientError(message, {
        code: "TRANSIENT_API_ERROR",
        retryable: true,
        status,
        retryAfterMs,
      });
    }

    if (["ETIMEDOUT", "ECONNRESET", "ENOTFOUND"].includes(code)) {
      return new SlidesClientError(message, {
        code: "NETWORK_ERROR",
        retryable: true,
        status,
      });
    }

    return new SlidesClientError(message, {
      code: "API_ERROR",
      retryable: false,
      status,
    });
  }

  private computeBackoff(attempt: number, mapped?: SlidesClientError): number {
    const exponential =
      this.options.baseBackoffMs * Math.pow(2, Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * 250);
    const base = Math.min(this.options.maxBackoffMs, exponential + jitter);
    const retryAfter = mapped?.retryAfterMs;
    if (Number.isFinite(retryAfter) && (retryAfter as number) > 0) {
      return Math.max(base, retryAfter as number);
    }
    return base;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertPresentationId(presentationId: string): void {
    if (!presentationId || !presentationId.trim()) {
      throw new SlidesClientError("presentationId is required.", {
        code: "INVALID_PRESENTATION_ID",
        retryable: false,
      });
    }
  }
}

export default SlidesClientService;
