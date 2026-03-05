import { describe, expect, jest, test } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import {
  adminTelemetryRegenerationRate,
  adminTelemetryTruncationRate,
} from "./adminTelemetry.controller";

function makeReq(service: Record<string, unknown>, range?: string): Request {
  return {
    app: {
      locals: {
        services: {
          adminTelemetryApp: service,
        },
      },
    },
    query: range ? { range } : {},
  } as unknown as Request;
}

function makeRes(): Response & { body?: unknown } {
  const res = {
    json: jest.fn(),
  } as unknown as Response & { body?: unknown };
  (res.json as unknown as jest.Mock).mockImplementation((payload: unknown) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe("adminTelemetry.controller quality metrics", () => {
  test("adminTelemetryTruncationRate delegates to app service and returns payload", async () => {
    const truncationRate = jest.fn(async () => ({
      truncationRate: 12.5,
      truncatedCount: 5,
      totalQueries: 40,
      thresholdMaxPct: 15,
    }));
    const req = makeReq({ truncationRate }, "30d");
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    await adminTelemetryTruncationRate(req, res, next);

    expect(truncationRate).toHaveBeenCalledWith({ range: "30d" });
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      range: "30d",
      data: {
        truncationRate: 12.5,
        truncatedCount: 5,
        totalQueries: 40,
        thresholdMaxPct: 15,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("adminTelemetryRegenerationRate delegates to app service and returns payload", async () => {
    const regenerationRate = jest.fn(async () => ({
      regenerationRate: 9.4,
      regenerateCount: 47,
      totalMessages: 500,
      thresholdMaxPct: 25,
    }));
    const req = makeReq({ regenerationRate });
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    await adminTelemetryRegenerationRate(req, res, next);

    expect(regenerationRate).toHaveBeenCalledWith({ range: "7d" });
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      range: "7d",
      data: {
        regenerationRate: 9.4,
        regenerateCount: 47,
        totalMessages: 500,
        thresholdMaxPct: 25,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
