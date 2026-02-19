import { google, sheets_v4 } from "googleapis";
import type { GoogleAuth } from "google-auth-library";
import { logger } from "../../../infra/logger";

export type SheetsValue = string | number | boolean | null;
export type SheetsValueRow = SheetsValue[];
export type SheetsValueGrid = SheetsValueRow[];

export interface SheetsRequestContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface SheetsClientOptions {
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export class SheetsClientError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly status?: number;

  constructor(
    message: string,
    opts: { code: string; retryable: boolean; status?: number },
  ) {
    super(message);
    this.name = "SheetsClientError";
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

const DEFAULT_OPTIONS: Required<SheetsClientOptions> = {
  maxRetries: 3,
  baseBackoffMs: 250,
  maxBackoffMs: 4000,
};

/**
 * Google Sheets API wrapper with retry/backoff and typed error mapping.
 */
export class SheetsClientService {
  private readonly auth: GoogleAuth;
  private readonly client: sheets_v4.Sheets;
  private readonly options: Required<SheetsClientOptions>;

  constructor(auth?: GoogleAuth, options?: SheetsClientOptions) {
    this.auth =
      auth ??
      new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

    this.client = google.sheets({ version: "v4", auth: this.auth });
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  async getSpreadsheet(
    spreadsheetId: string,
    ctx?: SheetsRequestContext,
  ): Promise<sheets_v4.Schema$Spreadsheet> {
    this.assertSpreadsheetId(spreadsheetId);

    return this.withRetry("getSpreadsheet", ctx, async () => {
      const response = await this.client.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
      });

      if (!response.data) {
        throw new SheetsClientError(
          "Google Sheets API returned empty spreadsheet payload.",
          {
            code: "EMPTY_SPREADSHEET_PAYLOAD",
            retryable: false,
          },
        );
      }

      return response.data;
    });
  }

  async batchUpdate(
    spreadsheetId: string,
    requests: sheets_v4.Schema$Request[],
    ctx?: SheetsRequestContext,
  ): Promise<sheets_v4.Schema$BatchUpdateSpreadsheetResponse> {
    this.assertSpreadsheetId(spreadsheetId);
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new SheetsClientError(
        "batchUpdate requires at least one request.",
        {
          code: "INVALID_BATCH_REQUESTS",
          retryable: false,
        },
      );
    }

    return this.withRetry("batchUpdate", ctx, async () => {
      const response = await this.client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });

      if (!response.data) {
        throw new SheetsClientError(
          "Google Sheets API returned empty batchUpdate payload.",
          {
            code: "EMPTY_BATCH_UPDATE_PAYLOAD",
            retryable: false,
          },
        );
      }

      return response.data;
    });
  }

  async getValues(
    spreadsheetId: string,
    range: string,
    ctx?: SheetsRequestContext,
  ): Promise<sheets_v4.Schema$ValueRange> {
    this.assertSpreadsheetId(spreadsheetId);
    this.assertRange(range);

    return this.withRetry("getValues", ctx, async () => {
      const response = await this.client.spreadsheets.values.get({
        spreadsheetId,
        range,
        majorDimension: "ROWS",
      });

      if (!response.data) {
        throw new SheetsClientError(
          "Google Sheets API returned empty values payload.",
          {
            code: "EMPTY_VALUES_PAYLOAD",
            retryable: false,
          },
        );
      }

      return response.data;
    });
  }

  async setValues(
    spreadsheetId: string,
    range: string,
    values: SheetsValueGrid,
    ctx?: SheetsRequestContext,
  ): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    this.assertSpreadsheetId(spreadsheetId);
    this.assertRange(range);
    this.assertGrid(values);

    return this.withRetry("setValues", ctx, async () => {
      const response = await this.client.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          range,
          majorDimension: "ROWS",
          values,
        },
      });

      if (!response.data) {
        throw new SheetsClientError(
          "Google Sheets API returned empty update values payload.",
          {
            code: "EMPTY_SET_VALUES_PAYLOAD",
            retryable: false,
          },
        );
      }

      return response.data;
    });
  }

  private async withRetry<T>(
    operation: string,
    ctx: SheetsRequestContext | undefined,
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

        const isLast = attempt > this.options.maxRetries;
        if (!mapped.retryable || isLast) {
          logger.error(`[SheetsClient] ${operation} failed`, {
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

        const backoff = this.computeBackoff(attempt);
        logger.warn(`[SheetsClient] ${operation} transient error, retrying`, {
          attempt,
          backoffMs: backoff,
          correlationId: ctx?.correlationId,
          code: mapped.code,
          status: mapped.status,
        });
        await this.sleep(backoff);
      }
    }

    throw this.mapError(lastError);
  }

  private mapError(error: unknown): SheetsClientError {
    if (error instanceof SheetsClientError) return error;

    const e = error as {
      message?: string;
      code?: string | number;
      status?: number;
      response?: { status?: number };
    };
    const status = e?.status ?? e?.response?.status;
    const code = String(e?.code ?? "UNKNOWN");
    const message = e?.message ?? "Unknown Google Sheets error";

    if (status === 404) {
      return new SheetsClientError("Spreadsheet or range not found.", {
        code: "NOT_FOUND",
        retryable: false,
        status,
      });
    }

    if (status === 401 || status === 403) {
      return new SheetsClientError(
        "Sheets authentication/authorization failed.",
        {
          code: "AUTH_ERROR",
          retryable: false,
          status,
        },
      );
    }

    if ([408, 429, 500, 502, 503, 504].includes(status ?? -1)) {
      return new SheetsClientError(message, {
        code: "TRANSIENT_API_ERROR",
        retryable: true,
        status,
      });
    }

    if (["ETIMEDOUT", "ECONNRESET", "ENOTFOUND"].includes(code)) {
      return new SheetsClientError(message, {
        code: "NETWORK_ERROR",
        retryable: true,
        status,
      });
    }

    return new SheetsClientError(message, {
      code: "API_ERROR",
      retryable: false,
      status,
    });
  }

  private computeBackoff(attempt: number): number {
    const exp = this.options.baseBackoffMs * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 100);
    return Math.min(this.options.maxBackoffMs, exp + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private assertSpreadsheetId(spreadsheetId: string): void {
    if (!spreadsheetId || !spreadsheetId.trim()) {
      throw new SheetsClientError("spreadsheetId is required.", {
        code: "INVALID_SPREADSHEET_ID",
        retryable: false,
      });
    }
  }

  private assertRange(range: string): void {
    if (!range || !range.trim()) {
      throw new SheetsClientError("range is required.", {
        code: "INVALID_RANGE",
        retryable: false,
      });
    }
  }

  private assertGrid(values: SheetsValueGrid): void {
    if (!Array.isArray(values) || values.length === 0) {
      throw new SheetsClientError("values must contain at least one row.", {
        code: "INVALID_VALUES_GRID",
        retryable: false,
      });
    }

    const width = values[0].length;
    if (width === 0) {
      throw new SheetsClientError(
        "values rows must contain at least one column.",
        {
          code: "INVALID_VALUES_ROW_WIDTH",
          retryable: false,
        },
      );
    }

    const inconsistent = values.some((row) => row.length !== width);
    if (inconsistent) {
      throw new SheetsClientError("all values rows must have the same width.", {
        code: "INCONSISTENT_VALUES_GRID",
        retryable: false,
      });
    }
  }
}

export default SheetsClientService;
