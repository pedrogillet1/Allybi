import { describe, expect, test, jest } from "@jest/globals";
import { EditOrchestratorService } from "./editOrchestrator.service";
import type { EditPlan } from "./editing.types";

const ctx = {
  userId: "user_1",
  conversationId: "conv_1",
  correlationId: "corr_1",
  clientMessageId: "msg_1",
  language: "en" as const,
};

const plan: EditPlan = {
  operator: "EDIT_PARAGRAPH",
  domain: "docx",
  documentId: "doc_1",
  normalizedInstruction: "rewrite this paragraph",
  constraints: {
    preserveNumbers: true,
    preserveEntities: true,
    strictNoNewFacts: true,
    tone: "neutral",
    outputLanguage: "en",
    maxExpansionRatio: 2.2,
  },
  missingRequiredEntities: [],
  preserveTokens: [],
  diagnostics: {
    extractedEntities: [],
    extractedHints: ["rewrite"],
    checks: [{ id: "instruction_non_empty", pass: true }],
  },
};

describe("EditOrchestratorService stale-plan protections", () => {
  test("returns apply failure when revision store requests replan", async () => {
    const revisionStore = {
      createRevision: jest
        .fn()
        .mockRejectedValue(new Error("REPLAN_REQUIRED: document changed since plan.")),
      undoToRevision: jest.fn(),
    };

    const orchestrator = new EditOrchestratorService({
      revisionStore: revisionStore as any,
    });

    const out = await orchestrator.applyEdit(ctx, {
      plan,
      target: {
        id: "docx:p:1",
        label: "Paragraph 1",
        confidence: 0.99,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: "viewer_selection",
      },
      beforeText: "Old text",
      proposedText: "New text",
      userConfirmed: true,
      idempotencyKey: "idem-1",
      expectedDocumentUpdatedAtIso: "2026-02-11T10:00:00.000Z",
      expectedDocumentFileHash: "hash-123",
    });

    expect(out.ok).toBe(false);
    expect(out.applied).toBe(false);
    expect(String(out.error || "")).toContain("REPLAN_REQUIRED");
    expect(revisionStore.createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "idem-1",
        expectedDocumentUpdatedAtIso: "2026-02-11T10:00:00.000Z",
        expectedDocumentFileHash: "hash-123",
      }),
    );
  });
});

