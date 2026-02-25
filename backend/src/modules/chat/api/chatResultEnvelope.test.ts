import { toChatFinalEvent } from "./chatResultEnvelope";

describe("toChatFinalEvent", () => {
  it("includes traceId in final SSE payload", () => {
    const payload = toChatFinalEvent({
      conversationId: "c1",
      userMessageId: "u1",
      assistantMessageId: "a1",
      traceId: "tr_abc12345",
      assistantText: "hello",
      sources: [],
    });

    expect(payload).toMatchObject({
      type: "final",
      conversationId: "c1",
      messageId: "a1",
      traceId: "tr_abc12345",
      content: "hello",
    });
  });
});
