import { afterEach, describe, expect, jest, test } from "@jest/globals";

const originalFlag = process.env.RETRIEVAL_V2_VECTOR_EMBEDDING;

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  if (originalFlag === undefined) delete process.env.RETRIEVAL_V2_VECTOR_EMBEDDING;
  else process.env.RETRIEVAL_V2_VECTOR_EMBEDDING = originalFlag;
});

describe("vectorEmbedding runtime selector", () => {
  test("uses v1 implementation by default", async () => {
    delete process.env.RETRIEVAL_V2_VECTOR_EMBEDDING;

    jest.doMock("./vectorEmbedding.service", () => ({
      __esModule: true,
      default: { runtime: "v1" },
    }));
    jest.doMock("./vectorEmbedding.v2.service", () => ({
      __esModule: true,
      default: { runtime: "v2" },
    }));

    const mod = await import("./vectorEmbedding.runtime.service");
    expect((mod.default as any).runtime).toBe("v1");
  });

  test("uses v2 implementation when flag is enabled", async () => {
    process.env.RETRIEVAL_V2_VECTOR_EMBEDDING = "1";

    jest.doMock("./vectorEmbedding.service", () => ({
      __esModule: true,
      default: { runtime: "v1" },
    }));
    jest.doMock("./vectorEmbedding.v2.service", () => ({
      __esModule: true,
      default: { runtime: "v2" },
    }));

    const mod = await import("./vectorEmbedding.runtime.service");
    expect((mod.default as any).runtime).toBe("v2");
  });
});
