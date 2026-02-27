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
  public readonly attempts?: number;

  constructor(
    message: string,
    opts: {
      code: string;
      status?: number;
      retryable: boolean;
      attempts?: number;
    },
  ) {
    super(message);
    this.name = "SpreadsheetEngineClientError";
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.attempts = opts.attempts;
  }
}

function trimBaseUrl(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\/+$/, "");
}

export class SpreadsheetEngineClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerCooldownMs: number;
  private consecutiveFailures = 0;
  private circuitOpenUntilMs = 0;

  constructor(opts?: {
    baseUrl?: string;
    timeoutMs?: number;
    maxRetries?: number;
    backoffBaseMs?: number;
    circuitBreakerThreshold?: number;
    circuitBreakerCooldownMs?: number;
  }) {
    this.baseUrl = trimBaseUrl(
      opts?.baseUrl ||
        process.env.SPREADSHEET_ENGINE_URL ||
        "http://127.0.0.1:8011",
    );
    this.timeoutMs = Number(
      opts?.timeoutMs || process.env.SPREADSHEET_ENGINE_TIMEOUT_MS || 12000,
    );
    this.maxRetries = Math.max(
      0,
      Number(
        opts?.maxRetries ?? process.env.SPREADSHEET_ENGINE_MAX_RETRIES ?? 2,
      ),
    );
    this.backoffBaseMs = Math.max(
      50,
      Number(
        opts?.backoffBaseMs ??
          process.env.SPREADSHEET_ENGINE_BACKOFF_BASE_MS ??
          250,
      ),
    );
    this.circuitBreakerThreshold = Math.max(
      1,
      Number(
        opts?.circuitBreakerThreshold ??
          process.env.SPREADSHEET_ENGINE_CIRCUIT_BREAKER_THRESHOLD ??
          6,
      ),
    );
    this.circuitBreakerCooldownMs = Math.max(
      500,
      Number(
        opts?.circuitBreakerCooldownMs ??
          process.env.SPREADSHEET_ENGINE_CIRCUIT_BREAKER_COOLDOWN_MS ??
          30000,
      ),
    );
  }

  private async postJsonSingleAttempt<TResponse>(
    path: string,
    body: unknown,
    attempt: number,
  ): Promise<TResponse> {
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
            attempts: attempt,
          },
        );
      }

      return (await response.json()) as TResponse;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new SpreadsheetEngineClientError(
          "Spreadsheet engine request timed out",
          {
            code: "TIMEOUT",
            retryable: true,
            attempts: attempt,
          },
        );
      }
      if (error instanceof SpreadsheetEngineClientError) throw error;
      throw new SpreadsheetEngineClientError(
        error?.message || "Spreadsheet engine request failed",
        {
          code: "REQUEST_FAILED",
          retryable: true,
          attempts: attempt,
        },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private isCircuitOpen(): boolean {
    return Date.now() < this.circuitOpenUntilMs;
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntilMs = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
      this.circuitOpenUntilMs = Date.now() + this.circuitBreakerCooldownMs;
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private backoffDelayMs(attempt: number): number {
    const exp = Math.max(0, attempt - 1);
    const cappedExp = Math.min(exp, 6);
    const base = this.backoffBaseMs * Math.pow(2, cappedExp);
    const jitter = Math.floor(Math.random() * Math.max(25, base * 0.2));
    return Math.min(8000, base + jitter);
  }

  private async postJson<TResponse>(
    path: string,
    body: unknown,
  ): Promise<TResponse> {
    if (this.isCircuitOpen()) {
      throw new SpreadsheetEngineClientError(
        "Spreadsheet engine circuit breaker is open",
        {
          code: "CIRCUIT_OPEN",
          retryable: false,
        },
      );
    }

    let lastError: SpreadsheetEngineClientError | null = null;
    const maxAttempts = this.maxRetries + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.postJsonSingleAttempt<TResponse>(
          path,
          body,
          attempt,
        );
        this.onSuccess();
        return response;
      } catch (error: any) {
        const wrapped =
          error instanceof SpreadsheetEngineClientError
            ? error
            : new SpreadsheetEngineClientError(
                String(error?.message || "Spreadsheet engine request failed"),
                {
                  code: "REQUEST_FAILED",
                  retryable: true,
                  attempts: attempt,
                },
              );
        this.onFailure();
        lastError = wrapped;
        const canRetry = wrapped.retryable && attempt < maxAttempts;
        if (!canRetry) {
          break;
        }
        await this.sleep(this.backoffDelayMs(attempt));
      }
    }

    throw (
      lastError ||
      new SpreadsheetEngineClientError("Spreadsheet engine request failed", {
        code: "REQUEST_FAILED",
        retryable: true,
      })
    );
  }

  async execute(
    req: SpreadsheetEngineExecuteRequest,
  ): Promise<SpreadsheetEngineExecuteResponse> {
    return this.postJson<SpreadsheetEngineExecuteResponse>(
      "/v1/spreadsheet/execute",
      {
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
      },
    );
  }

  async insight(
    req: SpreadsheetEngineInsightRequest,
  ): Promise<SpreadsheetEngineInsightResponse> {
    return this.postJson<SpreadsheetEngineInsightResponse>(
      "/v1/spreadsheet/insight",
      {
        request_id: req.requestId,
        document_id: req.documentId,
        user_id: req.userId,
        correlation_id: req.correlationId,
        spreadsheet_id: req.spreadsheetId,
        ranges: req.ranges,
        language: req.language ?? null,
      },
    );
  }
}
