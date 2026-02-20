import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSharpStats = jest.fn();

jest.mock("sharp", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    stats: (...args: unknown[]) => mockSharpStats(...args),
  })),
}));

describe("CreativeOrchestratorService", () => {
  beforeEach(() => {
    mockSharpStats.mockReset();
  });

  it("propagates explicit insertion targets and supports dominant-color fallback", async () => {
    const { CreativeOrchestratorService } = await import(
      "./creativeOrchestrator.service"
    );
    mockSharpStats.mockResolvedValueOnce({ dominant: null });

    const qualityGate = {
      evaluate: jest.fn(() => ({ pass: true, issues: [] })),
    };
    const provenance = {
      logEvent: jest.fn(async () => ({ id: "prov-1" })),
      buildProof: jest.fn(() => ({ proofId: "proof-1" })),
    };

    const service = new CreativeOrchestratorService(
      { extractAndStore: async () => ({ tone: "modern" }) } as any,
      {
        build: () => ({
          systemPrompt: "system",
          userPrompt: "user",
          negativePrompt: "negative",
          audit: {},
        }),
      } as any,
      {
        generate: async () => ({
          imageBuffer: Buffer.from("image"),
          model: "nano-banana",
          providerRequestId: "run-3",
        }),
      } as any,
      {
        render: async () => ({
          primary: {
            buffer: Buffer.from("rendered"),
            width: 100,
            height: 80,
            byteSize: 1000,
            mimeType: "image/png",
            sha256: "sha",
          },
          thumbnail: {
            buffer: Buffer.from("thumb"),
          },
        }),
      } as any,
      qualityGate as any,
      { store: async () => ({ id: "asset-1" }) } as any,
      provenance as any,
    );

    await service.generateAssets({
      userId: "u1",
      documentId: "d1",
      presentationId: "p1",
      language: "en",
      blueprint: { slideGoal: "Executive summary" } as any,
      assets: [
        {
          id: "hero",
          type: "illustration",
          size: { width: 100, height: 80 },
          styleMode: "brand_consistent",
          backgroundMode: "transparent",
        } as any,
      ],
      insertionTargets: [{ documentId: "d1", slideNumber: 3 }],
    });

    expect(qualityGate.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        rendered: expect.objectContaining({ dominantColors: [] }),
      }),
    );
    expect(provenance.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        inserted: [{ documentId: "d1", slideNumber: 3 }],
      }),
      undefined,
    );
  });

  it("runs the end-to-end creative pipeline when quality gate passes", async () => {
    const { CreativeOrchestratorService } = await import(
      "./creativeOrchestrator.service"
    );
    mockSharpStats.mockResolvedValue({
      dominant: { r: 10, g: 20, b: 30 },
    });

    const styleDNAService = {
      extractAndStore: jest.fn(async () => ({ tone: "modern" })),
    };
    const promptBuilder = {
      build: jest.fn(() => ({
        systemPrompt: "system",
        userPrompt: "user",
        negativePrompt: "negative",
        audit: { promptVersion: "v1" },
      })),
    };
    const nanoBananaClient = {
      generate: jest.fn(async () => ({
        imageBuffer: Buffer.from("image"),
        model: "nano-banana",
        providerRequestId: "run-1",
      })),
    };
    const renderer = {
      render: jest.fn(async () => ({
        primary: {
          buffer: Buffer.from("rendered"),
          width: 100,
          height: 80,
          byteSize: 1000,
          mimeType: "image/png",
          sha256: "sha",
        },
        thumbnail: {
          buffer: Buffer.from("thumb"),
        },
      })),
    };
    const qualityGate = {
      evaluate: jest.fn(() => ({ pass: true, issues: [] })),
    };
    const assetLibrary = {
      store: jest.fn(async () => ({ id: "asset-1" })),
    };
    const provenance = {
      logEvent: jest.fn(async () => ({ id: "prov-1" })),
      buildProof: jest.fn(() => ({ proofId: "proof-1" })),
    };

    const service = new CreativeOrchestratorService(
      styleDNAService as any,
      promptBuilder as any,
      nanoBananaClient as any,
      renderer as any,
      qualityGate as any,
      assetLibrary as any,
      provenance as any,
    );

    const result = await service.generateAssets({
      userId: "u1",
      documentId: "d1",
      presentationId: "p1",
      language: "en",
      blueprint: {
        slideGoal: "Executive summary",
      } as any,
      assets: [
        {
          id: "hero",
          type: "illustration",
          size: { width: 100, height: 80 },
          styleMode: "brand_consistent",
          backgroundMode: "transparent",
        } as any,
      ],
    });

    expect(result.items).toHaveLength(1);
    expect(assetLibrary.store).toHaveBeenCalledTimes(1);
    expect(provenance.logEvent).toHaveBeenCalledTimes(1);
  });

  it("throws when quality gate fails", async () => {
    const { CreativeOrchestratorService } = await import(
      "./creativeOrchestrator.service"
    );
    mockSharpStats.mockResolvedValue({
      dominant: { r: 10, g: 20, b: 30 },
    });

    const service = new CreativeOrchestratorService(
      { extractAndStore: async () => ({ tone: "modern" }) } as any,
      {
        build: () => ({
          systemPrompt: "system",
          userPrompt: "user",
          negativePrompt: "negative",
          audit: {},
        }),
      } as any,
      {
        generate: async () => ({
          imageBuffer: Buffer.from("image"),
          model: "nano-banana",
          providerRequestId: "run-2",
        }),
      } as any,
      {
        render: async () => ({
          primary: {
            buffer: Buffer.from("rendered"),
            width: 100,
            height: 80,
            byteSize: 1000,
            mimeType: "image/png",
            sha256: "sha",
          },
          thumbnail: {
            buffer: Buffer.from("thumb"),
          },
        }),
      } as any,
      {
        evaluate: () => ({ pass: false, issues: [{ code: "low_quality" }] }),
      } as any,
      { store: async () => ({ id: "asset-1" }) } as any,
      {
        logEvent: async () => ({ id: "prov-1" }),
        buildProof: () => ({ proofId: "proof-1" }),
      } as any,
    );

    await expect(
      service.generateAssets({
        userId: "u1",
        documentId: "d1",
        presentationId: "p1",
        language: "en",
        blueprint: {
          slideGoal: "Executive summary",
        } as any,
        assets: [
          {
            id: "hero",
            type: "illustration",
            size: { width: 100, height: 80 },
            styleMode: "brand_consistent",
            backgroundMode: "transparent",
          } as any,
        ],
      }),
    ).rejects.toThrow(/Creative quality gate failed/);
  });
});
