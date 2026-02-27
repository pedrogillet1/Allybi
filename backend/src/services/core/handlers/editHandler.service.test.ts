import { describe, expect, test, jest } from "@jest/globals";
import { EditHandlerService } from "./editHandler.service";

function makeContext() {
  return {
    userId: "user_1",
    conversationId: "editing:docx:user_1",
    correlationId: "corr_1",
    clientMessageId: "msg_1",
    language: "en" as const,
  };
}

function makePlan(domain: "docx" | "sheets" = "docx") {
  return {
    operator: domain === "docx" ? "EDIT_PARAGRAPH" : "COMPUTE_BUNDLE",
    canonicalOperator:
      domain === "docx" ? "DOCX_REWRITE_PARAGRAPH" : "XLSX_SET_RANGE_VALUES",
    intentSource: "explicit_operator",
    domain,
    documentId: "doc_1",
    targetHint: "target",
    normalizedInstruction:
      domain === "docx" ? "rewrite this paragraph" : "set values",
    constraints: {
      preserveNumbers: false,
      preserveEntities: false,
      strictNoNewFacts: true,
      tone: "neutral",
      outputLanguage: "en",
      maxExpansionRatio: 2,
    },
    missingRequiredEntities: [],
    preserveTokens: [],
    diagnostics: {
      extractedEntities: [],
      extractedHints: [],
      checks: [],
    },
  } as any;
}

function makeTarget() {
  return {
    id: "docx:p:1",
    label: "Paragraph 1",
    confidence: 1,
    candidates: [],
    decisionMargin: 1,
    isAmbiguous: false,
    resolutionReason: "test",
  };
}

describe("EditHandlerService", () => {
  test("generates proposed text for docx preview when proposedText is missing", async () => {
    const handler = new EditHandlerService();
    const previewEdit = jest.fn().mockResolvedValue({
      ok: true,
      target: makeTarget(),
      diff: {
        kind: "paragraph",
        before: "Original text",
        after: "Generated rewrite",
        changed: true,
        summary: "Rewrite generated",
        changes: [],
      },
      rationale: {
        reasons: [],
        preserved: [],
        styleMatched: "neutral",
        riskLevel: "LOW",
        guardrails: [],
      },
      receipt: { stage: "preview", actions: [] },
      requiresConfirmation: false,
      similarityScore: 0.8,
    });

    (handler as any).orchestrator = {
      planEdit: jest
        .fn()
        .mockResolvedValue({ ok: true, plan: makePlan("docx") }),
      previewEdit,
      applyEdit: jest.fn(),
      undoEdit: jest.fn(),
    };
    (handler as any).supportContract = {
      evaluatePreApply: jest.fn().mockReturnValue({ ok: true }),
    };
    (handler as any).textGeneration = {
      generateProposedText: jest.fn().mockResolvedValue({
        ok: true,
        generated: true,
        proposedText: "Generated rewrite",
        taskId: "rewrite_paragraph",
      }),
    };

    const out = await handler.execute({
      mode: "preview",
      context: makeContext(),
      planRequest: {
        instruction: "rewrite this paragraph",
        operator: "EDIT_PARAGRAPH",
        domain: "docx",
        documentId: "doc_1",
      },
      target: makeTarget(),
      beforeText: "Original text",
    });

    expect(out.ok).toBe(true);
    expect(previewEdit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        proposedText: "Generated rewrite",
      }),
    );
  });

  test("returns generation error when generation fails", async () => {
    const handler = new EditHandlerService();
    (handler as any).orchestrator = {
      planEdit: jest
        .fn()
        .mockResolvedValue({ ok: true, plan: makePlan("docx") }),
      previewEdit: jest.fn(),
      applyEdit: jest.fn(),
      undoEdit: jest.fn(),
    };
    (handler as any).textGeneration = {
      generateProposedText: jest.fn().mockResolvedValue({
        ok: false,
        error: "LLM text generation unavailable.",
      }),
    };

    const out = await handler.execute({
      mode: "preview",
      context: makeContext(),
      planRequest: {
        instruction: "rewrite this paragraph",
        operator: "EDIT_PARAGRAPH",
        domain: "docx",
        documentId: "doc_1",
      },
      target: makeTarget(),
      beforeText: "Original text",
    });

    expect(out.ok).toBe(false);
    expect(out.error).toContain("LLM text generation unavailable");
  });

  test("fails when preview/apply beforeText is missing", async () => {
    const handler = new EditHandlerService();
    const out = await handler.execute({
      mode: "preview",
      context: makeContext(),
      planRequest: {
        instruction: "rewrite this paragraph",
        operator: "EDIT_PARAGRAPH",
        domain: "docx",
        documentId: "doc_1",
      },
      proposedText: "Edited text",
    });

    expect(out.ok).toBe(false);
    expect(out.error).toBe(
      "Preview/apply requires beforeText for this operator.",
    );
  });

  test("allows DOCX_FIND_REPLACE preview without beforeText", async () => {
    const handler = new EditHandlerService();
    const previewEdit = jest.fn().mockResolvedValue({
      ok: true,
      target: makeTarget(),
      diff: {
        kind: "paragraph",
        before: "",
        after: '{"patches":[{"kind":"docx_find_replace"}]}',
        changed: true,
        summary: "Find/replace prepared",
        changes: [],
      },
      rationale: {
        reasons: [],
        preserved: [],
        styleMatched: "neutral",
        riskLevel: "LOW",
        guardrails: [],
      },
      receipt: { stage: "preview", actions: [] },
      requiresConfirmation: false,
      similarityScore: 1,
    });

    (handler as any).orchestrator = {
      planEdit: jest.fn().mockResolvedValue({
        ok: true,
        plan: {
          ...makePlan("docx"),
          operator: "EDIT_DOCX_BUNDLE",
          canonicalOperator: "DOCX_FIND_REPLACE",
          normalizedInstruction: 'replace "old" with "new"',
        },
      }),
      previewEdit,
      applyEdit: jest.fn(),
      undoEdit: jest.fn(),
    };
    (handler as any).supportContract = {
      evaluatePreApply: jest.fn().mockReturnValue({ ok: true }),
    };
    (handler as any).textGeneration = {
      generateProposedText: jest.fn().mockResolvedValue({
        ok: true,
        generated: true,
        proposedText:
          '{"patches":[{"kind":"docx_find_replace","findText":"old","replaceText":"new"}]}',
      }),
    };

    const out = await handler.execute({
      mode: "preview",
      context: makeContext(),
      planRequest: {
        instruction: 'replace "old" with "new"',
        operator: "EDIT_DOCX_BUNDLE",
        domain: "docx",
        documentId: "doc_1",
        canonicalOperator: "DOCX_FIND_REPLACE",
      },
      target: makeTarget(),
    } as any);

    expect(out.ok).toBe(true);
    expect(previewEdit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        beforeText: "",
      }),
    );
  });
});
