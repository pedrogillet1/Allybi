import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import {
  SpreadsheetEngineClient,
  SpreadsheetEngineClientError,
} from "./spreadsheetEngine.client";

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const sampleRequest = {
  requestId: "req_1",
  documentId: "doc_1",
  userId: "user_1",
  correlationId: "corr_1",
  spreadsheetId: "sheet_1",
  ops: [{ kind: "set_values", rangeA1: "Sheet1!A1:A1", values: [[1]] }],
};

describe("SpreadsheetEngineClient", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test("retries retryable failures and succeeds", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "ok",
          workbook: { spreadsheet_id: "sheet_1" },
          applied_ops: [],
          artifacts: {},
          answer_context: {},
          proof: {
            engine_version: "1",
            provider: "py",
            timings_ms: 10,
            trace_id: "t_1",
          },
          warnings: [],
        }),
      );
    (global as any).fetch = fetchMock;

    const client = new SpreadsheetEngineClient({
      baseUrl: "http://unit.test",
      timeoutMs: 3000,
      maxRetries: 2,
      backoffBaseMs: 1,
      circuitBreakerThreshold: 10,
      circuitBreakerCooldownMs: 1000,
    });

    const response = await client.execute(sampleRequest as any);
    expect(response.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("opens circuit breaker after repeated failures", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("network down"));
    (global as any).fetch = fetchMock;

    const client = new SpreadsheetEngineClient({
      baseUrl: "http://unit.test",
      timeoutMs: 500,
      maxRetries: 0,
      circuitBreakerThreshold: 2,
      circuitBreakerCooldownMs: 60000,
    });

    await expect(client.execute(sampleRequest as any)).rejects.toBeInstanceOf(
      SpreadsheetEngineClientError,
    );
    await expect(client.execute(sampleRequest as any)).rejects.toBeInstanceOf(
      SpreadsheetEngineClientError,
    );
    await expect(client.execute(sampleRequest as any)).rejects.toMatchObject({
      code: "CIRCUIT_OPEN",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
