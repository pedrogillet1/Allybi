import { afterEach, describe, expect, jest, test } from "@jest/globals";

const originalFlag = process.env.RETRIEVAL_V2_ENGINE;

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  if (originalFlag === undefined) delete process.env.RETRIEVAL_V2_ENGINE;
  else process.env.RETRIEVAL_V2_ENGINE = originalFlag;
});

describe("retrieval engine runtime selector", () => {
  test("uses v1 engine by default", async () => {
    delete process.env.RETRIEVAL_V2_ENGINE;

    class EngineV1 {}
    class EngineV2 {}
    class ScopeViolationError extends Error {}

    jest.doMock("./retrievalEngine.service", () => ({
      RetrievalEngineService: EngineV1,
      RetrievalScopeViolationError: ScopeViolationError,
    }));
    jest.doMock("./retrievalEngine.v2.service", () => ({
      RetrievalEngineServiceV2: EngineV2,
    }));

    const mod = await import("./retrievalEngine.runtime.service");
    expect(mod.RetrievalEngineService).toBe(EngineV1);
    expect(mod.RetrievalScopeViolationError).toBe(ScopeViolationError);
    expect(mod.retrievalEngineRuntimeMetadata).toEqual({
      flag: "RETRIEVAL_V2_ENGINE",
      mode: "v1",
    });
    expect(mod.getRetrievalEngineRuntimeMetadata()).toEqual(
      mod.retrievalEngineRuntimeMetadata,
    );
  });

  test("uses v2 engine when flag is enabled", async () => {
    process.env.RETRIEVAL_V2_ENGINE = "1";

    class EngineV1 {}
    class EngineV2 {}
    class ScopeViolationError extends Error {}

    jest.doMock("./retrievalEngine.service", () => ({
      RetrievalEngineService: EngineV1,
      RetrievalScopeViolationError: ScopeViolationError,
    }));
    jest.doMock("./retrievalEngine.v2.service", () => ({
      RetrievalEngineServiceV2: EngineV2,
    }));

    const mod = await import("./retrievalEngine.runtime.service");
    expect(mod.RetrievalEngineService).toBe(EngineV2);
    expect(mod.RetrievalScopeViolationError).toBe(ScopeViolationError);
    expect(mod.retrievalEngineRuntimeMetadata).toEqual({
      flag: "RETRIEVAL_V2_ENGINE",
      mode: "v2",
    });
  });
});
