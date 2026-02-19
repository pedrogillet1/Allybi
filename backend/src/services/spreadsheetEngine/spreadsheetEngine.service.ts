import { logger } from "../../infra/logger";
import {
  SpreadsheetEngineClient,
  SpreadsheetEngineClientError,
} from "./spreadsheetEngine.client";
import type {
  SpreadsheetEngineExecuteRequest,
  SpreadsheetEngineExecuteResponse,
  SpreadsheetEngineInsightRequest,
  SpreadsheetEngineInsightResponse,
  SpreadsheetEngineMode,
} from "./spreadsheetEngine.types";
import { coerceSpreadsheetEngineMode } from "./spreadsheetEngine.types";

export class SpreadsheetEngineService {
  private readonly client: SpreadsheetEngineClient;
  private readonly modeValue: SpreadsheetEngineMode;

  constructor(opts?: {
    client?: SpreadsheetEngineClient;
    mode?: SpreadsheetEngineMode;
  }) {
    this.modeValue =
      opts?.mode ??
      coerceSpreadsheetEngineMode(process.env.SPREADSHEET_ENGINE_MODE || "off");
    this.client = opts?.client ?? new SpreadsheetEngineClient();
  }

  mode(): SpreadsheetEngineMode {
    return this.modeValue;
  }

  enabled(): boolean {
    return this.modeValue !== "off";
  }

  async execute(
    req: SpreadsheetEngineExecuteRequest,
  ): Promise<SpreadsheetEngineExecuteResponse> {
    if (!this.enabled()) {
      throw new SpreadsheetEngineClientError("Spreadsheet engine mode is off", {
        code: "ENGINE_MODE_OFF",
        retryable: false,
      });
    }
    const response = await this.client.execute(req);
    logger.info("[SpreadsheetEngine] execute", {
      requestId: req.requestId,
      documentId: req.documentId,
      spreadsheetId: req.spreadsheetId,
      mode: this.modeValue,
      status: response.status,
      warnings: Array.isArray(response.warnings) ? response.warnings.length : 0,
      traceId: response.proof?.trace_id,
    });
    return response;
  }

  async insight(
    req: SpreadsheetEngineInsightRequest,
  ): Promise<SpreadsheetEngineInsightResponse> {
    if (!this.enabled()) {
      throw new SpreadsheetEngineClientError("Spreadsheet engine mode is off", {
        code: "ENGINE_MODE_OFF",
        retryable: false,
      });
    }
    const response = await this.client.insight(req);
    logger.info("[SpreadsheetEngine] insight", {
      requestId: req.requestId,
      documentId: req.documentId,
      spreadsheetId: req.spreadsheetId,
      mode: this.modeValue,
      status: response.status,
    });
    return response;
  }
}

export default SpreadsheetEngineService;
