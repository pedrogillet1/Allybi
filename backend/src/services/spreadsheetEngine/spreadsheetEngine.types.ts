export type SpreadsheetEngineMode = "off" | "shadow" | "enforced";

export interface SpreadsheetEngineContext {
  activeSheetName?: string | null;
  selectionRangeA1?: string | null;
  language?: string | null;
  conversationId?: string | null;
}

export interface SpreadsheetEngineOp {
  kind: string;
  [key: string]: unknown;
}

export interface SpreadsheetEngineExecuteRequest {
  requestId: string;
  documentId: string;
  userId: string;
  correlationId: string;
  spreadsheetId: string;
  ops: SpreadsheetEngineOp[];
  context?: SpreadsheetEngineContext;
  options?: Record<string, unknown>;
}

export interface SpreadsheetEngineAppliedOpStatus {
  index: number;
  kind: string;
  status: "applied" | "failed" | string;
  message?: string;
}

export interface SpreadsheetEngineExecuteResponse {
  status: "ok" | "partial" | "failed" | string;
  workbook: {
    spreadsheet_id: string;
  };
  applied_ops: SpreadsheetEngineAppliedOpStatus[];
  artifacts: Record<string, unknown>;
  answer_context: Record<string, unknown>;
  proof: {
    engine_version: string;
    provider: string;
    timings_ms: number;
    trace_id: string;
  };
  warnings: string[];
}

export interface SpreadsheetEngineInsightRequest {
  requestId: string;
  documentId: string;
  userId: string;
  correlationId: string;
  spreadsheetId: string;
  ranges: string[];
  language?: string | null;
}

export interface SpreadsheetEngineInsightResponse {
  status: string;
  answer_context: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  proof: Record<string, unknown>;
  warnings: string[];
}

export function coerceSpreadsheetEngineMode(raw: unknown): SpreadsheetEngineMode {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "enforced") return "enforced";
  if (mode === "shadow") return "shadow";
  return "off";
}
