import type {
  SpreadsheetEngineExecuteRequest,
  SpreadsheetEngineExecuteResponse,
  SpreadsheetEngineInsightRequest,
  SpreadsheetEngineInsightResponse,
} from "./spreadsheetEngine.types";

export class SpreadsheetEngineClientError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly retryable: boolean;

  constructor(
    message: string,
    opts: {
      code: string;
      status?: number;
      retryable: boolean;
    },
  ) {
    super(message);
    this.name = "SpreadsheetEngineClientError";
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

function trimBaseUrl(input: string): string {
  return String(input || "").trim().replace(/\/+$/, "");
}

export class SpreadsheetEngineClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts?: { baseUrl?: string; timeoutMs?: number }) {
    this.baseUrl = trimBaseUrl(opts?.baseUrl || process.env.SPREADSHEET_ENGINE_URL || "http://127.0.0.1:8011");
    this.timeoutMs = Number(opts?.timeoutMs || process.env.SPREADSHEET_ENGINE_TIMEOUT_MS || 12000);
  }

  private async postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), Math.max(1000, this.timeoutMs));

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new SpreadsheetEngineClientError(
          `Spreadsheet engine HTTP ${response.status}: ${text || response.statusText}`,
          {
            code: `HTTP_${response.status}`,
            status: response.status,
            retryable: response.status >= 500 || response.status === 429,
          },
        );
      }

      return (await response.json()) as TResponse;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new SpreadsheetEngineClientError("Spreadsheet engine request timed out", {
          code: "TIMEOUT",
          retryable: true,
        });
      }
      if (error instanceof SpreadsheetEngineClientError) throw error;
      throw new SpreadsheetEngineClientError(error?.message || "Spreadsheet engine request failed", {
        code: "REQUEST_FAILED",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async execute(req: SpreadsheetEngineExecuteRequest): Promise<SpreadsheetEngineExecuteResponse> {
    return this.postJson<SpreadsheetEngineExecuteResponse>("/v1/spreadsheet/execute", {
      request_id: req.requestId,
      document_id: req.documentId,
      user_id: req.userId,
      correlation_id: req.correlationId,
      spreadsheet_id: req.spreadsheetId,
      ops: req.ops,
      context: req.context
        ? {
            active_sheet_name: req.context.activeSheetName ?? null,
            selection_range_a1: req.context.selectionRangeA1 ?? null,
            language: req.context.language ?? null,
            conversation_id: req.context.conversationId ?? null,
          }
        : undefined,
      options: req.options || {},
    });
  }

  async insight(req: SpreadsheetEngineInsightRequest): Promise<SpreadsheetEngineInsightResponse> {
    return this.postJson<SpreadsheetEngineInsightResponse>("/v1/spreadsheet/insight", {
      request_id: req.requestId,
      document_id: req.documentId,
      user_id: req.userId,
      correlation_id: req.correlationId,
      spreadsheet_id: req.spreadsheetId,
      ranges: req.ranges,
      language: req.language ?? null,
    });
  }
}
