import { describe, expect, it, jest } from "@jest/globals";
import { LLMChatEngine } from "./llmChatEngine";

describe("LLMChatEngine", () => {
  it("forwards structured evidencePack to gateway generate", async () => {
    const gateway = {
      generate: jest.fn(async () => ({
        text: "ok",
        telemetry: {},
        promptTrace: {
          promptIds: [],
          promptVersions: [],
          promptHashes: [],
          promptTemplateIds: [],
        },
      })),
      stream: jest.fn(),
    } as any;

    const engine = new LLMChatEngine(gateway);
    const evidencePack = {
      query: { original: "q", normalized: "q" },
      evidence: [
        {
          docId: "doc-1",
          locationKey: "loc-1",
          snippet: "snippet",
          evidenceType: "text",
        },
      ],
    };

    await engine.generate({
      traceId: "tr1",
      userId: "u1",
      conversationId: "c1",
      messages: [{ role: "user", content: "hello" }],
      evidencePack,
    } as any);

    expect(gateway.generate).toHaveBeenCalledTimes(1);
    expect(gateway.generate.mock.calls[0][0].evidencePack).toEqual(
      evidencePack,
    );
  });
});
