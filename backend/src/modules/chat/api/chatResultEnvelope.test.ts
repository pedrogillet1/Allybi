import { describe, expect, test } from "@jest/globals";
import { toChatFinalEvent } from "./chatResultEnvelope";

describe("chatResultEnvelope", () => {
  test("includes assistant telemetry in final SSE envelope", () => {
    const event = toChatFinalEvent({
      conversationId: "conv-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      assistantText: "ok",
      answerMode: "general_answer",
      sources: [],
      assistantTelemetry: {
        model: "gemini-2.5-flash",
        finishReason: "length",
        requestedMaxOutputTokens: 889,
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
        },
      },
    } as any);

    expect((event as any).assistantTelemetry).toEqual({
      model: "gemini-2.5-flash",
      finishReason: "length",
      requestedMaxOutputTokens: 889,
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
    });
  });
});
