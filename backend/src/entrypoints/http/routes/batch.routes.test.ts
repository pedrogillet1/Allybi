import { beforeEach, describe, expect, jest, test } from "@jest/globals";

jest.mock("../../../middleware/auth.middleware", () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import router from "./batch.routes";

function makeRes() {
  return {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function getInitialDataHandler() {
  const layer = (router as any).stack.find(
    (entry: any) => entry?.route?.path === "/initial-data",
  );
  if (!layer) throw new Error("Missing /initial-data route");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe("batch routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when user is missing", async () => {
    const handler = getInitialDataHandler();
    const req: any = {
      user: null,
      app: { locals: { services: {} } },
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "Not authenticated" });
  });

  test("returns initial data and stats", async () => {
    const handler = getInitialDataHandler();
    const documents = [{ id: "doc-1" }, { id: "doc-2" }];
    const folders = [{ id: "folder-1" }];

    const req: any = {
      user: { id: "user-1" },
      app: {
        locals: {
          services: {
            documents: {
              list: jest.fn().mockResolvedValue({ items: documents }),
            },
            folders: {
              list: jest.fn().mockResolvedValue({ items: folders }),
            },
          },
        },
      },
    };
    const res = makeRes();

    await handler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      data: {
        documents,
        folders,
        stats: {
          totalDocuments: 2,
          totalFolders: 1,
        },
      },
    });
    expect(res.headers["Cache-Control"]).toContain("no-store");
  });
});
