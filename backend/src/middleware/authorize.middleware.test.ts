import type { Request, Response } from "express";
import { authorizeByMethod } from "./authorize.middleware";

function makeRes() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json } as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe("authorizeByMethod middleware", () => {
  it("returns 401 when user context is missing", () => {
    const middleware = authorizeByMethod("documents");
    const req = { method: "GET", user: undefined } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when role lacks permission", () => {
    const middleware = authorizeByMethod("editing");
    const req = {
      method: "POST",
      user: { id: "u1", role: "viewer" },
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when role has permission", () => {
    const middleware = authorizeByMethod("chat");
    const req = {
      method: "POST",
      user: { id: "u1", role: "user" },
    } as unknown as Request;
    const res = makeRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
