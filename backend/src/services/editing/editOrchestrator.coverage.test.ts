import { describe, expect, it, jest } from "@jest/globals";

import { EditOrchestratorService } from "./editOrchestrator.service";
import type {
  EditExecutionContext,
  EditOperator,
  EditPlan,
  EditPreviewRequest,
  ResolvedTarget,
} from "./editing.types";

const ctx: EditExecutionContext = {
  userId: "user_1",
  conversationId: "conv_1",
  correlationId: "corr_1",
  clientMessageId: "msg_1",
  language: "en",
};

function plan(overrides: Partial<EditPlan> = {}): EditPlan {
  return {
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
    ...overrides,
  };
}

function target(overrides: Partial<ResolvedTarget> = {}): ResolvedTarget {
  return {
    id: "docx:p:1",
    label: "Paragraph 1",
    confidence: 0.99,
    candidates: [],
    decisionMargin: 1,
    isAmbiguous: false,
    resolutionReason: "viewer_selection",
    ...overrides,
  };
}

function previewRequest(overrides: Partial<EditPreviewRequest> = {}): EditPreviewRequest {
  return {
    plan: plan(),
    target: target(),
    beforeText: "Old paragraph text.",
    proposedText: "New paragraph text.",
    ...overrides,
  };
}

const permissivePolicy = {
  minConfidenceForAutoApply: 0,
  minDecisionMarginForAutoApply: 0,
  minSimilarityForAutoApply: 0,
  alwaysRequireConfirmation: [] as EditOperator[],
};

describe("EditOrchestratorService coverage branches", () => {
  it("tracks failed and successful planning outcomes", async () => {
    const telemetry = { track: jest.fn(async () => undefined) };
    const serviceFail = new EditOrchestratorService({
      planService: { plan: jest.fn(() => ({ ok: false, error: "bad plan" })) } as any,
      telemetry: telemetry as any,
      policy: permissivePolicy,
    });
    const failOut = await serviceFail.planEdit(ctx, {
      instruction: "x",
      operator: "EDIT_PARAGRAPH",
      domain: "docx",
      documentId: "d1",
    });
    expect(failOut.ok).toBe(false);
    expect(telemetry.track).toHaveBeenCalledWith(
      "edit_failed",
      expect.objectContaining({ stage: "plan" }),
    );

    const serviceOk = new EditOrchestratorService({
      planService: {
        plan: jest.fn(() => ({
          ok: true,
          plan: plan({ diagnostics: { extractedEntities: [], extractedHints: [], checks: [] } }),
        })),
      } as any,
      telemetry: telemetry as any,
      policy: permissivePolicy,
    });
    const okOut = await serviceOk.planEdit(ctx, {
      instruction: "x",
      operator: "EDIT_PARAGRAPH",
      domain: "docx",
      documentId: "d1",
    });
    expect(okOut.ok).toBe(true);
    expect(telemetry.track).toHaveBeenCalledWith(
      "edit_planned",
      expect.objectContaining({ operator: "EDIT_PARAGRAPH" }),
    );
  });

  it("builds structural, cell, and slide diffs by operator/domain", async () => {
    const service = new EditOrchestratorService({ policy: permissivePolicy });
    const structural = await service.previewEdit(
      ctx,
      previewRequest({ plan: plan({ operator: "ADD_PARAGRAPH" }) }),
    );
    expect(structural.ok).toBe(true);
    expect(structural.diff?.kind).toBe("structural");

    const sheets = await service.previewEdit(
      ctx,
      previewRequest({
        plan: plan({ operator: "EDIT_RANGE", domain: "sheets" }),
        target: target({ id: "Sheet1!A1", label: "Sheet1!A1" }),
      }),
    );
    expect(sheets.ok).toBe(true);
    expect(sheets.diff?.kind).toBe("cell");

    const slides = await service.previewEdit(
      ctx,
      previewRequest({
        plan: plan({ operator: "REWRITE_SLIDE_TEXT", domain: "slides" }),
        target: target({ id: "slide:1", label: "Slide 1" }),
      }),
    );
    expect(slides.ok).toBe(true);
    expect(slides.diff?.kind).toBe("slide");
  });

  it("returns preview error when diff builder throws", async () => {
    const service = new EditOrchestratorService({
      diffBuilder: {
        buildParagraphDiff: () => {
          throw new Error("boom");
        },
      } as any,
      policy: permissivePolicy,
    });
    const out = await service.previewEdit(ctx, previewRequest());
    expect(out.ok).toBe(false);
    expect(String(out.error || "")).toContain("boom");
  });

  it("returns engine_unsupported when apply is requested without revision store", async () => {
    const service = new EditOrchestratorService({ policy: permissivePolicy });
    const out = await service.applyEdit(ctx, {
      plan: plan(),
      target: target(),
      beforeText: "Old",
      proposedText: "New",
      userConfirmed: true,
    });
    expect(out.ok).toBe(false);
    expect(out.outcomeType).toBe("engine_unsupported");
  });

  it("blocks apply when confirmation is required and missing", async () => {
    const revisionStore = {
      createRevision: jest.fn(),
      undoToRevision: jest.fn(),
    };
    const service = new EditOrchestratorService({
      revisionStore: revisionStore as any,
      policy: {
        ...permissivePolicy,
        alwaysRequireConfirmation: ["EDIT_RANGE"],
      },
    });

    const out = await service.applyEdit(ctx, {
      plan: plan({ operator: "EDIT_RANGE", domain: "sheets" }),
      target: target({ id: "Sheet1!A1", label: "Sheet1!A1" }),
      beforeText: "Old",
      proposedText: "New",
      userConfirmed: false,
    });
    expect(out.ok).toBe(true);
    expect(out.applied).toBe(false);
    expect(out.outcomeType).toBe("blocked");
    expect(revisionStore.createRevision).not.toHaveBeenCalled();
  });

  it("stores rich HTML content for docx paragraph edits when provided", async () => {
    const revisionStore = {
      createRevision: jest.fn(async () => ({
        revisionId: "rev-1",
        fileHashBefore: "before-1",
        fileHashAfter: "after-1",
      })),
      undoToRevision: jest.fn(),
    };
    const service = new EditOrchestratorService({
      revisionStore: revisionStore as any,
      policy: permissivePolicy,
    });

    const out = await service.applyEdit(ctx, {
      plan: plan({ operator: "EDIT_PARAGRAPH", domain: "docx" }),
      target: target(),
      beforeText: "Old text",
      proposedText: "New text",
      proposedHtml: "<p><strong>New text</strong></p>",
      userConfirmed: true,
    });
    expect(out.ok).toBe(true);
    expect(out.outcomeType).toBe("applied");
    expect(revisionStore.createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "<p><strong>New text</strong></p>",
        metadata: expect.objectContaining({
          contentFormat: "html",
          contentPlainText: "New text",
        }),
      }),
    );
  });

  it("returns noop outcome when no mutation is verified", async () => {
    const revisionStore = {
      createRevision: jest.fn(async () => ({
        revisionId: "rev-2",
        fileHashBefore: "same-hash",
        fileHashAfter: "same-hash",
      })),
      undoToRevision: jest.fn(),
    };
    const service = new EditOrchestratorService({
      revisionStore: revisionStore as any,
      policy: permissivePolicy,
    });

    const out = await service.applyEdit(ctx, {
      plan: plan(),
      target: target(),
      beforeText: "No change text",
      proposedText: "No change text",
      userConfirmed: true,
    });
    expect(out.ok).toBe(true);
    expect(out.outcomeType).toBe("noop");
    expect(out.blockedReason?.code).toBe("EDIT_NOOP_NO_CHANGES");
  });

  it("maps apply exceptions to noop, engine_unsupported, and blocked outcomes", async () => {
    const revisionStoreNoop = {
      createRevision: jest.fn(async () => {
        throw new Error("EDIT_NOOP: nothing changed");
      }),
      undoToRevision: jest.fn(),
    };
    const noopService = new EditOrchestratorService({
      revisionStore: revisionStoreNoop as any,
      policy: permissivePolicy,
    });
    const noop = await noopService.applyEdit(ctx, {
      plan: plan(),
      target: target(),
      beforeText: "a",
      proposedText: "b",
      userConfirmed: true,
    });
    expect(noop.ok).toBe(true);
    expect(noop.outcomeType).toBe("noop");

    const unsupportedErr = new Error("not implemented") as Error & {
      code?: string;
    };
    unsupportedErr.code = "OPERATOR_NOT_IMPLEMENTED";
    const revisionStoreUnsupported = {
      createRevision: jest.fn(async () => {
        throw unsupportedErr;
      }),
      undoToRevision: jest.fn(),
    };
    const unsupportedService = new EditOrchestratorService({
      revisionStore: revisionStoreUnsupported as any,
      policy: permissivePolicy,
    });
    const unsupported = await unsupportedService.applyEdit(ctx, {
      plan: plan(),
      target: target(),
      beforeText: "a",
      proposedText: "b",
      userConfirmed: true,
    });
    expect(unsupported.ok).toBe(true);
    expect(unsupported.outcomeType).toBe("engine_unsupported");

    const revisionStoreBlocked = {
      createRevision: jest.fn(async () => {
        throw new Error("fatal apply error");
      }),
      undoToRevision: jest.fn(),
    };
    const blockedService = new EditOrchestratorService({
      revisionStore: revisionStoreBlocked as any,
      policy: permissivePolicy,
    });
    const blocked = await blockedService.applyEdit(ctx, {
      plan: plan(),
      target: target(),
      beforeText: "a",
      proposedText: "b",
      userConfirmed: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.outcomeType).toBe("blocked");
  });

  it("supports undo success/failure paths", async () => {
    const noStore = new EditOrchestratorService({ policy: permissivePolicy });
    await expect(
      noStore.undoEdit(ctx, { documentId: "doc_1", revisionId: "rev_1" }),
    ).resolves.toEqual({
      ok: false,
      error: "Revision store is not configured.",
    });

    const okStore = {
      createRevision: jest.fn(),
      undoToRevision: jest.fn(async () => ({ restoredRevisionId: "rev_restored" })),
    };
    const okService = new EditOrchestratorService({
      revisionStore: okStore as any,
      policy: permissivePolicy,
    });
    const okOut = await okService.undoEdit(ctx, {
      documentId: "doc_1",
      revisionId: "rev_1",
    });
    expect(okOut.ok).toBe(true);
    expect(okOut.restoredRevisionId).toBe("rev_restored");

    const failStore = {
      createRevision: jest.fn(),
      undoToRevision: jest.fn(async () => {
        throw new Error("undo failed");
      }),
    };
    const failService = new EditOrchestratorService({
      revisionStore: failStore as any,
      policy: permissivePolicy,
    });
    const failOut = await failService.undoEdit(ctx, {
      documentId: "doc_1",
      revisionId: "rev_1",
    });
    expect(failOut.ok).toBe(false);
    expect(String(failOut.error || "")).toContain("undo failed");
  });
});

