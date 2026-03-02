import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { logger } from "../../../utils/logger";

export interface SheetsBridgeContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface ImportXlsxResult {
  spreadsheetId: string;
  url: string;
}

export class SheetsBridgeError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly status?: number;

  constructor(
    message: string,
    opts: { code: string; retryable: boolean; status?: number },
  ) {
    super(message);
    this.name = "SheetsBridgeError";
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  // Needed for files.create (import) and files.export (download XLSX).
  "https://www.googleapis.com/auth/drive",
] as const;

/**
 * Bridge service that imports XLSX bytes into a Google Sheet (Drive),
 * then exports the Google Sheet back into XLSX bytes.
 *
 * This is the spreadsheet analog to slidesClient.import/export.
 */
export class SheetsBridgeService {
  private readonly auth: InstanceType<typeof google.auth.GoogleAuth>;
  private readonly drive: ReturnType<typeof google.drive>;

  constructor(auth?: InstanceType<typeof google.auth.GoogleAuth>) {
    this.auth = auth ?? SheetsBridgeService.resolveAuth();
    this.drive = google.drive({ version: "v3", auth: this.auth });
  }

  private static resolveAuth(): InstanceType<typeof google.auth.GoogleAuth> {
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
            "[SheetsBridge] Using ADC (authorized_user) for Drive/Sheets auth",
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
        // fall through
      }
    }

    return new google.auth.GoogleAuth({ scopes: [...DEFAULT_SCOPES] });
  }

  async importXlsxToSpreadsheet(
    params: { xlsxBuffer: Buffer; filename: string; parentFolderId?: string },
    ctx?: SheetsBridgeContext,
  ): Promise<ImportXlsxResult> {
    const filename =
      String(params.filename || "").trim() || `sheet-${Date.now()}.xlsx`;
    const parentFolderId = String(params.parentFolderId || "").trim() || null;

    if (!Buffer.isBuffer(params.xlsxBuffer) || params.xlsxBuffer.length === 0) {
      throw new SheetsBridgeError("xlsxBuffer must contain bytes.", {
        code: "INVALID_XLSX_BUFFER",
        retryable: false,
      });
    }

    try {
      const uploaded = await this.drive.files.create({
        requestBody: {
          name: `edit-${Date.now()}-${filename}`,
          mimeType: "application/vnd.google-apps.spreadsheet",
          ...(parentFolderId ? { parents: [parentFolderId] } : {}),
        },
        media: {
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          body: Readable.from(params.xlsxBuffer),
        },
        fields: "id",
      });

      const spreadsheetId = uploaded.data?.id;
      if (!spreadsheetId) {
        throw new SheetsBridgeError(
          "Google Drive API returned an empty import payload.",
          {
            code: "EMPTY_DRIVE_IMPORT_PAYLOAD",
            retryable: false,
          },
        );
      }

      return {
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      };
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      if (status === 401 || status === 403) {
        throw new SheetsBridgeError(
          "Sheets authentication/authorization failed.",
          {
            code: "AUTH_ERROR",
            retryable: false,
            status,
          },
        );
      }
      throw new SheetsBridgeError(
        error?.message || "Failed to import XLSX to Google Sheets.",
        {
          code: "IMPORT_ERROR",
          retryable: false,
          status,
        },
      );
    } finally {
      logger.info("[SheetsBridge] importXlsxToSpreadsheet", {
        correlationId: ctx?.correlationId,
        userId: ctx?.userId,
        conversationId: ctx?.conversationId,
        clientMessageId: ctx?.clientMessageId,
      });
    }
  }

  async exportSpreadsheetToXlsx(
    spreadsheetId: string,
    ctx?: SheetsBridgeContext,
  ): Promise<Buffer> {
    const id = String(spreadsheetId || "").trim();
    if (!id) {
      throw new SheetsBridgeError("spreadsheetId is required.", {
        code: "INVALID_SPREADSHEET_ID",
        retryable: false,
      });
    }

    try {
      const exported = await this.drive.files.export(
        {
          fileId: id,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        { responseType: "arraybuffer" },
      );

      const buf = Buffer.from(exported.data as ArrayBuffer);
      if (!buf.length) {
        throw new SheetsBridgeError(
          "Google Drive export returned empty XLSX bytes.",
          {
            code: "EMPTY_XLSX_EXPORT",
            retryable: false,
          },
        );
      }
      return buf;
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      if (status === 401 || status === 403) {
        throw new SheetsBridgeError(
          "Sheets authentication/authorization failed.",
          {
            code: "AUTH_ERROR",
            retryable: false,
            status,
          },
        );
      }
      throw new SheetsBridgeError(
        error?.message || "Failed to export Google Sheet to XLSX.",
        {
          code: "EXPORT_ERROR",
          retryable: false,
          status,
        },
      );
    } finally {
      logger.info("[SheetsBridge] exportSpreadsheetToXlsx", {
        correlationId: ctx?.correlationId,
        userId: ctx?.userId,
        conversationId: ctx?.conversationId,
        clientMessageId: ctx?.clientMessageId,
      });
    }
  }
}

export default SheetsBridgeService;
