import { clamp01 } from "../../types/common.types";
import { logger } from "../../utils/logger";
import crypto from "crypto";
import { DiffBuilderService } from "./diffBuilder.service";
import { EditPlanService } from "./editPlan.service";
import { EditReceiptService } from "./editReceipt.service";
import { RationaleBuilderService } from "./rationaleBuilder.service";
import { ApplyVerificationService } from "./apply/applyVerification.service";
import { EditingPolicyService } from "./policy/EditingPolicyService";
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

function looksLikeDocxAnnotatedMarkdown(value: string): boolean {
  return /<!--\s*docx:\d+\s*-->/i.test(String(value || ""));
}

export class EditOrchestratorService {
  private readonly planService: EditPlanService;
  private readonly diffBuilder: DiffBuilderService;
  private readonly rationaleBuilder: RationaleBuilderService;
  private readonly receiptBuilder: EditReceiptService;
  private readonly applyVerification: ApplyVerificationService;
  private readonly policyService: EditingPolicyService;
  private readonly revisionStore?: EditRevisionStore;
  private readonly telemetry?: EditTelemetry;
  private readonly policy: EditPolicy;

  constructor(options?: {
    planService?: EditPlanService;
    diffBuilder?: DiffBuilderService;
    rationaleBuilder?: RationaleBuilderService;
    receiptBuilder?: EditReceiptService;
    applyVerification?: ApplyVerificationService;
    policyService?: EditingPolicyService;
    revisionStore?: EditRevisionStore;
    telemetry?: EditTelemetry;
    policy?: Partial<EditPolicy>;
  }) {
    this.planService = options?.planService || new EditPlanService();
    this.diffBuilder = options?.diffBuilder || new DiffBuilderService();
    this.rationaleBuilder = options?.rationaleBuilder || new RationaleBuilderService();
    this.receiptBuilder = options?.receiptBuilder || new EditReceiptService();
    this.applyVerification = options?.applyVerification || new ApplyVerificationService();
    this.policyService = options?.policyService || new EditingPolicyService();
    this.revisionStore = options?.revisionStore;
    this.telemetry = options?.telemetry;
    this.policy = this.policyService.resolvePolicy(options?.policy || {});
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
        operator: request.plan.operator,
        domain: request.plan.domain,
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
          operator: request.plan.operator,
          domain: request.plan.domain,
          note: "User confirmation required before committing revision.",
        }),
      };
    }

    try {
      const canUseRichDocx =
        request.plan.domain === "docx" &&
        (request.plan.operator === "EDIT_PARAGRAPH" || request.plan.operator === "EDIT_SPAN" || request.plan.operator === "ADD_PARAGRAPH") &&
        typeof request.proposedHtml === "string" &&
        request.proposedHtml.trim().length > 0;
      const usesMarkdownDocxBundle =
        request.plan.domain === "docx" &&
        request.plan.operator === "EDIT_DOCX_BUNDLE" &&
        looksLikeDocxAnnotatedMarkdown(request.proposedText);

      const revisionContent = canUseRichDocx ? request.proposedHtml!.trim() : request.proposedText;
      const created = await this.revisionStore.createRevision({
        documentId: request.plan.documentId,
        userId: ctx.userId,
        correlationId: ctx.correlationId,
        conversationId: ctx.conversationId,
        clientMessageId: ctx.clientMessageId,
        content: revisionContent,
        idempotencyKey: request.idempotencyKey,
        expectedDocumentUpdatedAtIso: request.expectedDocumentUpdatedAtIso,
        expectedDocumentFileHash: request.expectedDocumentFileHash,
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
            : { contentFormat: usesMarkdownDocxBundle ? "markdown" : "plain" }),
        },
      });

      await this.track("edit_applied", ctx, {
        operator: request.plan.operator,
        documentId: request.plan.documentId,
        targetId: request.target.id,
        revisionId: created.revisionId,
      });

      const hash = (value: string): string =>
        crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
      const beforeMaterial = String(request.beforeText || "");
      const afterMaterial = canUseRichDocx ? String(request.proposedHtml || "") : String(request.proposedText || "");
      const fileHashBefore = String(created.fileHashBefore || "").trim() || hash(beforeMaterial);
      const fileHashAfter = String(created.fileHashAfter || "").trim() || hash(afterMaterial);
      const backendMetrics = (created as any).applyMetrics && typeof (created as any).applyMetrics === "object"
        ? (created as any).applyMetrics
        : null;
      const applyMetrics = backendMetrics
        ? {
            affectedTargetsCount: Math.max(
              1,
              Number((backendMetrics as any).changedCellsCount || 0) > 0
                ? Number((backendMetrics as any).changedCellsCount || 0)
                : (Array.isArray((backendMetrics as any).affectedRanges) ? (backendMetrics as any).affectedRanges.length : 1),
            ),
            changedCellsCount: Math.max(0, Number((backendMetrics as any).changedCellsCount || 0)),
            changedStructuresCount: Math.max(0, Number((backendMetrics as any).changedStructuresCount || 0)),
            affectedRanges: Array.isArray((backendMetrics as any).affectedRanges)
              ? (backendMetrics as any).affectedRanges.map((item: any) => String(item || "").trim()).filter(Boolean)
              : [],
            affectedParagraphIds: [] as string[],
            rejectedOps: Array.isArray((backendMetrics as any).rejectedOps)
              ? (backendMetrics as any).rejectedOps.map((item: any) => String(item || "").trim()).filter(Boolean)
              : [],
          }
        : {
            ...this.deriveApplyMetrics({
              operator: request.plan.operator,
              targetId: request.target?.id || null,
              proposedText: request.proposedText,
            }),
            changedStructuresCount: 0,
            rejectedOps: [] as string[],
          };
      const diff = preview.diff;
      const changeCount = (() => {
        if (backendMetrics) {
          return Math.max(0, Number(applyMetrics.changedCellsCount || 0) + Number(applyMetrics.changedStructuresCount || 0));
        }
        if (Array.isArray(diff?.changes) && diff!.changes.length > 0) return diff!.changes.length;
        if (fileHashBefore !== fileHashAfter) return 1;
        return 0;
      })();
      const changesetKind: NonNullable<EditApplyResult["changeset"]>["kind"] =
        request.plan.operator === "EDIT_DOCX_BUNDLE" || request.plan.operator === "COMPUTE_BUNDLE"
          ? "bundle"
          : (diff?.kind || "paragraph");
      const targets = request.target?.id ? [String(request.target.id)] : [];
      const verification = this.applyVerification.verify({
        revisionId: created.revisionId || null,
        fileHashBefore,
        fileHashAfter,
        diff: backendMetrics ? undefined : diff,
        changeCount,
      });
      const proof = {
        verified: verification.verified,
        fileHashBefore,
        fileHashAfter,
        affectedTargetsCount: Math.max(1, applyMetrics.affectedTargetsCount || targets.length),
        ...(applyMetrics.changedCellsCount > 0 ? { changedCellsCount: applyMetrics.changedCellsCount } : {}),
        ...(applyMetrics.changedStructuresCount > 0 ? { changedStructuresCount: applyMetrics.changedStructuresCount } : {}),
        ...(applyMetrics.affectedRanges.length ? { affectedRanges: applyMetrics.affectedRanges } : {}),
        ...(applyMetrics.affectedParagraphIds.length ? { affectedParagraphIds: applyMetrics.affectedParagraphIds } : {}),
        ...(applyMetrics.rejectedOps.length ? { rejectedOps: applyMetrics.rejectedOps } : {}),
        ...(verification.reasons.length ? { warnings: verification.reasons } : {}),
      };

      // If the document did not actually change, return noop instead of applied.
      const actuallyChanged = verification.changed;
      if (!actuallyChanged) {
        await this.track("edit_noop" as any, ctx, {
          stage: "noop",
          documentId: request.plan.documentId,
          operator: request.plan.operator,
        });
        return {
          ok: true,
          applied: false,
          preview,
          receipt: this.receiptBuilder.build({
            stage: "noop",
            language: ctx.language || request.plan.constraints.outputLanguage,
            documentId: request.plan.documentId,
            targetId: request.target.id,
            operator: request.plan.operator,
            domain: request.plan.domain,
            note: "EDIT_NOOP_NO_CHANGES",
          }),
        };
      }

      return {
        ok: true,
        applied: true,
        revisionId: created.revisionId,
        baseRevisionId: request.plan.documentId,
        newRevisionId: created.revisionId,
        changeset: {
          kind: changesetKind,
          changed: true,
          summary: String(diff?.summary || "Change applied."),
          changeCount,
          sampleBefore: String(diff?.before || request.beforeText || ""),
          sampleAfter: String(diff?.after || request.proposedText || ""),
          targets,
        },
        proof,
        preview,
        receipt: this.receiptBuilder.build({
          stage: "applied",
          language: ctx.language || request.plan.constraints.outputLanguage,
          documentId: created.revisionId,
          targetId: request.target.id,
          operator: request.plan.operator,
          domain: request.plan.domain,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apply failed";
      const isNoop = message.startsWith("EDIT_NOOP");
      await this.track(isNoop ? "edit_noop" as any : "edit_failed", ctx, {
        stage: isNoop ? "noop" : "apply",
        documentId: request.plan.documentId,
        operator: request.plan.operator,
        error: message,
      });
      if (isNoop) {
        return {
          ok: true,
          applied: false,
          preview,
          receipt: this.receiptBuilder.build({
            stage: "noop",
            language: ctx.language || request.plan.constraints.outputLanguage,
            documentId: request.plan.documentId,
            targetId: request.target.id,
            operator: request.plan.operator,
            domain: request.plan.domain,
            note: "EDIT_NOOP_NO_CHANGES",
          }),
        };
      }
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

  private deriveApplyMetrics(input: {
    operator: EditOperator;
    targetId: string | null;
    proposedText: string;
  }): {
    affectedTargetsCount: number;
    changedCellsCount: number;
    changedStructuresCount: number;
    affectedRanges: string[];
    affectedParagraphIds: string[];
    rejectedOps: string[];
  } {
    const affectedRanges = new Set<string>();
    const affectedParagraphIds = new Set<string>();
    let changedCellsCount = 0;

    const addRange = (value: unknown) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      if (/^[A-Za-z0-9_ ]+![A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?$/.test(raw) || /^[A-Za-z]{1,3}\d{1,7}(?::[A-Za-z]{1,3}\d{1,7})?$/.test(raw)) {
        affectedRanges.add(raw);
        changedCellsCount += this.estimateRangeCellCount(raw);
      }
    };

    const addParagraph = (value: unknown) => {
      const pid = String(value || "").trim();
      if (!pid) return;
      if (pid.startsWith("docx:p:")) affectedParagraphIds.add(pid);
    };

    addRange(input.targetId);
    addParagraph(input.targetId);

    try {
      const payload = JSON.parse(String(input.proposedText || "{}"));
      if (Array.isArray(payload?.patches)) {
        for (const patch of payload.patches) {
          addRange((patch as any)?.rangeA1 || (patch as any)?.a1 || (patch as any)?.range);
          addParagraph((patch as any)?.paragraphId);
        }
      }
      if (Array.isArray(payload?.ops)) {
        for (const op of payload.ops) {
          addRange((op as any)?.rangeA1 || (op as any)?.a1 || (op as any)?.range || (op as any)?.sourceRange);
        }
      }
    } catch {
      // plain-text edits do not carry JSON ops.
    }

    return {
      affectedTargetsCount: Math.max(affectedRanges.size, affectedParagraphIds.size, input.targetId ? 1 : 0),
      changedCellsCount,
      changedStructuresCount: 0,
      affectedRanges: Array.from(affectedRanges),
      affectedParagraphIds: Array.from(affectedParagraphIds),
      rejectedOps: [],
    };
  }

  private estimateRangeCellCount(a1: string): number {
    const range = String(a1 || "").split("!").pop() || "";
    const m = range.match(/^([A-Za-z]{1,3})(\d{1,7})(?::([A-Za-z]{1,3})(\d{1,7}))?$/);
    if (!m) return 0;
    const c1 = this.colToIndex(m[1]);
    const r1 = Number(m[2]);
    const c2 = m[3] ? this.colToIndex(m[3]) : c1;
    const r2 = m[4] ? Number(m[4]) : r1;
    if (!Number.isFinite(c1) || !Number.isFinite(c2) || !Number.isFinite(r1) || !Number.isFinite(r2)) return 0;
    return Math.max(1, (Math.abs(c2 - c1) + 1) * (Math.abs(r2 - r1) + 1));
  }

  private colToIndex(col: string): number {
    let out = 0;
    const s = String(col || "").toUpperCase();
    for (let i = 0; i < s.length; i += 1) {
      const code = s.charCodeAt(i);
      if (code < 65 || code > 90) return 0;
      out = out * 26 + (code - 64);
    }
    return out;
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
