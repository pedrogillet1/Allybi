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

describe("EditOrchestratorService apply proof", () => {
  test("includes range + changedCellsCount proof for XLSX bundle edits", async () => {
    const revisionStore = {
      createRevision: jest.fn().mockResolvedValue({
        revisionId: "rev_x_1",
        fileHashBefore: "hash_before",
        fileHashAfter: "hash_after",
      }),
      undoToRevision: jest.fn(),
    };

    const orchestrator = new EditOrchestratorService({
      revisionStore: revisionStore as any,
    });

    const plan: EditPlan = {
      operator: "COMPUTE_BUNDLE",
      domain: "sheets",
      documentId: "doc_sheet_1",
      normalizedInstruction: "set selected range to 0",
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
        extractedHints: ["set", "range"],
        checks: [{ id: "instruction_non_empty", pass: true }],
      },
    };

    const out = await orchestrator.applyEdit(ctx, {
      plan,
      target: {
        id: "SUMMARY 1!D35:D48",
        label: "SUMMARY 1!D35:D48",
        confidence: 0.99,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: "viewer_selection",
      },
      beforeText: "old",
      proposedText: JSON.stringify({
        ops: [{ kind: "set_value", rangeA1: "SUMMARY 1!D35:D48", value: 0 }],
      }),
      userConfirmed: true,
    });

    expect(out.ok).toBe(true);
    expect(out.applied).toBe(true);
    expect(out.proof?.verified).toBe(true);
    expect(out.proof?.fileHashBefore).toBe("hash_before");
    expect(out.proof?.fileHashAfter).toBe("hash_after");
    expect(out.proof?.affectedRanges).toContain("SUMMARY 1!D35:D48");
    expect(Number(out.proof?.changedCellsCount || 0)).toBeGreaterThanOrEqual(14);
  });

  test("includes paragraph target proof for DOCX bundles", async () => {
    const revisionStore = {
      createRevision: jest.fn().mockResolvedValue({
        revisionId: "rev_d_1",
        fileHashBefore: "doc_before",
        fileHashAfter: "doc_after",
      }),
      undoToRevision: jest.fn(),
    };

    const orchestrator = new EditOrchestratorService({
      revisionStore: revisionStore as any,
    });

    const plan: EditPlan = {
      operator: "EDIT_DOCX_BUNDLE",
      domain: "docx",
      documentId: "doc_docx_1",
      normalizedInstruction: "convert selected bullets into one paragraph",
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
        extractedHints: ["bullets", "paragraph"],
        checks: [{ id: "instruction_non_empty", pass: true }],
      },
    };

    const out = await orchestrator.applyEdit(ctx, {
      plan,
      target: {
        id: "selection",
        label: "Selected paragraphs",
        confidence: 0.99,
        candidates: [],
        decisionMargin: 1,
        isAmbiguous: false,
        resolutionReason: "viewer_multi_selection",
      },
      beforeText: "old",
      proposedText: JSON.stringify({
        patches: [
          { kind: "docx_paragraph", paragraphId: "docx:p:abc", afterText: "merged" },
          { kind: "docx_delete_paragraph", paragraphId: "docx:p:def" },
        ],
      }),
      userConfirmed: true,
    });

    expect(out.ok).toBe(true);
    expect(out.applied).toBe(true);
    expect(out.proof?.verified).toBe(true);
    expect(out.proof?.affectedParagraphIds).toEqual(expect.arrayContaining(["docx:p:abc", "docx:p:def"]));
  });
});

