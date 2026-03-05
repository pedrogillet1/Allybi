import { describe, expect, jest, test } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

import { adminTelemetryLiveFeed } from "./adminTelemetry.controller";

type CloseHandler = (() => void) | null;

function makeReq(
  service: Record<string, unknown>,
  query: Record<string, unknown> = {},
): Request & { triggerClose: () => void } {
  let closeHandler: CloseHandler = null;
  const req = {
    app: {
      locals: {
        services: {
          adminTelemetryApp: service,
        },
      },
    },
    query,
    on: jest.fn((event: string, handler: () => void) => {
      if (event === "close") closeHandler = handler;
    }),
  } as unknown as Request & { triggerClose: () => void };
  req.triggerClose = () => {
    if (closeHandler) closeHandler();
  };
  return req;
}

function makeRes(): Response & {
  writes: string[];
  flushHeaders: jest.Mock;
  end: jest.Mock;
} {
  const writes: string[] = [];
  const res = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((payload: string) => {
      writes.push(payload);
      return true;
    }),
    end: jest.fn(),
    writes,
  } as unknown as Response & {
    writes: string[];
    flushHeaders: jest.Mock;
    end: jest.Mock;
  };
  return res;
}

function parseSseData(payload: string): Record<string, unknown> | null {
  const marker = "data: ";
  const start = payload.indexOf(marker);
  if (start < 0) return null;
  const line = payload.slice(start + marker.length).trim();
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe("adminTelemetryLiveFeed", () => {
  test("streams live query telemetry events instead of simulated random payloads", async () => {
    const queries = jest.fn(async () => ({
      items: [
        {
          id: "qt_1",
          traceId: "tr_live_1",
          query: "Show bank charges",
          userId: "user_1",
          domain: "banking",
          intent: "answer",
          createdAt: "2026-03-05T18:30:00.000Z",
          totalLatencyMs: 1240,
          retrievalMs: 340,
          llmMs: 700,
          hadFallback: false,
          providers: ["openai"],
          totalTokens: 412,
          totalCost: 0.015,
          evidenceStrength: 0.92,
          sourcesCount: 3,
          evidenceGateAction: "answer",
        },
      ],
      nextCursor: null,
    }));
    const req = makeReq({ queries }, { types: "llm" });
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    await adminTelemetryLiveFeed(req, res, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(queries).toHaveBeenCalledWith({ range: "1d", limit: 25 });
    const telemetryPayload = res.writes.find((payload) =>
      payload.startsWith("event: telemetry"),
    );
    expect(telemetryPayload).toBeDefined();
    const parsed = parseSseData(String(telemetryPayload));
    expect(parsed?.type).toBe("query.telemetry");
    expect(parsed?.correlationId).toBe("tr_live_1");
    expect(parsed?.category).toBe("llm");
    const data = (parsed?.data as Record<string, unknown>) || {};
    expect(data.source).toBe("queryTelemetry");
    expect(data.intent).toBe("answer");
    expect(data.totalMs).toBe(1240);
    expect(data.retrievalMs).toBe(340);
    expect(data.llmMs).toBe(700);
    expect(data.totalTokens).toBe(412);
    expect(data.totalCost).toBe(0.015);
    expect(data.evidenceStrength).toBe(0.92);
    expect(data.sourcesCount).toBe(3);
    expect(data.evidenceGateAction).toBe("answer");

    req.triggerClose();
    expect(res.end).toHaveBeenCalled();
  });
});
