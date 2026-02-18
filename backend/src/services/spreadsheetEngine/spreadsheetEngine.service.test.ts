import { describe, expect, test } from "@jest/globals";
import { SpreadsheetEngineClientError } from "./spreadsheetEngine.client";
import { SpreadsheetEngineService } from "./spreadsheetEngine.service";
import { coerceSpreadsheetEngineMode } from "./spreadsheetEngine.types";

describe("SpreadsheetEngine mode coercion", () => {
  test("supports enforced and shadow and defaults to off", () => {
    expect(coerceSpreadsheetEngineMode("enforced")).toBe("enforced");
    expect(coerceSpreadsheetEngineMode("shadow")).toBe("shadow");
    expect(coerceSpreadsheetEngineMode("OFF")).toBe("off");
    expect(coerceSpreadsheetEngineMode("unknown")).toBe("off");
  });
});

describe("SpreadsheetEngineService", () => {
  test("throws when mode is off", async () => {
    const svc = new SpreadsheetEngineService({
      mode: "off",
      client: {
        execute: jest.fn(),
        insight: jest.fn(),
      } as any,
    });

    await expect(
      svc.execute({
        requestId: "req-1",
        documentId: "doc-1",
        userId: "user-1",
        correlationId: "corr-1",
        spreadsheetId: "sheet-1",
        ops: [{ kind: "set_values", rangeA1: "Sheet1!A1", values: [[1]] }],
      }),
    ).rejects.toBeInstanceOf(SpreadsheetEngineClientError);
  });

  test("delegates to client in enforced mode", async () => {
    const response = {
      status: "ok",
      workbook: { spreadsheet_id: "sheet-1" },
      applied_ops: [{ index: 0, kind: "set_values", status: "applied" }],
      artifacts: { affectedRanges: ["Sheet1!A1"] },
      answer_context: {},
      proof: {
        engine_version: "0.1.0",
        provider: "google_sheets",
        timings_ms: 5,
        trace_id: "trace-1",
      },
      warnings: [],
    };

    const execute = jest.fn().mockResolvedValue(response);
    const svc = new SpreadsheetEngineService({
      mode: "enforced",
      client: {
        execute,
        insight: jest.fn(),
      } as any,
    });

    const out = await svc.execute({
      requestId: "req-1",
      documentId: "doc-1",
      userId: "user-1",
      correlationId: "corr-1",
      spreadsheetId: "sheet-1",
      ops: [{ kind: "set_values", rangeA1: "Sheet1!A1", values: [[1]] }],
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("ok");
    expect(out.workbook.spreadsheet_id).toBe("sheet-1");
  });
});
