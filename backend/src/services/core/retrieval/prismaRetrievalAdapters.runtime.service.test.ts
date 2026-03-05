import { afterEach, describe, expect, jest, test } from "@jest/globals";

const originalFlag = process.env.RETRIEVAL_V2_PRISMA_ADAPTERS;

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  if (originalFlag === undefined) delete process.env.RETRIEVAL_V2_PRISMA_ADAPTERS;
  else process.env.RETRIEVAL_V2_PRISMA_ADAPTERS = originalFlag;
});

describe("prisma retrieval adapters runtime selector", () => {
  test("uses v1 adapter factory by default", async () => {
    delete process.env.RETRIEVAL_V2_PRISMA_ADAPTERS;

    class FactoryV1 {}
    class FactoryV2 {}

    jest.doMock("./prismaRetrievalAdapters.service", () => ({
      PrismaRetrievalAdapterFactory: FactoryV1,
    }));
    jest.doMock("./prismaRetrievalAdapters.v2.service", () => ({
      PrismaRetrievalAdapterFactoryV2: FactoryV2,
    }));

    const mod = await import("./prismaRetrievalAdapters.runtime.service");
    expect(mod.PrismaRetrievalAdapterFactory).toBe(FactoryV1);
    expect(mod.prismaRetrievalRuntimeMetadata).toEqual({
      flag: "RETRIEVAL_V2_PRISMA_ADAPTERS",
      mode: "v1",
    });
    expect(mod.getPrismaRetrievalRuntimeMetadata()).toEqual(
      mod.prismaRetrievalRuntimeMetadata,
    );
  });

  test("uses v2 adapter factory when flag is enabled", async () => {
    process.env.RETRIEVAL_V2_PRISMA_ADAPTERS = "true";

    class FactoryV1 {}
    class FactoryV2 {}

    jest.doMock("./prismaRetrievalAdapters.service", () => ({
      PrismaRetrievalAdapterFactory: FactoryV1,
    }));
    jest.doMock("./prismaRetrievalAdapters.v2.service", () => ({
      PrismaRetrievalAdapterFactoryV2: FactoryV2,
    }));

    const mod = await import("./prismaRetrievalAdapters.runtime.service");
    expect(mod.PrismaRetrievalAdapterFactory).toBe(FactoryV2);
    expect(mod.prismaRetrievalRuntimeMetadata).toEqual({
      flag: "RETRIEVAL_V2_PRISMA_ADAPTERS",
      mode: "v2",
    });
  });
});
