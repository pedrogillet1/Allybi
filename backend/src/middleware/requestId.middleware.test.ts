import type { NextFunction, Request, Response } from "express";
import { requestIdMiddleware } from "./requestId.middleware";

function createRes(): Response {
  return {
    locals: {},
    setHeader: jest.fn(),
  } as unknown as Response;
}

describe("requestIdMiddleware", () => {
  it("preserves valid incoming x-request-id", () => {
    const req = {
      headers: {
        "x-request-id": "req_test_12345",
      },
    } as unknown as Request;
    const res = createRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe("req_test_12345");
    expect(res.locals.requestId).toBe("req_test_12345");
    expect((res.setHeader as unknown as jest.Mock).mock.calls[0]).toEqual([
      "x-request-id",
      "req_test_12345",
    ]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("generates a request id when incoming header is invalid", () => {
    const req = {
      headers: {
        "x-request-id": "a",
      },
    } as unknown as Request;
    const res = createRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.locals.requestId).toBe(req.requestId);
    expect((res.setHeader as unknown as jest.Mock).mock.calls[0][0]).toBe(
      "x-request-id",
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
