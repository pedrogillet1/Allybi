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

  test("includes user warning payload in final SSE envelope", () => {
    const event = toChatFinalEvent({
      conversationId: "conv-2",
      userMessageId: "user-2",
      assistantMessageId: "assistant-2",
      assistantText: "partial answer",
      answerMode: "doc_grounded_single",
      sources: [{ documentId: "doc-1", filename: "report.pdf", mimeType: "application/pdf", page: 1 }],
      userWarning: {
        code: "quality_gate_blocked",
        message: "Not all quality checks passed. Please verify key points against the sources.",
        severity: "warning",
        source: "quality_gate",
      },
      warnings: [
        {
          code: "quality_gate_blocked",
          message:
            "Not all quality checks passed. Please verify key points against the sources.",
          severity: "warning",
          source: "quality_gate",
        },
      ],
    } as any);

    expect((event as any).userWarning).toEqual({
      code: "quality_gate_blocked",
      message:
        "Not all quality checks passed. Please verify key points against the sources.",
      severity: "warning",
      source: "quality_gate",
    });
    expect((event as any).warnings).toEqual([
      {
        code: "quality_gate_blocked",
        message:
          "Not all quality checks passed. Please verify key points against the sources.",
        severity: "warning",
        source: "quality_gate",
      },
    ]);
  });

  test("derives rich sources from source_buttons when explicit sources are missing", () => {
    const event = toChatFinalEvent({
      conversationId: "conv-3",
      userMessageId: "user-3",
      assistantMessageId: "assistant-3",
      assistantText: "ok",
      answerMode: "doc_grounded_single",
      attachmentsPayload: [
        {
          type: "source_buttons",
          buttons: [
            {
              documentId: "doc-123",
              title: "report.pdf",
              locationKey: "d:doc-123|p:4|sec:chunk_4",
              snippet: "Quoted evidence",
            },
          ],
        },
      ],
    } as any);

    expect((event as any).sources).toEqual([
      expect.objectContaining({
        documentId: "doc-123",
        docId: "doc-123",
        filename: "report.pdf",
        locationKey: "d:doc-123|p:4|sec:chunk_4",
        page: 4,
        section: "chunk_4",
        snippet: "Quoted evidence",
      }),
    ]);
  });
});
