import { afterEach, describe, expect, jest, test } from "@jest/globals";

const originalFlag = process.env.RETRIEVAL_V2_VECTOR_EMBEDDING;
const originalAllowedMode = process.env.INDEXING_RUNTIME_MODE_ALLOWED;

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  if (originalFlag === undefined) delete process.env.RETRIEVAL_V2_VECTOR_EMBEDDING;
  else process.env.RETRIEVAL_V2_VECTOR_EMBEDDING = originalFlag;
  if (originalAllowedMode === undefined) delete process.env.INDEXING_RUNTIME_MODE_ALLOWED;
  else process.env.INDEXING_RUNTIME_MODE_ALLOWED = originalAllowedMode;
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
    expect(mod.vectorEmbeddingRuntimeMetadata).toEqual({
      flag: "RETRIEVAL_V2_VECTOR_EMBEDDING",
      mode: "v1",
      modeAllowed: true,
      allowedModes: ["v1", "v2"],
      modeAllowedEnv: "INDEXING_RUNTIME_MODE_ALLOWED",
    });
    expect(mod.getVectorEmbeddingRuntimeMetadata()).toEqual(
      mod.vectorEmbeddingRuntimeMetadata,
    );
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
    expect(mod.vectorEmbeddingRuntimeMetadata).toEqual({
      flag: "RETRIEVAL_V2_VECTOR_EMBEDDING",
      mode: "v2",
      modeAllowed: true,
      allowedModes: ["v1", "v2"],
      modeAllowedEnv: "INDEXING_RUNTIME_MODE_ALLOWED",
    });
  });

  test("marks mode as disallowed when policy blocks selected runtime", async () => {
    delete process.env.RETRIEVAL_V2_VECTOR_EMBEDDING;
    process.env.INDEXING_RUNTIME_MODE_ALLOWED = "v2";

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
    expect(mod.vectorEmbeddingRuntimeMetadata.modeAllowed).toBe(false);
    expect(mod.vectorEmbeddingRuntimeMetadata.allowedModes).toEqual(["v2"]);
  });
});
