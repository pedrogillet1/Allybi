import { describe, expect, test, jest } from "@jest/globals";

import { TelemetryLLMClient } from "./telemetryLlmClient.decorator";
import type {
  LLMClient,
  LLMCompletionResponse,
  LLMRequest,
  LLMStreamResponse,
} from "./llmClient.interface";

function makeRequest(): LLMRequest {
  return {
    traceId: "trace-1",
    turnId: "turn-1",
    model: { provider: "openai", model: "gpt-5.2" },
    purpose: "answer_compose",
    messages: [{ role: "user", content: "hello" }],
    meta: {
      userId: "user-1",
      routingDecision: {
        route: "KNOWLEDGE",
        locale: "en",
        intentFamily: "documents",
        operator: "extract",
        followupSource: "none",
        followupReasonCodes: [
          "followup_overlay_patterns_missing",
          "followup_overlay_patterns_missing_en",
        ],
      },
    },
  };
}

describe("TelemetryLLMClient routing metadata mapping", () => {
  test("emits structured followup degradation telemetry fields from routingDecision", async () => {
    const completeResult: LLMCompletionResponse = {
      traceId: "trace-1",
      turnId: "turn-1",
      model: { provider: "openai", model: "gpt-5.2" },
      content: "ok",
      usage: {
        promptTokens: 10,
        completionTokens: 8,
        totalTokens: 18,
      },
    };
    const inner: LLMClient = {
      provider: "openai",
      complete: jest.fn(async () => completeResult),
      stream: jest.fn(async () => {
        const streamResult: LLMStreamResponse = {
          traceId: "trace-1",
          turnId: "turn-1",
          model: { provider: "openai", model: "gpt-5.2" },
          finalText: "ok",
        };
        return streamResult;
      }),
    };
    const telemetry = {
      logModelCall: jest.fn(),
    };

    const client = new TelemetryLLMClient(inner, telemetry as any);
    await client.complete(makeRequest());

    expect(telemetry.logModelCall).toHaveBeenCalledTimes(1);
    const payload = telemetry.logModelCall.mock.calls[0][0] as {
      meta?: Record<string, unknown>;
    };
    expect(payload.meta).toEqual(
      expect.objectContaining({
        routingFollowupSource: "none",
        routingFollowupReasonCodes:
          "followup_overlay_patterns_missing,followup_overlay_patterns_missing_en",
        routingFollowupDegraded: true,
      }),
    );
  });
});
