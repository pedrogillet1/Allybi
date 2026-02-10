import { clamp01 } from "../../types/common.types";
import { logger } from "../../utils/logger";
import { DiffBuilderService } from "./diffBuilder.service";
import { EditPlanService } from "./editPlan.service";
import { EditReceiptService } from "./editReceipt.service";
import { RationaleBuilderService } from "./rationaleBuilder.service";
import type {
  EditApplyRequest,
  EditApplyResult,
  EditExecutionContext,
  EditOperator,
  EditPlanRequest,
  EditPlanResult,
  EditPolicy,
  EditPreviewRequest,
  EditPreviewResult,
  EditRevisionStore,
  EditTelemetry,
  UndoRequest,
  UndoResult,
} from "./editing.types";

const DEFAULT_POLICY: EditPolicy = {
  minConfidenceForAutoApply: 0.88,
  minDecisionMarginForAutoApply: 0.14,
  minSimilarityForAutoApply: 0.28,
  alwaysRequireConfirmation: ["EDIT_RANGE", "REPLACE_SLIDE_IMAGE"],
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(input: string): Set<string> {
  return new Set(normalize(input).split(/[^a-z0-9]+/).filter(Boolean));
}

function similarity(before: string, after: string): number {
  const left = tokenSet(before);
  const right = tokenSet(after);
  if (left.size === 0 || right.size === 0) return 0;
  let hit = 0;
  for (const token of Array.from(left)) if (right.has(token)) hit += 1;
  return clamp01(hit / Math.max(left.size, right.size));
}

function containsAllTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const normalized = normalize(text);
  return tokens.every((token) => normalized.includes(normalize(token)));
}

export class EditOrchestratorService {
  private readonly planService: EditPlanService;
  private readonly diffBuilder: DiffBuilderService;
  private readonly rationaleBuilder: RationaleBuilderService;
  private readonly receiptBuilder: EditReceiptService;
  private readonly revisionStore?: EditRevisionStore;
  private readonly telemetry?: EditTelemetry;
  private readonly policy: EditPolicy;

  constructor(options?: {
    planService?: EditPlanService;
    diffBuilder?: DiffBuilderService;
    rationaleBuilder?: RationaleBuilderService;
    receiptBuilder?: EditReceiptService;
    revisionStore?: EditRevisionStore;
    telemetry?: EditTelemetry;
    policy?: Partial<EditPolicy>;
  }) {
    this.planService = options?.planService || new EditPlanService();
    this.diffBuilder = options?.diffBuilder || new DiffBuilderService();
    this.rationaleBuilder = options?.rationaleBuilder || new RationaleBuilderService();
    this.receiptBuilder = options?.receiptBuilder || new EditReceiptService();
    this.revisionStore = options?.revisionStore;
    this.telemetry = options?.telemetry;
    this.policy = { ...DEFAULT_POLICY, ...(options?.policy || {}) };
  }

  async planEdit(ctx: EditExecutionContext, request: EditPlanRequest): Promise<EditPlanResult> {
    const result = this.planService.plan(request);
    if (!result.ok) {
      await this.track("edit_failed", ctx, {
        stage: "plan",
        operator: request.operator,
        documentId: request.documentId,
        error: result.error || "Plan failed",
      });
      return result;
    }

    await this.track("edit_planned", ctx, {
      operator: request.operator,
      documentId: request.documentId,
      missingRequiredEntities: result.plan?.missingRequiredEntities?.length || 0,
      checks: result.plan?.diagnostics.checks || [],
    });
    return result;
  }

  async previewEdit(ctx: EditExecutionContext, request: EditPreviewRequest): Promise<EditPreviewResult> {
    try {
      const sim = similarity(request.beforeText, request.proposedText);
      const preserveTokens = request.preserveTokens || request.plan.preserveTokens;
      const preservePass = containsAllTokens(request.proposedText, preserveTokens);
      const diff =
        request.plan.operator === "ADD_PARAGRAPH"
          ? this.diffBuilder.buildStructuralDiff("Insert new paragraph", request.proposedText)
          : request.plan.domain === "sheets"
            ? this.diffBuilder.buildCellDiff(request.beforeText, request.proposedText)
            : request.plan.domain === "slides"
              ? this.diffBuilder.buildSlideTextDiff(request.beforeText, request.proposedText)
              : this.diffBuilder.buildParagraphDiff(request.beforeText, request.proposedText);

      const blockedReasons = this.computeBlockedReasons(
        request.plan.operator,
        request.target.confidence,
        request.target.decisionMargin,
        sim,
        preservePass,
        this.shouldEnforceSimilarity(request),
      );
      const requiresConfirmation = blockedReasons.length > 0 || request.target.isAmbiguous;

      const rationale = this.rationaleBuilder.build({
        constraints: request.plan.constraints,
        operationLabel: request.plan.operator,
        preservedTokens: preserveTokens,
        sourceProofCount: request.plan.diagnostics.extractedHints.length,
        targetAmbiguous: request.target.isAmbiguous,
      });

      const receipt = this.receiptBuilder.build({
        stage: requiresConfirmation ? "blocked" : "preview",
        language: ctx.language || request.plan.constraints.outputLanguage,
        documentId: request.plan.documentId,
        targetId: request.target.id,
        // UI requirement: do not show internal policy reasons like "similarity below threshold"
        // in the user-facing assistant message. The preview card already indicates review/apply.
        note: undefined,
      });

      await this.track("edit_previewed", ctx, {
        operator: request.plan.operator,
        documentId: request.plan.documentId,
        targetId: request.target.id,
        confidence: request.target.confidence,
        decisionMargin: request.target.decisionMargin,
        similarity: sim,
        preservePass,
        requiresConfirmation,
      });

      return {
        ok: true,
        target: request.target,
        diff,
        rationale,
        receipt,
        requiresConfirmation,
        similarityScore: sim,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      await this.track("edit_failed", ctx, {
        stage: "preview",
        documentId: request.plan.documentId,
        operator: request.plan.operator,
        error: message,
      });
      return { ok: false, error: message };
    }
  }

  async applyEdit(ctx: EditExecutionContext, request: EditApplyRequest): Promise<EditApplyResult> {
    const preview = await this.previewEdit(ctx, {
      plan: request.plan,
      target: request.target,
      beforeText: request.beforeText,
      proposedText: request.proposedText,
      preserveTokens: request.plan.preserveTokens,
    });
    if (!preview.ok) return { ok: false, applied: false, error: preview.error };
    if (!this.revisionStore) return { ok: false, applied: false, preview, error: "Revision store is not configured." };

    const mustConfirm =
      Boolean(preview.requiresConfirmation) ||
      this.policy.alwaysRequireConfirmation.includes(request.plan.operator);

    if (mustConfirm && !request.userConfirmed) {
      return {
        ok: true,
        applied: false,
        preview,
        receipt: this.receiptBuilder.build({
          stage: "blocked",
          language: ctx.language || request.plan.constraints.outputLanguage,
          documentId: request.plan.documentId,
          targetId: request.target.id,
          note: "User confirmation required before committing revision.",
        }),
      };
    }

    try {
      const canUseRichDocx =
        request.plan.domain === "docx" &&
        (request.plan.operator === "EDIT_PARAGRAPH" || request.plan.operator === "ADD_PARAGRAPH") &&
        typeof request.proposedHtml === "string" &&
        request.proposedHtml.trim().length > 0;

      const revisionContent = canUseRichDocx ? request.proposedHtml!.trim() : request.proposedText;
      const created = await this.revisionStore.createRevision({
        documentId: request.plan.documentId,
        userId: ctx.userId,
        correlationId: ctx.correlationId,
        conversationId: ctx.conversationId,
        clientMessageId: ctx.clientMessageId,
        content: revisionContent,
        metadata: {
          operator: request.plan.operator,
          targetId: request.target.id,
          targetConfidence: request.target.confidence,
          targetDecisionMargin: request.target.decisionMargin,
          preserveTokens: request.plan.preserveTokens,
          similarity: preview.similarityScore,
          beforeText: request.beforeText,
          ...(canUseRichDocx
            ? {
                contentFormat: "html",
                contentPlainText: request.proposedText,
              }
            : { contentFormat: "plain" }),
        },
      });

      await this.track("edit_applied", ctx, {
        operator: request.plan.operator,
        documentId: request.plan.documentId,
        targetId: request.target.id,
        revisionId: created.revisionId,
      });

      return {
        ok: true,
        applied: true,
        revisionId: created.revisionId,
        preview,
        receipt: this.receiptBuilder.build({
          stage: "applied",
          language: ctx.language || request.plan.constraints.outputLanguage,
          documentId: created.revisionId,
          targetId: request.target.id,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apply failed";
      await this.track("edit_failed", ctx, {
        stage: "apply",
        operator: request.plan.operator,
        documentId: request.plan.documentId,
        error: message,
      });
      logger.error("[Editing] apply failed", {
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        correlationId: ctx.correlationId,
        clientMessageId: ctx.clientMessageId,
        error: message,
      });
      return { ok: false, applied: false, preview, error: message };
    }
  }

  async undoEdit(ctx: EditExecutionContext, request: UndoRequest): Promise<UndoResult> {
    if (!this.revisionStore) return { ok: false, error: "Revision store is not configured." };

    try {
      const restored = await this.revisionStore.undoToRevision({
        documentId: request.documentId,
        userId: ctx.userId,
        revisionId: request.revisionId,
      });

      return {
        ok: true,
        restoredRevisionId: restored.restoredRevisionId,
        receipt: this.receiptBuilder.build({
          stage: "applied",
          language: ctx.language || "en",
          documentId: restored.restoredRevisionId,
          note: "Revision restored successfully.",
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Undo failed";
      await this.track("edit_failed", ctx, {
        stage: "undo",
        documentId: request.documentId,
        error: message,
      });
      return { ok: false, error: message };
    }
  }

  private computeBlockedReasons(
    operator: EditOperator,
    confidence: number,
    margin: number,
    similarityScore: number,
    preservePass: boolean,
    enforceSimilarity: boolean,
  ): string[] {
    const reasons: string[] = [];
    if (this.policy.alwaysRequireConfirmation.includes(operator)) reasons.push("operator requires explicit confirmation");
    if (confidence < this.policy.minConfidenceForAutoApply) reasons.push(`target confidence ${confidence.toFixed(2)} below threshold`);
    // Only enforce margin when there are multiple candidates (margin is meaningless with a single target)
    if (margin < this.policy.minDecisionMarginForAutoApply && confidence < 1) reasons.push(`decision margin ${margin.toFixed(2)} below threshold`);
    if (enforceSimilarity && similarityScore < this.policy.minSimilarityForAutoApply) reasons.push(`similarity ${similarityScore.toFixed(2)} below threshold`);
    if (!preservePass) reasons.push("preserve token check failed");
    return reasons;
  }

  private shouldEnforceSimilarity(request: EditPreviewRequest): boolean {
    // Similarity gating is meaningful only for "rewrite" style edits.
    // For explicit set/replace operations (titles, cell values, short replacements), token overlap can be near-zero but still correct.
    const hints = request.plan?.diagnostics?.extractedHints || [];
    const isRewriteLike = Array.isArray(hints) && hints.includes("rewrite");
    if (!isRewriteLike) return false;

    // Keep similarity gating scoped to docx paragraph edits; for sheets/slides it's not a good signal.
    if (request.plan.domain !== "docx") return false;
    if (request.plan.operator !== "EDIT_PARAGRAPH") return false;

    return true;
  }

  private async track(
    event: "edit_planned" | "edit_previewed" | "edit_applied" | "edit_failed",
    ctx: EditExecutionContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.telemetry) return;
    try {
      await this.telemetry.track(event, {
        ...payload,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        correlationId: ctx.correlationId,
        clientMessageId: ctx.clientMessageId,
      });
    } catch {
      // telemetry fail-open
    }
  }
}
